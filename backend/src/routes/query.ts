import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, authenticateWidgetOrAgency, assertAgentBelongsToAgency } from '../middleware/auth';
import pool, { query } from '../config/db';
import { generateEmbedding } from '../services/embeddings';
import { callGemini, ChatMessage, ToolDefinition } from '../services/router';
import { executeTool } from '../services/tools';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Maps DB tool records to Gemini function call JSON schemas
 */
function mapAgentTools(rows: any[]): ToolDefinition[] {
  return rows.map(r => {
    if (r.tool_type === 'calendar_booking') {
      return {
        name: 'book_calendar_slot',
        description: 'Schedule a demo or booking slot on the calendar. Use this when the user explicitly asks to book a call, schedule a demo, or set up a meeting.',
        input_schema: {
          type: 'OBJECT',
          properties: {
            date: { type: 'STRING', description: 'The date for the slot in YYYY-MM-DD format' },
            time: { type: 'STRING', description: 'The time slot in HH:MM format (24h)' },
            attendee_email: { type: 'STRING', description: 'The email address of the attendee booking the call' }
          },
          required: ['date', 'time', 'attendee_email']
        }
      };
    } else if (r.tool_type === 'database_query') {
      return {
        name: 'query_user_account',
        description: 'Query live customer database or internal billing API to verify user state, subscription plan, payment deduction, or webhook synchronization. Use this when the user asks about payment deductions, why their plan has not upgraded, transaction history, or account status.',
        input_schema: {
          type: 'OBJECT',
          properties: {
            user_id: { type: 'STRING', description: 'The unique identifier or email of the customer' },
            query_type: { type: 'STRING', description: 'Type of query: "billing", "subscription", "payments", or "general"' }
          }
        }
      };
    } else if (r.tool_type === 'sentry_telemetry') {
      return {
        name: 'check_recent_telemetry_errors',
        description: 'Check Sentry or application telemetry logs for recent unhandled frontend crashes, white-screen exceptions, or 500 server errors for the user session. Use this whenever the user reports an error, crash, white screen, button not responding, or failed export.',
        input_schema: {
          type: 'OBJECT',
          properties: {
            user_id: { type: 'STRING', description: 'The user ID or session reference' },
            timeframe_minutes: { type: 'INTEGER', description: 'Time window in minutes to look back (default 15)' }
          }
        }
      };
    } else {
      return {
        name: 'create_support_ticket',
        description: 'Create a customer support ticket. Use this when the user requests human help, wants to talk to support, or the knowledge base does not contain the answer.',
        input_schema: {
          type: 'OBJECT',
          properties: {
            subject: { type: 'STRING', description: 'Short summary of the user issue' },
            description: { type: 'STRING', description: 'Detailed account of the user query or issue' }
          },
          required: ['subject', 'description']
        }
      };
    }
  });
}

// POST /api/v1/agents/:id/query - Execute a RAG query chat turn against the agent
router.post('/agents/:id/query', authenticateWidgetOrAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  const { message, conversation_id, user_context } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  // 1. Tenant access control checks
  if (req.isWidget) {
    // If widget token is used, it must match the agent URL parameter
    if (req.agentId !== agentId) {
      return res.status(403).json({ error: 'Access denied: Widget key mismatch' });
    }
  } else {
    // If JWT is used, the agent must belong to the agency
    const agencyId = req.agencyId!;
    await assertAgentBelongsToAgency(agentId, agencyId);
  }

  // 2. Fetch agent configuration details
  const agentResult = await query(
    `SELECT id, config, template_type, status FROM agents WHERE id = $1`,
    [agentId]
  );
  if (!agentResult.rowCount || agentResult.rowCount === 0) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  const agent = agentResult.rows[0];

  // 3. Resolve conversation session ID & retrieve message history
  let conversationId = conversation_id;
  const chatHistory: ChatMessage[] = [];

  if (conversationId) {
    // Verify conversation belongs to this agent
    const convResult = await query(
      `SELECT id FROM conversations WHERE id = $1 AND agent_id = $2`,
      [conversationId, agentId]
    );
    if (!convResult.rowCount || convResult.rowCount === 0) {
      return res.status(404).json({ error: 'Conversation session not found' });
    }
    
    // Retrieve last 10 messages of history
    const historyResult = await query(
      `SELECT role, content FROM messages 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC 
       LIMIT 10`,
      [conversationId]
    );
    
    for (const row of historyResult.rows) {
      chatHistory.push({
        role: row.role === 'user' ? 'user' : 'model',
        content: row.content
      });
    }
  } else {
    // Create new conversation session
    const convInsert = await query(
      `INSERT INTO conversations (agent_id) VALUES ($1) RETURNING id`,
      [agentId]
    );
    conversationId = convInsert.rows[0].id;
  }

  // 4. Perform RAG Vector Semantic Search with Cosine Similarity
  let chunksText = '';
  let topSimilarity = 0;
  let retrievedChunksList: any[] = [];
  try {
    const userEmbedding = await generateEmbedding(message);
    const vectorStr = `[${userEmbedding.join(',')}]`;
    
    const chunksResult = await query(
      `SELECT content, 1 - (embedding <=> $2::vector) AS similarity 
       FROM chunks 
       WHERE agent_id = $1 
       ORDER BY embedding <=> $2::vector 
       LIMIT 5`,
      [agentId, vectorStr]
    );

    if (chunksResult.rowCount && chunksResult.rowCount > 0) {
      retrievedChunksList = chunksResult.rows;
      topSimilarity = Math.max(0, parseFloat(chunksResult.rows[0].similarity) || 0);
      chunksText = chunksResult.rows.map(r => r.content).join('\n---\n');
    }
  } catch (err: any) {
    console.error('RAG vector search failed, proceeding without chunks:', err.message);
  }

  // 5. Confidence Threshold & Guardrail Verification
  const confidenceThreshold = agent.config?.confidenceThreshold ?? 0.70;
  const fallbackMode = agent.config?.fallbackMode || 'escalate_ticket';
  const copilotMode = agent.config?.copilotMode === true;
  const isGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening|howdy|who are you)\b/i.test(message.trim());
  
  let guardrailTriggered = false;
  let fallbackReply = '';

  // Trigger guardrail if it's a technical/domain query and confidence is below threshold
  if (!isGreeting && topSimilarity > 0 && topSimilarity < confidenceThreshold) {
    guardrailTriggered = true;
    if (fallbackMode === 'escalate_ticket') {
      const ticketSubj = `Low confidence escalation: ${message.slice(0, 60)}`;
      const ticketDesc = `End user query: "${message}"\nRetrieval similarity was ${(topSimilarity * 100).toFixed(1)}% (minimum threshold: ${(confidenceThreshold * 100).toFixed(0)}%).\nAuto-escalated by Zero-Blunder guardrail.`;
      
      try {
        await query(
          `INSERT INTO tickets (agent_id, subject, description, status) VALUES ($1, $2, $3, 'open')`,
          [agentId, ticketSubj, ticketDesc]
        );
      } catch (e: any) {
        console.error('Failed to log guardrail ticket:', e.message);
      }

      fallbackReply = `I want to ensure you get 100% accurate guidance. My knowledge match confidence for this question is ${(topSimilarity * 100).toFixed(0)}% (below our ${(confidenceThreshold * 100).toFixed(0)}% strict verification threshold). Rather than risk inaccurate formula or codebase details, I have automatically escalated a support ticket for our engineering team to assist you directly.`;
    } else {
      fallbackReply = `I do not have sufficient verified documentation or codebase records in my current knowledge base to answer this with high confidence (confidence: ${(topSimilarity * 100).toFixed(0)}%, required: ${(confidenceThreshold * 100).toFixed(0)}%). Please contact engineering support or check our verified docs.`;
    }
  }

  const actionsTaken: any[] = [];
  let finalBotReply = '';

  if (guardrailTriggered) {
    finalBotReply = fallbackReply;
  } else {
    // 6. Build prompt system instruction
    const basePrompt = agent.config?.systemPrompt || 
      (agent.template_type === 'sales' 
        ? 'You are a helpful sales assistant.' 
        : 'You are a helpful customer support agent.');

    let systemPrompt = basePrompt;
    if (chunksText) {
      systemPrompt = `${basePrompt}\n\nUse the following retrieved context information from our knowledge base to answer the user query. Do not hallucinate outside this context. Strictly preserve code syntax and formulas.\nContext information:\n---------------------\n${chunksText}\n---------------------\n`;
    }

    if (user_context && typeof user_context === 'object') {
      const contextLines = Object.entries(user_context)
        .map(([k, v]) => `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join('\n');
      systemPrompt += `\n\nActive End-User Session Context:\n---------------------\n${contextLines}\n---------------------\n`;
    }

    // 7. Gather active tools for the agent
    const toolsResult = await query(
      `SELECT tool_type, tool_config FROM agent_tools WHERE agent_id = $1 AND enabled = true`,
      [agentId]
    );
    const mappedTools = mapAgentTools(toolsResult.rows);

    // 8. Invoke the Gemini LLM router
    let routerResponse = await callGemini(
      systemPrompt,
      chatHistory,
      message,
      mappedTools
    );

    // If Gemini requests a tool execution, execute it and feed the output back to the model
    if (routerResponse.toolCalls && routerResponse.toolCalls.length > 0) {
      const geminiHistory: any[] = chatHistory.map(h => ({
        role: h.role,
        parts: [{ text: h.content }]
      }));

      geminiHistory.push({
        role: 'user',
        parts: [{ text: message }]
      });

      const functionCallsParts = routerResponse.toolCalls.map(tc => ({
        functionCall: {
          name: tc.name,
          args: tc.input
        }
      }));

      geminiHistory.push({
        role: 'model',
        parts: functionCallsParts
      });

      const functionResponseParts = [];
      for (const toolCall of routerResponse.toolCalls) {
        const toolRow = toolsResult.rows.find(r => {
          if (r.tool_type === 'calendar_booking' && toolCall.name === 'book_calendar_slot') return true;
          if (r.tool_type === 'ticket_create' && toolCall.name === 'create_support_ticket') return true;
          if (r.tool_type === 'database_query' && toolCall.name === 'query_user_account') return true;
          if (r.tool_type === 'sentry_telemetry' && toolCall.name === 'check_recent_telemetry_errors') return true;
          return false;
        });
        const toolConfig = toolRow ? toolRow.tool_config : {};

        const toolResult = await executeTool(toolCall.name, toolCall.input, { 
          agentId, 
          toolConfig,
          sessionContext: user_context
        });
        
        actionsTaken.push({
          tool_type: toolCall.name,
          status: toolResult.success ? 'success' : 'failed',
          result: toolResult.success ? toolResult.data : { error: toolResult.error }
        });

        functionResponseParts.push({
          functionResponse: {
            name: toolCall.name,
            response: toolResult.success ? toolResult.data : { error: toolResult.error }
          }
        });
      }

      geminiHistory.push({
        role: 'user',
        parts: functionResponseParts
      });

      // Call Gemini again to generate final context-grounded response
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (GEMINI_API_KEY && GEMINI_API_KEY.trim() !== '' && !GEMINI_API_KEY.startsWith('replace_this')) {
        try {
          const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            systemInstruction: systemPrompt,
          });

          const finalResponse = await model.generateContent({
            contents: geminiHistory
          });

          routerResponse.reply = finalResponse.response.text() || '';
        } catch (err: any) {
          console.error('Failed to get final response from Gemini tool loop:', err.message);
          routerResponse.reply = `I have processed your request. Here are the actions taken: ${JSON.stringify(actionsTaken)}`;
        }
      } else {
        routerResponse.reply = `[Mock Final AI Response] Successfully executed action: ${JSON.stringify(actionsTaken.map(a => a.tool_type))}.`;
      }
    }

    finalBotReply = routerResponse.reply;
  }

  // 9. If agent is in Copilot/Shadow mode, save response as a draft for human review
  if (copilotMode) {
    try {
      await query(
        `INSERT INTO copilot_drafts (agent_id, conversation_id, user_query, draft_reply, confidence_score, citations, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
        [
          agentId,
          conversationId,
          message,
          finalBotReply,
          topSimilarity.toFixed(4),
          JSON.stringify(retrievedChunksList.slice(0, 3).map(c => ({ content: c.content, similarity: c.similarity })))
        ]
      );
    } catch (err: any) {
      console.error('Failed to record copilot draft:', err.message);
    }
  }

  // 10. Log message exchange in messages table (within a transaction)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Save user message
    await client.query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
      [conversationId, message]
    );
    // Save assistant reply (unless in shadow mode waiting for review)
    const storedAssistantReply = copilotMode 
      ? `[Shadow Mode] Draft generated for team review.` 
      : finalBotReply;

    await client.query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
      [conversationId, storedAssistantReply]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to log message session history:', err);
  } finally {
    client.release();
  }

  // Return the resolved final reply and log trace to the caller
  return res.json({
    reply: copilotMode ? '[Shadow Mode] Response drafted and waiting for human sign-off.' : finalBotReply,
    conversation_id: conversationId,
    confidence_score: topSimilarity,
    guardrail_triggered: guardrailTriggered,
    is_copilot_draft: copilotMode,
    actions_taken: actionsTaken
  });
}));

export default router;
