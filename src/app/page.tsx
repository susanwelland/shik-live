'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { GeminiDirectClient } from '@/lib/gemini-direct';
import { useKernel } from '@/lib/use-kernel';
import { extractKernelUpdates } from '@/lib/extract-kernel';

interface Message {
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

export default function ShikLive() {
  const [showIntro, setShowIntro] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [visualStream, setVisualStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [currentAgentText, setCurrentAgentText] = useState('');
  
  // Firestore-backed kernel state
  const kernel = useKernel();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const geminiRef = useRef<GeminiDirectClient | null>(null);
  const pendingUserMessageRef = useRef<string>('');

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentAgentText]);

  // Connect video stream to element
  useEffect(() => {
    if (videoRef.current && visualStream) {
      videoRef.current.srcObject = visualStream;
    }
  }, [visualStream]);

  // Use kernel's addEvent
  const addEvent = kernel.addEvent;

  const extractTopic = (text: string): string | null => {
    const topicPatterns = [
      /(?:about|regarding|concerning|discuss(?:ing)?)\s+(.+?)(?:\.|$)/i,
      /(?:what is|what's|explain|tell me about)\s+(.+?)(?:\?|$)/i,
      /(?:how does|how do)\s+(.+?)(?:\?|work|$)/i,
    ];
    
    for (const pattern of topicPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim().slice(0, 50);
      }
    }
    return null;
  };

  // Initialize Gemini Direct client (only once!)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (geminiRef.current) return;  // Don't recreate if already exists

    geminiRef.current = new GeminiDirectClient({
      onConnected: () => {
        setIsConnected(true);
        setStatus('listening');
        addEvent('gemini_live_connected', 'Real-time audio pipeline active');
      },
      onDisconnected: () => {
        setIsConnected(false);
        setStatus('idle');
        setAudioEnabled(false);
        addEvent('disconnected', 'Session ended');
      },
      onText: (text) => {
        // Accumulate streaming text
        setCurrentAgentText(prev => prev + text);
      },
      onAudioStart: () => {
        addEvent('audio_playing', 'Speaking...');
      },
      onAudioEnd: () => {
        addEvent('audio_complete', 'Finished speaking');
      },
      onTurnComplete: () => {
        // Finalize the accumulated text as a message
        setCurrentAgentText(prev => {
          if (prev.trim()) {
            const agentText = prev.trim();
            
            setMessages(msgs => [...msgs, {
              role: 'agent',
              content: agentText,
              timestamp: new Date(),
            }]);
            
            kernel.incrementTurn();
            kernel.addEvent('turn_complete', 'Response complete');

            // Run extraction in background (don't await)
            const lastUserMsg = pendingUserMessageRef.current;
            if (lastUserMsg) {
              extractKernelUpdates(
                lastUserMsg,
                agentText,
                kernel.coreMemories.map(m => m.content),
                kernel.sessionContext.map(c => c.content)
              ).then(updates => {
                if (!updates) return;
                
                for (const mem of updates.newCoreMemories || []) {
                  if (mem.confidence >= 0.7) {
                    kernel.addMemory(mem.content, mem.sourceType || 'voice', 'conversation', mem.confidence);
                  }
                }
                for (const ctx of updates.newSessionContext || []) {
                  kernel.addContext(ctx.content, ctx.sourceType || 'voice');
                }
                if (updates.currentTopic) {
                  kernel.updateTopic(updates.currentTopic);
                }
                for (const evt of updates.events || []) {
                  kernel.addEvent('kernel_extract', evt);
                }
              }).catch(e => console.error('Extraction error:', e));
            }
          }
          return '';
        });
      },
      onUserTranscript: (text) => {
        pendingUserMessageRef.current = text;
        setMessages(prev => [...prev, {
          role: 'user',
          content: text,
          timestamp: new Date(),
        }]);
        const topic = extractTopic(text);
        if (topic) {
          kernel.updateTopic(topic);
          kernel.addEvent('topic_detected', topic);
        }
        kernel.addContext(text.slice(0, 100), 'voice');
      },
      onInterrupted: () => {
        setCurrentAgentText('');
        addEvent('interrupted', 'User interrupted - stopping');
      },
      onError: (error) => {
        console.error('Pipeline error:', error);
        addEvent('error', error);
      },
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
      },
    });

    return () => {
      geminiRef.current?.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // Empty array - only create client once

  const startVisualCapture = async (type: 'camera' | 'screen') => {
    try {
      const stream = type === 'camera'
        ? await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      
      setVisualStream(stream);
      addEvent('visual_started', `${type} capture enabled`);
      
      // Start sending frames to Gemini
      if (type === 'camera') {
        startFrameCapture();
      }
    } catch (err) {
      console.error('Failed to start visual capture:', err);
      addEvent('error', `Failed to start ${type} capture`);
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
      
      // Get JPEG data and send to Gemini
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
      const base64 = dataUrl.split(',')[1];
      geminiRef.current.sendImage(base64);
    };
    
    // Capture frame every 2 seconds
    const intervalId = setInterval(captureFrame, 2000);
    
    // Store for cleanup
    (window as any).__frameInterval = intervalId;
  };

  const stopVisualCapture = () => {
    if (visualStream) {
      visualStream.getTracks().forEach(track => track.stop());
      setVisualStream(null);
      addEvent('visual_stopped', 'Visual capture disabled');
    }
    
    if ((window as any).__frameInterval) {
      clearInterval((window as any).__frameInterval);
    }
  };

  const startSession = async () => {
    if (isConnected || geminiRef.current?.isSessionActive()) return;  // Prevent double connect
    kernel.addEvent('session_starting', 'Connecting to Gemini Live...');
    
    // Start Firestore session first
    await kernel.startSession();
    
    // Pass existing memories to the connection for injection
    const memoryStrings = kernel.coreMemories.map(m => m.content);
    const connected = await geminiRef.current?.connect(memoryStrings);
    
    if (connected) {
      kernel.addEvent('kernel_loaded', `Identity kernel connected (${memoryStrings.length} memories loaded)`);
    } else {
      addEvent('error', 'Failed to connect - check API key');
    }
  };

  const endSession = async () => {
    geminiRef.current?.disconnect();
    stopVisualCapture();
    setAudioEnabled(false);
    setIsConnected(false);
    setStatus('idle');
    setCurrentAgentText('');
    await kernel.endSession();
  };

  const toggleAudio = async () => {
    if (!audioEnabled) {
      await geminiRef.current?.startRecording();
      setAudioEnabled(true);
      addEvent('mic_enabled', 'Voice input active');
    } else {
      geminiRef.current?.stopRecording();
      setAudioEnabled(false);
      addEvent('mic_disabled', 'Voice input paused');
    }
  };

  const sendTextMessage = async (text: string) => {
    if (!text.trim() || !isConnected) return;

    pendingUserMessageRef.current = text;  // Store for extraction

    setMessages(prev => [...prev, {
      role: 'user',
      content: text,
      timestamp: new Date(),
    }]);

    const topic = extractTopic(text);
    if (topic) {
      kernel.updateTopic(topic);
      kernel.addEvent('topic_detected', topic);
    }

    // Persist context to Firestore
    kernel.addContext(text.slice(0, 100), 'voice');

    setStatus('thinking');
    geminiRef.current?.sendText(text);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim()) {
      sendTextMessage(textInput.trim());
      setTextInput('');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[var(--shik-bg)]">
      {/* Hidden canvas for visual capture */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Intro Overlay */}
      {showIntro && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--shik-surface)] border border-[var(--shik-border)] rounded-xl p-8 max-w-lg text-center">
            <h2 className="text-2xl font-bold text-white mb-4">Welcome to SHIK Live</h2>
            <p className="text-[var(--shik-text-muted)] mb-6 leading-relaxed">
              <strong className="text-white">SHIK separates what an AI thinks from who it is.</strong>
              <br /><br />
              Start a session to watch a real-time agent build and maintain a persistent identity kernel while you talk to it. The right panel shows the agent&apos;s evolving memory and self-model — updating live as you interact.
              <br /><br />
              <span className="text-[var(--shik-warning)]">🎧 Use headphones to avoid audio feedback loops.</span>
            </p>
            <button
              onClick={() => setShowIntro(false)}
              className="px-6 py-3 rounded-lg bg-[var(--shik-accent)] text-white font-semibold hover:bg-[var(--shik-accent-light)] transition-colors"
            >
              Got it — Show me the demo
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--shik-border)] bg-[var(--shik-surface)]">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">SHIK Live</h1>
          <span className="text-xs text-[var(--shik-text-muted)]">Watch an AI build persistent identity in real time</span>
        </div>
        <div className="flex items-center gap-4">
          {isConnected ? (
            <>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  status === 'speaking' ? 'bg-[var(--shik-accent)]' : 
                  status === 'thinking' ? 'bg-[var(--shik-warning)]' : 
                  'bg-[var(--shik-success)]'
                } pulse-live`}></span>
                <span className="text-sm text-[var(--shik-success)]">LIVE</span>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${
                status === 'listening' ? 'bg-[var(--shik-success)]/20 text-[var(--shik-success)]' :
                status === 'thinking' ? 'bg-[var(--shik-warning)]/20 text-[var(--shik-warning)]' :
                status === 'speaking' ? 'bg-[var(--shik-accent)]/20 text-[var(--shik-accent)]' :
                'bg-[var(--shik-surface-light)] text-[var(--shik-text-muted)]'
              }`}>
                {status.toUpperCase()}
              </span>
              <button
                onClick={endSession}
                className="px-3 py-1 text-sm rounded bg-[var(--shik-danger)] text-white hover:opacity-90"
              >
                End Session
              </button>
            </>
          ) : (
            <button
              onClick={startSession}
              className="px-4 py-2 text-sm rounded bg-[var(--shik-accent)] text-white hover:bg-[var(--shik-accent-light)]"
            >
              Start Session
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel - Live Interaction */}
        <div className="w-1/3 flex flex-col border-r border-[var(--shik-border)]">
          <div className="px-4 py-2 border-b border-[var(--shik-border)] bg-[var(--shik-surface)]">
            <h2 className="text-sm font-semibold text-[var(--shik-accent)]">LIVE INTERACTION</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !currentAgentText ? (
              <p className="text-[var(--shik-text-muted)] text-sm text-center mt-8">
                {isConnected ? 'Enable mic or type below to start talking...' : 'Start a session to begin'}
              </p>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg text-sm ${
                      msg.role === 'user'
                        ? 'bg-[var(--shik-accent)]/20 border border-[var(--shik-accent)]/30'
                        : 'bg-[var(--shik-surface-light)] border border-[var(--shik-border)]'
                    }`}
                  >
                    <div className="text-xs text-[var(--shik-text-muted)] mb-1">
                      {msg.role === 'user' ? 'You' : 'SHIK Agent'}
                    </div>
                    {msg.content}
                  </div>
                ))}
                {/* Streaming agent response */}
                {currentAgentText && (
                  <div className="p-3 rounded-lg text-sm bg-[var(--shik-surface-light)] border border-[var(--shik-border)]">
                    <div className="text-xs text-[var(--shik-text-muted)] mb-1">SHIK Agent</div>
                    {currentAgentText}
                    <span className="inline-block w-1 h-4 bg-[var(--shik-accent)] animate-pulse ml-1"></span>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Controls */}
          <div className="p-4 border-t border-[var(--shik-border)] bg-[var(--shik-surface)] space-y-2">
            <form onSubmit={handleTextSubmit} className="flex gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={isConnected ? "Type a message..." : "Start session first"}
                disabled={!isConnected || status === 'thinking' || status === 'speaking'}
                className="flex-1 px-3 py-2 rounded text-sm bg-[var(--shik-surface-light)] border border-[var(--shik-border)] text-white placeholder-[var(--shik-text-muted)] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!isConnected || !textInput.trim() || status === 'thinking' || status === 'speaking'}
                className="px-4 py-2 rounded text-sm font-medium bg-[var(--shik-accent)] text-white disabled:opacity-50"
              >
                Send
              </button>
            </form>
            
            <button
              onClick={toggleAudio}
              disabled={!isConnected}
              className={`w-full py-2 rounded text-sm font-medium transition-colors ${
                audioEnabled
                  ? 'bg-[var(--shik-success)] text-white'
                  : 'bg-[var(--shik-surface-light)] text-[var(--shik-text-muted)] hover:bg-[var(--shik-border)]'
              } disabled:opacity-50`}
            >
              {audioEnabled ? '🎤 Voice Active — Speak to interact' : '🎤 Enable Voice Input'}
            </button>
          </div>
        </div>

        {/* Center Panel - Visual Context */}
        <div className="w-1/3 flex flex-col border-r border-[var(--shik-border)]">
          <div className="px-4 py-2 border-b border-[var(--shik-border)] bg-[var(--shik-surface)]">
            <h2 className="text-sm font-semibold text-[var(--shik-accent)]">VISUAL CONTEXT</h2>
            <p className="text-xs text-[var(--shik-text-muted)] mt-1">Share camera or screen — the agent will see and respond to what you show.</p>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            {visualStream ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full max-h-[400px] rounded-lg border border-[var(--shik-border)] object-cover"
              />
            ) : (
              <div className="w-full aspect-video rounded-lg border-2 border-dashed border-[var(--shik-border)] flex flex-col items-center justify-center text-[var(--shik-text-muted)]">
                <span className="text-4xl mb-2">📷</span>
                <span className="text-sm">No visual input</span>
                <span className="text-xs mt-1">Enable camera or screen share below</span>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-[var(--shik-border)] bg-[var(--shik-surface)]">
            <div className="flex gap-2">
              {!visualStream ? (
                <>
                  <button
                    onClick={() => startVisualCapture('camera')}
                    disabled={!isConnected}
                    className="flex-1 py-2 rounded text-sm bg-[var(--shik-surface-light)] hover:bg-[var(--shik-border)] disabled:opacity-50 transition-colors"
                  >
                    📹 Camera
                  </button>
                  <button
                    onClick={() => startVisualCapture('screen')}
                    disabled={!isConnected}
                    className="flex-1 py-2 rounded text-sm bg-[var(--shik-surface-light)] hover:bg-[var(--shik-border)] disabled:opacity-50 transition-colors"
                  >
                    🖥️ Screen
                  </button>
                </>
              ) : (
                <button
                  onClick={stopVisualCapture}
                  className="flex-1 py-2 rounded text-sm bg-[var(--shik-danger)] text-white"
                >
                  Stop Capture
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Identity Kernel */}
        <div className="w-1/3 flex flex-col">
          <div className="px-4 py-2 border-b border-[var(--shik-border)] bg-[var(--shik-surface)]">
            <h2 className="text-sm font-semibold text-[var(--shik-accent)]">IDENTITY KERNEL</h2>
            <p className="text-xs text-[var(--shik-text-muted)] mt-1">While Gemini handles the conversation, this panel shows the agent&apos;s persistent self — updating live.</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Core Memory */}
            <div>
              <h3 className="text-xs font-semibold text-[var(--shik-warning)] mb-2">CORE MEMORY</h3>
              <div className="space-y-2">
                {kernel.coreMemories.length === 0 ? (
                  <p className="text-xs text-[var(--shik-text-muted)] italic">Memories will appear here as the agent learns from your conversation.</p>
                ) : (
                  kernel.coreMemories.map(mem => (
                    <div key={mem.id} className="p-2 rounded bg-[var(--shik-surface)] text-xs border border-[var(--shik-border)]">
                      <p>{mem.content}</p>
                      <div className="flex justify-between mt-1 text-[var(--shik-text-muted)]">
                        <span>{mem.sourceType}</span>
                        <span>{(mem.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Session Context */}
            <div>
              <h3 className="text-xs font-semibold text-[var(--shik-success)] mb-2">SESSION CONTEXT</h3>
              <div className="space-y-2">
                {kernel.sessionContext.length === 0 ? (
                  <p className="text-xs text-[var(--shik-text-muted)] italic">Session-specific context will build up as you interact.</p>
                ) : (
                  kernel.sessionContext.map(ctx => (
                    <div key={ctx.id} className="p-2 rounded bg-[var(--shik-surface)] text-xs border border-[var(--shik-border)]">
                      <p>{ctx.content}</p>
                      <span className="text-[var(--shik-text-muted)]">{ctx.sourceType}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Continuity State */}
            <div>
              <h3 className="text-xs font-semibold text-[var(--shik-accent)] mb-2">CONTINUITY STATE</h3>
              <div className="p-3 rounded bg-[var(--shik-surface)] border border-[var(--shik-border)] text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--shik-text-muted)]">Current Topic</span>
                  <span>{kernel.currentTopic || <span className="italic text-[var(--shik-text-muted)]">Start talking</span>}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--shik-text-muted)]">Turn Count</span>
                  <span>{kernel.turnCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--shik-text-muted)]">Status</span>
                  <span className={`px-1 rounded ${
                    status === 'listening' ? 'bg-[var(--shik-success)]/20 text-[var(--shik-success)]' :
                    status === 'thinking' ? 'bg-[var(--shik-warning)]/20 text-[var(--shik-warning)]' :
                    status === 'speaking' ? 'bg-[var(--shik-accent)]/20 text-[var(--shik-accent)]' :
                    'bg-[var(--shik-surface-light)]'
                  }`}>
                    {status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Event Log */}
      <footer className="h-10 border-t border-[var(--shik-border)] bg-[var(--shik-surface)] flex items-center px-4 overflow-x-auto">
        <span className="text-xs font-semibold text-[var(--shik-text-muted)] mr-4 shrink-0" title="What the agent is doing behind the scenes">KERNEL OPERATIONS:</span>
        <div className="flex gap-4 text-xs">
          {kernel.events.length === 0 ? (
            <span className="text-[var(--shik-text-muted)] italic">Identity kernel operations will appear here as the agent thinks...</span>
          ) : (
            kernel.events.map(evt => (
              <span key={evt.id} className="text-[var(--shik-text-muted)] shrink-0">
                <span className="text-[var(--shik-accent)]">{evt.type}:</span> {evt.message}
              </span>
            ))
          )}
        </div>
      </footer>
    </div>
  );
}
