import { NextRequest, NextResponse } from 'next/server';
import {
  createSession,
  updateSession,
  endSession,
  getKernelState,
  addCoreMemory,
  addSessionContext,
  addEvent,
  getCoreMemories,
} from '@/lib/firestore';

export async function POST(request: NextRequest) {
  try {
    const { action, ...data } = await request.json();

    switch (action) {
      case 'createSession': {
        const sessionId = await createSession();
        await addEvent({ sessionId, type: 'session_started', message: 'SHIK Live session initialized' });
        return NextResponse.json({ success: true, sessionId });
      }

      case 'endSession': {
        const { sessionId } = data;
        await endSession(sessionId);
        await addEvent({ sessionId, type: 'session_ended', message: 'Session terminated' });
        return NextResponse.json({ success: true });
      }

      case 'updateSession': {
        const { sessionId, ...updates } = data;
        await updateSession(sessionId, updates);
        return NextResponse.json({ success: true });
      }

      case 'addMemory': {
        const { sessionId, content, sourceType, provenance, confidence } = data;
        const memoryId = await addCoreMemory({ content, sourceType, provenance, confidence });
        await addEvent({ sessionId, type: 'memory_stored', message: content.slice(0, 50) });
        return NextResponse.json({ success: true, memoryId });
      }

      case 'addContext': {
        const { sessionId, content, sourceType } = data;
        const contextId = await addSessionContext({ sessionId, content, sourceType });
        return NextResponse.json({ success: true, contextId });
      }

      case 'addEvent': {
        const { sessionId, type, message } = data;
        const eventId = await addEvent({ sessionId, type, message });
        return NextResponse.json({ success: true, eventId });
      }

      case 'getState': {
        const { sessionId } = data;
        const state = await getKernelState(sessionId);
        return NextResponse.json({ success: true, state });
      }

      case 'getMemories': {
        const memories = await getCoreMemories(50);
        return NextResponse.json({ success: true, memories });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Kernel API error:', error);
    return NextResponse.json(
      { error: 'Internal error', details: String(error) },
      { status: 500 }
    );
  }
}
