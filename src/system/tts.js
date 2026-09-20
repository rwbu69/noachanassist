import fs from 'fs';
import path from 'path';
import { getAudioDir } from './config.js';

export async function generateSpeech(text, requestId, apiKey, voiceId) {
    if (!apiKey) return null;
    const targetVoice = voiceId || 'pNInz6obbfDQGcgMyIGC'; // Default voice

    try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_monolingual_v1",
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            })
        });

        if (!response.ok) throw new Error(`ElevenLabs API error: ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const audioResponsesDir = path.join(getAudioDir(), 'responses');
        if (!fs.existsSync(audioResponsesDir)) fs.mkdirSync(audioResponsesDir, { recursive: true });
        
        const fileName = `responses/${requestId || Date.now()}.mp3`;
        const filePath = path.join(getAudioDir(), fileName);
        fs.writeFileSync(filePath, buffer);
        
        return `audio/${fileName}`;
    } catch (e) {
        console.error("[ TTS Error ]", e.message);
        return null;
    }
}
