# Voice Bot Case Studies - Production Ready

Real-time voice qualification bots with WebSocket streaming, Whisper ASR, ElevenLabs TTS, and sub-1s latency.

## Setup

```bash
cp .env.example .env
# Add OPENAI_API_KEY and ELEVENLABS_API_KEY

# Backend
cd backend && pip install -r requirements.txt && python main.py

# Frontend (new terminal)
npm install && npm run dev
# Visit http://localhost:3000
```

## System Design

**Frontend (React)**
- Web Audio API for 16kHz PCM capture
- WebSocket streaming (not REST)
- Real-time audio playback from server
- Live latency dashboard

**Backend (FastAPI)**
- Async WebSocket endpoint `/ws/voice/{session_id}`
- Non-blocking httpx for external APIs
- Connection manager for session lifecycle
- Proper cleanup on disconnect

**ASR Pipeline**
- Client captures 16kHz mono PCM
- Backend converts to WAV
- OpenAI Whisper API transcription
- Measured latency logging

**TTS Pipeline**
- Bot text → ElevenLabs API
- Stream audio chunks over WebSocket
- Real-time playback (no buffer delay)
- Measured latency logging

## Case Studies

**QuickRupee Loan Bot** (3 questions)
```
Q1: Are you salaried?
Q2: Salary > ₹25,000?
Q3: Live in metro?
→ All YES = Eligible (agent calls in 10 mins)
→ Any NO = Rejected
```

**Home Renovation Bot** (3 questions)
```
Q1: Own your home?
Q2: Budget > $10,000?
Q3: Start within 3 months?
→ All YES = Hot lead (transfer to specialist)
→ Any NO = Thank you (end call)
```

## Architecture

```
Browser (React + Web Audio)
        ↓
    WebSocket (PCM bytes)
        ↓
FastAPI Backend (Asyncio)
    ├→ Whisper (speech→text, 300-500ms)
    ├→ State Machine (logic, <50ms)
    └→ ElevenLabs (text→speech, 200-400ms)
        ↓
    WebSocket (audio chunks)
        ↓
Browser (Web Audio playback)
```

**Total Latency: 700-1300ms** (measured per turn)

## Code Structure

```
backend/main.py (392 lines)
├── BotType & BotState enums
├── SessionData model
├── ConnectionManager (WebSocket sessions)
├── BotLogic (questions + eligibility)
├── transcribe_audio() → real Whisper API
├── synthesize_speech() → real ElevenLabs API
└── WebSocket handler with full state machine

components/voice-bot.tsx (241 lines)
├── Session initialization
├── Microphone recording (Web Audio API)
├── WebSocket message handling
├── Audio chunk playback
├── Latency metrics display

app/bot-demo/page.tsx
└── Bot selector + voice bot UI
```

## Running

1. **Terminal 1**: `cd backend && python main.py`
2. **Terminal 2**: `npm run dev`
3. **Browser**: http://localhost:3000 → "Launch Voice Bot Demo"
4. **Select bot** → "Start Recording" → Speak → Listen
