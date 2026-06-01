import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SHIK Live — Research & Architecture',
  description:
    'How SHIK Live implements the Self-Hosted Identity Kernel formal model: the I = ⟨id, K, P, M, H⟩ tuple, the five identity invariants, the SHIK Handshake v0 protocol, and the self-hosting hardware path.',
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-bold text-white mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-[var(--shik-text)]">{children}</div>
    </section>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--shik-text-muted)]">{children}</span>;
}

export default function ResearchPage() {
  return (
    <div className="min-h-screen bg-[var(--shik-bg)]">
      <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b border-[var(--shik-border)] bg-[var(--shik-surface)]/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xl font-bold text-white">SHIK Live</Link>
          <span className="text-xs text-[var(--shik-text-muted)]">Research &amp; Architecture</span>
        </div>
        <Link href="/" className="px-4 py-2 text-sm rounded bg-[var(--shik-accent)] text-white hover:bg-[var(--shik-accent-light)]">
          ← Live demo
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-white mb-3">
            Self-Hosted Identity Kernels, made tangible
          </h1>
          <p className="text-base text-[var(--shik-text-muted)] leading-relaxed">
            SHIK Live is a working artifact for{' '}
            <em>Self-Hosted Identity Kernels for Multi-Agent Systems</em> (Kingsley, 2025).
            The paper argues that an agent&apos;s <strong className="text-[var(--shik-text)]">identity</strong> should be an
            explicit architectural substrate — not an accidental by-product of a model&apos;s
            hidden state. This page maps every claim in the paper to something you can watch,
            inspect, export, and verify in the live demo.
          </p>
        </div>

        {/* Nav */}
        <nav className="flex flex-wrap gap-2 text-xs">
          {[
            ['thesis', 'The thesis'],
            ['model', 'Formal model'],
            ['invariants', 'Five invariants'],
            ['layers', 'Three layers'],
            ['handshake', 'Handshake v0'],
            ['mapping', 'Paper → demo'],
            ['gaps', 'What is still missing'],
            ['hardware', 'Self-hosting & hardware'],
            ['evaluation', 'Evaluation plan'],
            ['roadmap', 'Forward roadmap'],
          ].map(([href, label]) => (
            <a key={href} href={`#${href}`} className="px-3 py-1 rounded-full bg-[var(--shik-surface-light)] text-[var(--shik-text-muted)] hover:text-white border border-[var(--shik-border)]">
              {label}
            </a>
          ))}
        </nav>

        <Section id="thesis" title="The thesis in one sentence">
          <p>
            <strong className="text-white">SHIK separates what an agent thinks (the cognition engine) from who it is
            (the identity kernel)</strong>, so that the same agent can persist across model swaps,
            device migrations, and intermittent connectivity — while remaining under the owner&apos;s control.
          </p>
          <p>
            In the demo, Gemini is the cognition engine. Everything in the right-hand{' '}
            <em>Identity Kernel</em> panel is owned by the kernel, computed in your browser, and stored on
            your device. Swap the engine, reload the page, or export the kernel to another machine: the
            identity is invariant.
          </p>
        </Section>

        <Section id="model" title="The formal model (Section 3)">
          <p>The paper represents identity as a tuple:</p>
          <pre className="bg-[var(--shik-bg)] border border-[var(--shik-border)] rounded p-3 text-xs font-mono overflow-x-auto">
{`I = ⟨ id, K, P, M, H ⟩          // identity state
C = ⟨ I, E, R ⟩                // runtime configuration`}
          </pre>
          <ul className="space-y-1 list-none">
            <li><span className="font-mono text-[var(--shik-accent)]">id</span> — stable identifier. We derive a self-certifying <span className="font-mono">did:shik:…</span> from the genesis public key.</li>
            <li><span className="font-mono text-[var(--shik-accent)]">K</span> — cryptographic key material. A real ECDSA P-256 keypair is generated via WebCrypto; rotations record an auditable lineage.</li>
            <li><span className="font-mono text-[var(--shik-accent)]">P</span> — policies &amp; values. A set of <em>core</em> (safety-critical) and <em>soft</em> policies, versioned.</li>
            <li><span className="font-mono text-[var(--shik-accent)]">M</span> — long-term memory: semantic facts + episodic summaries, each carrying provenance.</li>
            <li><span className="font-mono text-[var(--shik-accent)]">H</span> — append-only interaction history, chained by hash so it cannot be silently reordered or erased.</li>
            <li><span className="font-mono text-[var(--shik-accent)]">E, R</span> — environment + cognition stack. <span className="font-mono">R</span> is the swappable engine selector in the panel.</li>
          </ul>
          <p>
            <Muted>Two configurations are </Muted><em>identity-equivalent</em> (<span className="font-mono">C₁ ∼ C₂</span>)
            <Muted> when they share the same </Muted><span className="font-mono">id</span><Muted> and satisfy the invariants over </Muted>
            <span className="font-mono">K, P, M, H</span>. Exporting and re-importing the kernel produces an identity-equivalent agent on a new node.
          </p>
        </Section>

        <Section id="invariants" title="The five identity invariants">
          <p>
            The kernel does not just store <span className="font-mono">I</span> — it constrains how <span className="font-mono">I</span> may
            change. The <em>Invariant Monitor</em> re-checks all five on every transition and surfaces any violation:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-[var(--shik-border)] rounded">
              <thead className="bg-[var(--shik-surface-light)] text-[var(--shik-text-muted)]">
                <tr>
                  <th className="text-left p-2">Invariant</th>
                  <th className="text-left p-2">What it guarantees</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--shik-border)]">
                {[
                  ['Identifier immutability', 'The stable id is never reassigned across any transition.'],
                  ['Key lineage', 'A rotated key carries an auditable record linking it to the old key, so signatures still bind to the same id.'],
                  ['Policy monotonicity', 'Core safety policies can be refined but never silently removed or weakened — only an authenticated governance event may change them.'],
                  ['History coherence', 'History is append-only up to summarization; prior events and their order cannot be erased.'],
                  ['Memory continuity', 'Summarized memories keep a link back to their source episodes — no opaque rewriting of the self.'],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td className="p-2 font-medium text-white whitespace-nowrap align-top">{k}</td>
                    <td className="p-2 text-[var(--shik-text-muted)]">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            These map to cryptographic <strong className="text-white">state commitments</strong> shown live in the panel:
            <span className="font-mono"> policy_core_root</span>, <span className="font-mono">memory_root</span> (Merkle roots),
            and <span className="font-mono">history_tip</span> (the head of the hash chain).
          </p>
        </Section>

        <Section id="layers" title="The three architectural layers (Section 5)">
          <div className="grid gap-3">
            <div className="p-3 rounded bg-[var(--shik-surface)] border border-[var(--shik-border)]">
              <h3 className="text-white font-semibold mb-1">1 · Core Self Layer</h3>
              <p className="text-[var(--shik-text-muted)] text-xs">Identity + key store, self-profile &amp; values, semantic/episodic memory, policy &amp; safety layer, append-only history. <span className="text-[var(--shik-success)]">Implemented.</span></p>
            </div>
            <div className="p-3 rounded bg-[var(--shik-surface)] border border-[var(--shik-border)]">
              <h3 className="text-white font-semibold mb-1">2 · Operational Layer</h3>
              <p className="text-[var(--shik-text-muted)] text-xs">A model-agnostic <strong className="text-[var(--shik-text)]">cognition adapter</strong> (<span className="font-mono">cognition-adapter.ts</span> + <span className="font-mono">/api/cognition</span>) builds model inputs from <span className="font-mono">P, M, H</span> and dispatches to a pluggable engine — Gemini, a self-hosted Llama via Ollama, or Claude. <span className="text-[var(--shik-success)]">Implemented:</span> the engine selector routes real text turns; identity is untouched on swap. <span className="text-[var(--shik-warning)]">A full capability/tool registry is future work.</span></p>
            </div>
            <div className="p-3 rounded bg-[var(--shik-surface)] border border-[var(--shik-border)]">
              <h3 className="text-white font-semibold mb-1">3 · Network &amp; Social Layer</h3>
              <p className="text-[var(--shik-text-muted)] text-xs">A standalone <strong className="text-[var(--shik-text)]">kernel daemon</strong> (<span className="font-mono">kernel-daemon/</span>) runs on a Raspberry Pi and performs the SHIK Handshake v0 over HTTP with cryptographic signature verification, key↔id binding, a social graph, and evolving trust. <span className="text-[var(--shik-success)]">Implemented &amp; verified node-to-node.</span> <span className="text-[var(--shik-warning)]">Replicated multi-node state sync is future work.</span></p>
            </div>
          </div>
        </Section>

        <Section id="handshake" title="SHIK Handshake v0 (Section 6)">
          <p>
            Two SHIK agents recognize each other by exchanging a signed message that commits to their
            policy, memory, and history roots — so &quot;the same agent across time and substrate&quot; becomes a
            checkable condition rather than an intuition. The demo&apos;s <strong className="text-white">Handshake</strong> button
            generates the exact message format from the paper, signs it with the live key, and simulates a
            counterpart verifying it.
          </p>
        </Section>

        <Section id="mapping" title="Paper → demo, claim by claim">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-[var(--shik-border)] rounded">
              <thead className="bg-[var(--shik-surface-light)] text-[var(--shik-text-muted)]">
                <tr><th className="text-left p-2">Paper requirement</th><th className="text-left p-2">In the demo</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--shik-border)]">
                {[
                  ['Self-hosted anchoring (4.1)', 'Kernel generated and stored on your device (localStorage stand-in for a Pi / USB module). No cloud owns it.'],
                  ['Portability across nodes (4.2)', 'Export to a signed .shik.json file, import on another node → identity-equivalent restore.'],
                  ['Model independence (4.3)', 'Cognition engine selector. Swap it; I is untouched and the history records the swap.'],
                  ['Persistence & continuity (4.4)', 'Semantic + episodic memory and append-only history survive reloads and engine swaps.'],
                  ['Policy & safety invariants (4.5)', 'Versioned core/soft policies + the policy-monotonicity check.'],
                  ['Security integration (4.7)', 'Real keys, DIDs, detached signatures, and a credentials slot in the handshake.'],
                ].map(([a, b]) => (
                  <tr key={a}><td className="p-2 text-white align-top whitespace-nowrap">{a}</td><td className="p-2 text-[var(--shik-text-muted)]">{b}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="gaps" title="Built vs. still missing">
          <p>
            <span className="text-[var(--shik-success)]">Now implemented &amp; verified:</span> a self-hosted{' '}
            <strong className="text-[var(--shik-text)]">kernel daemon</strong> (<span className="font-mono">kernel-daemon/</span>, runs on a Raspberry Pi)
            that performs real signed node-to-node SHIK handshakes; a model-agnostic{' '}
            <strong className="text-[var(--shik-text)]">cognition adapter</strong> so the engine (Gemini / local Llama / Claude) is swappable
            with no cloud lock-in; and the full <span className="font-mono">I = ⟨id,K,P,M,H⟩</span> kernel with live invariants and signed export/import.
          </p>
          <p>An honest remaining-gap analysis — each item is a defensible PhD work package:</p>
          <ul className="list-disc pl-5 space-y-1 text-[var(--shik-text-muted)]">
            <li><strong className="text-[var(--shik-text)]">Decentralized replication &amp; conflict resolution (4.6).</strong> CRDT- or Merkle-DAG-based sync across multiple kernel instances, with partial replication (share some memories, keep others local).</li>
            <li><strong className="text-[var(--shik-text)]">DID/VC interoperability.</strong> Bind <span className="font-mono">did:shik</span> to W3C DID methods and verify real verifiable credentials, not placeholders.</li>
            <li><strong className="text-[var(--shik-text)]">Memory summarization &amp; pruning</strong> with provable continuity (the update functions u_M, u_P from the paper).</li>
            <li><strong className="text-[var(--shik-text)]">Social graph &amp; relationship histories</strong> across repeated handshakes with trust scores.</li>
            <li><strong className="text-[var(--shik-text)]">Empirical evaluation harness</strong> (see below).</li>
          </ul>
        </Section>

        <Section id="hardware" title="Self-hosting & hardware">
          <p>
            The paper is explicit that a SHIK should run on <em>resource-constrained, self-owned</em> hardware.
            The kernel&apos;s job is light — a small DB, hashing, and signatures — so the requirements are modest:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-[var(--shik-border)] rounded">
              <thead className="bg-[var(--shik-surface-light)] text-[var(--shik-text-muted)]">
                <tr><th className="text-left p-2">Tier</th><th className="text-left p-2">Hardware</th><th className="text-left p-2">Role</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--shik-border)]">
                <tr><td className="p-2 text-white">Kernel node (minimum)</td><td className="p-2 text-[var(--shik-text-muted)]">Raspberry Pi 4/5 (2–4 GB), or any ARM/x86 SBC; a USB HSM/secure element (e.g. YubiKey, SE050) for key custody</td><td className="p-2 text-[var(--shik-text-muted)]">Hosts I = ⟨id,K,P,M,H⟩, signs handshakes, serves the SHIK API. ~tens of MB RAM.</td></tr>
                <tr><td className="p-2 text-white">Kernel node (comfortable)</td><td className="p-2 text-[var(--shik-text-muted)]">Jetson Orin Nano, mini-PC, or home server with NVMe + UPS</td><td className="p-2 text-[var(--shik-text-muted)]">Same, plus headroom for replication, logs, and a local vector store for memory.</td></tr>
                <tr><td className="p-2 text-white">Local cognition (optional)</td><td className="p-2 text-[var(--shik-text-muted)]">16–24 GB GPU / Jetson Orin / Apple Silicon (M-series, ≥16 GB) for 7–8B quantized LLMs</td><td className="p-2 text-[var(--shik-text-muted)]">Runs the model-independence story end-to-end: identity on the Pi, cognition on a local model, no cloud.</td></tr>
                <tr><td className="p-2 text-white">Cloud cognition</td><td className="p-2 text-[var(--shik-text-muted)]">None — just an API key (Gemini, Claude, etc.)</td><td className="p-2 text-[var(--shik-text-muted)]">The current demo. The point: the kernel never depends on it.</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-[var(--shik-text-muted)]">
            For your PhD demo you can run the entire decentralized story on <strong className="text-[var(--shik-text)]">two Raspberry Pis</strong> (two
            agents performing a handshake over the local network) plus a laptop for the UI — a compelling, inexpensive,
            and reproducible setup.
          </p>
        </Section>

        <Section id="evaluation" title="Evaluation plan (Section 10.3)">
          <p>The paper proposes three evaluation axes. Each is directly measurable with this artifact extended:</p>
          <ul className="list-disc pl-5 space-y-1 text-[var(--shik-text-muted)]">
            <li><strong className="text-[var(--shik-text)]">Behavioral stability under model swaps.</strong> Hold a conversation, swap engines, measure how consistently the agent honors stored memory/policy vs. a baseline with no kernel.</li>
            <li><strong className="text-[var(--shik-text)]">Long-term relationship continuity.</strong> Repeated handshakes between agents; measure correct re-recognition and trust evolution.</li>
            <li><strong className="text-[var(--shik-text)]">Overhead on constrained hardware.</strong> Time to compute commitments, sign handshakes, and replicate state on a Pi as M and H grow.</li>
          </ul>
        </Section>

        <Section id="roadmap" title="Forward roadmap — accelerating the product">
          <p className="text-[var(--shik-text-muted)]">
            Beyond the thesis, SHIK can grow into a general substrate for user-owned agent identity. A staged path:
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-[var(--shik-text-muted)]">
            <li><strong className="text-[var(--shik-text)]">Kernel daemon + SDK.</strong> Extract the kernel into a standalone service with a clean API and client SDKs, so any agent framework can plug in an identity waist.</li>
            <li><strong className="text-[var(--shik-text)]">Engine-agnostic adapter.</strong> A formal cognition-adapter interface so Gemini, Claude, and local models are interchangeable behind one contract.</li>
            <li><strong className="text-[var(--shik-text)]">Decentralized mesh.</strong> Peer discovery + replicated, signed state across a user&apos;s devices, with selective sharing.</li>
            <li><strong className="text-[var(--shik-text)]">Governance &amp; transfer.</strong> Mechanisms for ownership transfer, freezing, and dissolution of a SHIK — the institutional questions the paper raises.</li>
            <li><strong className="text-[var(--shik-text)]">Verifiable provenance for memory.</strong> Every memory carries a signed, auditable chain from the interaction that produced it.</li>
          </ol>
        </Section>

        <footer className="pt-8 border-t border-[var(--shik-border)] text-xs text-[var(--shik-text-muted)]">
          <p>
            Source: <em>Self-Hosted Identity Kernels for Multi-Agent Systems</em>, Susan D. Kingsley, Happy Alien AI, 2025.
            This artifact implements the conceptual architecture as a runnable, inspectable prototype.
          </p>
          <p className="mt-2"><Link href="/" className="text-[var(--shik-accent)] hover:underline">← Back to the live demo</Link></p>
        </footer>
      </main>
    </div>
  );
}
