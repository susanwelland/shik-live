// Client-side hook for managing Identity Kernel state with Firestore persistence
import { useState, useCallback, useRef } from 'react';

interface CoreMemory {
  id: string;
  content: string;
  sourceType: 'voice' | 'visual' | 'inferred';
  provenance: string;
  confidence: number;
  createdAt: Date;
}

interface SessionContext {
  id: string;
  content: string;
  sourceType: 'voice' | 'visual' | 'inferred';
  createdAt: Date;
}

interface KernelEvent {
  id: string;
  type: string;
  message: string;
  timestamp: Date;
}

export interface KernelState {
  sessionId: string | null;
  coreMemories: CoreMemory[];
  sessionContext: SessionContext[];
  events: KernelEvent[];
  currentTopic: string;
  turnCount: number;
}

async function kernelApi(action: string, data: Record<string, any> = {}) {
  const response = await fetch('/api/kernel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data }),
  });
  
  if (!response.ok) {
    throw new Error('Kernel API request failed');
  }
  
  return response.json();
}

export function useKernel() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [coreMemories, setCoreMemories] = useState<CoreMemory[]>([]);
  const [sessionContext, setSessionContext] = useState<SessionContext[]>([]);
  const [events, setEvents] = useState<KernelEvent[]>([]);
  const [currentTopic, setCurrentTopic] = useState('');
  const [turnCount, setTurnCount] = useState(0);
  
  const localEventsRef = useRef<KernelEvent[]>([]); // Local buffer for quick display

  // Start a new session
  const startSession = useCallback(async () => {
    // Generate a local session ID regardless of API success
    const localSessionId = `local-${Date.now()}`;
    
    try {
      const { sessionId: newSessionId } = await kernelApi('createSession');
      setSessionId(newSessionId);
      
      // Load existing core memories (persist across sessions)
      try {
        const { memories } = await kernelApi('getMemories');
        setCoreMemories(memories || []);
      } catch (e) {
        console.warn('Could not load memories, continuing without persistence');
      }
    } catch (error) {
      console.warn('Kernel API unavailable, using local-only mode:', error);
      setSessionId(localSessionId); // Use local ID so session still works
    }
    
    // Add local event regardless
    const event = {
      id: Date.now().toString(),
      type: 'session_started',
      message: 'SHIK Live session initialized',
      timestamp: new Date(),
    };
    localEventsRef.current = [event];
    setEvents([event]);
    
    return sessionId || localSessionId;
  }, []);

  // End current session
  const endSessionKernel = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      await kernelApi('endSession', { sessionId });
      setSessionId(null);
      setSessionContext([]);
      localEventsRef.current = [];
      setEvents([]);
      setCurrentTopic('');
      setTurnCount(0);
    } catch (error) {
      console.error('Failed to end session:', error);
    }
  }, [sessionId]);

  // Add a core memory
  const addMemory = useCallback(async (
    content: string,
    sourceType: 'voice' | 'visual' | 'inferred' = 'inferred',
    provenance: string = 'conversation',
    confidence: number = 0.85
  ) => {
    if (!sessionId) return;
    
    // Always add locally first
    const newMemory: CoreMemory = {
      id: Date.now().toString(),
      content,
      sourceType,
      provenance,
      confidence,
      createdAt: new Date(),
    };
    setCoreMemories(prev => [newMemory, ...prev]);
    addLocalEvent('memory_stored', content.slice(0, 40));
    
    // Try to persist (fire and forget)
    try {
      await kernelApi('addMemory', {
        sessionId,
        content,
        sourceType,
        provenance,
        confidence,
      });
    } catch (error) {
      console.warn('Memory not persisted:', error);
    }
  }, [sessionId]);

  // Add session context
  const addContext = useCallback(async (
    content: string,
    sourceType: 'voice' | 'visual' | 'inferred' = 'voice'
  ) => {
    if (!sessionId) return;
    
    // Always add locally first
    const newContext: SessionContext = {
      id: Date.now().toString(),
      content,
      sourceType,
      createdAt: new Date(),
    };
    setSessionContext(prev => [newContext, ...prev.slice(0, 9)]);
    
    // Try to persist (fire and forget)
    kernelApi('addContext', { sessionId, content, sourceType }).catch(() => {});
  }, [sessionId]);

  // Add event (local + remote)
  const addLocalEvent = useCallback((type: string, message: string) => {
    const event: KernelEvent = {
      id: Date.now().toString(),
      type,
      message,
      timestamp: new Date(),
    };
    
    localEventsRef.current = [...localEventsRef.current.slice(-19), event];
    setEvents([...localEventsRef.current]);
    
    // Async persist (fire and forget)
    if (sessionId) {
      kernelApi('addEvent', { sessionId, type, message }).catch(() => {});
    }
  }, [sessionId]);

  // Update topic and turn count
  const updateTopic = useCallback((topic: string) => {
    setCurrentTopic(topic);
    if (sessionId) {
      kernelApi('updateSession', { sessionId, currentTopic: topic }).catch(() => {});
    }
  }, [sessionId]);

  const incrementTurn = useCallback(() => {
    const newCount = turnCount + 1;
    setTurnCount(newCount);
    if (sessionId) {
      kernelApi('updateSession', { sessionId, turnCount: newCount }).catch(() => {});
    }
  }, [sessionId, turnCount]);

  return {
    sessionId,
    coreMemories,
    sessionContext,
    events,
    currentTopic,
    turnCount,
    startSession,
    endSession: endSessionKernel,
    addMemory,
    addContext,
    addEvent: addLocalEvent,
    updateTopic,
    incrementTurn,
  };
}
