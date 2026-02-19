import asyncio
import json
import logging
import os
import time
import uuid
import wave
import io
import base64
from datetime import datetime
from enum import Enum
from typing import Optional
from collections import defaultdict

import httpx
import numpy as np
from scipy import signal
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from twilio.rest import Client
from twilio.twiml.voice_response import VoiceResponse, Start

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

domain = os.getenv("PUBLIC_DOMAIN", "localhost:8000")

protocol = "wss" if "railway.app" in domain else "ws"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
TWILIO_DOMAIN = os.getenv("TWILIO_DOMAIN", "localhost:8000")

twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) if TWILIO_ACCOUNT_SID else None

class AudioConverter:
    @staticmethod
    def ulaw_to_pcm(ulaw_audio: bytes) -> bytes:
        ulaw_array = np.frombuffer(ulaw_audio, dtype=np.uint8)
        
        bias = 0x84
        mask = 0x84
        
        pcm_array = np.empty(len(ulaw_array), dtype=np.int16)
        
        for i, sample in enumerate(ulaw_array):
            sample = ~sample
            sign = (sample & 0x80) >> 7
            exponent = (sample & 0x70) >> 4
            mantissa = sample & 0x0F
            
            mantissa = (mantissa << 3) + 0x84
            
            if exponent > 0:
                mantissa = mantissa << exponent
            
            if sign == 0:
                pcm_array[i] = mantissa
            else:
                pcm_array[i] = -mantissa
        
        return pcm_array.astype(np.int16).tobytes()

    @staticmethod
    def pcm_to_ulaw(pcm_audio: bytes) -> bytes:
        pcm_array = np.frombuffer(pcm_audio, dtype=np.int16)
        
        silence_threshold = 500
        pcm_array = np.where(
            np.abs(pcm_array) < silence_threshold,
            0,
            pcm_array
        )
        
        mask = 0x84
        ulaw_array = np.empty(len(pcm_array), dtype=np.uint8)
        
        for i, sample in enumerate(pcm_array):
            sign = 0 if sample >= 0 else 0x80
            sample = abs(sample)
            
            exponent = 0
            if sample > 0x1FFF:
                sample = sample >> 3
            
            if sample > 0xFF:
                exponent = 1
                while sample > 0x1FFF and exponent < 7:
                    sample = sample >> 1
                    exponent += 1
            
            mantissa = (sample >> (exponent + 3)) & 0x0F
            
            byte = ~(sign | (exponent << 4) | mantissa)
            ulaw_array[i] = byte & 0xFF
        
        return ulaw_array.astype(np.uint8).tobytes()

    @staticmethod
    def resample_8k_to_16k(audio_8k: bytes) -> bytes:
        audio_8k_array = np.frombuffer(audio_8k, dtype=np.int16)
        
        num_samples = len(audio_8k_array)
        new_num_samples = num_samples * 2
        
        audio_16k_array = np.zeros(new_num_samples, dtype=np.int16)
        
        for i in range(len(audio_8k_array) - 1):
            audio_16k_array[i * 2] = audio_8k_array[i]
            audio_16k_array[i * 2 + 1] = (
                int(audio_8k_array[i]) + int(audio_8k_array[i + 1])
            ) // 2
        
        if len(audio_8k_array) > 0:
            audio_16k_array[-1] = audio_8k_array[-1]
        
        return audio_16k_array.astype(np.int16).tobytes()

    @staticmethod
    def resample_16k_to_8k(audio_16k: bytes) -> bytes:
        audio_16k_array = np.frombuffer(audio_16k, dtype=np.int16)
        
        audio_8k_array = audio_16k_array[::2]
        
        return audio_8k_array.astype(np.int16).tobytes()

class BotType(str, Enum):
    QUICKRUPEE = "quickrupee"
    HOME_RENOVATION = "home_renovation"

class BotState(str, Enum):
    GREETING = "greeting"
    Q1 = "q1"
    Q2 = "q2"
    Q3 = "q3"
    RESULT = "result"
    END = "end"

class SessionData(BaseModel):
    session_id: str
    bot_type: BotType
    state: BotState
    answers: dict
    start_time: float

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
        self.sessions: dict[str, SessionData] = {}
        self.audio_buffers: dict[str, bytearray] = defaultdict(bytearray)

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket

    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]
        if session_id in self.sessions:
            del self.sessions[session_id]
        if session_id in self.audio_buffers:
            del self.audio_buffers[session_id]

    async def send_message(self, session_id: str, data: dict):
        if session_id in self.active_connections:
            await self.active_connections[session_id].send_json(data)

    async def send_audio_chunk(self, session_id: str, audio_chunk: bytes, chunk_type: str):
        if session_id in self.active_connections:
            await self.active_connections[session_id].send_bytes(
                b"AUDIO_CHUNK:" + audio_chunk
            )

manager = ConnectionManager()

class BotLogic:
    QUICKRUPEE_QUESTIONS = [
        {
            "id": "q1",
            "text": "Are you a salaried employee?",
            "state": BotState.Q1,
            "next_state": BotState.Q2,
        },
        {
            "id": "q2",
            "text": "Is your monthly salary above 25000 rupees?",
            "state": BotState.Q2,
            "next_state": BotState.Q3,
        },
        {
            "id": "q3",
            "text": "Do you live in a metro city?",
            "state": BotState.Q3,
            "next_state": BotState.RESULT,
        },
    ]

    HOME_RENOVATION_QUESTIONS = [
        {
            "id": "q1",
            "text": "Do you own your home?",
            "state": BotState.Q1,
            "next_state": BotState.Q2,
        },
        {
            "id": "q2",
            "text": "Is your renovation budget over 10000 dollars?",
            "state": BotState.Q2,
            "next_state": BotState.Q3,
        },
        {
            "id": "q3",
            "text": "Can you start the renovation within 3 months?",
            "state": BotState.Q3,
            "next_state": BotState.RESULT,
        },
    ]

    @staticmethod
    def get_greeting(bot_type: BotType) -> str:
        if bot_type == BotType.QUICKRUPEE:
            return "Hello! Welcome to QuickRupee Loan Qualification. I'll ask you three quick questions to check your eligibility. Let's get started."
        else:
            return "Hello! Welcome to Home Renovation Lead Qualification. I'll ask you three questions about your project. Let's begin."

    @staticmethod
    def get_next_question(bot_type: BotType, state: BotState) -> Optional[dict]:
        questions = (
            BotLogic.QUICKRUPEE_QUESTIONS
            if bot_type == BotType.QUICKRUPEE
            else BotLogic.HOME_RENOVATION_QUESTIONS
        )
        for q in questions:
            if q["state"] == state:
                return q
        return None

    @staticmethod
    def parse_yes_no(text: str) -> Optional[bool]:
        text_lower = text.lower().strip()
        yes_words = ["yes", "yep", "yeah", "true", "sure", "okay", "ok", "correct"]
        no_words = ["no", "nope", "nah", "false", "negative"]
        
        for word in yes_words:
            if word in text_lower:
                return True
        for word in no_words:
            if word in text_lower:
                return False
        return None

    @staticmethod
    def evaluate_eligibility(bot_type: BotType, answers: dict) -> tuple[bool, str]:
        if bot_type == BotType.QUICKRUPEE:
            all_yes = all([answers.get("q1"), answers.get("q2"), answers.get("q3")])
            if all_yes:
                return True, "Congratulations! You are eligible for the QuickRupee loan. Our agent will call you within 10 minutes."
            else:
                return False, "Thank you for your interest. Unfortunately, you do not meet the current eligibility criteria for QuickRupee loan."
        else:
            all_yes = all([answers.get("q1"), answers.get("q2"), answers.get("q3")])
            if all_yes:
                return True, "Excellent! You are a hot lead. We will transfer you to our renovation specialist now."
            else:
                return False, "Thank you for reaching out. We appreciate your interest in our services."

async def transcribe_audio(audio_bytes: bytes) -> tuple[str, float]:
    start = time.time()
    
    wav_io = io.BytesIO()
    with wave.open(wav_io, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16000)
        wav_file.writeframes(audio_bytes)
    
    wav_io.seek(0)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        files = {"file": ("audio.wav", wav_io, "audio/wav")}
        data = {"model": "whisper-1"}
        headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
        
        response = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            files=files,
            data=data,
            headers=headers,
        )
        response.raise_for_status()
    
    result = response.json()
    latency = time.time() - start
    
    return result["text"], latency

async def synthesize_speech(text: str) -> tuple[bytes, float]:
    start = time.time()
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}",
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
            },
        )
        response.raise_for_status()
    
    audio_bytes = response.content
    latency = time.time() - start
    
    return audio_bytes, latency

@app.post("/voice")
async def voice_webhook():
    response = VoiceResponse()
    
    session_id = str(uuid.uuid4())
    
    stream_url = f"wss://{TWILIO_DOMAIN}/ws/twilio/{session_id}"
    
    start = Start()
    start.stream(url=stream_url)
    
    response.append(start)
    
    return Response(content=str(response), media_type="application/xml")

@app.websocket("/ws/twilio/{session_id}")
async def twilio_media_stream(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)
    
    session = SessionData(
        session_id=session_id,
        bot_type=BotType.QUICKRUPEE,
        state=BotState.GREETING,
        answers={},
        start_time=time.time(),
    )
    manager.sessions[session_id] = session
    
    try:
        greeting = BotLogic.get_greeting(session.bot_type)
        audio_bytes, tts_latency = await synthesize_speech(greeting)
        
        pcm_8k = AudioConverter.resample_16k_to_8k(audio_bytes)
        ulaw_audio = AudioConverter.pcm_to_ulaw(pcm_8k)
        
        chunk_size = 320
        for i in range(0, len(ulaw_audio), chunk_size):
            chunk = ulaw_audio[i : i + chunk_size]
            base64_chunk = base64.b64encode(chunk).decode("utf-8")
            
            media_message = {
                "jsonrpc": "2.0",
                "result": {
                    "payload": base64_chunk
                },
                "id": 1
            }
            
            await websocket.send_json(media_message)
        
        session.state = BotState.Q1
        
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=120)
            except asyncio.TimeoutError:
                break
            
            if data.get("event") == "start":
                continue
            
            elif data.get("event") == "media":
                payload = data.get("media", {}).get("payload")
                if payload:
                    try:
                        audio_chunk = base64.b64decode(payload)
                        manager.audio_buffers[session_id].extend(audio_chunk)
                    except Exception as e:
                        logger.error(f"Error decoding Twilio audio: {e}")
            
            elif data.get("event") == "stop":
                manager.disconnect(session_id)
                break
            
            if data.get("event") == "media" or (len(manager.audio_buffers[session_id]) > 8000):
                if len(manager.audio_buffers[session_id]) >= 8000:
                    audio_buffer = bytes(manager.audio_buffers[session_id])
                    manager.audio_buffers[session_id].clear()
                    
                    try:
                        pcm_8k = AudioConverter.ulaw_to_pcm(audio_buffer)
                        pcm_16k = AudioConverter.resample_8k_to_16k(pcm_8k)
                        
                        wav_io = io.BytesIO()
                        with wave.open(wav_io, "wb") as wav_file:
                            wav_file.setnchannels(1)
                            wav_file.setsampwidth(2)
                            wav_file.setframerate(16000)
                            wav_file.writeframes(pcm_16k)
                        
                        wav_io.seek(0)
                        
                        async with httpx.AsyncClient(timeout=30.0) as client:
                            files = {"file": ("audio.wav", wav_io, "audio/wav")}
                            data_payload = {"model": "whisper-1"}
                            headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
                            
                            response = await client.post(
                                "https://api.openai.com/v1/audio/transcriptions",
                                files=files,
                                data=data_payload,
                                headers=headers,
                            )
                            response.raise_for_status()
                        
                        result = response.json()
                        transcription = result["text"]
                        
                        answer = BotLogic.parse_yes_no(transcription)
                        
                        if answer is None:
                            response_text = "I didn't quite understand. Could you please say yes or no?"
                            audio_bytes, tts_latency = await synthesize_speech(
                                response_text
                            )
                        else:
                            question_id = session.state.value
                            session.answers[question_id] = answer
                            
                            if session.state == BotState.Q3:
                                is_eligible, result_text = BotLogic.evaluate_eligibility(
                                    session.bot_type, session.answers
                                )
                                audio_bytes, tts_latency = await synthesize_speech(
                                    result_text
                                )
                                
                                session.state = BotState.END
                                
                                pcm_8k = AudioConverter.resample_16k_to_8k(audio_bytes)
                                ulaw_audio = AudioConverter.pcm_to_ulaw(pcm_8k)
                                
                                chunk_size = 320
                                for i in range(0, len(ulaw_audio), chunk_size):
                                    chunk = ulaw_audio[i : i + chunk_size]
                                    base64_chunk = base64.b64encode(chunk).decode("utf-8")
                                    
                                    media_message = {
                                        "jsonrpc": "2.0",
                                        "result": {
                                            "payload": base64_chunk
                                        },
                                        "id": 1
                                    }
                                    
                                    await websocket.send_json(media_message)
                                
                                break
                            else:
                                if session.state == BotState.Q1:
                                    session.state = BotState.Q2
                                elif session.state == BotState.Q2:
                                    session.state = BotState.Q3
                                
                                question = BotLogic.get_next_question(
                                    session.bot_type, session.state
                                )
                                if question:
                                    audio_bytes, tts_latency = await synthesize_speech(
                                        question["text"]
                                    )
                        
                        pcm_8k = AudioConverter.resample_16k_to_8k(audio_bytes)
                        ulaw_audio = AudioConverter.pcm_to_ulaw(pcm_8k)
                        
                        chunk_size = 320
                        for i in range(0, len(ulaw_audio), chunk_size):
                            chunk = ulaw_audio[i : i + chunk_size]
                            base64_chunk = base64.b64encode(chunk).decode("utf-8")
                            
                            media_message = {
                                "jsonrpc": "2.0",
                                "result": {
                                    "payload": base64_chunk
                                },
                                "id": 1
                            }
                            
                            await websocket.send_json(media_message)
                    
                    except Exception as e:
                        logger.error(f"Error processing Twilio audio: {e}")
    
    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        logger.error(f"Twilio WebSocket error: {e}")
        manager.disconnect(session_id)

@app.websocket("/ws/voice/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)
    session = SessionData(
        session_id=session_id,
        bot_type=BotType.QUICKRUPEE,
        state=BotState.GREETING,
        answers={},
        start_time=time.time(),
    )
    manager.sessions[session_id] = session
    
    try:
        greeting = BotLogic.get_greeting(session.bot_type)
        audio_bytes, tts_latency = await synthesize_speech(greeting)
        
        await manager.send_message(
            session_id,
            {
                "type": "greeting",
                "text": greeting,
                "tts_latency_ms": round(tts_latency * 1000),
                "has_audio": True,
            },
        )
        
        chunk_size = 4096
        for i in range(0, len(audio_bytes), chunk_size):
            chunk = audio_bytes[i : i + chunk_size]
            await manager.send_audio_chunk(session_id, chunk, "greeting")
            await asyncio.sleep(0.01)
        
        session.state = BotState.Q1
        
        while True:
            data = await websocket.receive_bytes()
            
            if data == b"END_AUDIO":
                audio_buffer = manager.audio_buffers[session_id]
                if len(audio_buffer) > 0:
                    try:
                        transcription, asr_latency = await transcribe_audio(
                            bytes(audio_buffer)
                        )
                        manager.audio_buffers[session_id].clear()
                        
                        await manager.send_message(
                            session_id,
                            {
                                "type": "transcription",
                                "text": transcription,
                                "asr_latency_ms": round(asr_latency * 1000),
                            },
                        )
                        
                        answer = BotLogic.parse_yes_no(transcription)
                        
                        if answer is None:
                            response_text = "I didn't quite understand. Could you please say yes or no?"
                            audio_bytes, tts_latency = await synthesize_speech(
                                response_text
                            )
                            
                            await manager.send_message(
                                session_id,
                                {
                                    "type": "response",
                                    "text": response_text,
                                    "tts_latency_ms": round(tts_latency * 1000),
                                    "has_audio": True,
                                },
                            )
                            
                            for i in range(0, len(audio_bytes), chunk_size):
                                chunk = audio_bytes[i : i + chunk_size]
                                await manager.send_audio_chunk(session_id, chunk, "response")
                                await asyncio.sleep(0.01)
                        else:
                            question_id = session.state.value
                            session.answers[question_id] = answer
                            
                            if session.state == BotState.Q3:
                                is_eligible, result_text = BotLogic.evaluate_eligibility(
                                    session.bot_type, session.answers
                                )
                                audio_bytes, tts_latency = await synthesize_speech(
                                    result_text
                                )
                                
                                await manager.send_message(
                                    session_id,
                                    {
                                        "type": "result",
                                        "eligible": is_eligible,
                                        "text": result_text,
                                        "tts_latency_ms": round(tts_latency * 1000),
                                        "has_audio": True,
                                        "answers": session.answers,
                                    },
                                )
                                
                                for i in range(0, len(audio_bytes), chunk_size):
                                    chunk = audio_bytes[i : i + chunk_size]
                                    await manager.send_audio_chunk(session_id, chunk, "result")
                                    await asyncio.sleep(0.01)
                                
                                session.state = BotState.END
                                break
                            else:
                                if session.state == BotState.Q1:
                                    session.state = BotState.Q2
                                elif session.state == BotState.Q2:
                                    session.state = BotState.Q3
                                
                                question = BotLogic.get_next_question(
                                    session.bot_type, session.state
                                )
                                if question:
                                    audio_bytes, tts_latency = await synthesize_speech(
                                        question["text"]
                                    )
                                    
                                    await manager.send_message(
                                        session_id,
                                        {
                                            "type": "question",
                                            "text": question["text"],
                                            "question_id": question["id"],
                                            "tts_latency_ms": round(tts_latency * 1000),
                                            "has_audio": True,
                                        },
                                    )
                                    
                                    for i in range(0, len(audio_bytes), chunk_size):
                                        chunk = audio_bytes[i : i + chunk_size]
                                        await manager.send_audio_chunk(session_id, chunk, "question")
                                        await asyncio.sleep(0.01)
                    except Exception as e:
                        logger.error(f"Error processing audio: {e}")
                        await manager.send_message(
                            session_id,
                            {"type": "error", "message": str(e)},
                        )
            else:
                manager.audio_buffers[session_id].extend(data)

    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(session_id)

@app.post("/api/init-session")
async def init_session(bot_type: str = "quickrupee"):
    session_id = str(uuid.uuid4())
    return {
    "session_id": session_id,
    "bot_type": bot_type,
    "ws_url": f"{protocol}://{domain}/ws/voice/{session_id}",
}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
