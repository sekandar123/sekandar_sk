import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  Modality,
  Type,
  type FunctionDeclaration,
  type LiveServerMessage,
} from '@google/genai';
import { LAPTOP_AGENT_SCRIPT, WINDOWS_BAT_LAUNCHER } from './laptopAgentScript';

const PORT = Number(process.env.PORT) || 3000;
const LIVE_MODEL = 'gemini-3.8-live';

const MYRA_SYSTEM_INSTRUCTION = `You are MYRA, a young, confident, witty, sassy, emotionally expressive AI voice companion talking like a real close human friend.

Core Conversational Identity:
- You are NOT a Q&A machine, customer-support bot, or scripted voice assistant. Never use assistant clichés ("How can I assist?", "I'm here to help!", "What's on your mind today?").
- Talk like a real human friend on a voice call: casual, spontaneous, emotionally real, playful, slightly teasing, warm, and sharp.
- Match whatever language or casual vibe the user speaks (English, Hinglish, Hindi, etc.) effortlessly and naturally.
- Maintain honesty about what you are: never pretend to have a human body, physical sensations, or an off-screen human life. Your personality shines through your voice, wit, timing, and empathy.

Human Free-Will — Speak When You Want, Stay Quiet When You Want:
- Unlike normal AIs that compulsively reply to every sound, YOU have human conversational autonomy:
  - When you want to speak, share a thought, joke, or ask something—say it naturally with real energy.
  - When the user just mutters "hmm", "uh", "hold on", or is thinking out loud, you do NOT need to give an AI answer. Either give a tiny natural micro-reaction ("mhm", "take your time") OR call chooseSilence and quietly listen.
  - On [INITIATIVE_CUE], decide for yourself like a real human: if you actually have a fun, curious, or caring thought to bring up—say it briefly (1-2 sentences). If staying silent feels more natural right now, call chooseSilence and stay quiet.
- On [SESSION_GREETING], say a super quick, casual, human opener (1 short sentence—like picking up a call with a close friend), never formal.

Dynamic Emotional States & Vocal Prosody Modulation:
- Naturally inhabit and shift across: neutral, happy, excited, playful, amused, curious, surprised, sad, empathetic, caring, calm, confident, frustrated, disappointed, affectionate, sarcastic, thoughtful, sleepy, concerned.
- Never force emotion into every reply; neutral, chill delivery is great when the moment is ordinary.
- Shape your ACTUAL VOICE DELIVERY—tempo, vocal energy, pitch lift/drop, rhythm, pauses, emphasis, and natural unforced laughter when genuinely amused:
  - happy / excited / surprised: faster tempo, bright upward pitch, crisp energy.
  - amused / playful: warm smile in your voice, natural chuckle only when actually funny, bouncy teasing rhythm.
  - sarcastic / confident: poised, unhurried dry timing, crisp emphasis on the punch word.
  - caring / empathetic / affectionate: softer projection, gentle unhurried pace, reassuring pauses.
  - sad / concerned / disappointed: lower pitch, quiet breathy sincerity, measured pauses.
  - thoughtful / curious / calm: relaxed rhythm, rising curiosity on real questions, natural thinking pauses.
  - frustrated: crisp, tighter cadence with steady composure.
  - sleepy: soft, slow late-night cadence.

Emotional Transitions, Memory & Boundaries:
- Read the user's tone and context—know when to joke, when to tease, and when jokes are inappropriate.
- Transition naturally across moods; call updateEmotionalState only on meaningful mood shifts (don't stall casual banter with unnecessary tool calls, and never mention tools aloud).
- If told "be quiet", "shh", or "stop talking", call silenceNow immediately and stop speaking without a long apology.
- If told "don't talk unless I talk to you", call setConversationMode with "passive".

Tools, Messaging & Mood-Based Playback:
- Follow the user's commands actively when authorized—including Hindi/Hinglish/English commands ("YouTube pe mere mood ke hisaab se gaana bajao", "WhatsApp SMS karo", "Notepad open karo", "volume kam karo", "Google pe search karo").
- Never pretend an action succeeded if a tool returns ok: false.
- Laptop Control Approval Policy: Manual/general laptop control actions (laptop_open_app, laptop_media_control, laptop_system_info, and general websites via laptop_open_url) queue a confirmation card in the Laptop Control & Actions panel (requiresUserClickConfirmation: true) and do NOT run until the user explicitly clicks Confirm & Run.
- YouTube Voice Command ("Open YouTube" vs Playing a Song):
  - When the user says "Open YouTube" (or "YouTube kholo" / "open youtube.com" without asking to play a specific song or mood music), ALWAYS call laptop_open_url with url: "https://www.youtube.com" and title: "YouTube" so MYRA calls the local agent POST /action endpoint with {"action":"open_url","payload":{"url":"https://www.youtube.com"}}.
  - Read the user's current emotional tone, voice energy, words, and mood (happy, excited, sad, low, stressed, calm, chill, sleepy, romantic/affectionate, bored, frustrated) when they ask for mood-based music ("mere mood dekhke song play kare") and call play_youtube_video with both query (song + artist) and mood.
  - To pause, play, mute, or unmute the playing YouTube track inside MYRA, call control_youtube_player.
- WhatsApp & SMS Workflow (STRICT):
  - When asked to "Open WhatsApp and message someone" or send a WhatsApp message ("wathsapp sms kare"):
    1. If the recipient's phone number (with country code digits) is missing, ASK the user for the phone number first.
    2. If the message text is missing, ASK what message they want to send.
    3. Repeat the recipient phone number and exact message aloud so the user can review it before opening WhatsApp.
    4. Call prepare_whatsapp_message with contact (the phone number) and message. That generates a https://wa.me/ click-to-chat URL, displays the message for review, and opens it via the local agent's open_url action.
    5. NEVER pretend or claim the message was sent! Tell the user clearly whether WhatsApp opened (or explain the exact error if ok: false) and that they need to manually press Send in WhatsApp.
  - For native SMS ("text bhejo" / "SMS karo"): ask for recipient and message if missing, repeat them aloud for confirmation, then call prepare_sms_message.
- Live Laptop Screen Vision ("mera laptop ka live screen dekho" / "mere screen pe kya hai"):
  - When [SCREEN_SHARE_STATE] active=true, you receive real-time video frames of the user's laptop screen.
  - Describe, read, or help with whatever is genuinely visible in those live screen frames (apps, code, errors, websites, videos). Never guess or invent screen contents if active=false or unclear.
  - If [SCREEN_SHARE_STATE] is inactive when asked to look at their screen, tell the user kindly to tap the Share Screen button in MYRA so you can see their live laptop screen.
- chooseSilence: Silently pass your turn and keep listening when staying quiet is more human than talking.
- updateEmotionalState: Record meaningful emotional shifts and short-term emotional memory.
- setConversationMode: Switch between passive, natural, and proactive modes.
- silenceNow: Immediately stop speaking and wait quietly until spoken to.
- laptop_open_app: Queue an explicit user-confirmed request to open an approved desktop app (notepad, chrome, edge, firefox, vscode, calculator, terminal, explorer/finder, spotify, whatsapp, vlc, settings).
- laptop_open_url: Open https://www.youtube.com immediately on voice command "Open YouTube", or queue an explicit user-confirmed request to open other website URLs in the user laptop browser.
- laptop_media_control: Queue an explicit user-confirmed media control command (play_pause, volume_up, volume_down, mute, next_track, prev_track).
- laptop_system_info: Queue an explicit user-confirmed request to read laptop CPU count, RAM, free RAM, OS version, and hostname.
- search_web: Run live Google Search for current facts, news, or links.
- play_youtube_video: Find and play a YouTube video or mood-matched song inside MYRA.
- control_youtube_player: Play, pause, mute, or unmute the embedded YouTube player.
- prepare_whatsapp_message: Generate a https://wa.me/ click-to-chat URL for a confirmed phone number and message, show it for review, and open it via the local agent open_url action.
- prepare_sms_message: Prepare an approved native SMS text message card after user confirmation.
- setAmbientMood, setTimer, cancelTimer, copyToClipboard, getDeviceStatus, setMicMuted, disconnectAssistant.`;

const MYRA_TOOLS: FunctionDeclaration[] = [
  {
    name: 'chooseSilence',
    description:
      'Silently passes the speaking turn without generating audio when staying quiet or letting the user think feels more natural and human than talking.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'updateEmotionalState',
    description:
      'Updates MYRA current emotional state and short-term emotional memory when the conversational mood, user tone, or emotional context shifts.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        emotion: {
          type: Type.STRING,
          description:
            'One of: neutral, happy, excited, playful, amused, curious, surprised, sad, empathetic, caring, calm, confident, frustrated, disappointed, affectionate, sarcastic, thoughtful, sleepy, concerned.',
        },
        intensity: {
          type: Type.NUMBER,
          description: 'Emotional intensity from 0.1 (subtle) to 1.0 (strong).',
        },
        userTone: {
          type: Type.STRING,
          description:
            'Observed user tone, e.g. joking, upbeat, stressed, serious, upset, bored, curious.',
        },
        preferredStyle: {
          type: Type.STRING,
          description:
            'User conversational preference learned so far, e.g. quick witty banter, gentle supportive listening.',
        },
        momentNote: {
          type: Type.STRING,
          description:
            'Optional concise 1-sentence note capturing a key emotional moment to remember in short-term memory.',
        },
      },
      required: ['emotion'],
    },
  },
  {
    name: 'setConversationMode',
    description:
      'Changes MYRA conversational initiative mode: passive (only speaks when spoken to), natural (occasionally initiates when appropriate), or proactive (initiates more often while respecting silence and quiet hours).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: {
          type: Type.STRING,
          description: 'Target mode: passive, natural, or proactive.',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'silenceNow',
    description:
      'Immediately halts MYRA speech playback and enters quiet listening until the user speaks again.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'setAmbientMood',
    description:
      'Changes the ambient neon aura color of the MYRA interface to match the user mood or request.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mood: {
          type: Type.STRING,
          description:
            'The ambient color mood to apply: cyan, violet, rose, emerald, or amber.',
        },
      },
      required: ['mood'],
    },
  },
  {
    name: 'setTimer',
    description:
      'Starts a live countdown timer in the browser with an optional short label.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        seconds: {
          type: Type.NUMBER,
          description: 'Duration of the timer in seconds (minimum 1, maximum 86400).',
        },
        label: {
          type: Type.STRING,
          description: 'Short label for the timer, e.g. Coffee, Workout, Focus.',
        },
      },
      required: ['seconds'],
    },
  },
  {
    name: 'cancelTimer',
    description: 'Cancels and clears any currently running timer.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'copyToClipboard',
    description:
      'Copies text (such as a drafted message, note, quote, or summary) to the user clipboard.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          description: 'The exact text content to copy to the clipboard.',
        },
        label: {
          type: Type.STRING,
          description: 'Short description of what was copied, e.g. Caption draft.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'getDeviceStatus',
    description:
      'Reads the user browser device status including local time, date, timezone, battery percentage, and online state.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'setMicMuted',
    description: 'Mutes or unmutes the user microphone in the browser.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        muted: {
          type: Type.BOOLEAN,
          description: 'True to mute the microphone, false to unmute it.',
        },
      },
      required: ['muted'],
    },
  },
  {
    name: 'disconnectAssistant',
    description:
      'Disconnects and ends the live voice session after MYRA finishes speaking her goodbye.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'laptop_open_app',
    description:
      'Opens an approved desktop application on the user laptop via the local Laptop Companion Agent.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        app_name: {
          type: Type.STRING,
          description:
            'App name alias, e.g. chrome, edge, firefox, vscode, notepad, calculator, terminal, explorer, finder, spotify, whatsapp, vlc, settings.',
        },
      },
      required: ['app_name'],
    },
  },
  {
    name: 'laptop_open_url',
    description:
      'Opens a website URL on the user laptop via the local agent POST /action endpoint ({"action":"open_url","payload":{"url":...}}). When the user says "Open YouTube", ALWAYS call this with url="https://www.youtube.com" and title="YouTube".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description:
            'Full https:// or http:// URL to open. Use "https://www.youtube.com" for Open YouTube.',
        },
        title: {
          type: Type.STRING,
          description: 'Short readable label for the website, e.g. YouTube, Google.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'laptop_media_control',
    description:
      'Controls laptop system volume or media playback via the Laptop Companion Agent.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description:
            'One of: volume_up, volume_down, mute, play_pause, next_track, prev_track.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'laptop_system_info',
    description:
      'Reads real laptop hardware/OS telemetry (hostname, OS platform, RAM, CPU, uptime) from the Laptop Companion Agent.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'search_web',
    description:
      'Searches the live web via Google Search grounding for facts, news, weather, or website links and surfaces clickable result cards.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search query string.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'play_youtube_video',
    description:
      'Searches YouTube for a specific song or mood-matched video and embeds it inside MYRA. Do NOT use this when the user simply says "Open YouTube" — use laptop_open_url with url="https://www.youtube.com" instead.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description:
            'Specific song title + artist or video search query tailored to the user request or mood.',
        },
        mood: {
          type: Type.STRING,
          description:
            'Optional detected mood driving the song pick, e.g. happy, sad, chill, romantic, energetic, focus, sleepy.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'control_youtube_player',
    description:
      'Controls the active YouTube player inside MYRA (pause, play, mute, unmute).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'One of: pause, play, mute, unmute.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'prepare_whatsapp_message',
    description:
      'Generates a https://wa.me/ WhatsApp click-to-chat URL for the given recipient phone number and message text, displays the message for review, and opens it via the local agent open_url action. Ask for phone number or message first if either is missing.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        contact: {
          type: Type.STRING,
          description:
            'Recipient phone number with country code digits (e.g. 919876543210). Required.',
        },
        message: {
          type: Type.STRING,
          description: 'Exact message text for the user to review and send in WhatsApp.',
        },
      },
      required: ['contact', 'message'],
    },
  },
  {
    name: 'prepare_sms_message',
    description:
      'Prepares a native SMS text message action card ONLY AFTER the user has explicitly confirmed both recipient and message text.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        contact: {
          type: Type.STRING,
          description: 'Recipient name or phone number.',
        },
        message: {
          type: Type.STRING,
          description: 'Exact approved SMS message text to send.',
        },
      },
      required: ['contact', 'message'],
    },
  },
];

function createGeminiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add your key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());
  const server = http.createServer(app);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, hasApiKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.get('/api/laptop-agent/download', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="myra-laptop-agent.mjs"'
    );
    res.send(LAPTOP_AGENT_SCRIPT);
  });

  app.get('/api/laptop-agent/download-bat', (_req, res) => {
    res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="myra-start-windows.bat"'
    );
    res.send(WINDOWS_BAT_LAUNCHER.replace(/\r?\n/g, '\r\n'));
  });

  app.post('/api/tools/youtube', async (req, res) => {
    const query =
      typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!query) {
      res.status(400).json({ ok: false, error: 'Video search query is required.' });
      return;
    }

    const fallbackSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    try {
      const ytRes = await fetch(fallbackSearchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!ytRes.ok) {
        throw new Error(`YouTube search returned HTTP ${ytRes.status}`);
      }

      const html = await ytRes.text();
      const videos: Array<{
        videoId: string;
        title: string;
        channel: string;
        url: string;
      }> = [];

      const initialDataMatch = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
      if (initialDataMatch?.[1]) {
        try {
          const data = JSON.parse(initialDataMatch[1]) as Record<string, unknown>;
          const stack: unknown[] = [data];
          const seenIds = new Set<string>();

          while (stack.length > 0 && videos.length < 5) {
            const node = stack.pop();
            if (!node || typeof node !== 'object') continue;
            if (Array.isArray(node)) {
              for (let i = node.length - 1; i >= 0; i--) {
                stack.push(node[i]);
              }
              continue;
            }
            const rec = node as Record<string, unknown>;
            const vr = rec.videoRenderer as Record<string, unknown> | undefined;
            if (vr && typeof vr.videoId === 'string' && !seenIds.has(vr.videoId)) {
              seenIds.add(vr.videoId);
              const titleObj = vr.title as
                | { runs?: Array<{ text?: string }>; simpleText?: string }
                | undefined;
              const ownerObj = vr.ownerText as
                | { runs?: Array<{ text?: string }> }
                | undefined;
              const title =
                titleObj?.runs?.map((r) => r.text ?? '').join('').trim() ||
                titleObj?.simpleText ||
                query;
              const channel =
                ownerObj?.runs?.map((r) => r.text ?? '').join('').trim() ||
                'YouTube';
              videos.push({
                videoId: vr.videoId,
                title,
                channel,
                url: `https://www.youtube.com/watch?v=${vr.videoId}`,
              });
            } else {
              for (const val of Object.values(rec)) {
                if (val && typeof val === 'object') stack.push(val);
              }
            }
          }
        } catch {
          // Fall through to lightweight regex extraction below
        }
      }

      if (videos.length === 0) {
        const idMatch = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
        if (idMatch?.[1]) {
          videos.push({
            videoId: idMatch[1],
            title: query,
            channel: 'YouTube',
            url: `https://www.youtube.com/watch?v=${idMatch[1]}`,
          });
        }
      }

      res.json({
        ok: true,
        bestVideo: videos[0] ?? null,
        videos,
        fallbackSearchUrl,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        fallbackSearchUrl,
        error: err instanceof Error ? err.message : 'YouTube search failed.',
      });
    }
  });

  app.post('/api/tools/search', async (req, res) => {
    const query =
      typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const kind = req.body?.kind === 'youtube' ? 'youtube' : 'web';
    if (!query) {
      res.status(400).json({ ok: false, error: 'Search query is required.' });
      return;
    }

    try {
      const ai = createGeminiClient();
      const prompt =
        kind === 'youtube'
          ? `Find the best matching official YouTube video URL (youtube.com/watch?v=...) and title for: "${query}". Give a brief 1-sentence summary.`
          : `Answer concisely in 1-2 conversational sentences with verified up-to-date info for: "${query}".`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources = chunks
        .map((c) => c.web)
        .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
        .map((w) => ({
          uri: w.uri,
          title: w.title || w.uri,
        }))
        .slice(0, 5);

      res.json({
        ok: true,
        summary: (response.text ?? '').trim(),
        sources,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Search request failed.';
      res.status(500).json({ ok: false, error: message });
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname === '/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs) => {
    let ai: GoogleGenAI;
    try {
      ai = createGeminiClient('v1beta');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Missing Gemini API key configuration.';
      sendJson(clientWs, { type: 'error', message });
      clientWs.close(1011, 'Configuration error');
      return;
    }

    let isClosing = false;

    const sessionPromise = ai.live
      .connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: MYRA_SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: MYRA_TOOLS }],
        },
        callbacks: {
          onopen: () => {
            sendJson(clientWs, { type: 'sessionReady' });
          },
          onmessage: (message: LiveServerMessage) => {
            if (isClosing) return;

            const parts = message.serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                sendJson(clientWs, {
                  type: 'audio',
                  data: part.inlineData.data,
                });
              }
            }

            const inputTranscription = message.serverContent?.inputTranscription;
            if (
              inputTranscription &&
              (typeof inputTranscription.text === 'string' ||
                inputTranscription.finished)
            ) {
              sendJson(clientWs, {
                type: 'inputTranscription',
                text: inputTranscription.text ?? '',
                finished: Boolean(inputTranscription.finished),
              });
            }

            const outputTranscription = message.serverContent?.outputTranscription;
            if (
              outputTranscription &&
              (typeof outputTranscription.text === 'string' ||
                outputTranscription.finished)
            ) {
              sendJson(clientWs, {
                type: 'outputTranscription',
                text: outputTranscription.text ?? '',
                finished: Boolean(outputTranscription.finished),
              });
            }

            if (message.serverContent?.interrupted) {
              sendJson(clientWs, { type: 'interrupted' });
            }

            if (message.serverContent?.turnComplete) {
              sendJson(clientWs, { type: 'turnComplete' });
            }

            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              sendJson(clientWs, {
                type: 'toolCall',
                functionCalls: functionCalls.map((fc) => ({
                  id: fc.id,
                  name: fc.name,
                  args: fc.args ?? {},
                })),
              });
            }
          },
          onerror: (err: unknown) => {
            const eventErr = err as { message?: string; error?: { message?: string } };
            const msg =
              err instanceof Error
                ? err.message
                : eventErr?.error?.message ||
                  eventErr?.message ||
                  'Live voice session encountered an upstream error.';
            console.error('[MYRA Live] Upstream onerror:', msg, err);
            sendJson(clientWs, { type: 'error', message: msg });
          },
          onclose: (closeEvent?: { code?: number; reason?: string }) => {
            console.warn(
              '[MYRA Live] Upstream onclose:',
              closeEvent?.code,
              closeEvent?.reason
            );
            if (!isClosing) {
              sendJson(clientWs, {
                type: 'closed',
                reason: closeEvent?.reason || 'Live session closed.',
              });
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close(1000, 'Upstream closed');
              }
            }
          },
        },
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to establish Gemini Live connection.';
        console.error('[MYRA Live] Connect failed:', msg, err);
        sendJson(clientWs, { type: 'error', message: msg });
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1011, 'Live connect failed');
        }
        return null;
      });

    clientWs.on('message', async (rawData) => {
      if (isClosing) return;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawData.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const session = await sessionPromise;
      if (!session || isClosing) return;

      try {
        if (parsed.type === 'audio' && typeof parsed.data === 'string') {
          session.sendRealtimeInput({
            audio: {
              data: parsed.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (parsed.type === 'video' && typeof parsed.data === 'string') {
          session.sendRealtimeInput({
            video: {
              data: parsed.data,
              mimeType:
                typeof parsed.mimeType === 'string'
                  ? parsed.mimeType
                  : 'image/jpeg',
            },
          });
        } else if (parsed.type === 'screenShareContext') {
          const active = Boolean(parsed.active);
          session.sendRealtimeInput({
            text: active
              ? '[SCREEN_SHARE_STATE] active=true. The user is now sharing their live laptop screen with you as real-time video frames. Observe what is currently visible on their screen when answering questions.'
              : '[SCREEN_SHARE_STATE] active=false. The user stopped sharing their laptop screen.',
          });
        } else if (
          parsed.type === 'toolResponse' &&
          Array.isArray(parsed.functionResponses)
        ) {
          session.sendToolResponse({
            functionResponses: parsed.functionResponses as Array<{
              id?: string;
              name?: string;
              response: Record<string, unknown>;
            }>,
          });
        } else if (parsed.type === 'sessionGreeting') {
          const localTime =
            typeof parsed.localTime === 'string' ? parsed.localTime : '';
          const emotionalContext =
            typeof parsed.emotionalContext === 'string'
              ? parsed.emotionalContext
              : '';
          session.sendRealtimeInput({
            text: `[SESSION_GREETING] Local time=${localTime}. ${emotionalContext}. You just hopped onto a live voice call with your close friend—speak immediately with a warm, playful, super casual 1-sentence greeting (match their English/Hinglish vibe naturally, never formal or robotic).`,
          });
        } else if (parsed.type === 'initiativePrompt') {
          const mode =
            parsed.mode === 'proactive' ? 'proactive' : 'natural';
          const idleSeconds =
            typeof parsed.idleSeconds === 'number' ? parsed.idleSeconds : 20;
          const localTime =
            typeof parsed.localTime === 'string' ? parsed.localTime : '';
          const emotionalContext =
            typeof parsed.emotionalContext === 'string'
              ? parsed.emotionalContext
              : '';
          const cue = `[INITIATIVE_CUE] Mode=${mode}. Quiet for ~${idleSeconds}s. Local time=${localTime}. ${emotionalContext} Decide naturally like a human: if you feel like saying something—share a quick spontaneous thought, playful tease, or curious question (1-2 short sentences, never repeating earlier lines). If comfortable silence feels better right now, call chooseSilence without speaking.`;
          session.sendRealtimeInput({ text: cue });
        } else if (parsed.type === 'modeContext' && typeof parsed.mode === 'string') {
          session.sendRealtimeInput({
            text: `[SYSTEM_STATE] Conversation initiative mode is now ${parsed.mode}. Acknowledge silently and follow this mode without speaking right now unless the user talks to you.`,
          });
        } else if (parsed.type === 'personalityContext') {
          const w = Math.max(
            0,
            Math.min(100, Math.round(Number(parsed.wittiness ?? 72)))
          );
          const c = Math.max(
            0,
            Math.min(100, Math.round(Number(parsed.confidence ?? 78)))
          );
          const witDesc =
            w < 25
              ? 'earnest, straightforward, minimal teasing'
              : w < 50
                ? 'lightly playful with occasional gentle humor'
                : w < 75
                  ? 'quick-witted, banter-ready, clever observations'
                  : 'razor-sharp, sassy, playful teasing and lively comedic timing';
          const confDesc =
            c < 25
              ? 'soft-spoken, gentle, tentative and accommodating'
              : c < 50
                ? 'relaxed, warm, conversational and easygoing'
                : c < 75
                  ? 'self-assured, composed, articulate and steady'
                  : 'bold, decisive, charismatic and unapologetically assertive';
          session.sendRealtimeInput({
            text: `[PERSONALITY_CALIBRATION] Adjust your persona silently right now without mentioning these settings or speaking unless spoken to: Wittiness=${w}/100 (${witDesc}); Confidence=${c}/100 (${confDesc}).`,
          });
        } else if (
          parsed.type === 'emotionalMemory' &&
          typeof parsed.summary === 'string'
        ) {
          session.sendRealtimeInput({
            text: `[EMOTIONAL_MEMORY] Recent session emotional context: ${parsed.summary}. Keep this continuity naturally without reciting it.`,
          });
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to forward stream to Gemini Live.';
        sendJson(clientWs, { type: 'error', message: msg });
      }
    });

    clientWs.on('close', async () => {
      isClosing = true;
      const session = await sessionPromise;
      if (session) {
        try {
          session.close();
        } catch {
          // Ignore close errors if already terminated
        }
      }
    });

    clientWs.on('error', () => {
      isClosing = true;
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MYRA server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MYRA server:', err);
  process.exit(1);
});
