// Firestore client for SHIK Live Identity Kernel persistence
import { Firestore, FieldValue } from '@google-cloud/firestore';

const db = new Firestore({ 
  projectId: process.env.GCP_PROJECT_ID 
});

// Collection references
const sessions = db.collection('sessions');
const coreMemory = db.collection('coreMemory');
const sessionContext = db.collection('sessionContext');
const events = db.collection('events');

// ============= SESSIONS =============

export interface Session {
  id?: string;
  startedAt: Date;
  status: 'active' | 'ended';
  currentTopic: string;
  turnCount: number;
}

export async function createSession(): Promise<string> {
  const doc = await sessions.add({
    startedAt: FieldValue.serverTimestamp(),
    status: 'active',
    currentTopic: '',
    turnCount: 0,
  });
  return doc.id;
}

export async function updateSession(sessionId: string, data: Partial<Session>): Promise<void> {
  await sessions.doc(sessionId).update(data);
}

export async function endSession(sessionId: string): Promise<void> {
  await sessions.doc(sessionId).update({ status: 'ended' });
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const doc = await sessions.doc(sessionId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Session;
}

// ============= CORE MEMORY =============

export interface CoreMemory {
  id?: string;
  content: string;
  sourceType: 'voice' | 'visual' | 'inferred';
  provenance: string;
  confidence: number;
  createdAt: Date;
}

export async function addCoreMemory(memory: Omit<CoreMemory, 'id' | 'createdAt'>): Promise<string> {
  const doc = await coreMemory.add({
    ...memory,
    createdAt: FieldValue.serverTimestamp(),
  });
  return doc.id;
}

export async function getCoreMemories(limit = 50): Promise<CoreMemory[]> {
  const snapshot = await coreMemory
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate(),
  })) as CoreMemory[];
}

export async function deleteCoreMemory(memoryId: string): Promise<void> {
  await coreMemory.doc(memoryId).delete();
}

// ============= SESSION CONTEXT =============

export interface SessionContextEntry {
  id?: string;
  sessionId: string;
  content: string;
  sourceType: 'voice' | 'visual' | 'inferred';
  createdAt: Date;
}

export async function addSessionContext(entry: Omit<SessionContextEntry, 'id' | 'createdAt'>): Promise<string> {
  const doc = await sessionContext.add({
    ...entry,
    createdAt: FieldValue.serverTimestamp(),
  });
  return doc.id;
}

export async function getSessionContext(sessionId: string, limit = 20): Promise<SessionContextEntry[]> {
  const snapshot = await sessionContext
    .where('sessionId', '==', sessionId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate(),
  })) as SessionContextEntry[];
}

// ============= EVENTS =============

export interface KernelEvent {
  id?: string;
  sessionId: string;
  type: string;
  message: string;
  timestamp: Date;
}

export async function addEvent(event: Omit<KernelEvent, 'id' | 'timestamp'>): Promise<string> {
  const doc = await events.add({
    ...event,
    timestamp: FieldValue.serverTimestamp(),
  });
  return doc.id;
}

export async function getSessionEvents(sessionId: string, limit = 50): Promise<KernelEvent[]> {
  const snapshot = await events
    .where('sessionId', '==', sessionId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate(),
  })) as KernelEvent[];
}

// ============= KERNEL STATE (combined read) =============

export interface KernelState {
  session: Session | null;
  coreMemories: CoreMemory[];
  sessionContext: SessionContextEntry[];
  events: KernelEvent[];
}

export async function getKernelState(sessionId: string): Promise<KernelState> {
  const [session, memories, context, sessionEvents] = await Promise.all([
    getSession(sessionId),
    getCoreMemories(20),
    getSessionContext(sessionId, 10),
    getSessionEvents(sessionId, 30),
  ]);

  return {
    session,
    coreMemories: memories,
    sessionContext: context,
    events: sessionEvents,
  };
}
