import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const { userText, agentText, currentMemories, currentContext } = await request.json();

    if (!userText && !agentText) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are an identity kernel processor. Extract structured updates from this conversation turn. Return ONLY valid JSON, no markdown.

USER SAID: ${userText}
AGENT SAID: ${agentText}

EXISTING MEMORIES: ${JSON.stringify(currentMemories || [])}
EXISTING CONTEXT: ${JSON.stringify(currentContext || [])}

Return this exact structure:
{
  "newCoreMemories": [{"content":"...", "sourceType":"voice", "confidence": 0.0-1.0}],
  "newSessionContext": [{"content":"...", "sourceType":"voice"}],
  "currentTopic": "short description",
  "events": ["what happened"]
}

EXTRACT as core memory (confidence >= 0.7):
- Name, role, organization
- Projects, research areas, expertise  
- Stated preferences
- Important facts about the user

DO NOT EXTRACT:
- Greetings, filler, small talk
- Things already in existing memories
- Anything the AGENT said (extract from USER statements only)
- Vague or uncertain information

Most turns produce 0-1 core memories. Be selective but not stingy - if the user shares real info about themselves, capture it.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // Clean up any markdown formatting
    const cleanJson = text.replace(/```json\n?|```\n?/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Extraction error:', error);
    return NextResponse.json({ 
      newCoreMemories: [],
      newSessionContext: [],
      currentTopic: null,
      events: ['extraction_failed']
    });
  }
}
