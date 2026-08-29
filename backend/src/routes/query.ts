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
  const { message, conversation_id } = req.body;

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

  // 4. Perform RAG Vector Semantic Search
  let chunksText = '';
  try {
    const userEmbedding = await generateEmbedding(message);
    const vectorStr = `[${userEmbedding.join(',')}]`;
    
    const chunksResult = await query(
      `SELECT content FROM chunks 
       WHERE agent_id = $1 
       ORDER BY embedding <=> $2::vector 
       LIMIT 5`,
      [agentId, vectorStr]
    );

    if (chunksResult.rowCount && chunksResult.rowCount > 0) {
      chunksText = chunksResult.rows.map(r => r.content).join('\n---\n');
    }
  } catch (err: any) {
    console.error('RAG vector search failed, proceeding without chunks:', err.message);
  }

  // 5. Build prompt system instruction
  const basePrompt = agent.config?.systemPrompt || 
    (agent.template_type === 'sales' 
      ? 'You are a helpful sales assistant.' 
      : 'You are a helpful customer support agent.');

  let systemPrompt = basePrompt;
  if (chunksText) {
    systemPrompt = `${basePrompt}\n\nUse the following retrieved context information from our knowledge base to answer the user query. Do not hallucinate outside this context.\nContext information:\n---------------------\n${chunksText}\n---------------------\n`;
  }

  // 6. Gather active tools for the agent
  const toolsResult = await query(
    `SELECT tool_type, tool_config FROM agent_tools WHERE agent_id = $1 AND enabled = true`,
    [agentId]
  );
  const mappedTools = mapAgentTools(toolsResult.rows);

  // 7. Invoke the Gemini LLM router
  let routerResponse = await callGemini(
    systemPrompt,
    chatHistory,
    message,
    mappedTools
  );

  const actionsTaken: any[] = [];

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
        return false;
      });
      const toolConfig = toolRow ? toolRow.tool_config : {};

      const toolResult = await executeTool(toolCall.name, toolCall.input, { agentId, toolConfig });
      
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

  // 8. Log message exchange in messages table (within a transaction)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Save user message
    await client.query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
      [conversationId, message]
    );
    // Save assistant reply
    await client.query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
      [conversationId, routerResponse.reply]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to log message session history:', err);
  } finally {
    client.release();
  }

  // Return the resolved final reply and log trace to the widget
  return res.json({
    reply: routerResponse.reply,
    conversation_id: conversationId,
    actions_taken: actionsTaken,
    tool_calls: routerResponse.toolCalls
  });
}));

export default router;
