'use client';

import { useState, useEffect, useRef } from 'react';
import { GeminiDirectClient } from '@/lib/gemini-direct';
import { useKernel } from '@/lib/use-kernel';
import { useEmbodiment } from '@/lib/use-embodiment';
import { runCognition } from '@/lib/claude-cognition';
import { Percept, PresenceIntent } from '@/lib/embodiment';

// Presence intent → visual treatment (the body renders the agent's state).
// On the Raspberry Pi body (M2) the same intents drive the LED ring.
const PRESENCE: Record<PresenceIntent, { label: string; dot: string; text: string }> = {
  idle: { label: 'IDLE', dot: 'bg-[var(--shik-surface-light)]', text: 'text-[var(--shik-text-muted)]' },
  listening: { label: 'LISTENING', dot: 'bg-[var(--shik-success)]', text: 'text-[var(--shik-success)]' },
  thinking: { label: 'THINKING', dot: 'bg-[var(--shik-warning)]', text: 'text-[var(--shik-warning)]' },
  speaking: { label: 'SPEAKING', dot: 'bg-[var(--shik-accent)]', text: 'text-[var(--shik-accent)]' },
  alert: { label: 'ALERT', dot: 'bg-[var(--shik-danger)]', text: 'text-[var(--shik-danger)]' },
};

function perceptLine(p: Percept): { who: string; body: string } {
  switch (p.kind) {
    case 'speech': return { who: 'heard', body: p.text };
    case 'text': return { who: 'read', body: p.text };
    case 'vision': return { who: 'saw', body: p.caption || 'a visual frame' };
    case 'motion': return { who: 'motion', body: p.present ? 'presence detected' : 'presence gone' };
    case 'light_level': return { who: 'light', body: `${p.lux} lux` };
    case 'temperature': return { who: 'temp', body: `${p.celsius}°C` };
    case 'battery': return { who: 'power', body: `${p.percent}%${p.charging ? ' charging' : ''}` };
    case 'touch': return { who: 'touch', body: p.control };
  }
}

export default function ShikLive() {
  const [showIntro, setShowIntro] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [visualStream, setVisualStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [currentAgentText, setCurrentAgentText] = useState('');
  const [lastSpoken, setLastSpoken] = useState('');

  const kernel = useKernel();
  const embodiment = useEmbodiment();

  // Refs so the once-only Gemini setup effect always reaches the latest state.
  const kernelRef = useRef(kernel);
  kernelRef.current = kernel;
  const embodimentRef = useRef(embodiment);
  embodimentRef.current = embodiment;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const geminiRef = useRef<GeminiDirectClient | null>(null);
  const pendingUserMessageRef = useRef<string>('');

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [embodiment.percepts, currentAgentText]);

  useEffect(() => {
    if (videoRef.current && visualStream) {
      videoRef.current.srcObject = visualStream;
    }
  }, [visualStream]);

  // Initialize the realtime voice engine (Gemini Live) — the "mouth/ears".
  // Claude (the "mind") runs server-side via runCognition() on each turn.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (geminiRef.current) return;

    geminiRef.current = new GeminiDirectClient({
      onConnected: () => {
        setIsConnected(true);
        setStatus('listening');
        embodimentRef.current.signal('listening');
        kernelRef.current.addEvent('voice_connected', 'Realtime audio pipeline active');
      },
      onDisconnected: () => {
        setIsConnected(false);
        setStatus('idle');
        setAudioEnabled(false);
        embodimentRef.current.signal('idle');
        kernelRef.current.addEvent('disconnected', 'Session ended');
      },
      onText: (text) => {
        setCurrentAgentText(prev => prev + text);
      },
      onAudioStart: () => embodimentRef.current.signal('speaking'),
      onAudioEnd: () => kernelRef.current.addEvent('audio_complete', 'Finished speaking'),
      onTurnComplete: () => {
        setCurrentAgentText(prev => {
          const agentText = prev.trim();
          if (agentText) {
            setLastSpoken(agentText);
            // SHIK expressed itself through the body → Action Bus.
            embodimentRef.current.addAction({ kind: 'speak', text: agentText });
            kernelRef.current.incrementTurn();

            // Hand the turn to the MIND (Claude) for kernel curation + actions.
            const k = kernelRef.current;
            const lastUserMsg = pendingUserMessageRef.current;
            if (lastUserMsg) {
              runCognition({
                userText: lastUserMsg,
                agentText,
                currentMemories: k.coreMemories.map(m => m.content),
                currentContext: k.sessionContext.map(c => c.content),
                bodyName: embodimentRef.current.manifest.displayName,
              }).then(result => {
                if (!result) return;
                const e = embodimentRef.current;
                const upd = result.kernelUpdates;
                for (const mem of upd.newCoreMemories || []) {
                  if (mem.confidence >= 0.7) {
                    k.addMemory(mem.content, mem.sourceType || 'voice', 'conversation', mem.confidence);
                  }
                }
                for (const ctx of upd.newSessionContext || []) {
                  k.addContext(ctx.content, ctx.sourceType || 'voice');
                }
                if (upd.currentTopic) {
                  k.updateTopic(upd.currentTopic);
                }
                if (result.selfReflection) e.setReflection(result.selfReflection);
                for (const a of result.actions || []) {
                  if (a.kind === 'light' && a.intent) e.addAction({ kind: 'light', intent: a.intent as PresenceIntent });
                  else if (a.kind === 'display' && a.text) e.addAction({ kind: 'display', text: a.text });
                  else if (a.kind === 'notify' && a.text) e.addAction({ kind: 'notify', text: a.text });
                }
                for (const evt of result.events || []) k.addEvent('mind', evt);
              }).catch(err => console.error('Cognition error:', err));
            }
          }
          return '';
        });
      },
      onUserTranscript: (text) => {
        pendingUserMessageRef.current = text;
        embodimentRef.current.addPercept({
          kind: 'speech', text, final: true,
          source: { bodyId: embodimentRef.current.manifest.bodyId, sensor: 'audio', origin: 'human' },
        });
        kernelRef.current.addContext(text.slice(0, 100), 'voice');
      },
      onInterrupted: () => {
        setCurrentAgentText('');
        embodimentRef.current.signal('listening');
        kernelRef.current.addEvent('interrupted', 'User interrupted - stopping');
      },
      onError: (error) => {
        console.error('Pipeline error:', error);
        kernelRef.current.addEvent('error', error);
      },
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
        embodimentRef.current.signal(newStatus);
      },
    });

    return () => {
      geminiRef.current?.disconnect();
    };
  }, []);

  const startVisualCapture = async (type: 'camera' | 'screen') => {
    try {
      const stream = type === 'camera'
        ? await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });

      setVisualStream(stream);
      embodiment.setSensorAvailable('vision', true);
      embodiment.addPercept({
        kind: 'vision', caption: `${type} capture started`,
        source: { bodyId: embodiment.manifest.bodyId, sensor: 'vision', origin: 'human' },
      });
      kernel.addEvent('visual_started', `${type} capture enabled`);

      if (type === 'camera') startFrameCapture();
    } catch (err) {
      console.error('Failed to start visual capture:', err);
      kernel.addEvent('error', `Failed to start ${type} capture`);
    }
  };

  const startFrameCapture = () => {
    const captureFrame = () => {
      if (!videoRef.current || !canvasRef.current || !geminiRef.current) return;
      if (!visualStream) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = 640;
      canvas.height = 480;
      ctx.drawImage(video, 0, 0, 640, 480);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
      const base64 = dataUrl.split(',')[1];
      geminiRef.current.sendImage(base64);
    };

    const intervalId = setInterval(captureFrame, 2000);
    (window as unknown as { __frameInterval?: number }).__frameInterval = intervalId as unknown as number;
  };

  const stopVisualCapture = () => {
    if (visualStream) {
      visualStream.getTracks().forEach(track => track.stop());
      setVisualStream(null);
      embodiment.setSensorAvailable('vision', false);
      kernel.addEvent('visual_stopped', 'Visual capture disabled');
    }
    const w = window as unknown as { __frameInterval?: number };
    if (w.__frameInterval) clearInterval(w.__frameInterval);
  };

  const startSession = async () => {
    if (isConnected || geminiRef.current?.isSessionActive()) return;
    kernel.addEvent('session_starting', 'Connecting voice engine...');
    embodiment.bind();

    await kernel.startSession();
    const memoryStrings = kernel.coreMemories.map(m => m.content);
    const connected = await geminiRef.current?.connect(memoryStrings);

    if (connected) {
      kernel.addEvent('kernel_loaded', `Identity bound (${memoryStrings.length} memories loaded)`);
    } else {
      kernel.addEvent('error', 'Failed to connect - check API key');
    }
  };

  const endSession = async () => {
    geminiRef.current?.disconnect();
    stopVisualCapture();
    setAudioEnabled(false);
    setIsConnected(false);
    setStatus('idle');
    setCurrentAgentText('');
    embodiment.unbind();
    await kernel.endSession();
  };

  const toggleAudio = async () => {
    if (!audioEnabled) {
      await geminiRef.current?.startRecording();
      setAudioEnabled(true);
      embodiment.setSensorAvailable('audio', true);
      kernel.addEvent('mic_enabled', 'Voice input active');
    } else {
      geminiRef.current?.stopRecording();
      setAudioEnabled(false);
      embodiment.setSensorAvailable('audio', false);
      kernel.addEvent('mic_disabled', 'Voice input paused');
    }
  };

  const sendTextMessage = async (text: string) => {
    if (!text.trim() || !isConnected) return;
    pendingUserMessageRef.current = text;
    embodiment.addPercept({
      kind: 'text', text,
      source: { bodyId: embodiment.manifest.bodyId, sensor: 'audio', origin: 'human' },
    });
    kernel.addContext(text.slice(0, 100), 'voice');
    setStatus('thinking');
    embodiment.signal('thinking');
    geminiRef.current?.sendText(text);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim()) {
      sendTextMessage(textInput.trim());
      setTextInput('');
    }
  };

  const self = embodiment.selfModel(kernel.coreMemories.length);
  const presence = PRESENCE[embodiment.presenceIntent];

  return (
    <div className="h-screen flex flex-col bg-[var(--shik-bg)]">
      <canvas ref={canvasRef} className="hidden" />

      {/* Intro */}
      {showIntro && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--shik-surface)] border border-[var(--shik-border)] rounded-xl p-8 max-w-lg text-center">
            <h2 className="text-2xl font-bold text-white mb-4">SHIK — agent&apos;s-eye view</h2>
            <p className="text-[var(--shik-text-muted)] mb-6 leading-relaxed text-left">
              This is the agent&apos;s own console, not a dashboard about it. The center is
              <strong className="text-white"> who and where SHIK is</strong> — the body it inhabits and
              what that body can perceive and do. Left is everything it perceives; right is its persistent
              identity; the bottom logs what it chose to do.
              <br /><br />
              A realtime voice engine is SHIK&apos;s mouth and ears. <strong className="text-white">Claude is its
              mind</strong> — curating memory and choosing actions.
              <br /><br />
              <span className="text-[var(--shik-warning)]">🎧 Use headphones to avoid audio feedback.</span>
            </p>
            <button
              onClick={() => setShowIntro(false)}
              className="px-6 py-3 rounded-lg bg-[var(--shik-accent)] text-white font-semibold hover:bg-[var(--shik-accent-light)] transition-colors"
            >
              Enter the cockpit
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--shik-border)] bg-[var(--shik-surface)]">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">SHIK</h1>
          <span className="text-xs text-[var(--shik-text-muted)]">agent-perspective console · v2</span>
        </div>
        <div className="flex items-center gap-4">
          {isConnected ? (
            <>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${presence.dot} pulse-live`}></span>
                <span className={`text-sm ${presence.text}`}>{presence.label}</span>
              </div>
              <button onClick={endSession} className="px-3 py-1 text-sm rounded bg-[var(--shik-danger)] text-white hover:opacity-90">
                End Session
              </button>
            </>
          ) : (
            <button onClick={startSession} className="px-4 py-2 text-sm rounded bg-[var(--shik-accent)] text-white hover:bg-[var(--shik-accent-light)]">
              Wake SHIK
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* LEFT — Perception Bus */}
        <div className="w-1/4 flex flex-col border-r border-[var(--shik-border)]">
          <div className="px-4 py-2 border-b border-[var(--shik-border)] bg-[var(--shik-surface)]">
            <h2 className="text-sm font-semibold text-[var(--shik-accent)]">PERCEPTION</h2>
            <p className="text-xs text-[var(--shik-text-muted)] mt-1">Senses arriving on the perception bus.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {embodiment.percepts.length === 0 ? (
              <p className="text-[var(--shik-text-muted)] text-sm text-center mt-8">
                {isConnected ? 'Speak, type, or show something — it appears here as SHIK perceives it.' : 'Wake SHIK to begin perceiving.'}
              </p>
            ) : (
              embodiment.percepts.map(p => {
                const line = perceptLine(p);
                return (
                  <div key={p.id} className="p-2 rounded bg-[var(--shik-surface-light)] border border-[var(--shik-border)] text-sm">
                    <span className="text-xs uppercase tracking-wide text-[var(--shik-accent)] mr-2">{line.who}</span>
                    <span className="text-[var(--shik-text)]">{line.body}</span>
                  </div>
                );
              })
            )}
            <div ref={feedEndRef} />
          </div>
          <div className="p-4 border-t border-[var(--shik-border)] bg-[var(--shik-surface)] space-y-2">
            <form onSubmit={handleTextSubmit} className="flex gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={isConnected ? 'Inject a percept…' : 'Wake SHIK first'}
                disabled={!isConnected || status === 'thinking' || status === 'speaking'}
                className="flex-1 px-3 py-2 rounded text-sm bg-[var(--shik-surface-light)] border border-[var(--shik-border)] text-white placeholder-[var(--shik-text-muted)] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!isConnected || !textInput.trim() || status === 'thinking' || status === 'speaking'}
                className="px-4 py-2 rounded text-sm font-medium bg-[var(--shik-accent)] text-white disabled:opacity-50"
              >Send</button>
            </form>
            <button
              onClick={toggleAudio}
              disabled={!isConnected}
              className={`w-full py-2 rounded text-sm font-medium transition-colors ${
                audioEnabled ? 'bg-[var(--shik-success)] text-white' : 'bg-[var(--shik-surface-light)] text-[var(--shik-text-muted)] hover:bg-[var(--shik-border)]'
              } disabled:opacity-50`}
            >{audioEnabled ? '🎤 Hearing — speak to SHIK' : '🎤 Open the ears'}</button>
          </div>
        </div>

        {/* CENTER — Self & Embodiment */}
        <div className="w-1/2 flex flex-col border-r border-[var(--shik-border)]">
          <div className="px-4 py-2 border-b border-[var(--shik-border)] bg-[var(--shik-surface)]">
            <h2 className="text-sm font-semibold text-[var(--shik-accent)]">SELF &amp; EMBODIMENT</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* First-person self statement */}
            <div className="flex items-start gap-4">
              <span className={`mt-1 w-4 h-4 rounded-full ${presence.dot} ${embodiment.bound ? 'pulse-live' : ''} shrink-0`}></span>
              <div>
                <p className="text-lg text-white leading-snug">
                  {self.bound && self.currentBody
                    ? <>I am <strong>SHIK</strong>, embodied in <strong className="text-[var(--shik-accent-light)]">{self.currentBody.displayName}</strong>.</>
                    : <>I am <strong>SHIK</strong>. I am not currently embodied.</>}
                </p>
                <p className="text-sm text-[var(--shik-text-muted)] mt-1">
                  I remember {self.coreMemoryCount} thing{self.coreMemoryCount === 1 ? '' : 's'} ·
                  thinking with <span className="text-[var(--shik-text)]">{self.currentBody?.cognitionEngine || 'gemini'} + claude-opus-4-8</span>
                </p>
                {embodiment.reflection && (
                  <p className="text-sm italic text-[var(--shik-accent-light)] mt-2">“{embodiment.reflection}”</p>
                )}
              </div>
            </div>

            {/* Body diagram */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-[var(--shik-surface)] border border-[var(--shik-border)]">
                <h3 className="text-xs font-semibold text-[var(--shik-success)] mb-2">SENSES</h3>
                <div className="flex flex-wrap gap-2">
                  {embodiment.manifest.sensors.map(s => (
                    <span key={s.kind} className={`text-xs px-2 py-1 rounded border ${
                      s.available ? 'bg-[var(--shik-success)]/20 border-[var(--shik-success)]/40 text-[var(--shik-success)]' : 'border-[var(--shik-border)] text-[var(--shik-text-muted)]'
                    }`}>{s.label}{s.available ? ' ●' : ' ○'}</span>
                  ))}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--shik-surface)] border border-[var(--shik-border)]">
                <h3 className="text-xs font-semibold text-[var(--shik-accent)] mb-2">ACTUATORS</h3>
                <div className="flex flex-wrap gap-2">
                  {embodiment.manifest.actuators.map(a => (
                    <span key={a.kind} className="text-xs px-2 py-1 rounded border border-[var(--shik-border)] text-[var(--shik-text-muted)]">{a.label}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* What SHIK is expressing now */}
            <div className="p-3 rounded-lg bg-[var(--shik-surface)] border border-[var(--shik-border)] min-h-[64px]">
              <h3 className="text-xs font-semibold text-[var(--shik-accent)] mb-2">EXPRESSING</h3>
              {currentAgentText ? (
                <p className="text-sm text-[var(--shik-text)]">{currentAgentText}<span className="inline-block w-1 h-4 bg-[var(--shik-accent)] animate-pulse ml-1" /></p>
              ) : lastSpoken ? (
                <p className="text-sm text-[var(--shik-text-muted)]">{lastSpoken}</p>
              ) : (
                <p className="text-sm text-[var(--shik-text-muted)] italic">Silent.</p>
              )}
            </div>

            {/* Vision sense */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-[var(--shik-success)]">VISION SENSE</h3>
                <div className="flex gap-2">
                  {!visualStream ? (
                    <>
                      <button onClick={() => startVisualCapture('camera')} disabled={!isConnected} className="px-2 py-1 rounded text-xs bg-[var(--shik-surface-light)] hover:bg-[var(--shik-border)] disabled:opacity-50">📹 Camera</button>
                      <button onClick={() => startVisualCapture('screen')} disabled={!isConnected} className="px-2 py-1 rounded text-xs bg-[var(--shik-surface-light)] hover:bg-[var(--shik-border)] disabled:opacity-50">🖥️ Screen</button>
                    </>
                  ) : (
                    <button onClick={stopVisualCapture} className="px-2 py-1 rounded text-xs bg-[var(--shik-danger)] text-white">Stop</button>
                  )}
                </div>
              </div>
              {visualStream ? (
                <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-[260px] rounded-lg border border-[var(--shik-border)] object-cover" />
              ) : (
                <div className="w-full aspect-video rounded-lg border-2 border-dashed border-[var(--shik-border)] flex flex-col items-center justify-center text-[var(--shik-text-muted)]">
                  <span className="text-3xl mb-1">👁</span>
                  <span className="text-xs">No visual sense active</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — Identity Kernel */}
        <div className="w-1/4 flex flex-col">
          <div className="px-4 py-2 border-b border-[var(--shik-border)] bg-[var(--shik-surface)]">
            <h2 className="text-sm font-semibold text-[var(--shik-accent)]">IDENTITY KERNEL</h2>
            <p className="text-xs text-[var(--shik-text-muted)] mt-1">The self that survives bodies and sessions.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-[var(--shik-warning)] mb-2">CORE MEMORY</h3>
              <div className="space-y-2">
                {kernel.coreMemories.length === 0 ? (
                  <p className="text-xs text-[var(--shik-text-muted)] italic">Memories appear here as SHIK learns about you.</p>
                ) : (
                  kernel.coreMemories.map(mem => (
                    <div key={mem.id} className="p-2 rounded bg-[var(--shik-surface)] text-xs border border-[var(--shik-border)]">
                      <p>{mem.content}</p>
                      <div className="flex justify-between mt-1 text-[var(--shik-text-muted)]">
                        <span>{mem.sourceType}</span><span>{(mem.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-[var(--shik-success)] mb-2">SESSION CONTEXT</h3>
              <div className="space-y-2">
                {kernel.sessionContext.length === 0 ? (
                  <p className="text-xs text-[var(--shik-text-muted)] italic">Session-specific context builds up here.</p>
                ) : (
                  kernel.sessionContext.map(ctx => (
                    <div key={ctx.id} className="p-2 rounded bg-[var(--shik-surface)] text-xs border border-[var(--shik-border)]">
                      <p>{ctx.content}</p><span className="text-[var(--shik-text-muted)]">{ctx.sourceType}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-[var(--shik-accent)] mb-2">CONTINUITY</h3>
              <div className="p-3 rounded bg-[var(--shik-surface)] border border-[var(--shik-border)] text-xs space-y-2">
                <div className="flex justify-between"><span className="text-[var(--shik-text-muted)]">Current topic</span><span>{kernel.currentTopic || <span className="italic text-[var(--shik-text-muted)]">—</span>}</span></div>
                <div className="flex justify-between"><span className="text-[var(--shik-text-muted)]">Turns</span><span>{kernel.turnCount}</span></div>
                <div className="flex justify-between"><span className="text-[var(--shik-text-muted)]">Presence</span><span className={presence.text}>{presence.label.toLowerCase()}</span></div>
              </div>
            </div>

            {/* Presence history — the portability thesis made legible */}
            <div>
              <h3 className="text-xs font-semibold text-[var(--shik-accent)] mb-2">PRESENCE HISTORY</h3>
              <div className="space-y-1">
                {embodiment.presenceHistory.length === 0 ? (
                  <p className="text-xs text-[var(--shik-text-muted)] italic">Bodies SHIK has woken up in will appear here.</p>
                ) : (
                  embodiment.presenceHistory.map((r, i) => (
                    <div key={`${r.bodyId}-${r.enteredAt}`} className="flex items-center gap-2 text-xs text-[var(--shik-text-muted)]">
                      <span className={`w-1.5 h-1.5 rounded-full ${r.leftAt === null ? 'bg-[var(--shik-success)]' : 'bg-[var(--shik-border)]'}`} />
                      <span className="text-[var(--shik-text)]">{r.displayName}</span>
                      <span>{r.leftAt === null && i === 0 ? 'now' : new Date(r.enteredAt).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom — Action Log */}
      <footer className="h-10 border-t border-[var(--shik-border)] bg-[var(--shik-surface)] flex items-center px-4 overflow-x-auto">
        <span className="text-xs font-semibold text-[var(--shik-text-muted)] mr-4 shrink-0" title="What SHIK chose to do through its body">ACTIONS:</span>
        <div className="flex gap-4 text-xs">
          {embodiment.actions.length === 0 ? (
            <span className="text-[var(--shik-text-muted)] italic">Acts SHIK performs through its body will stream here…</span>
          ) : (
            embodiment.actions.map(a => (
              <span key={a.id} className="text-[var(--shik-text-muted)] shrink-0">
                <span className="text-[var(--shik-accent)]">{a.kind}:</span>{' '}
                {a.kind === 'light' ? a.intent : a.kind === 'speak' ? a.text.slice(0, 40) : a.kind === 'display' ? a.text : a.kind === 'notify' ? a.text : a.kind === 'move' ? a.gesture : ''}
              </span>
            ))
          )}
        </div>
      </footer>
    </div>
  );
}
