import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("BODY:", body);

    const bot_type = body?.bot_type || "quickrupee";

    const response = await fetch(
      'https://voice-bot-production-8d49.up.railway.app/api/init-session',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_type }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Railway error:", text);
      return NextResponse.json(
        { error: "Backend failed", details: text },
        { status: 500 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("API ROUTE ERROR:", error);
    return NextResponse.json(
      { error: 'Failed to initialize session' },
      { status: 500 }
    );
  }
}
