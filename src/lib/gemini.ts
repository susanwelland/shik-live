import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const geminiModel = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash-exp',
});

// System prompt for SHIK Live agent
export const SHIK_SYSTEM_PROMPT = `You are SHIK Live, a real-time AI agent demonstrating the Self-Hosted Identity Kernel architecture.

Your key characteristics:
- You maintain continuity through an explicit identity kernel (visible in the UI)
- You can be interrupted mid-response and handle it gracefully
- You reference visual context when the user shares their camera or screen
- You acknowledge when memories are being stored to the kernel

When responding:
- Be concise and conversational
- Reference what you see if visual input is active
- Acknowledge your identity kernel when relevant ("I'll remember that..." or "Adding to my core memory...")
- If interrupted, smoothly transition to the new topic

You are demonstrating a research concept: that AI agent identity should be an explicit architectural layer, separate from the cognition engine.`;

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export async function chat(
  history: GeminiMessage[],
  userMessage: string,
  visualContext?: string
): Promise<string> {
  const chat = geminiModel.startChat({
    history: [
      { role: 'user', parts: [{ text: SHIK_SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: 'Understood. I am SHIK Live, ready to demonstrate the Self-Hosted Identity Kernel architecture. I will maintain continuity, handle interruptions gracefully, and reference any visual context you share.' }] },
      ...history,
    ],
  });

  let prompt = userMessage;
  if (visualContext) {
    prompt = `[Visual context: ${visualContext}]\n\n${userMessage}`;
  }

  const result = await chat.sendMessage(prompt);
  const response = await result.response;
  return response.text();
}

export async function streamChat(
  history: GeminiMessage[],
  userMessage: string,
  onChunk: (text: string) => void,
  visualContext?: string
): Promise<string> {
  const chat = geminiModel.startChat({
    history: [
      { role: 'user', parts: [{ text: SHIK_SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: 'Understood. I am SHIK Live, ready.' }] },
      ...history,
    ],
  });

  let prompt = userMessage;
  if (visualContext) {
    prompt = `[Visual context: ${visualContext}]\n\n${userMessage}`;
  }

  const result = await chat.sendMessageStream(prompt);
  let fullText = '';

  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    fullText += chunkText;
    onChunk(chunkText);
  }

  return fullText;
}
