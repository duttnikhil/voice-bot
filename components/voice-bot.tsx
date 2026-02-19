'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';

interface LatencyMetrics {
  asr_latency_ms?: number;
  tts_latency_ms?: number;
}

interface Message {
  type: 'greeting' | 'question' | 'transcription' | 'response' | 'result' | 'error';
  text: string;
  tts_latency_ms?: number;
  asr_latency_ms?: number;
  eligible?: boolean;
  answers?: Record<string, boolean>;
  question_id?: string;
  has_audio?: boolean;
}

export default function VoiceBot({ botType = 'quickrupee' }: { botType?: string }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [latency, setLatency] = useState<LatencyMetrics>({});
  const [botStatus, setBotStatus] = useState<'connecting' | 'ready' | 'speaking' | 'listening' | 'processing' | 'done'>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioChunksRef = useRef<Uint8Array[]>([]);
  const audioPlaybackRef = useRef<AudioContext | null>(null);
  const mp3BufferRef = useRef<Uint8Array[]>([]);
  const initializedRef = useRef(false);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isPlayingRef = useRef(false);
  const pendingAudioRef = useRef<Uint8Array[]>([]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    initializeSession();
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const initializeSession = async () => {
    try {
      setBotStatus('connecting');
      const response = await fetch('https://voice-bot-production-8d49.up.railway.app/api/init-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_type: botType }),
      });
      const { ws_url } = await response.json();
      connectWebSocket(ws_url);
    } catch (error) {
      console.error('Failed to initialize session:', error);
      setBotStatus('ready');
    }
  };

  const getAudioContext = () => {
    if (!audioPlaybackRef.current || audioPlaybackRef.current.state === 'closed') {
      audioPlaybackRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioPlaybackRef.current;
  };

  // Play all collected MP3 chunks as one audio blob
  const playCollectedAudio = useCallback(async () => {
    if (mp3BufferRef.current.length === 0) return;

    const chunks = [...mp3BufferRef.current];
    mp3BufferRef.current = [];

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    if (totalLength < 100) return; // too small, skip

    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    try {
      setIsBotSpeaking(true);
      isPlayingRef.current = true;
      setBotStatus('speaking');

      const ctx = getAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();

      const decoded = await ctx.decodeAudioData(combined.buffer.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      source.onended = () => {
        isPlayingRef.current = false;
        setIsBotSpeaking(false);
        setIsProcessing(false);
        setBotStatus('ready');
      };
      source.start(0);
    } catch (e) {
      console.error('Audio decode error:', e);
      isPlayingRef.current = false;
      setIsBotSpeaking(false);
      setIsProcessing(false);
      setBotStatus('ready');
    }
  }, []);

  const connectWebSocket = (url: string) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary = audio chunk
        const arr = new Uint8Array(event.data);
        const prefix = new TextDecoder().decode(arr.slice(0, 12));
        if (prefix === 'AUDIO_CHUNK:') {
          mp3BufferRef.current.push(arr.slice(12));
        }
      } else {
        // JSON message
        try {
          const msg: Message = JSON.parse(event.data);
          handleMessage(msg);
        } catch (e) {
          console.error('JSON parse error:', e);
        }
      }
    };

    ws.onerror = (e) => console.error('WS error:', e);
    ws.onclose = () => {
      console.log('WS closed');
      setBotStatus('done');
    };
  };

  const handleMessage = (msg: Message) => {
    setMessages((prev) => [...prev, msg]);

    if (msg.tts_latency_ms) setLatency((p) => ({ ...p, tts_latency_ms: msg.tts_latency_ms }));
    if (msg.asr_latency_ms) setLatency((p) => ({ ...p, asr_latency_ms: msg.asr_latency_ms }));

    if (msg.type === 'result') {
      setBotStatus('done');
    }

    // When bot sends has_audio, wait a bit for binary chunks then play
    if (msg.has_audio) {
      setIsProcessing(true);
      // Wait 800ms for all binary audio chunks to arrive, then play
      setTimeout(() => {
        playCollectedAudio();
      }, 800);
    }
  };

  const startRecording = async () => {
    if (isProcessing || isBotSpeaking || botStatus === 'done') return;

    try {
      // Resume audio context on user gesture
      getAudioContext();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      audioChunksRef.current = [];

      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32767));
        }
        audioChunksRef.current.push(new Uint8Array(pcmData.buffer));
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      setIsRecording(true);
      setBotStatus('listening');
    } catch (error) {
      console.error('Mic error:', error);
    }
  };

  const stopRecording = async () => {
    if (!isRecording) return;

    // Stop mic
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    setIsRecording(false);
    setIsProcessing(true);
    setBotStatus('processing');

    // Combine PCM chunks
    const totalLen = audioChunksRef.current.reduce((acc, c) => acc + c.length, 0);
    if (totalLen === 0) {
      setIsProcessing(false);
      setBotStatus('ready');
      return;
    }

    const pcmData = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of audioChunksRef.current) {
      pcmData.set(chunk, offset);
      offset += chunk.length;
    }
    audioChunksRef.current = [];

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(pcmData);
      // Send END_AUDIO signal
      wsRef.current.send(new TextEncoder().encode('END_AUDIO'));
    }
  };

  const statusLabel: Record<string, string> = {
    connecting: '🔄 Connecting...',
    ready: '🟢 Ready',
    speaking: '🔊 Bot Speaking...',
    listening: '🎙️ Listening...',
    processing: '⏳ Processing...',
    done: '✅ Session Complete',
  };

  const canRecord = !isProcessing && !isBotSpeaking && botStatus !== 'connecting' && botStatus !== 'done';

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Voice Qualification Bot</h2>
            <span className="text-sm font-medium px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700">
              {statusLabel[botStatus]}
            </span>
          </div>

          {/* Chat messages */}
          <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg min-h-48 max-h-96 overflow-y-auto space-y-3">
            {messages.length === 0 && (
              <div className="text-slate-400 text-sm text-center mt-8">Connecting to voice bot...</div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`space-y-1 ${
                  msg.type === 'transcription' ? 'text-right' : 'text-left'
                }`}
              >
                <div className="text-xs font-semibold text-slate-500 uppercase">
                  {msg.type === 'transcription' ? 'You' : 'Bot'}
                </div>
                <div
                  className={`inline-block px-3 py-2 rounded-lg text-sm ${
                    msg.type === 'transcription'
                      ? 'bg-blue-600 text-white'
                      : msg.type === 'result'
                      ? 'bg-green-600 text-white'
                      : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-600'
                  }`}
                >
                  {msg.text}
                </div>
                <div className="flex gap-2 text-xs text-slate-400">
                  {msg.tts_latency_ms && <span>TTS: {msg.tts_latency_ms}ms</span>}
                  {msg.asr_latency_ms && <span>ASR: {msg.asr_latency_ms}ms</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Record button */}
          <Button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={() => isRecording && stopRecording()}
            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
            disabled={!canRecord}
            className={`w-full h-14 text-lg font-semibold transition-all ${
              isRecording
                ? 'bg-red-600 hover:bg-red-700 scale-95'
                : canRecord
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-slate-400 cursor-not-allowed'
            }`}
          >
            {isRecording
              ? '🔴 Release to Send'
              : isProcessing || isBotSpeaking
              ? '⏳ Please Wait...'
              : botStatus === 'done'
              ? '✅ Session Complete'
              : '🎙️ Hold to Speak'}
          </Button>

          {/* Latency metrics */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded border border-blue-100 dark:border-blue-800">
              <div className="text-xs text-slate-500">ASR Latency</div>
              <div className="font-bold text-blue-600 dark:text-blue-300">
                {latency.asr_latency_ms ? `${latency.asr_latency_ms}ms` : '—'}
              </div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/30 p-2 rounded border border-green-100 dark:border-green-800">
              <div className="text-xs text-slate-500">TTS Latency</div>
              <div className="font-bold text-green-600 dark:text-green-300">
                {latency.tts_latency_ms ? `${latency.tts_latency_ms}ms` : '—'}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}