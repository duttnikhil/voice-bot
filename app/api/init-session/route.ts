import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { bot_type } = await request.json();
    
    const response = await fetch('http://localhost:8000/api/init-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_type }),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Session init error:', error);
    return NextResponse.json(
      { error: 'Failed to initialize session' },
      { status: 500 }
    );
  }
}
