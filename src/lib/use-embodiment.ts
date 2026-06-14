// SHIK v2 — Browser embodiment hook
// Tracks the agent's first-person state while inhabiting the `browser` body:
// the live manifest (which sensors are streaming), the Perception Bus (senses
// in), the Action Bus (acts out), presence history, and the derived SelfModel.
// This is the state layer behind the agent-perspective cockpit (M1). It is
// engine-agnostic — the same shape will back the Raspberry Pi body (M2).
import { useState, useCallback, useRef, useMemo } from 'react';
import {
  BROWSER_MANIFEST,
  EmbodimentManifest,
  SensorKind,
  Percept,
  Action,
  SelfModel,
  PresenceIntent,
  PresenceRecord,
} from './embodiment';

// Omit that distributes across a discriminated union (plain Omit collapses the
// union to its shared keys, losing the per-variant fields).
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type PerceptInput = DistributiveOmit<Percept, 'id' | 'at'>;
export type ActionInput = DistributiveOmit<Action, 'id' | 'at' | 'bodyId'>;

export function useEmbodiment() {
  const [manifest, setManifest] = useState<EmbodimentManifest>(BROWSER_MANIFEST);
  const [percepts, setPercepts] = useState<Percept[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [presenceHistory, setPresenceHistory] = useState<PresenceRecord[]>([]);
  const [presenceIntent, setPresenceIntent] = useState<PresenceIntent>('idle');
  const [bound, setBound] = useState(false);
  const [reflection, setReflection] = useState('');

  const seq = useRef(0);
  const nextId = useCallback(() => `${Date.now()}-${seq.current++}`, []);

  // Toggle whether a sensor on this body is currently streaming.
  const setSensorAvailable = useCallback((kind: SensorKind, available: boolean) => {
    setManifest(m => ({
      ...m,
      sensors: m.sensors.map(s => (s.kind === kind ? { ...s, available } : s)),
    }));
  }, []);

  // A sense arrives on the Perception Bus.
  const addPercept = useCallback((p: PerceptInput) => {
    const full = { ...p, id: nextId(), at: Date.now() } as Percept;
    setPercepts(prev => [full, ...prev].slice(0, 50));
  }, [nextId]);

  // The agent acts through the body. `light` acts also drive presence state.
  const addAction = useCallback((a: ActionInput) => {
    const full = { ...a, id: nextId(), at: Date.now(), bodyId: manifest.bodyId } as Action;
    setActions(prev => [full, ...prev].slice(0, 50));
    if (full.kind === 'light') setPresenceIntent(full.intent);
  }, [nextId, manifest.bodyId]);

  // Express a presence/light intent directly (status → LED ring on the Pi later).
  const signal = useCallback((intent: PresenceIntent) => {
    setPresenceIntent(intent);
    addAction({ kind: 'light', intent });
  }, [addAction]);

  // SHIK wakes up in this body — append to presence history, mark bound.
  const bind = useCallback(() => {
    setBound(true);
    setManifest(m => ({ ...m, active: true }));
    setPresenceHistory(prev => [
      { bodyId: manifest.bodyId, displayName: manifest.displayName, enteredAt: Date.now(), leftAt: null },
      ...prev,
    ]);
  }, [manifest.bodyId, manifest.displayName]);

  // SHIK leaves this body — close the open presence record.
  const unbind = useCallback(() => {
    setBound(false);
    setManifest(m => ({ ...m, active: false }));
    setPresenceHistory(prev =>
      prev.map((r, i) => (i === 0 && r.leftAt === null ? { ...r, leftAt: Date.now() } : r)),
    );
  }, []);

  const selfModel = useCallback(
    (coreMemoryCount: number): SelfModel => ({
      agentName: 'SHIK',
      currentBody: bound ? manifest : null,
      presenceHistory,
      coreMemoryCount,
      bound,
    }),
    [bound, manifest, presenceHistory],
  );

  const activeSensors = useMemo(() => manifest.sensors.filter(s => s.available), [manifest]);

  return {
    manifest,
    percepts,
    actions,
    presenceHistory,
    presenceIntent,
    bound,
    reflection,
    activeSensors,
    setReflection,
    setSensorAvailable,
    addPercept,
    addAction,
    signal,
    bind,
    unbind,
    selfModel,
  };
}
