import { NextRequest, NextResponse } from 'next/server';
import { callEngine, EngineId } from '@/lib/engines';

// Identity-kernel memory extractor. Runs on the SAME pluggable engine as
// cognition — so when the agent is on a self-hosted local model, the thing that
// *populates* its memory M is also local. No cloud dependency required.

export async function POST(request: NextRequest) {
  try {
    const { userText, agentText, currentMemories, currentContext, engine } =
      (await request.json()) as {
        userText: string;
        agentText: string;
        currentMemories?: string[];
        currentContext?: string[];
        engine?: EngineId;
      };

    if (!userText && !agentText) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const system =
      'You are an identity kernel processor. You extract durable, self-relevant ' +
      'facts from a conversation turn and return ONLY valid minified JSON.';

    const prompt = `Extract structured identity-kernel updates from this turn. Return ONLY JSON, no markdown.

USER SAID: ${userText}
AGENT SAID: ${agentText}

EXISTING MEMORIES: ${JSON.stringify(currentMemories || [])}
EXISTING CONTEXT: ${JSON.stringify(currentContext || [])}

Return exactly this structure:
{"newCoreMemories":[{"content":"...","sourceType":"voice","confidence":0.0}],"newSessionContext":[{"content":"...","sourceType":"voice"}],"currentTopic":"short description","events":["what happened"]}

EXTRACT as core memory (confidence >= 0.7): name, role, organization, projects, research areas, expertise, stated preferences, important facts about the USER.
DO NOT EXTRACT: greetings/filler/small talk, things already in existing memories, anything the AGENT said, vague info.
Most turns produce 0-1 core memories. Be selective.`;

    const raw = await callEngine(engine || 'gemini', system, prompt);

    // Tolerate models that wrap JSON in code fences or prose.
    const match = raw.match(/\{[\s\S]*\}/);
    const cleanJson = (match ? match[0] : raw).replace(/```json\n?|```\n?/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Extraction error:', error);
    return NextResponse.json({
      newCoreMemories: [],
      newSessionContext: [],
      currentTopic: null,
      events: ['extraction_failed'],
    });
  }
}
