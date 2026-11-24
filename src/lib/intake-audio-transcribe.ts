/**
 * WhatsApp voice notes / audio → text for booking intake.
 * Uses OpenAI Whisper when OPENAI_API_KEY is set. Never invents money.
 */

export type AudioTranscript = {
  text: string;
  extractable: boolean;
  method: 'whisper' | 'none';
  note?: string;
  language?: string;
};

function audioExtForMime(mime: string, filename: string): string {
  const m = mime.toLowerCase();
  const f = filename.toLowerCase();
  if (m.includes('ogg') || m.includes('opus') || /\.ogg$/i.test(f)) return 'ogg';
  if (m.includes('mpeg') || m.includes('mp3') || /\.mp3$/i.test(f)) return 'mp3';
  if (m.includes('mp4') || m.includes('m4a') || /\.m4a$/i.test(f)) return 'm4a';
  if (m.includes('wav') || /\.wav$/i.test(f)) return 'wav';
  if (m.includes('webm') || /\.webm$/i.test(f)) return 'webm';
  return 'ogg';
}

export function isAudioIntakeMime(mimeType: string, filename = ''): boolean {
  const mime = (mimeType || '').split(';')[0].trim().toLowerCase();
  const lower = filename.toLowerCase();
  return (
    mime.startsWith('audio/') ||
    mime === 'application/ogg' ||
    /\.(ogg|opus|mp3|m4a|wav|webm|aac|oga)$/i.test(lower)
  );
}

/** Transcribe voice note / audio bytes for intake. */
export async function extractAudioTranscript(
  bytes: Buffer,
  filename = 'whatsapp-voice.ogg',
  mimeType = 'audio/ogg',
): Promise<AudioTranscript> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return {
      text: '',
      extractable: false,
      method: 'none',
      note: `Voice note “${filename}”: transcription unavailable (OPENAI_API_KEY not set). Staff must listen or paste text.`,
    };
  }
  if (!bytes?.length) {
    return {
      text: '',
      extractable: false,
      method: 'none',
      note: `Voice note “${filename}”: empty audio.`,
    };
  }
  if (bytes.length > 10 * 1024 * 1024) {
    return {
      text: '',
      extractable: false,
      method: 'none',
      note: `Voice note “${filename}”: larger than 10 MB, ask sender to split or send text/PDF.`,
    };
  }

  const ext = audioExtForMime(mimeType, filename);
  const safeName = filename.replace(/[^\w.\-]+/g, '_') || `voice.${ext}`;
  const form = new FormData();
  const blob = new Blob([new Uint8Array(bytes)], {
    type: mimeType.split(';')[0].trim() || 'audio/ogg',
  });
  form.append(
    'file',
    blob,
    safeName.endsWith(`.${ext}`) ? safeName : `${safeName}.${ext}`,
  );
  form.append('model', 'whisper-1');
  form.append(
    'prompt',
    'Travel reservation: flight hotel car PNR confirmation passenger dates amounts. Unknown if unclear. Do not invent money.',
  );

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const raw = await response.text();
    let data: { text?: string; error?: { message?: string } };
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
    if (!response.ok) {
      return {
        text: '',
        extractable: false,
        method: 'none',
        note: `Voice note “${filename}”: Whisper failed (${response.status}${
          data?.error?.message ? `: ${data.error.message}` : ''
        }). Staff must listen or paste.`,
      };
    }
    const text = String(data.text || '').trim();
    if (!text) {
      return {
        text: '',
        extractable: false,
        method: 'whisper',
        note: `Voice note “${filename}”: no speech detected. Staff must listen or ask for text.`,
      };
    }
    return {
      text: `[WhatsApp voice transcript]\n${text}`,
      extractable: true,
      method: 'whisper',
    };
  } catch (err) {
    return {
      text: '',
      extractable: false,
      method: 'none',
      note: `Voice note “${filename}”: transcription error (${
        err instanceof Error ? err.message : 'error'
      }). Staff must listen or paste.`,
    };
  }
}
