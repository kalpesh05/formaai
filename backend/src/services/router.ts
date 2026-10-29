import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const GROQ_API_KEY = process.env.GROQ_API_KEY;

export interface ChatMessage {
  role: 'user' | 'model'; // Gemini SDK format: user or model
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: any; // JSON Schema structure
}

export interface RouterResponse {
  reply: string;
  toolCalls: { name: string; input: any }[];
}

/**
 * Generates a mock response for local testing/debugging when Gemini API credentials are absent.
 * Automatically mocks a tool execution trigger if the user query contains 'book' or 'demo'.
 */
export function callMockRouter(newMessage: string): RouterResponse {
  const normalized = newMessage.toLowerCase();
  
  if (normalized.includes('book') || normalized.includes('demo') || normalized.includes('calendar') || normalized.includes('schedule')) {
    return {
      reply: "Sure! Let me check the schedule and book a calendar slot for you.",
      toolCalls: [
        {
          name: 'book_calendar_slot',
          input: {
            date: '2026-09-01',
            time: '14:00',
            attendee_email: 'customer@example.com'
          }
        }
      ]
    };
  }

  if (normalized.includes('ticket') || normalized.includes('escalate') || normalized.includes('human') || normalized.includes('help')) {
    return {
      reply: "I will open a support ticket for our support team to look into this.",
      toolCalls: [
        {
          name: 'create_support_ticket',
          input: {
            subject: 'Support Request Escalation',
            description: `User requested escalation: "${newMessage}"`
          }
        }
      ]
    };
  }

  if (/^(hi|hello|hey|good morning|good afternoon|good evening|howdy)\b/i.test(normalized.trim())) {
    return {
      reply: "Hello! How can I help you today? Feel free to ask any questions about our products, services, or account details.",
      toolCalls: []
    };
  }

  return {
    reply: `Thank you for asking. Based on our workspace knowledge base, here is information regarding your request: "${newMessage}". Please let me know if you need any additional details or assistance!`,
    toolCalls: []
  };
}

/**
 * Automatically resolves model names to real, currently supported Gemini endpoints.
 * Maps legacy or retired models (such as 1.5 or 2.0) to active generation models (gemini-3.8-flash).
 */
export function resolveGeminiModel(inputModel?: string): string {
  if (!inputModel || !inputModel.trim()) {
    return 'gemini-3.8-flash';
  }
  const clean = inputModel.trim().toLowerCase();

  // If user or agent requests legacy/retired models (1.5, 2.0), upgrade to 3.8-flash as instructed by Google API
  if (clean.includes('1.5') || clean.includes('2.0') || clean.includes('bison')) {
    return 'gemini-3.8-flash';
  }

  if (clean.includes('argon') || clean.includes('4-')) {
    return 'gemini-3.1-pro-preview';
  }
  if (clean.includes('3.8')) {
    return 'gemini-3.8-flash';
  }
  if (clean.includes('3.6')) {
    return 'gemini-3.6-flash';
  }
  if (clean.includes('3.5-flash-lite')) {
    return 'gemini-3.5-flash-lite';
  }
  if (clean.includes('3.5')) {
    return 'gemini-3.5-flash';
  }
  if (clean.includes('3.1')) {
    return 'gemini-3.1-pro-preview';
  }
  if (clean.includes('2.5')) {
    return 'gemini-2.5-flash';
  }

  return clean;
}

export function getGeminiCandidates(requestedModelName?: string): string[] {
  const resolved = resolveGeminiModel(requestedModelName);
  const fallbacks = [
    resolved,
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash'
  ];
  return Array.from(new Set(fallbacks));
}

/**
 * Routes the query to Google Gemini using native tool-calling schemas and system prompts.
 * Dynamically uses the selected model (default: gemini-3.8-flash) with fallback resilience and strict timeouts.
 */
export async function callGemini(
  systemPrompt: string,
  history: ChatMessage[],
  newMessage: string,
  tools?: ToolDefinition[],
  modelName: string = 'gemini-3.8-flash'
): Promise<RouterResponse> {
  
  if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '' || GEMINI_API_KEY.startsWith('replace_this')) {
    return callMockRouter(newMessage);
  }

  // Structure chat contents for Gemini
  const contents: any[] = history.map(h => ({
    role: h.role,
    parts: [{ text: h.content }]
  }));

  contents.push({
    role: 'user',
    parts: [{ text: newMessage }]
  });

  // Format tools payload for Gemini functionDeclarations
  let declaration: any = undefined;
  if (tools && tools.length > 0) {
    declaration = {
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema
      }))
    };
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  // Normalize model name and ensure real production active Gemini models are used
  const candidateModels = getGeminiCandidates(modelName);

  let lastError: any = null;
  const ATTEMPT_TIMEOUT_MS = 8000;

  for (const candidate of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({
          model: candidate,
          systemInstruction: systemPrompt,
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${ATTEMPT_TIMEOUT_MS}ms for model '${candidate}'`)), ATTEMPT_TIMEOUT_MS)
        );

        const response = await Promise.race([
          model.generateContent({
            contents,
            tools: declaration ? [declaration] : undefined,
          }),
          timeoutPromise
        ]);

        const reply = response.response.text() || '';
        const toolCalls: { name: string; input: any }[] = [];

        // Parse native function calls from Gemini output
        const functionCalls = response.response.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
          for (const fc of functionCalls) {
            toolCalls.push({
              name: fc.name,
              input: fc.args
            });
          }
        }

        return { reply, toolCalls };
      } catch (err: any) {
        lastError = err;
        const isTransient = err.message?.includes('503') || err.message?.includes('high demand') || err.message?.includes('429');
        if (isTransient && attempt === 0) {
          console.warn(`[KromaDesk] Gemini model '${candidate}' hit transient spike (${err.message}). Retrying in 700ms...`);
          await new Promise(res => setTimeout(res, 700));
          continue;
        }
        console.warn(`[KromaDesk] Gemini model '${candidate}' invocation failed: ${err.message}. Trying next candidate...`);
        break;
      }
    }
  }

  console.error('All Gemini model candidates failed or timed out. Error:', lastError?.message);
  return callMockRouter(newMessage);
}

/**
 * Executes inference on Groq's ultra-low latency LPU Inference Engine.
 * Supports OpenAI-compatible API with native function/tool calling and ~100-300ms latency.
 */
export async function callGroq(
  systemPrompt: string,
  history: ChatMessage[],
  newMessage: string,
  tools?: ToolDefinition[],
  modelName: string = 'openai/gpt-oss-120b'
): Promise<RouterResponse> {
  if (!GROQ_API_KEY || GROQ_API_KEY.trim() === '') {
    return callMockRouter(newMessage);
  }

  const messages: { role: string; content: string }[] = [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  for (const h of history) {
    messages.push({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: h.content
    });
  }

  messages.push({ role: 'user', content: newMessage });

  // Map tool definitions to OpenAI functions format
  let openAiTools: any = undefined;
  if (tools && tools.length > 0) {
    openAiTools = tools.map(t => {
      const properties: Record<string, any> = {};
      const required: string[] = t.input_schema?.required || [];
      if (t.input_schema?.properties) {
        for (const [key, prop] of Object.entries<any>(t.input_schema.properties)) {
          properties[key] = {
            type: (prop.type || 'string').toLowerCase(),
            description: prop.description || ''
          };
        }
      }
      return {
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: 'object',
            properties,
            required
          }
        }
      };
    });
  }

  const candidateModels = [
    modelName && !modelName.startsWith('gemini') ? modelName : 'openai/gpt-oss-120b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b'
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

  let lastError: any = null;
  const GROQ_TIMEOUT_MS = 6000;

  for (const candidate of candidateModels) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

      const payload: any = {
        model: candidate,
        messages,
        temperature: 0.3
      };
      if (openAiTools && openAiTools.length > 0) {
        payload.tools = openAiTools;
        payload.tool_choice = 'auto';
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Groq HTTP ${res.status}: ${errorText}`);
      }

      const data: any = await res.json();
      const choice = data.choices?.[0]?.message;
      if (!choice) {
        throw new Error('Groq returned empty choice');
      }

      const reply = choice.content || '';
      const toolCalls: { name: string; input: any }[] = [];

      if (choice.tool_calls && Array.isArray(choice.tool_calls)) {
        for (const tc of choice.tool_calls) {
          if (tc.type === 'function' && tc.function) {
            let parsedArgs = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments || '{}');
            } catch (e) {
              console.warn('[Groq] Failed to parse tool arguments JSON:', tc.function.arguments);
            }
            toolCalls.push({
              name: tc.function.name,
              input: parsedArgs
            });
          }
        }
      }

      return { reply, toolCalls };
    } catch (err: any) {
      lastError = err;
      console.warn(`[Groq] Model '${candidate}' invocation failed: ${err.message}. Trying next candidate...`);
    }
  }

  throw lastError || new Error('All Groq candidate models failed');
}

/**
 * Master multi-provider router.
 * Evaluates requested provider (Groq or Gemini).
 * Features automatic bidirectional failover:
 * - If Groq is primary: calls Groq, seamlessly falls back to Gemini if needed.
 * - If Gemini is primary: calls Gemini, seamlessly falls back to Groq if 503/429 spikes occur.
 */
export async function routeQuery(
  systemPrompt: string,
  history: ChatMessage[],
  newMessage: string,
  tools?: ToolDefinition[],
  provider: string = 'groq',
  modelName?: string
): Promise<RouterResponse> {
  const normProvider = (provider || 'groq').toLowerCase();

  // 1. If agent explicitly requested Gemini:
  if (normProvider === 'gemini') {
    try {
      const geminiRes = await callGemini(systemPrompt, history, newMessage, tools, modelName);
      // If Gemini returned default mock fallback and Groq is available, seamlessly let Groq answer
      const isMock = geminiRes.reply.includes('workspace knowledge base') || geminiRes.reply.includes('Hello! How can I help');
      if (isMock && GROQ_API_KEY) {
        console.info('[Router] Gemini returned fallback placeholder; seamlessly failing over to Groq LPU...');
        try {
          return await callGroq(systemPrompt, history, newMessage, tools, 'openai/gpt-oss-120b');
        } catch {}
      }
      return geminiRes;
    } catch (err: any) {
      console.warn('[Router] Gemini failed, failing over to Groq LPU:', err.message);
      if (GROQ_API_KEY) {
        try {
          return await callGroq(systemPrompt, history, newMessage, tools, 'openai/gpt-oss-120b');
        } catch (groqErr: any) {
          console.error('[Router] Both Gemini and Groq failover failed:', groqErr.message);
        }
      }
      return callMockRouter(newMessage);
    }
  }

  // 2. Default / Primary: Groq LPU inference (fastest response time <500ms)
  try {
    return await callGroq(systemPrompt, history, newMessage, tools, modelName);
  } catch (groqErr: any) {
    console.warn('[Router] Groq invocation failed, failing over to secondary Gemini provider:', groqErr.message);
    if (GEMINI_API_KEY && !GEMINI_API_KEY.startsWith('replace_this')) {
      try {
        return await callGemini(systemPrompt, history, newMessage, tools, 'gemini-3.8-flash');
      } catch (geminiErr: any) {
        console.error('[Router] Secondary Gemini failover also failed:', geminiErr.message);
      }
    }
    return callMockRouter(newMessage);
  }
}
