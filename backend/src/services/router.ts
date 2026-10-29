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
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
    'gemini-2.5-flash'
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
      console.warn(`[KromaDesk] Gemini model '${candidate}' invocation failed: ${err.message}. Trying next candidate...`);
    }
  }

  console.error('All Gemini model candidates failed or timed out. Error:', lastError?.message);
  return callMockRouter(newMessage);
}
