import { NextRequest, NextResponse } from 'next/server';
import { KernelContext, buildSystemInstruction } from '@/lib/cognition-adapter';
import { callEngine, EngineId } from '@/lib/engines';

// Server-side cognition adapter. Same kernel-grounded prompt, pluggable engine.
//
//   gemini  → Google Generative AI (needs GEMINI_API_KEY)
//   ollama  → a self-hosted local model (OLLAMA_URL, default localhost:11434)
//   claude  → Anthropic API (needs ANTHROPIC_API_KEY)
//
// This is what makes the "model independence" claim runnable end-to-end: point
// `ollama` at a Llama 3 / Mistral running on the same Raspberry Pi or home GPU
// and the agent reasons with NO cloud dependency, while identity stays put.

export async function POST(request: NextRequest) {
  try {
    const { engine, message, context } = (await request.json()) as {
      engine: EngineId;
      message: string;
      context: KernelContext;
    };
    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    const system = buildSystemInstruction(context);
    const text = await callEngine(engine || 'gemini', system, message);

    return NextResponse.json({
      text,
      engine: engine || 'gemini',
      grounded: (context?.memories?.length ?? 0) + (context?.policies?.length ?? 0) > 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error) },
      { status: 500 },
    );
  }
}
