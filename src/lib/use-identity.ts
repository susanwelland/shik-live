'use client';

// React hook that owns the Self-Hosted Identity Kernel for the running agent.
//
// The kernel is persisted to localStorage on THIS device — a deliberately
// minimal stand-in for the paper's "self-owned hardware" (Raspberry Pi, home
// server, USB module). It survives reloads, model swaps, and tab closes, and
// can be exported to / imported from any other node. The cognition engine
// (Gemini) never owns this state.

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  IdentityState,
  StateCommitments,
  InvariantResult,
  MemoryEntry,
  genesisIdentity,
  computeCommitments,
  checkInvariants,
  appendHistory,
  exportKernel,
  importKernel,
  buildHandshake,
  KernelExport,
  HandshakeMessage,
} from './shik-kernel';

const STORAGE_KEY = 'shik:identity:v0';

function reviveDates(state: IdentityState): IdentityState {
  return state; // dates are stored as ISO strings; no Date objects to revive
}

export function useIdentity() {
  const [identity, setIdentity] = useState<IdentityState | null>(null);
  const [commitments, setCommitments] = useState<StateCommitments | null>(null);
  const [invariants, setInvariants] = useState<InvariantResult[]>([]);
  const [activeEngine, setActiveEngine] = useState('Gemini 2.5 Flash (native audio)');
  const [ready, setReady] = useState(false);
  const prevRef = useRef<IdentityState | null>(null);

  // Bootstrap: load existing kernel from this device, or perform genesis.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let state: IdentityState | null = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) state = reviveDates(JSON.parse(raw));
      } catch {
        /* fall through to genesis */
      }
      if (!state) state = await genesisIdentity();
      if (cancelled) return;
      prevRef.current = state;
      setIdentity(state);
      setCommitments(await computeCommitments(state));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist + recompute commitments and invariants whenever identity changes.
  const commit = useCallback(async (next: IdentityState) => {
    const prev = prevRef.current ?? next;
    const inv = checkInvariants(prev, next);
    setInvariants(inv);
    setCommitments(await computeCommitments(next));
    prevRef.current = next;
    setIdentity(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage may be unavailable; kernel still lives in memory */
    }
  }, []);

  // --- mutation helpers --------------------------------------------------

  const recordHistory = useCallback(async (kind: string, summary: string) => {
    setIdentity((cur) => {
      if (!cur) return cur;
      appendHistory(cur.history, kind, summary).then((history) => {
        commit({ ...cur, history });
      });
      return cur;
    });
  }, [commit]);

  const addMemory = useCallback(
    async (entry: Omit<MemoryEntry, 'id' | 'createdAt'>) => {
      const cur = prevRef.current;
      if (!cur) return;
      const mem: MemoryEntry = {
        ...entry,
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
      };
      const history = await appendHistory(
        cur.history,
        'memory_commit',
        `Committed ${entry.kind} memory: ${entry.content.slice(0, 48)}`,
      );
      await commit({ ...cur, memory: [mem, ...cur.memory], history });
    },
    [commit],
  );

  const noteTurn = useCallback(
    async (summary: string) => {
      const cur = prevRef.current;
      if (!cur) return;
      const history = await appendHistory(cur.history, 'turn', summary);
      await commit({ ...cur, history });
    },
    [commit],
  );

  /** Demonstrate model independence: swap the cognition engine R while the
   *  identity state I is preserved untouched. */
  const swapEngine = useCallback(
    async (engine: string) => {
      setActiveEngine(engine);
      const cur = prevRef.current;
      if (!cur) return;
      const history = await appendHistory(
        cur.history,
        'engine_swap',
        `Cognition engine swapped to ${engine}; identity preserved`,
      );
      await commit({ ...cur, history });
    },
    [commit],
  );

  const exportToFile = useCallback(async (): Promise<KernelExport | null> => {
    const cur = prevRef.current;
    if (!cur) return null;
    const env = await exportKernel(cur);
    const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cur.id.replace(/[:#]/g, '_')}.shik.json`;
    a.click();
    URL.revokeObjectURL(url);
    return env;
  }, []);

  const importFromFile = useCallback(
    async (json: string): Promise<{ valid: boolean; reason: string }> => {
      const data = JSON.parse(json) as KernelExport;
      const result = await importKernel(data);
      if (result.valid) {
        const migrated = await appendHistory(
          result.state.history,
          'migrate',
          'Kernel imported onto this node (identity-equivalent restore)',
        );
        await commit({ ...result.state, history: migrated });
      }
      return { valid: result.valid, reason: result.reason };
    },
    [commit],
  );

  const makeHandshake = useCallback(
    async (direction: 'request' | 'response' = 'request'): Promise<HandshakeMessage | null> => {
      const cur = prevRef.current;
      if (!cur) return null;
      return buildHandshake(cur, direction);
    },
    [],
  );

  const reset = useCallback(async () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const fresh = await genesisIdentity();
    prevRef.current = fresh;
    setIdentity(fresh);
    setInvariants([]);
    setCommitments(await computeCommitments(fresh));
  }, []);

  return {
    ready,
    identity,
    commitments,
    invariants,
    activeEngine,
    addMemory,
    noteTurn,
    recordHistory,
    swapEngine,
    exportToFile,
    importFromFile,
    makeHandshake,
    reset,
  };
}

export type UseIdentity = ReturnType<typeof useIdentity>;
