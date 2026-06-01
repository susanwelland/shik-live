import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  EngineId,
  KernelContext,
  buildSystemInstruction,
} from '@/lib/cognition-adapter';

// Server-side cognition adapter. Same kernel-grounded prompt, pluggable engine.
//
//   gemini  → Google Generative AI (needs GEMINI_API_KEY)
//   ollama  → a self-hosted local model (OLLAMA_URL, default localhost:11434)
//   claude  → Anthropic API (needs ANTHROPIC_API_KEY)
//
// This is what makes the "model independence" claim runnable end-to-end: point
// `ollama` at a Llama 3 / Mistral running on the same Raspberry Pi or home GPU
// and the agent reasons with NO cloud dependency, while identity stays put.

async function runGemini(system: string, message: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const chat = model.startChat({
    history: [
      { role: 'user', parts: [{ text: system }] },
      { role: 'model', parts: [{ text: 'Understood — identity loaded.' }] },
    ],
  });
  const result = await chat.sendMessage(message);
  return result.response.text();
}

async function runOllama(system: string, message: string): Promise<string> {
  const url = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
  const res = await fetch(`${url.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: message },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status} — is it running at ${url}?`);
  const data = await res.json();
  return data.message?.content ?? '';
}

async function runClaude(system: string, message: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: message }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

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
    let text: string;
    switch (engine) {
      case 'ollama':
        text = await runOllama(system, message);
        break;
      case 'claude':
        text = await runClaude(system, message);
        break;
      case 'gemini':
      default:
        text = await runGemini(system, message);
        break;
    }

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
