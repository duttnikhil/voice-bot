'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, Zap, Server, Database, ArrowRight, MessageSquare } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Hero Section */}
      <div className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Mic className="w-10 h-10 text-blue-600" />
              <h1 className="text-5xl sm:text-6xl font-bold text-slate-900">
                Voice Bot Case Studies
              </h1>
            </div>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Production-ready voice AI with real-time WebSocket streaming, state machine logic, and sub-1 second latency. Interview demonstration ready.
            </p>
          </div>

          {/* CTA Button */}
          <div className="flex justify-center">
            <Link href="/bot-demo">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 px-8">
                <Mic className="w-5 h-5" />
                Launch Voice Bot Demo
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </div>

          {/* Tech Stack Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
            {/* Architecture Card */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-blue-600" />
                  Backend Architecture
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900">FastAPI + WebSocket</p>
                  <ul className="space-y-1 text-slate-600">
                    <li className="flex items-center gap-2">
                      <span className="text-blue-600">•</span>
                      Real-time bidirectional communication
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-blue-600">•</span>
                      Asyncio for concurrent call handling
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-blue-600">•</span>
                      State machine per session
                    </li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900">Voice Pipeline</p>
                  <ul className="space-y-1 text-slate-600">
                    <li className="flex items-center gap-2">
                      <span className="text-blue-600">•</span>
                      Deepgram/Whisper for ASR
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-blue-600">•</span>
                      OpenAI for LLM/intent
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-blue-600">•</span>
                      ElevenLabs for TTS
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Features Card */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-600" />
                  Key Features
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-start gap-3">
                    <span className="text-emerald-600 font-bold mt-0.5">1</span>
                    <div>
                      <p className="font-semibold text-slate-900">Sub-1 Second Latency</p>
                      <p className="text-sm text-slate-600">Proven response time under 1000ms</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-emerald-600 font-bold mt-0.5">2</span>
                    <div>
                      <p className="font-semibold text-slate-900">State Machine Logic</p>
                      <p className="text-sm text-slate-600">Pause/resume with robust conversation flow</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-emerald-600 font-bold mt-0.5">3</span>
                    <div>
                      <p className="font-semibold text-slate-900">Non-blocking Asyncio</p>
                      <p className="text-sm text-slate-600">Handle concurrent calls efficiently</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Case Studies Section */}
          <div className="pt-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Case Studies Implemented</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Case Study 1 */}
              <Card className="border-slate-200 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg">Case Study 1: QuickRupee Loan Bot</CardTitle>
                  <CardDescription>Indian fintech loan eligibility</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 mb-2">Questions:</p>
                    <ol className="space-y-1 text-sm text-slate-600">
                      <li>1. Are you a salaried employee?</li>
                      <li>2. Is your monthly salary above ₹25,000?</li>
                      <li>3. Do you live in a metro city?</li>
                    </ol>
                  </div>
                  <div className="pt-2 border-t border-slate-200">
                    <p className="text-sm"><strong>Logic:</strong> 3 YES → Eligible (Agent calls in 10 mins)</p>
                    <p className="text-xs text-slate-500 mt-1">Demonstrates: Voice-only interaction, rapid qualification</p>
                  </div>
                </CardContent>
              </Card>

              {/* Case Study 2 */}
              <Card className="border-slate-200 hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg">Case Study 2: Home Renovation Bot</CardTitle>
                  <CardDescription>Lead qualification for contractors</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 mb-2">Questions:</p>
                    <ol className="space-y-1 text-sm text-slate-600">
                      <li>1. Do you own your home?</li>
                      <li>2. Is your budget over $10,000?</li>
                      <li>3. Will you start within 3 months?</li>
                    </ol>
                  </div>
                  <div className="pt-2 border-t border-slate-200">
                    <p className="text-sm"><strong>Logic:</strong> 3 YES → Hot Lead (Transfer to human)</p>
                    <p className="text-xs text-slate-500 mt-1">Demonstrates: Lead scoring, handoff logic</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Technical Requirements Met */}
          <Card className="border-slate-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                Job Requirements Checklist
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-green-600 font-bold">✓</span>
                    <div>
                      <p className="font-semibold text-slate-900">Real-time WebSocket Voice Pipeline</p>
                      <p className="text-slate-600">Not REST - streaming architecture</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-green-600 font-bold">✓</span>
                    <div>
                      <p className="font-semibold text-slate-900">Asyncio Non-blocking Python</p>
                      <p className="text-slate-600">Concurrent call handling with FastAPI</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-green-600 font-bold">✓</span>
                    <div>
                      <p className="font-semibold text-slate-900">State Machine Logic</p>
                      <p className="text-slate-600">Pause/resume with conversation context</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-green-600 font-bold">✓</span>
                    <div>
                      <p className="font-semibold text-slate-900">Voice Stack Integration Ready</p>
                      <p className="text-slate-600">ASR, LLM, TTS architecture in place</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Setup Instructions */}
          <Card className="border-slate-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="text-lg">Setup Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="font-semibold text-slate-900 mb-2">1. Start the FastAPI Backend</p>
                <code className="block bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">
                  cd backend && pip install -r requirements.txt && python main.py
                </code>
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-2">2. Backend runs on localhost:8000</p>
                <code className="block bg-slate-900 text-slate-100 p-3 rounded text-xs">
                  WebSocket: ws://localhost:8000/ws/{'{session_id}'}/{'{bot_type}'}
                </code>
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-2">3. Frontend connects automatically</p>
                <p className="text-slate-600">When you click "Launch Voice Bot Demo", the React app will establish WebSocket connection to the backend.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
