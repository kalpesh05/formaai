import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

  return {
    reply: `[Mock AI Response] Thank you for asking. Based on our workspace knowledge, here is your answer to: "${newMessage}"`,
    toolCalls: []
  };
}

/**
 * Routes the query to Google Gemini using native tool-calling schemas and system prompts.
 * Dynamically uses the selected model (default: gemini-3.8-flash) with fallback resilience.
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

  // List candidate models: requested model first, then modern high-availability fallbacks
  const requestedModel = (modelName && modelName.trim()) ? modelName.trim() : 'gemini-3.8-flash';
  const candidateModels = [
    requestedModel,
    'gemini-3.5-flash-lite',
    'gemini-3.1-pro',
    'gemini-3.8-flash'
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

  let lastError: any = null;

  for (const candidate of candidateModels) {
    // Retry once on transient demand spikes (503 Service Unavailable or 429 Rate Limit)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({
          model: candidate,
          systemInstruction: systemPrompt,
        });

        const response = await model.generateContent({
          contents,
          tools: declaration ? [declaration] : undefined,
        });

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
          console.warn(`[Forma AI] Gemini model '${candidate}' hit transient spike (${err.message}). Retrying in 800ms...`);
          await new Promise(res => setTimeout(res, 800));
          continue;
        }
        console.warn(`[Forma AI] Gemini model '${candidate}' invocation failed: ${err.message}. Trying next candidate...`);
        break;
      }
    }
  }

  console.error('All Gemini model candidates failed. Error:', lastError?.message);
  return callMockRouter(newMessage);
}
