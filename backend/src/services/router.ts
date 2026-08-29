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
 * Routes the query to the Gemini 1.5 Flash generative model using native tool-calling schemas 
 * and system prompts. Falls back to callMockRouter if no valid API key is present.
 */
export async function callGemini(
  systemPrompt: string,
  history: ChatMessage[],
  newMessage: string,
  tools?: ToolDefinition[]
): Promise<RouterResponse> {
  
  if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '' || GEMINI_API_KEY.startsWith('replace_this')) {
    return callMockRouter(newMessage);
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemPrompt,
    });

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
    console.error('Gemini generative AI completion failed. Falling back to mock. Error:', err.message);
    return callMockRouter(newMessage);
  }
}
