import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Mint ephemeral tokens for client-side Gemini Live connections
// Real API key stays server-side, browser gets short-lived token
export async function POST() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const client = new GoogleGenAI({ apiKey });

    const token = await client.authTokens.create({
      config: {
        uses: 1, // Single use
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(), // 1 min to start
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });

    return NextResponse.json({ 
      token: token.name,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    });
  } catch (error) {
    console.error('Token API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate token', details: String(error) },
      { status: 500 }
    );
  }
}
