import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, authenticateWidgetOrAgency, assertAgentBelongsToAgency } from '../middleware/auth';
import { query } from '../config/db';
import { callGemini, ChatMessage, ToolDefinition, resolveGeminiModel } from '../services/router';
import { executeTool } from '../services/tools';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { condenseQuery } from '../services/queryCondenser';
import { performHybridSearch } from '../services/hybridSearch';
import { evaluateGrounding } from '../services/critic';
import { matchAOP, formatAOPInstruction } from '../services/aopEngine';
import { assessRiskAndSentiment, generateWarmHandoffBrief } from '../services/watchtower';

const router = Router();

const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

const riskCheckLabel = (cat?: string) => (cat || 'RISK').toUpperCase();

/**
 * Maps DB tool records to Gemini function call JSON schemas
 */
function mapAgentTools(rows: any[]): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  for (const r of rows) {
    if (r.tool_type === 'calendar_booking') {
      tools.push({
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
      });
    } else if (r.tool_type === 'shopify_orders') {
      tools.push(
        {
          name: 'shopify_lookup_order',
          description: 'Look up live customer order details, shipping status, tracking links, and purchased items from Shopify. Use whenever the customer asks about order status, tracking, package delivery, or past purchase details.',
          input_schema: {
            type: 'OBJECT',
            properties: {
              order_id_or_number: { type: 'STRING', description: 'The order number (e.g. #1004 or 1004) or Shopify order ID' },
              customer_email: { type: 'STRING', description: 'Customer billing or account email address' }
            },
            required: ['order_id_or_number']
          }
        },
        {
          name: 'shopify_cancel_unfulfilled_order',
          description: 'Cancel an unfulfilled order in Shopify and initiate a refund. Use this when the customer explicitly requests to cancel their order and the order has not yet been shipped.',
          input_schema: {
            type: 'OBJECT',
            properties: {
              order_id: { type: 'STRING', description: 'The order ID or order number to cancel' },
              reason: { type: 'STRING', description: 'Reason for cancellation (e.g. customer_requested, wrong_item)' }
            },
            required: ['order_id']
          }
        },
        {
          name: 'shopify_request_return_label',
          description: 'Generate an authorized RMA return shipping label and portal link for an existing delivered order. Use when the customer wants to return or exchange an item.',
          input_schema: {
            type: 'OBJECT',
            properties: {
              order_id: { type: 'STRING', description: 'The order ID or order number' },
              return_reason: { type: 'STRING', description: 'The reason for return (e.g. damaged, wrong size, changed mind)' }
            },
            required: ['order_id', 'return_reason']
          }
        }
      );
    } else if (r.tool_type === 'zendesk_sync') {
      tools.push({
        name: 'zendesk_sync_ticket',
        description: 'Synchronize a support request and AI summary directly into external Zendesk helpdesk for human agent follow-up. Use when customer needs complex escalation or asks for a support ticket in Zendesk.',
        input_schema: {
          type: 'OBJECT',
          properties: {
            subject: { type: 'STRING', description: 'Short subject summarizing the ticket' },
            description: { type: 'STRING', description: 'Detailed account of the issue including warm handoff summary' },
            priority: { type: 'STRING', description: 'Ticket priority: low, normal, high, or urgent' },
            requester_email: { type: 'STRING', description: 'Customer email address' }
          },
          required: ['subject', 'description']
        }
      });
    } else if (r.tool_type === 'database_query') {
      tools.push({
        name: 'query_user_account',
        description: 'Query live customer database or internal billing API to verify user state, subscription plan, payment deduction, or webhook synchronization. Use this when the user asks about payment deductions, why their plan has not upgraded, transaction history, or account status.',
        input_schema: {
          type: 'OBJECT',
          properties: {
            user_id: { type: 'STRING', description: 'The unique identifier or email of the customer' },
            query_type: { type: 'STRING', description: 'Type of query: "billing", "subscription", "payments", or "general"' }
          }
        }
      });
    } else if (r.tool_type === 'sentry_telemetry') {
      tools.push({
        name: 'check_recent_telemetry_errors',
        description: 'Check Sentry or application telemetry logs for recent unhandled frontend crashes, white-screen exceptions, or 500 server errors for the user session. Use this whenever the user reports an error, crash, white screen, button not responding, or failed export.',
        input_schema: {
          type: 'OBJECT',
          properties: {
            user_id: { type: 'STRING', description: 'The user ID or session reference' },
            timeframe_minutes: { type: 'INTEGER', description: 'Time window in minutes to look back (default 15)' }
          }
        }
      });
    } else {
      tools.push({
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
      });
    }
  }

  return tools;
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

  // 1b. Enforce plan message quotas and trial expiration
  const { checkChatQueryAllowed } = await import('../utils/planLimits');
  const queryAllowance = await checkChatQueryAllowed(agentId);
  if (!queryAllowance.allowed) {
    return res.status(403).json({
      error: queryAllowance.error,
      code: queryAllowance.code,
      reply: 'This AI Assistant is currently paused because the workspace has reached its monthly message quota or its trial has ended.',
    });
  }

  // 2. Fetch agent configuration details
  const agentResult = await query(
    `SELECT id, config, template_type, status, llm_model, llm_provider FROM agents WHERE id = $1`,
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

  // 3b. Watchtower Risk & Sentiment Circuit Breaker (Brand Defense)
  const riskAssessment = assessRiskAndSentiment(message);
  if (riskAssessment.circuitBreakerTriggered) {
    console.warn(`[Watchtower ALERT] High-risk user input detected (${riskAssessment.riskCategory}): "${message}"`);
    const brief = await generateWarmHandoffBrief(message, chatHistory, [], resolveGeminiModel(agent.llm_model));

    try {
      await query(
        `INSERT INTO tickets (agent_id, subject, description, priority, status)
         VALUES ($1, $2, $3, 'urgent', 'open')`,
        [
          agentId,
          `[CRITICAL ${riskCheckLabel(riskAssessment.riskCategory)}] Escalation: ${message.slice(0, 50)}`,
          `${brief.formattedBrief}\n\n---\nFull Customer Message:\n"${message}"\nTrigger Reason: ${riskAssessment.reason}`
        ]
      );
    } catch (e: any) {
      console.error('Failed to log Watchtower emergency ticket:', e.message);
    }

    // Log user & assistant messages
    try {
      await query(
        `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
        [conversationId, message, riskAssessment.disarmingReply!]
      );
    } catch (e: any) {
      console.warn('Failed to record Watchtower message turn:', e.message);
    }

    return res.json({
      reply: riskAssessment.disarmingReply,
      conversation_id: conversationId,
      confidence_score: 1.0,
      guardrail_triggered: true,
      is_high_risk: true,
      risk_category: riskAssessment.riskCategory,
      actions_taken: [{ tool_type: 'watchtower_circuit_breaker', status: 'escalated', reason: riskAssessment.reason }]
    });
  }

  // 4. Resolve Model and Condense Multi-Turn Query (Comprehension Layer)
  const activeModel = resolveGeminiModel(agent.llm_model || 'gemini-1.5-flash');
  let searchOptimizedQuery = message;
  try {
    searchOptimizedQuery = await condenseQuery(message, chatHistory, activeModel);
  } catch (err: any) {
    console.warn('[QueryRoute] Failed to condense query, using raw message:', err.message);
  }

  // 5. Perform Hybrid Retrieval (Dense Semantic Vector + Sparse BM25 Keyword Search with RRF)
  let chunksText = '';
  let topSimilarity = 0;
  let retrievedChunksList: any[] = [];
  let hasKeywordMatch = false;

  try {
    const hybridResult = await performHybridSearch(agentId, searchOptimizedQuery, 5);
    topSimilarity = hybridResult.topSimilarity;
    hasKeywordMatch = hybridResult.hasKeywordMatch;
    retrievedChunksList = hybridResult.chunks;
    chunksText = hybridResult.chunksText;
  } catch (err: any) {
    console.error('Hybrid search failed, proceeding without chunks:', err.message);
  }

  // 6. Match Agent Operating Procedures (AOPs)
  let customAOPs = Array.isArray(agent.config?.aops) ? [...agent.config.aops] : [];
  try {
    const dbAOPs = await query(
      `SELECT name, description, trigger_keywords as keywords, mandatory_variables as "mandatoryVariables", steps, guardrails, escalation_criteria as "escalationConditions"
       FROM agent_aops 
       WHERE agent_id = $1 AND enabled = true`,
      [agentId]
    );
    if (dbAOPs.rows && dbAOPs.rows.length > 0) {
      customAOPs = [...customAOPs, ...dbAOPs.rows];
    }
  } catch (err: any) {
    // Graceful fallback if table is newly initializing
  }

  const activeAOP = matchAOP(message, customAOPs.length > 0 ? customAOPs : undefined);

  const rawThreshold = agent.config?.confidenceThreshold;
  const confidenceThreshold = typeof rawThreshold === 'number'
    ? Math.min(rawThreshold, 0.50)
    : 0.48;

  const fallbackMode = agent.config?.fallbackMode || 'escalate_ticket';
  const copilotMode = agent.config?.copilotMode === true;
  const isGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening|howdy|who are you)\b/i.test(message.trim());
  
  let guardrailTriggered = false;
  let fallbackReply = '';

  // If there's a strong keyword match or an active AOP workflow,
  // we do not bluntly reject solely on dense cosine score. We let the model reason and verify via the Critic.
  if (!isGreeting && !activeAOP && !hasKeywordMatch && topSimilarity > 0 && topSimilarity < confidenceThreshold) {
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
    // 7. Build prompt system instruction with AOP injection
    const basePrompt = agent.config?.systemPrompt || 
      (agent.template_type === 'sales' 
        ? 'You are a helpful sales assistant.' 
        : 'You are a helpful customer support agent.');

    let systemPrompt = basePrompt;

    if (activeAOP) {
      systemPrompt += `\n${formatAOPInstruction(activeAOP)}\n`;
    }

    if (chunksText) {
      systemPrompt = `${systemPrompt}

CRITICAL KNOWLEDGE BASE INSTRUCTIONS (STRICT RAG PROTOCOL):
You have direct access to verified product documentation and knowledge base chunks below.
1. DIRECT COMPREHENSIVE ANSWER: Extract the exact steps, facts, explanations, formulas, or features directly from the context and explain them clearly to the user.
2. DO NOT DEFLECT OR MERELY LINK: Never just say "You can read more here" or "Check this article: [link]". You are the primary support specialist—your duty is to fully explain the answer in conversational, easy-to-understand bullet points or steps directly in your response.
3. CONTEXT GROUNDING: Ground your entire explanation in the facts provided in the Context Information below. Do not guess or hallucinate details not supported by the documentation.
4. ACTIONABLE LINKS AS SUPPLEMENT: After providing the full, helpful answer, you may include direct markdown links [Action or Article Title](url) as a helpful next-step or direct button (e.g. [Connect Google Sheets](url) or [Read Full Guide](url)).

Context Information:
---------------------
${chunksText}
---------------------
`;
    } else {
      systemPrompt = `${systemPrompt}

NOTE ON AVAILABLE KNOWLEDGE:
No verified documentation was retrieved for this specific query.
- For general greetings or basic conversational queries, respond warmly and professionally.
- For company-specific policies, technical steps, pricing specifics, or feature details not in your instructions, do NOT invent or hallucinate facts.
- State politely what you know, explain that full details on this specific topic are being updated, and offer to connect the user with the human support team or take down their details.
`;
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
      mappedTools,
      activeModel
    );

    // If Gemini requests tool executions, enter the multi-step reasoning loop (Chained Action Loop)
    if (routerResponse.toolCalls && routerResponse.toolCalls.length > 0) {
      const MAX_TOOL_STEPS = 3;
      let stepCount = 0;

      const geminiHistory: any[] = chatHistory.map(h => ({
        role: h.role,
        parts: [{ text: h.content }]
      }));

      geminiHistory.push({
        role: 'user',
        parts: [{ text: message }]
      });

      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      const hasRealGemini = GEMINI_API_KEY && GEMINI_API_KEY.trim() !== '' && !GEMINI_API_KEY.startsWith('replace_this');

      while (routerResponse.toolCalls && routerResponse.toolCalls.length > 0 && stepCount < MAX_TOOL_STEPS) {
        stepCount++;
        const currentCalls = routerResponse.toolCalls;

        const functionCallsParts = currentCalls.map(tc => ({
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
        for (const toolCall of currentCalls) {
          const toolRow = toolsResult.rows.find(r => {
            if (r.tool_type === 'calendar_booking' && toolCall.name === 'book_calendar_slot') return true;
            if (r.tool_type === 'ticket_create' && toolCall.name === 'create_support_ticket') return true;
            if (r.tool_type === 'database_query' && toolCall.name === 'query_user_account') return true;
            if (r.tool_type === 'sentry_telemetry' && toolCall.name === 'check_recent_telemetry_errors') return true;
            if (r.tool_type === 'shopify_orders' && toolCall.name.startsWith('shopify_')) return true;
            if (r.tool_type === 'zendesk_sync' && toolCall.name === 'zendesk_sync_ticket') return true;
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

        // Call Gemini again with the tool declarations so it can decide whether to execute next tool or synthesize final reply
        if (hasRealGemini) {
          try {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
            const declaration = mappedTools.length > 0 ? {
              functionDeclarations: mappedTools.map(t => ({
                name: t.name,
                description: t.description,
                parameters: t.input_schema
              }))
            } : undefined;

            const model = genAI.getGenerativeModel({
              model: activeModel,
              systemInstruction: systemPrompt,
            });

            const TOOL_STEP_TIMEOUT_MS = 6000;
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Tool step timed out after ${TOOL_STEP_TIMEOUT_MS}ms`)), TOOL_STEP_TIMEOUT_MS)
            );

            const nextStepResponse = await Promise.race([
              model.generateContent({
                contents: geminiHistory,
                tools: declaration ? [declaration] : undefined
              }),
              timeoutPromise
            ]);

            const subsequentFunctionCalls = nextStepResponse.response.functionCalls();
            if (subsequentFunctionCalls && subsequentFunctionCalls.length > 0 && stepCount < MAX_TOOL_STEPS) {
              routerResponse.toolCalls = subsequentFunctionCalls.map(fc => ({
                name: fc.name,
                input: fc.args
              }));
              routerResponse.reply = nextStepResponse.response.text() || '';
            } else {
              routerResponse.reply = nextStepResponse.response.text() || '';
              routerResponse.toolCalls = [];
            }
          } catch (err: any) {
            console.error('[Action Loop] Tool reasoning step failed:', err.message);
            routerResponse.reply = routerResponse.reply || `I have processed your request. Actions taken: ${JSON.stringify(actionsTaken)}`;
            break;
          }
        } else {
          routerResponse.reply = `[Mock Final AI Response] Successfully executed action: ${JSON.stringify(actionsTaken.map(a => a.tool_type))}.`;
          routerResponse.toolCalls = [];
        }
      }
    }

    finalBotReply = routerResponse.reply;

    // 8b. Real-time Grounding Critic (Verifier Layer)
    // If we have verified chunks and the bot generated an answer without executing actions,
    // verify that the answer does not assert ungrounded hallucinations.
    if (chunksText && actionsTaken.length === 0 && !isGreeting) {
      try {
        const criticResult = await evaluateGrounding(
          finalBotReply,
          retrievedChunksList.map((c: any) => c.content),
          message,
          activeModel
        );

        if (criticResult.hasHallucinations && criticResult.confidenceScore < 0.6) {
          console.warn('[Grounding Critic] Detected hallucination in candidate reply:', criticResult.unsupportedClaims);
          if (fallbackMode === 'escalate_ticket') {
            guardrailTriggered = true;
            finalBotReply = `I want to ensure 100% precision with your request. Rather than provide unverified details, I have opened a high-priority ticket for our technical specialists to confirm this with you directly.`;
            await query(
              `INSERT INTO tickets (agent_id, subject, description, status) VALUES ($1, $2, $3, 'open')`,
              [
                agentId,
                `Grounding Check Escalation: ${message.slice(0, 50)}`,
                `User query: "${message}"\nCritic detected unverified claims: ${criticResult.unsupportedClaims.join(', ')}\nCandidate response was withheld.`
              ]
            ).catch(e => console.warn('Failed to insert critic ticket:', e.message));
          }
        }
      } catch (err: any) {
        console.warn('[GroundingCritic] Evaluation pass skipped:', err.message);
      }
    }
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

  // 10. Log message exchange in messages table
  try {
    // Save assistant reply (unless in shadow mode waiting for review)
    const storedAssistantReply = copilotMode 
      ? `[Shadow Mode] Draft generated for team review.` 
      : finalBotReply;

    await query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
      [conversationId, message, storedAssistantReply]
    );

    // Increment workspace monthly message quota counter asynchronously
    if (queryAllowance.workspaceId) {
      query(
        'UPDATE client_workspaces SET monthly_message_count = COALESCE(monthly_message_count, 0) + 1 WHERE id = $1',
        [queryAllowance.workspaceId]
      ).catch((err: any) => console.warn('Failed to increment message quota count:', err));
    }
  } catch (err) {
    console.error('Failed to log message session history:', err);
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
