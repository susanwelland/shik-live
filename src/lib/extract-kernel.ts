import { GoogleGenerativeAI } from '@google/generative-ai';

const genai = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

export async function extractKernelUpdates(
  userText: string,
  agentText: string,
  currentMemories: string[],
  currentContext: string[]
) {
  const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are an identity kernel processor. Extract structured updates from this conversation turn. Return ONLY valid JSON.

USER SAID: ${userText}
AGENT SAID: ${agentText}

EXISTING MEMORIES: ${JSON.stringify(currentMemories)}
EXISTING CONTEXT: ${JSON.stringify(currentContext)}

Return:
{
  "newCoreMemories": [{"content":"...","sourceType":"voice","confidence":0.0-1.0}],
  "newSessionContext": [{"content":"...","sourceType":"voice"}],
  "currentTopic": "short description",
  "events": ["what happened"]
}

EXTRACT as core memory (confidence >= 0.7):
- Name, role, organization
- Projects, research areas, expertise
- Stated preferences

DO NOT EXTRACT:
- Greetings, filler, small talk
- Things already in existing memories
- Anything the AGENT said (user statements only)
- Emotional reactions to the conversation

Most turns produce 0 core memories and 1 session context. Be selective.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
  } catch (e) {
    console.error('Extraction failed:', e);
    return null;
  }
}
