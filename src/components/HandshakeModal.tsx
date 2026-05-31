'use client';

// SHIK Handshake v0 inspector (Section 6 of the paper).
//
// Generates the exact handshake message specified in the paper from the live
// identity state, and simulates a counterpart SHIK verifying it — demonstrating
// inter-agent identity recognition in a decentralized setting.

import { useState } from 'react';
import {
  HandshakeMessage,
  verifyHandshake,
  HandshakeVerification,
} from '@/lib/shik-kernel';

interface Props {
  build: (direction: 'request' | 'response') => Promise<HandshakeMessage | null>;
  onClose: () => void;
}

export default function HandshakeModal({ build, onClose }: Props) {
  const [message, setMessage] = useState<HandshakeMessage | null>(null);
  const [verification, setVerification] = useState<HandshakeVerification | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    const msg = await build('request');
    setMessage(msg);
    if (msg) {
      // Simulate a counterpart node verifying our handshake (first encounter).
      const v = await verifyHandshake(msg);
      setVerification(v);
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--shik-surface)] border border-[var(--shik-border)] rounded-xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">SHIK Handshake v0</h2>
          <button onClick={onClose} className="text-[var(--shik-text-muted)] hover:text-white text-xl leading-none">×</button>
        </div>
        <p className="text-xs text-[var(--shik-text-muted)] mb-4">
          The protocol two SHIK-based agents use to recognize each other across nodes.
          The message commits to <span className="text-[var(--shik-accent)]">policy</span>,{' '}
          <span className="text-[var(--shik-accent)]">memory</span>, and{' '}
          <span className="text-[var(--shik-accent)]">history</span> roots, so identity continuity is
          cryptographically checkable — not just a reused name.
        </p>

        <button
          onClick={generate}
          disabled={busy}
          className="px-4 py-2 mb-4 rounded text-sm font-medium bg-[var(--shik-accent)] text-white hover:bg-[var(--shik-accent-light)] disabled:opacity-50"
        >
          {busy ? 'Signing…' : message ? 'Regenerate handshake' : 'Generate signed handshake'}
        </button>

        {verification && (
          <div className="mb-4 p-3 rounded bg-[var(--shik-surface-light)] border border-[var(--shik-border)] text-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${verification.signatureValid ? 'bg-[var(--shik-success)]' : 'bg-[var(--shik-danger)]'}`} />
              <span className="text-white font-medium">Counterpart verification</span>
            </div>
            <p className="text-[var(--shik-text-muted)]">{verification.summary}</p>
          </div>
        )}

        {message && (
          <pre className="text-[11px] leading-relaxed bg-[var(--shik-bg)] border border-[var(--shik-border)] rounded p-3 overflow-x-auto text-[var(--shik-text)]">
{JSON.stringify(message, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
