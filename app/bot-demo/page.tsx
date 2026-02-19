'use client';

import { useState } from 'react';
import VoiceBot from '@/components/voice-bot';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function BotDemoPage() {
  const [selectedBot, setSelectedBot] = useState<'quickrupee' | 'home_renovation' | null>(null);

  if (!selectedBot) {
    return (
      <main className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-2xl mx-auto">
          <Link href="/">
            <Button variant="outline" className="mb-6 flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>

          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Select Bot</h1>
              <p className="text-slate-600">Choose a qualification bot to test</p>
            </div>

            <div className="grid gap-4">
              <Card 
                className="p-6 cursor-pointer hover:border-blue-500 hover:shadow-md transition-all"
                onClick={() => setSelectedBot('quickrupee')}
              >
                <h2 className="text-xl font-bold mb-2">QuickRupee Loan Bot</h2>
                <p className="text-slate-600 text-sm">3 eligibility questions for loan qualification. All YES = Agent calls in 10 minutes.</p>
              </Card>

              <Card 
                className="p-6 cursor-pointer hover:border-green-500 hover:shadow-md transition-all"
                onClick={() => setSelectedBot('home_renovation')}
              >
                <h2 className="text-xl font-bold mb-2">Home Renovation Bot</h2>
                <p className="text-slate-600 text-sm">3 lead scoring questions. All YES = Transfer to specialist.</p>
              </Card>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-2xl mx-auto">
        <Button 
          variant="outline" 
          className="mb-6 flex items-center gap-2"
          onClick={() => setSelectedBot(null)}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Selection
        </Button>

        <VoiceBot botType={selectedBot} />
      </div>
    </main>
  );
}
