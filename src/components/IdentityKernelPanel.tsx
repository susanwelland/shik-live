'use client';

// The visible Self-Hosted Identity Kernel: the full I = ⟨id, K, P, M, H⟩ tuple,
// its live cryptographic commitments, and a continuous invariant monitor.
//
// This is the thesis made tangible — the agent's *self* as an explicit,
// inspectable, portable substrate that is separate from the cognition engine.

import { useRef, useState } from 'react';
import { UseIdentity } from '@/lib/use-identity';
import HandshakeModal from './HandshakeModal';

interface SessionContextItem {
  id: string;
  content: string;
  sourceType: string;
}

const ENGINES = [
  'Gemini 2.5 Flash (native audio)',
  'Gemini 2.0 Flash',
  'Local model (Llama 3, self-hosted)',
  'Claude (API)',
];

function Hash({ value }: { value: string }) {
  return (
    <span className="font-mono text-[10px] text-[var(--shik-text-muted)]" title={value}>
      {value.replace('sha256:', '').slice(0, 16)}…
    </span>
  );
}

export default function IdentityKernelPanel({
  id: idApi,
  sessionContext,
}: {
  id: UseIdentity;
  sessionContext: SessionContextItem[];
}) {
  const { identity, commitments, invariants, activeEngine } = idApi;
  const [showHandshake, setShowHandshake] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!identity) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[var(--shik-text-muted)]">
        Bootstrapping identity kernel…
      </div>
    );
  }

  const semantic = identity.memory.filter((m) => m.kind === 'semantic');
  const episodic = identity.memory.filter((m) => m.kind === 'episodic');
  const corePolicies = identity.policies.filter((p) => p.core);
  const softPolicies = identity.policies.filter((p) => !p.core);
  const recentHistory = identity.history.slice(-4).reverse();

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const result = await idApi.importFromFile(text);
      setImportMsg(result.reason);
    } catch {
      setImportMsg('Could not parse kernel export.');
    }
    e.target.value = '';
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Identity Anchor — id + active key K */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--shik-accent)] mb-2">IDENTITY ANCHOR · ⟨id, K⟩</h3>
        <div className="p-3 rounded bg-[var(--shik-surface)] border border-[var(--shik-border)] text-xs space-y-1">
          <div className="flex justify-between gap-2">
            <span className="text-[var(--shik-text-muted)]">DID</span>
            <span className="font-mono text-[10px] text-right break-all">{identity.id}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-[var(--shik-text-muted)]">Active key</span>
            <span className="font-mono text-[10px] text-right" title={identity.activeKey.publicKeyB58}>
              {identity.activeKey.keyId.split('#')[1]} · {identity.activeKey.publicKeyB58.slice(0, 12)}…
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-[var(--shik-text-muted)]">Profile / roles</span>
            <span className="text-right">v{identity.profileVersion} · {identity.roles.join(', ')}</span>
          </div>
          {identity.keyLineage.length > 0 && (
            <div className="flex justify-between gap-2">
              <span className="text-[var(--shik-text-muted)]">Key rotations</span>
              <span>{identity.keyLineage.length} (auditable lineage)</span>
            </div>
          )}
        </div>
      </section>

      {/* Cognition engine R — demonstrates model independence */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--shik-accent)] mb-2">COGNITION ENGINE · R</h3>
        <div className="p-3 rounded bg-[var(--shik-surface)] border border-[var(--shik-border)] text-xs space-y-2">
          <p className="text-[var(--shik-text-muted)] leading-snug">
            The engine is swappable; the identity above is not. Swap it to see the kernel persist.
          </p>
          <select
            value={activeEngine}
            onChange={(e) => idApi.swapEngine(e.target.value)}
            className="w-full px-2 py-1.5 rounded bg-[var(--shik-surface-light)] border border-[var(--shik-border)] text-white text-xs"
          >
            {ENGINES.map((eng) => (
              <option key={eng} value={eng}>{eng}</option>
            ))}
          </select>
        </div>
      </section>

      {/* State commitments — the cryptographic spine */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--shik-warning)] mb-2">STATE COMMITMENTS</h3>
        <div className="p-3 rounded bg-[var(--shik-surface)] border border-[var(--shik-border)] text-xs space-y-1">
          <div className="flex justify-between"><span className="text-[var(--shik-text-muted)]">policy_core_root</span><Hash value={commitments?.policy_core_root ?? ''} /></div>
          <div className="flex justify-between"><span className="text-[var(--shik-text-muted)]">memory_root</span><Hash value={commitments?.memory_root ?? ''} /></div>
          <div className="flex justify-between"><span className="text-[var(--shik-text-muted)]">history_tip</span><Hash value={commitments?.history_tip ?? ''} /></div>
        </div>
      </section>

      {/* Invariant monitor — the five invariants, live */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--shik-success)] mb-2">INVARIANT MONITOR</h3>
        <div className="space-y-1">
          {invariants.length === 0 ? (
            <p className="text-xs text-[var(--shik-text-muted)] italic">
              All five invariants hold. They are re-checked on every transition (memory, policy, key, migration).
            </p>
          ) : (
            invariants.map((inv) => (
              <div key={inv.id} className="flex items-start gap-2 text-xs p-2 rounded bg-[var(--shik-surface)] border border-[var(--shik-border)]">
                <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${inv.ok ? 'bg-[var(--shik-success)]' : 'bg-[var(--shik-danger)]'}`} />
                <div>
                  <div className="text-white">{inv.label}</div>
                  <div className="text-[var(--shik-text-muted)] text-[10px]">{inv.detail}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Memory M — semantic + episodic */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--shik-warning)] mb-2">MEMORY · M ({identity.memory.length})</h3>
        {identity.memory.length === 0 ? (
          <p className="text-xs text-[var(--shik-text-muted)] italic">Semantic facts and episodic summaries appear here as the agent learns.</p>
        ) : (
          <div className="space-y-2">
            {semantic.length > 0 && (
              <div className="text-[10px] uppercase tracking-wide text-[var(--shik-text-muted)]">Semantic</div>
            )}
            {semantic.map((m) => (
              <MemoryCard key={m.id} content={m.content} meta={`${m.sourceType} · ${(m.confidence * 100).toFixed(0)}%`} />
            ))}
            {episodic.length > 0 && (
              <div className="text-[10px] uppercase tracking-wide text-[var(--shik-text-muted)] pt-1">Episodic</div>
            )}
            {episodic.map((m) => (
              <MemoryCard key={m.id} content={m.content} meta={m.sourceType} />
            ))}
          </div>
        )}
      </section>

      {/* Policy & values P */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--shik-accent)] mb-2">POLICY &amp; VALUES · P</h3>
        <div className="space-y-1">
          {corePolicies.map((p) => (
            <div key={p.id} className="flex items-start gap-2 text-[11px] p-2 rounded bg-[var(--shik-surface)] border border-[var(--shik-border)]">
              <span className="text-[var(--shik-danger)] text-[9px] mt-0.5 font-semibold">CORE</span>
              <span>{p.statement}</span>
            </div>
          ))}
          {softPolicies.map((p) => (
            <div key={p.id} className="flex items-start gap-2 text-[11px] p-2 rounded bg-[var(--shik-surface)] border border-[var(--shik-border)]">
              <span className="text-[var(--shik-text-muted)] text-[9px] mt-0.5">soft</span>
              <span className="text-[var(--shik-text-muted)]">{p.statement}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Interaction history H */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--shik-success)] mb-2">HISTORY · H (append-only, {identity.history.length})</h3>
        <div className="space-y-1">
          {recentHistory.map((h) => (
            <div key={h.hash} className="text-[11px] p-2 rounded bg-[var(--shik-surface)] border border-[var(--shik-border)]">
              <span className="text-[var(--shik-accent)]">#{h.seq} {h.kind}</span>
              <span className="text-[var(--shik-text-muted)]"> — {h.summary}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Transient session context (not part of persistent I) */}
      {sessionContext.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-[var(--shik-text-muted)] mb-2">SESSION CONTEXT (transient)</h3>
          <div className="space-y-1">
            {sessionContext.map((c) => (
              <div key={c.id} className="text-[11px] p-2 rounded bg-[var(--shik-surface)] border border-[var(--shik-border)] text-[var(--shik-text-muted)]">
                {c.content}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Portability + inter-agent actions */}
      <section className="pt-2 border-t border-[var(--shik-border)] space-y-2">
        {importMsg && <p className="text-[10px] text-[var(--shik-text-muted)]">{importMsg}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => idApi.exportToFile()} className="py-2 rounded text-xs bg-[var(--shik-surface-light)] hover:bg-[var(--shik-border)] transition-colors" title="Serialize the signed kernel to a portable file">
            ⬇ Export kernel
          </button>
          <button onClick={() => fileRef.current?.click()} className="py-2 rounded text-xs bg-[var(--shik-surface-light)] hover:bg-[var(--shik-border)] transition-colors" title="Restore a kernel exported from another node">
            ⬆ Import kernel
          </button>
          <button onClick={() => setShowHandshake(true)} className="py-2 rounded text-xs bg-[var(--shik-surface-light)] hover:bg-[var(--shik-border)] transition-colors" title="Generate a SHIK Handshake v0 message">
            🤝 Handshake
          </button>
          <button onClick={() => idApi.reset()} className="py-2 rounded text-xs bg-[var(--shik-surface-light)] hover:bg-[var(--shik-border)] transition-colors" title="Discard and regenerate a fresh identity">
            ↺ New identity
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
      </section>

      {showHandshake && (
        <HandshakeModal build={idApi.makeHandshake} onClose={() => setShowHandshake(false)} />
      )}
    </div>
  );
}

function MemoryCard({ content, meta }: { content: string; meta: string }) {
  return (
    <div className="p-2 rounded bg-[var(--shik-surface)] text-xs border border-[var(--shik-border)]">
      <p>{content}</p>
      <div className="text-[var(--shik-text-muted)] text-[10px] mt-1">{meta}</div>
    </div>
  );
}
