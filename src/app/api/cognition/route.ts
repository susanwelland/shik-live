// SHIK v2 — Cognition endpoint (the "mind")
// ---------------------------------------------------------------------------
// Provider-agnostic by design. The kernel is reached through ONE standard
// interface (kernel-interface.ts); the cognition engine behind it is selected by
// config — SHIK_MIND_PROVIDER — not hardwired. This is the build expression of
// SHIK's model-independence thesis (Kingsley 2025) and the MCP paper's
// "swap the model in a single configuration line" (Kingsley & Kingsley 2026).
//
// Voice stays on the realtime engine (Gemini Live); Claude has no native
// speech-to-speech API, so the mind proposes only non-speech actions and the
// two halves never contend for SHIK's voice.
import { NextRequest, NextResponse } from 'next/server';
import { CognitionTurn, MindProvider, EMPTY_DELTA } from '@/lib/kernel-interface';
import { claudeMind } from '@/lib/providers/claude-mind';

// The provider registry. Adding Gemini / a local model / a remote MCP client is
// a new entry here — the kernel, the UI, and the persistent state are untouched.
const PROVIDERS: Record<string, MindProvider> = {
  claude: claudeMind,
};

function selectProvider(): MindProvider | null {
  const id = process.env.SHIK_MIND_PROVIDER || 'claude';
  return PROVIDERS[id] ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const turn = (await request.json()) as CognitionTurn;

    if (!turn.userText && !turn.agentText) {
      return NextResponse.json({ error: 'No perception provided' }, { status: 400 });
    }

    const provider = selectProvider();
    if (!provider) {
      return NextResponse.json({ ...EMPTY_DELTA, events: ['mind_provider_unknown'] });
    }
    // Claude is the only provider that needs a key today; degrade gracefully.
    if (provider.id === 'claude' && !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ ...EMPTY_DELTA, events: ['mind_unconfigured'] });
    }

    const delta = await provider.reflect(turn);
    return NextResponse.json(delta);
  } catch (error) {
    console.error('Cognition error:', error);
    return NextResponse.json({ ...EMPTY_DELTA, events: ['cognition_failed'] });
  }
}
