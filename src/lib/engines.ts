// Shared cognition-engine dispatch — the one place that knows how to talk to a
// concrete model. Both the conversational adapter (/api/cognition) and the
// memory-extraction processor (/api/extract) route through here, so the agent
// can run end-to-end on a self-hosted local model with NO cloud dependency.

import { GoogleGenerativeAI } from '@google/generative-ai';

export type EngineId = 'gemini' | 'ollama' | 'claude';

export async function callEngine(engine: EngineId, system: string, message: string): Promise<string> {
  switch (engine) {
    case 'ollama':
      return runOllama(system, message);
    case 'claude':
      return runClaude(system, message);
    case 'gemini':
    default:
      return runGemini(system, message);
  }
}

async function runGemini(system: string, message: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });
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
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: message }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}
