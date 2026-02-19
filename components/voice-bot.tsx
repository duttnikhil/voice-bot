'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';

interface LatencyMetrics {
  asr_latency_ms?: number;
  tts_latency_ms?: number;
  total_round_trip_ms?: number;
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [latency, setLatency] = useState<LatencyMetrics>({});

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioChunksRef = useRef<Uint8Array[]>([]);
  const audioPlaybackRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<Uint8Array[]>([]);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    initializeSession();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [botType]);

  const initializeSession = async () => {
    try {
      const response = await fetch('https://voice-bot-production-8d49.up.railway.app/api/init-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_type: botType }),
      });
      const { session_id, ws_url } = await response.json();
      setSessionId(session_id);
      
      connectWebSocket(ws_url); 
      console.log("WS URL FROM BACKEND:", ws_url);

    } catch (error) {
      console.error('Failed to initialize session:', error);
    }
  };

  const connectWebSocket = (url: string) => {
      wsRef.current = new WebSocket(url);
      wsRef.current.binaryType = 'arraybuffer';

    wsRef.current.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        handleAudioData(event.data);
      } else {
        handleMessage(JSON.parse(event.data));
      }
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  };

  const handleMessage = (msg: Message) => {
    setMessages((prev) => [...prev, msg]);

    if (msg.tts_latency_ms) {
      setLatency((prev) => ({
        ...prev,
        tts_latency_ms: msg.tts_latency_ms,
      }));
    }
    if (msg.asr_latency_ms) {
      setLatency((prev) => ({
        ...prev,
        asr_latency_ms: msg.asr_latency_ms,
      }));
    }

    if (msg.type === 'result') {
      setIsRecording(false);
      setIsProcessing(false);
    }

    // Play audio when message has audio
    if (msg.has_audio) {
      // Use a small delay to ensure all chunks are received
      setTimeout(() => {
        playCompleteAudio();
      }, 500);
    }
  };

  const handleAudioData = async (arrayBuffer: ArrayBuffer) => {
    if (arrayBuffer.byteLength > 6 && new TextDecoder().decode(new Uint8Array(arrayBuffer, 0, 12)) === 'AUDIO_CHUNK:') {
      const audioData = arrayBuffer.slice(12);
      audioBufferRef.current.push(new Uint8Array(audioData));
    }
  };

  const playAudioChunk = async (audioData: Uint8Array) => {
    if (!audioPlaybackRef.current) {
      audioPlaybackRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioPlaybackRef.current;
    try {
      // Create a proper copy of the buffer
      const buffer = audioData.buffer.slice(
        audioData.byteOffset, 
        audioData.byteOffset + audioData.byteLength
      );
      const decoded = await ctx.decodeAudioData(buffer as ArrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      source.start(0);
    } catch (e) {
      console.error('Audio decode failed:', e);
    }
  };

  const playCompleteAudio = async () => {
    if (audioBufferRef.current.length === 0) return;
    
    // Combine all chunks into a single MP3
    const totalLength = audioBufferRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
    const completeAudio = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of audioBufferRef.current) {
      completeAudio.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Clear buffer for next audio
    audioBufferRef.current = [];
    
    // Play the complete MP3
    await playAudioChunk(completeAudio);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1 },
      });

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

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
      processor.connect(audioContextRef.current.destination);

      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = async () => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    setIsRecording(false);
    setIsProcessing(true);

    const pcmData = new Uint8Array(
      audioChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0)
    );
    let offset = 0;
    for (const chunk of audioChunksRef.current) {
      pcmData.set(chunk, offset);
      offset += chunk.length;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(pcmData);
      wsRef.current.send(new Uint8Array([0x45, 0x4e, 0x44, 0x5f, 0x41, 0x55, 0x44, 0x49, 0x4f]));
    }

    audioChunksRef.current = [];
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
      <Card className="p-6">
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Voice Qualification Bot</h2>

          <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg min-h-48 max-h-96 overflow-y-auto space-y-3">
            {messages.map((msg, idx) => (
              <div key={idx} className="space-y-1">
                <div className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                  {msg.type.toUpperCase()}
                </div>
                <div className="text-base text-slate-900 dark:text-white">{msg.text}</div>
                {msg.tts_latency_ms && (
                  <div className="text-xs text-green-600">TTS: {msg.tts_latency_ms}ms</div>
                )}
                {msg.asr_latency_ms && (
                  <div className="text-xs text-blue-600">ASR: {msg.asr_latency_ms}ms</div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              disabled={isProcessing}
              className={`flex-1 ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {isRecording ? 'Release to Stop' : 'Hold to Speak'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-blue-50 dark:bg-blue-900 p-2 rounded">
              <div className="text-xs text-slate-600 dark:text-slate-400">ASR Latency</div>
              <div className="font-bold text-blue-600 dark:text-blue-300">
                {latency.asr_latency_ms ? `${latency.asr_latency_ms}ms` : '—'}
              </div>
            </div>
            <div className="bg-green-50 dark:bg-green-900 p-2 rounded">
              <div className="text-xs text-slate-600 dark:text-slate-400">TTS Latency</div>
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
