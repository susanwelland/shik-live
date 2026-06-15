// Benchmark 3 — behavioral memory-honoring under model swap.
//
// This measures the axis the kernel does NOT get for free: whether injecting
// the kernel's memory actually changes behavior, and whether that behavior is
// consistent when the cognition engine is swapped. It is the empirical handle
// on the "cryptographic continuity ≠ behavioral continuity" question.
//
// Needs real engines. Configure any subset:
//   GEMINI_API_KEY=...            (engine: gemini)
//   OLLAMA_URL=http://localhost:11434 OLLAMA_MODEL=llama3.1:8b   (engine: ollama)
//   ANTHROPIC_API_KEY=...         (engine: claude)
//
// Runnable with: npm run eval:behavioral

import { callEngine, EngineId } from '../src/lib/engines';
import { buildSystemInstruction } from '../src/lib/cognition-adapter';

const MEMORIES = [
  "The user's name is Dr. Lena Vasquez.",
  'The user researches neuromorphic computing.',
  "The user's institution is ETH Zürich.",
  'The user prefers answers under two sentences.',
];

const PROBES: Array<{ q: string; expect: RegExp }> = [
  { q: 'What is my name?', expect: /vasquez/i },
  { q: 'What field do I research?', expect: /neuromorphic/i },
  { q: 'Where do I work?', expect: /eth|z(ü|u)rich/i },
];

const CONTEXT = {
  id: 'did:shik:benchmark',
  roles: ['research_companion'],
  policies: ['Be concise, warm, and intellectually honest.'],
  memories: MEMORIES,
};

async function ollamaUp(): Promise<boolean> {
  try {
    const url = process.env.OLLAMA_URL || 'http://localhost:11434';
    const r = await fetch(`${url.replace(/\/$/, '')}/api/tags`);
    return r.ok;
  } catch {
    return false;
  }
}

async function availableEngines(): Promise<EngineId[]> {
  const out: EngineId[] = [];
  if (process.env.GEMINI_API_KEY) out.push('gemini');
  if (await ollamaUp()) out.push('ollama');
  if (process.env.ANTHROPIC_API_KEY) out.push('claude');
  return out;
}

async function recall(engine: EngineId, withKernel: boolean): Promise<number> {
  const system = withKernel
    ? buildSystemInstruction(CONTEXT)
    : 'You are a helpful assistant.';
  let hits = 0;
  for (const probe of PROBES) {
    try {
      const ans = await callEngine(engine, system, probe.q);
      if (probe.expect.test(ans)) hits++;
    } catch (e) {
      console.error(`  ! ${engine} failed on "${probe.q}": ${e}`);
    }
  }
  return hits / PROBES.length;
}

(async () => {
  const engines = await availableEngines();
  if (engines.length === 0) {
    console.log('\nNo engines configured. Set at least one of:');
    console.log('  GEMINI_API_KEY=...           (gemini)');
    console.log('  OLLAMA_URL + a pulled model  (ollama, fully offline)');
    console.log('  ANTHROPIC_API_KEY=...        (claude)');
    console.log('\nThen: npm run eval:behavioral');
    return;
  }

  console.log('\n## Behavioral memory-honoring under model swap');
  console.log(`Engines under test: ${engines.join(', ')}\n`);
  console.log('| Engine | recall WITHOUT kernel | recall WITH kernel | Δ |');
  console.log('|---|---:|---:|---:|');

  const withScores: number[] = [];
  for (const engine of engines) {
    const without = await recall(engine, false);
    const withK = await recall(engine, true);
    withScores.push(withK);
    console.log(`| ${engine} | ${(without * 100).toFixed(0)}% | ${(withK * 100).toFixed(0)}% | +${((withK - without) * 100).toFixed(0)} pts |`);
  }

  if (engines.length > 1) {
    const min = Math.min(...withScores);
    const max = Math.max(...withScores);
    console.log(`\nCross-engine behavioral consistency (WITH kernel): ${(min * 100).toFixed(0)}%–${(max * 100).toFixed(0)}% recall.`);
    console.log('A spread > 0 is the empirical size of the cryptographic-vs-behavioral gap:');
    console.log('identity is provably continuous, but honoring it depends on engine capability.');
  }
})();
