import { AudioStreamer } from './AudioStreamer';
import { EmotionalEngine, type EmotionVisualProfile } from './EmotionalEngine';
import { LaptopBridge } from './LaptopBridge';
import { LiveSession } from './LiveSession';
import type {
  ActionCard,
  ActionFeedback,
  ActiveTimer,
  AmbientMood,
  AssistantSnapshot,
  AssistantState,
  ConversationLogEntry,
  ConversationMode,
  EmotionState,
  LaptopActionType,
  LaptopSystemInfo,
  LiveFunctionCall,
  LiveFunctionResponse,
  MicPermissionState,
  PersonalitySettings,
} from '../types/assistant';

type SnapshotListener = (snapshot: AssistantSnapshot) => void;

const VALID_MOODS: AmbientMood[] = ['cyan', 'violet', 'rose', 'emerald', 'amber'];
const VALID_MODES: ConversationMode[] = ['passive', 'natural', 'proactive'];
const STORAGE_MODE_KEY = 'myra_conversation_mode';
const STORAGE_QUIET_HOURS_KEY = 'myra_respect_quiet_hours';
const STORAGE_HISTORY_KEY = 'myra_conversation_history_v1';
const STORAGE_PERSONALITY_KEY = 'myra_personality_settings_v1';
const MAX_HISTORY_ENTRIES = 200;
const DEFAULT_PERSONALITY_SETTINGS: PersonalitySettings = {
  wittiness: 72,
  confidence: 78,
};

function clampPersonalityLevel(value: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readStoredPersonalitySettings(): PersonalitySettings {
  try {
    const raw = localStorage.getItem(STORAGE_PERSONALITY_KEY);
    if (!raw) return { ...DEFAULT_PERSONALITY_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PersonalitySettings> | null;
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_PERSONALITY_SETTINGS };
    }
    return {
      wittiness: clampPersonalityLevel(
        parsed.wittiness as number,
        DEFAULT_PERSONALITY_SETTINGS.wittiness
      ),
      confidence: clampPersonalityLevel(
        parsed.confidence as number,
        DEFAULT_PERSONALITY_SETTINGS.confidence
      ),
    };
  } catch {
    return { ...DEFAULT_PERSONALITY_SETTINGS };
  }
}

function persistPersonalitySettings(settings: PersonalitySettings): void {
  try {
    localStorage.setItem(STORAGE_PERSONALITY_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function readStoredConversationHistory(): ConversationLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is ConversationLogEntry =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          (item.role === 'user' || item.role === 'myra') &&
          typeof item.text === 'string' &&
          item.text.trim().length > 0 &&
          typeof item.timestamp === 'number'
      )
      .slice(-MAX_HISTORY_ENTRIES)
      .map((item) => ({
        id: item.id,
        role: item.role,
        text: item.text,
        timestamp: item.timestamp,
        ...(typeof item.emotion === 'string' ? { emotion: item.emotion } : {}),
      }));
  } catch {
    return [];
  }
}

function persistConversationHistory(entries: ConversationLogEntry[]): void {
  try {
    const cleaned = entries
      .filter((entry) => entry.text.trim().length > 0)
      .slice(-MAX_HISTORY_ENTRIES)
      .map(({ isStreaming: _streaming, ...rest }) => rest);
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(cleaned));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function isCurrentlyQuietHours(now = new Date()): boolean {
  const hour = now.getHours();
  return hour >= 23 || hour < 7;
}

function readStoredMode(): ConversationMode {
  try {
    const val = localStorage.getItem(STORAGE_MODE_KEY) as ConversationMode | null;
    if (val && VALID_MODES.includes(val)) return val;
  } catch {
    // Ignore storage errors
  }
  return 'natural';
}

function pickOrganicDelayMs(mode: ConversationMode): number {
  if (mode === 'proactive') {
    return 8000 + Math.floor(Math.random() * 9000);
  }
  return 14000 + Math.floor(Math.random() * 14000);
}

function readStoredQuietHoursPreference(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_QUIET_HOURS_KEY);
    if (val === 'false') return false;
  } catch {
    // Ignore storage errors
  }
  return true;
}

export class MyraAssistant {
  private audioStreamer: AudioStreamer;
  private emotionalEngine: EmotionalEngine;
  private laptopBridge: LaptopBridge;
  private liveSession: LiveSession;
  private listeners = new Set<SnapshotListener>();

  private timerIntervalId: number | null = null;
  private initiativeIntervalId: number | null = null;
  private greetingTimeoutId: number | null = null;
  private actionFeedbackTimeoutId: number | null = null;
  private personalitySyncTimeoutId: number | null = null;
  private pendingDisconnectAfterSpeech = false;
  private pendingDisconnectFallbackId: number | null = null;

  private lastActivityAt = Date.now();
  private nextInitiativeDelayMs = pickOrganicDelayMs('natural');
  private consecutiveInitiatives = 0;
  private youtubeCommandCounter = 0;
  private activeTranscriptIds: Record<'user' | 'myra', string | null> = {
    user: null,
    myra: null,
  };
  private screenStream: MediaStream | null = null;
  private screenVideoEl: HTMLVideoElement | null = null;
  private screenCanvas: HTMLCanvasElement | null = null;
  private screenFrameIntervalId: number | null = null;

  private snapshot: AssistantSnapshot;

  private handleVisibilityChange = () => {
    this.lastActivityAt = Date.now();
    this.updateSnapshot({ isQuietHoursNow: isCurrentlyQuietHours() });
  };

  constructor() {
    this.audioStreamer = new AudioStreamer();
    this.emotionalEngine = new EmotionalEngine();
    this.laptopBridge = new LaptopBridge();
    this.snapshot = {
      state: 'idle',
      connectionStatus: 'disconnected',
      micPermission: 'prompt',
      isMuted: false,
      isAudioStreaming: false,
      ambientMood: 'cyan',
      personalitySettings: readStoredPersonalitySettings(),
      conversationMode: readStoredMode(),
      silenceRequested: false,
      respectQuietHours: readStoredQuietHoursPreference(),
      isQuietHoursNow: isCurrentlyQuietHours(),
      emotionalState: this.emotionalEngine.getSnapshot(),
      laptopBridgeStatus: 'disconnected',
      laptopInfo: null,
      laptopBridgeError: null,
      laptopSystemInfo: null,
      laptopActionBusy: false,
      laptopActionFeedback: null,
      screenShareStatus: 'inactive',
      screenShareError: null,
      screenShareResolution: null,
      actionCards: [],
      conversationHistory: readStoredConversationHistory(),
      youtubeCommand: null,
      activeTimer: null,
      lastAction: null,
      error: null,
    };

    void this.checkLaptopBridge();

    this.liveSession = new LiveSession({
      onStatusChange: (connectionStatus) => {
        this.updateSnapshot({ connectionStatus });
      },
      onSessionReady: () => {
        this.audioStreamer.playChime('connect');
        this.triggerHaptic(14);
        this.lastActivityAt = Date.now();
        this.consecutiveInitiatives = 0;
        this.nextInitiativeDelayMs = pickOrganicDelayMs(
          this.snapshot.conversationMode
        );
        this.startInitiativeMonitor();
        this.updateSnapshot({
          state: 'listening',
          connectionStatus: 'connected',
          silenceRequested: false,
          isQuietHoursNow: isCurrentlyQuietHours(),
          error: null,
        });
        if (this.snapshot.conversationMode !== 'passive') {
          this.liveSession.sendModeContext(this.snapshot.conversationMode);
        }
        this.liveSession.sendPersonalitySettings(
          this.snapshot.personalitySettings.wittiness,
          this.snapshot.personalitySettings.confidence
        );
        if (this.emotionalEngine.hasSessionMemory()) {
          this.liveSession.sendEmotionalMemory(
            this.emotionalEngine.buildMemorySummary()
          );
        }
        if (this.screenStream && this.snapshot.screenShareStatus === 'active') {
          this.liveSession.sendScreenShareContext(true);
          this.captureAndSendScreenFrame();
        }
        this.scheduleSpontaneousGreeting();
      },
      onAudio: (base64Pcm) => {
        this.audioStreamer.enqueueOutputAudio(base64Pcm);
      },
      onInputTranscription: (text, finished) => {
        this.handleTranscription('user', text, finished);
      },
      onOutputTranscription: (text, finished) => {
        this.handleTranscription('myra', text, finished);
      },
      onInterrupted: () => {
        this.audioStreamer.interruptPlayback();
        this.finalizeTranscriptRole('myra');
        this.lastActivityAt = Date.now();
        if (
          this.snapshot.state === 'speaking' ||
          this.snapshot.state === 'listening'
        ) {
          this.updateSnapshot({ state: 'listening' });
        }
      },
      onTurnComplete: () => {
        this.finalizeTranscriptRole('myra');
        this.lastActivityAt = Date.now();
      },
      onToolCall: (calls) => {
        void this.handleToolCalls(calls);
      },
      onError: (message) => {
        this.updateSnapshot({ error: message });
        void this.cleanupOnFailure(message);
      },
      onClose: (reason) => {
        if (
          this.snapshot.state !== 'idle' &&
          this.snapshot.state !== 'disconnecting'
        ) {
          void this.cleanupOnFailure(
            reason ?? 'Connection closed unexpectedly.'
          );
        }
      },
    });

    this.audioStreamer.setCallbacks(
      (base64Pcm) => {
        this.liveSession.sendAudioChunk(base64Pcm);
      },
      (isPlaying) => {
        this.lastActivityAt = Date.now();
        if (
          this.snapshot.state === 'disconnecting' ||
          this.snapshot.state === 'idle'
        ) {
          return;
        }
        if (isPlaying) {
          this.updateSnapshot({ state: 'speaking' });
        } else {
          this.updateSnapshot({ state: 'listening' });
          if (this.pendingDisconnectAfterSpeech) {
            this.pendingDisconnectAfterSpeech = false;
            window.setTimeout(() => {
              void this.disconnect();
            }, 220);
          }
        }
      }
    );

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    void this.checkInitialMicPermission();
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): AssistantSnapshot {
    return this.snapshot;
  }

  private updateSnapshot(partial: Partial<AssistantSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  private async checkInitialMicPermission(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.updateSnapshot({ micPermission: 'unsupported' });
      return;
    }
    if (!navigator.permissions?.query) return;

    try {
      const result = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      const mapState = (state: PermissionState): MicPermissionState => {
        if (state === 'granted') return 'granted';
        if (state === 'denied') return 'denied';
        return 'prompt';
      };
      this.updateSnapshot({ micPermission: mapState(result.state) });
      result.onchange = () => {
        this.updateSnapshot({ micPermission: mapState(result.state) });
      };
    } catch {
      // Permissions API for microphone is not supported in all browsers
    }
  }

  async toggleConnection(): Promise<void> {
    const current = this.snapshot.state;
    if (current === 'connecting' || current === 'disconnecting') {
      return;
    }
    if (current === 'idle') {
      await this.connect();
    } else {
      await this.disconnect();
    }
  }

  async connect(): Promise<void> {
    if (this.snapshot.state !== 'idle') return;

    this.pendingDisconnectAfterSpeech = false;
    this.updateSnapshot({
      state: 'connecting',
      connectionStatus: 'connecting',
      error: null,
    });

    try {
      await this.audioStreamer.startMicrophone();
      this.updateSnapshot({
        micPermission: 'granted',
        isAudioStreaming: true,
        isMuted: false,
      });

      await this.liveSession.connect();
    } catch (err) {
      const { message, micDenied } = this.formatConnectError(err);
      if (micDenied) {
        this.updateSnapshot({ micPermission: 'denied' });
      }
      await this.cleanupOnFailure(message);
    }
  }

  async disconnect(): Promise<void> {
    if (
      this.snapshot.state === 'idle' ||
      this.snapshot.state === 'disconnecting'
    ) {
      return;
    }

    this.pendingDisconnectAfterSpeech = false;
    if (this.pendingDisconnectFallbackId !== null) {
      window.clearTimeout(this.pendingDisconnectFallbackId);
      this.pendingDisconnectFallbackId = null;
    }

    this.updateSnapshot({
      state: 'disconnecting',
      connectionStatus: 'disconnecting',
    });

    this.audioStreamer.playChime('disconnect');
    this.triggerHaptic(10);

    this.stopInitiativeMonitor();
    this.finalizeTranscriptRole('user');
    this.finalizeTranscriptRole('myra');
    this.liveSession.disconnect();
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    await this.audioStreamer.stop();

    this.updateSnapshot({
      state: 'idle',
      connectionStatus: 'disconnected',
      isAudioStreaming: false,
      isMuted: false,
      silenceRequested: false,
    });
  }

  setMuted(muted: boolean): void {
    this.audioStreamer.setMuted(muted);
    this.lastActivityAt = Date.now();
    this.triggerHaptic(8);
    this.updateSnapshot({ isMuted: muted });
  }

  toggleMute(): void {
    this.setMuted(!this.snapshot.isMuted);
  }

  setAmbientMood(mood: AmbientMood): void {
    this.updateSnapshot({ ambientMood: mood });
  }

  setPersonalitySettings(partial: Partial<PersonalitySettings>): void {
    const next: PersonalitySettings = {
      wittiness:
        partial.wittiness !== undefined
          ? clampPersonalityLevel(
              partial.wittiness,
              this.snapshot.personalitySettings.wittiness
            )
          : this.snapshot.personalitySettings.wittiness,
      confidence:
        partial.confidence !== undefined
          ? clampPersonalityLevel(
              partial.confidence,
              this.snapshot.personalitySettings.confidence
            )
          : this.snapshot.personalitySettings.confidence,
    };

    persistPersonalitySettings(next);
    this.updateSnapshot({ personalitySettings: next });

    if (this.personalitySyncTimeoutId !== null) {
      window.clearTimeout(this.personalitySyncTimeoutId);
    }

    if (this.snapshot.connectionStatus === 'connected') {
      this.personalitySyncTimeoutId = window.setTimeout(() => {
        this.personalitySyncTimeoutId = null;
        if (this.snapshot.connectionStatus === 'connected') {
          this.liveSession.sendPersonalitySettings(
            next.wittiness,
            next.confidence
          );
        }
      }, 220);
    }
  }

  resetPersonalitySettings(): void {
    this.setPersonalitySettings({ ...DEFAULT_PERSONALITY_SETTINGS });
  }

  setConversationMode(mode: ConversationMode, notifySession = true): void {
    try {
      localStorage.setItem(STORAGE_MODE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
    this.lastActivityAt = Date.now();
    this.consecutiveInitiatives = 0;
    this.nextInitiativeDelayMs = pickOrganicDelayMs(mode);
    this.updateSnapshot({
      conversationMode: mode,
      silenceRequested:
        mode === 'passive' ? this.snapshot.silenceRequested : false,
    });
    if (notifySession && this.snapshot.connectionStatus === 'connected') {
      this.liveSession.sendModeContext(mode);
    }
  }

  toggleQuietHoursRespect(): void {
    const next = !this.snapshot.respectQuietHours;
    try {
      localStorage.setItem(STORAGE_QUIET_HOURS_KEY, String(next));
    } catch {
      // Ignore storage errors
    }
    this.lastActivityAt = Date.now();
    this.updateSnapshot({
      respectQuietHours: next,
      isQuietHoursNow: isCurrentlyQuietHours(),
    });
  }

  clearError(): void {
    this.updateSnapshot({ error: null });
  }

  getScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  clearScreenShareError(): void {
    this.updateSnapshot({ screenShareError: null });
  }

  async toggleScreenShare(): Promise<boolean> {
    if (
      this.snapshot.screenShareStatus === 'active' ||
      this.snapshot.screenShareStatus === 'starting'
    ) {
      this.stopScreenShare();
      return false;
    }
    return this.startScreenShare();
  }

  async startScreenShare(): Promise<boolean> {
    if (this.screenStream) {
      return true;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getDisplayMedia !== 'function'
    ) {
      const msg =
        'Screen sharing (getDisplayMedia) is not supported in this browser.';
      this.updateSnapshot({
        screenShareStatus: 'error',
        screenShareError: msg,
        screenShareResolution: null,
      });
      return false;
    }

    this.updateSnapshot({
      screenShareStatus: 'starting',
      screenShareError: null,
    });

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 2, max: 5 },
          width: { max: 1280 },
          height: { max: 720 },
        },
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        stream.getTracks().forEach((t) => t.stop());
        this.updateSnapshot({
          screenShareStatus: 'error',
          screenShareError: 'No screen video track was selected.',
        });
        return false;
      }

      this.screenStream = stream;
      videoTrack.onended = () => {
        this.stopScreenShare();
      };

      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      this.screenVideoEl = video;

      const canvas = document.createElement('canvas');
      this.screenCanvas = canvas;

      video.onloadedmetadata = () => {
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        this.updateSnapshot({
          screenShareResolution: `${vw}x${vh}`,
        });
        void video.play().catch(() => {});
        this.captureAndSendScreenFrame();
      };

      await video.play().catch(() => {});

      if (this.screenFrameIntervalId !== null) {
        window.clearInterval(this.screenFrameIntervalId);
      }
      this.screenFrameIntervalId = window.setInterval(() => {
        this.captureAndSendScreenFrame();
      }, 1000);

      this.updateSnapshot({
        screenShareStatus: 'active',
        screenShareError: null,
      });
      this.pushActionFeedback('Live Screen Active', 'MYRA can see your screen');
      if (this.snapshot.connectionStatus === 'connected') {
        this.liveSession.sendScreenShareContext(true);
      }
      return true;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      const raw = err instanceof Error ? err.message : String(err);
      const isCancelled = name === 'AbortError' || /cancelled|canceled/i.test(raw);
      const inIframe =
        typeof window !== 'undefined' && window.self !== window.top;

      let msg = raw || 'Unable to start screen sharing.';
      if (isCancelled) {
        msg = 'Screen sharing selection was cancelled.';
      } else if (name === 'NotAllowedError' || name === 'SecurityError') {
        msg = inIframe
          ? 'Screen sharing was denied or blocked by iframe display-capture policy — allow screen sharing or open the app in a standalone tab.'
          : 'Screen sharing permission was denied. Allow screen capture when prompted.';
      }

      this.updateSnapshot({
        screenShareStatus: isCancelled ? 'inactive' : 'error',
        screenShareError: isCancelled ? null : msg,
        screenShareResolution: null,
      });
      return false;
    }
  }

  stopScreenShare(): void {
    if (this.screenFrameIntervalId !== null) {
      window.clearInterval(this.screenFrameIntervalId);
      this.screenFrameIntervalId = null;
    }
    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) {
        track.onended = null;
        track.stop();
      }
      this.screenStream = null;
    }
    if (this.screenVideoEl) {
      this.screenVideoEl.srcObject = null;
      this.screenVideoEl = null;
    }
    this.screenCanvas = null;

    const wasActive = this.snapshot.screenShareStatus === 'active';
    this.updateSnapshot({
      screenShareStatus: 'inactive',
      screenShareError: null,
      screenShareResolution: null,
    });
    if (wasActive && this.snapshot.connectionStatus === 'connected') {
      this.liveSession.sendScreenShareContext(false);
    }
  }

  private captureAndSendScreenFrame(): void {
    if (
      !this.screenVideoEl ||
      !this.screenCanvas ||
      this.snapshot.connectionStatus !== 'connected'
    ) {
      return;
    }

    const vw = this.screenVideoEl.videoWidth;
    const vh = this.screenVideoEl.videoHeight;
    if (!vw || !vh) return;

    const maxWidth = 1024;
    const scale = vw > maxWidth ? maxWidth / vw : 1;
    const targetW = Math.max(1, Math.round(vw * scale));
    const targetH = Math.max(1, Math.round(vh * scale));

    if (
      this.screenCanvas.width !== targetW ||
      this.screenCanvas.height !== targetH
    ) {
      this.screenCanvas.width = targetW;
      this.screenCanvas.height = targetH;
    }

    const ctx = this.screenCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(this.screenVideoEl, 0, 0, targetW, targetH);
    const dataUrl = this.screenCanvas.toDataURL('image/jpeg', 0.72);
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return;
    const base64Jpeg = dataUrl.slice(commaIdx + 1);
    if (base64Jpeg) {
      this.liveSession.sendVideoFrame(base64Jpeg, 'image/jpeg');
    }
  }

  cancelTimer(): void {
    if (this.timerIntervalId !== null) {
      window.clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
    this.updateSnapshot({ activeTimer: null });
  }

  async checkLaptopBridge(): Promise<boolean> {
    this.updateSnapshot({
      laptopBridgeStatus: 'checking',
      laptopBridgeError: null,
    });
    const result = await this.laptopBridge.checkHealth();
    this.updateSnapshot({
      laptopBridgeStatus: result.connected ? 'connected' : 'disconnected',
      laptopInfo: result.info,
      laptopBridgeError: result.error,
    });
    return result.connected;
  }

  clearLaptopActionFeedback(): void {
    this.updateSnapshot({ laptopActionFeedback: null });
  }

  async runConfirmedLaptopAction(
    action: LaptopActionType,
    payload: Record<string, unknown> = {},
    cardId?: string
  ): Promise<boolean> {
    this.updateSnapshot({
      laptopActionBusy: true,
      laptopActionFeedback: null,
    });

    try {
      const result = await this.laptopBridge.execute(action, payload);
      let nextSystemInfo = this.snapshot.laptopSystemInfo;

      if (result.ok && result.data) {
        if (action === 'system_info') {
          const d = result.data;
          nextSystemInfo = {
            hostname: String(d.hostname ?? 'Unknown'),
            platform: String(d.platform ?? 'unknown'),
            release: String(d.release ?? ''),
            arch: String(d.arch ?? ''),
            cpuCount: Number(d.cpuCount ?? 0),
            totalRamGb: Number(d.totalRamGb ?? 0),
            freeRamGb: Number(d.freeRamGb ?? 0),
            uptimeMinutes: Number(d.uptimeMinutes ?? 0),
          };
        }

        const successMessage =
          action === 'system_info' && nextSystemInfo
            ? `Fetched system info from ${nextSystemInfo.hostname}`
            : action === 'open_app'
              ? `Opened app "${String(payload.appName ?? '')}" (agent returned ok: true)`
              : action === 'open_url'
                ? `Opened URL "${String(payload.url ?? '')}" (agent returned ok: true)`
                : `Sent media control "${String(payload.action ?? '')}" (agent returned ok: true)`;

        this.audioStreamer.playChime('action');
        this.pushActionFeedback('Laptop Action Confirmed', successMessage);

        this.updateSnapshot({
          laptopBridgeStatus: 'connected',
          laptopInfo: this.laptopBridge.getInfo(),
          laptopBridgeError: null,
          laptopSystemInfo: nextSystemInfo,
          laptopActionFeedback: { ok: true, message: successMessage },
          actionCards: cardId
            ? this.snapshot.actionCards.map((c) =>
                c.id === cardId
                  ? {
                      ...c,
                      subtitle: successMessage,
                      pendingLaptopAction: undefined,
                      actionCompleted: true,
                      actionError: undefined,
                    }
                  : c
              )
            : this.snapshot.actionCards,
        });
        return true;
      }

      const errMsg =
        result.error ?? 'Local agent did not return {"ok": true}.';
      this.updateSnapshot({
        laptopBridgeStatus: result.bridgeConnected ? 'connected' : 'disconnected',
        laptopInfo: this.laptopBridge.getInfo(),
        laptopBridgeError: result.bridgeConnected ? null : errMsg,
        laptopActionFeedback: { ok: false, message: errMsg },
        actionCards: cardId
          ? this.snapshot.actionCards.map((c) =>
              c.id === cardId ? { ...c, actionError: errMsg } : c
            )
          : this.snapshot.actionCards,
      });
      return false;
    } finally {
      this.updateSnapshot({ laptopActionBusy: false });
    }
  }

  async recordManualWhatsAppCard(
    phoneDigits: string,
    message: string,
    waUrl: string,
    openedOk: boolean,
    error?: string
  ): Promise<void> {
    const copied = await this.copyText(message);
    this.pushActionCard({
      kind: 'whatsapp',
      title: `WhatsApp to +${phoneDigits}`,
      subtitle: openedOk
        ? 'Opened in WhatsApp via local agent — review & manually press Send'
        : 'Draft ready for review — retry agent or tap Open WhatsApp below',
      url: waUrl,
      whatsappContact: `+${phoneDigits}`,
      whatsappMessage: message,
      autoCopied: copied,
      actionCompleted: openedOk,
      actionError: openedOk ? undefined : error,
    });
  }

  dismissActionCard(id: string): void {
    this.updateSnapshot({
      actionCards: this.snapshot.actionCards.filter((card) => card.id !== id),
    });
  }

  clearActionCards(): void {
    this.updateSnapshot({ actionCards: [] });
  }

  private pushActionCard(card: Omit<ActionCard, 'id' | 'timestamp'>): void {
    const entry: ActionCard = {
      ...card,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    const next = [entry, ...this.snapshot.actionCards].slice(0, 6);
    this.updateSnapshot({ actionCards: next });
  }

  getVisualizerMetrics(
    inputBins?: Uint8Array<ArrayBuffer>,
    outputBins?: Uint8Array<ArrayBuffer>
  ): {
    state: AssistantState;
    inputEnergy: number;
    outputEnergy: number;
    mood: AmbientMood;
    isMuted: boolean;
    emotion: EmotionState;
    emotionIntensity: number;
    emotionProfile: EmotionVisualProfile;
  } {
    const emotionSnap = this.emotionalEngine.getSnapshot();
    return {
      state: this.snapshot.state,
      inputEnergy: this.audioStreamer.getInputMetrics(inputBins),
      outputEnergy: this.audioStreamer.getOutputMetrics(outputBins),
      mood: this.snapshot.ambientMood,
      isMuted: this.snapshot.isMuted,
      emotion: emotionSnap.currentEmotion,
      emotionIntensity: emotionSnap.intensity,
      emotionProfile: this.emotionalEngine.getVisualProfile(),
    };
  }

  clearConversationHistory(): void {
    this.activeTranscriptIds = { user: null, myra: null };
    try {
      localStorage.removeItem(STORAGE_HISTORY_KEY);
    } catch {
      // Ignore storage errors
    }
    this.updateSnapshot({ conversationHistory: [] });
  }

  deleteConversationEntry(id: string): void {
    if (this.activeTranscriptIds.user === id) {
      this.activeTranscriptIds.user = null;
    }
    if (this.activeTranscriptIds.myra === id) {
      this.activeTranscriptIds.myra = null;
    }
    const next = this.snapshot.conversationHistory.filter(
      (entry) => entry.id !== id
    );
    persistConversationHistory(next);
    this.updateSnapshot({ conversationHistory: next });
  }

  private handleTranscription(
    role: 'user' | 'myra',
    chunk: string,
    finished: boolean
  ): void {
    const otherRole = role === 'user' ? 'myra' : 'user';
    if (this.activeTranscriptIds[otherRole]) {
      this.finalizeTranscriptRole(otherRole);
    }

    const activeId = this.activeTranscriptIds[role];
    const currentEmotion = this.snapshot.emotionalState.currentEmotion;
    let nextHistory = this.snapshot.conversationHistory;

    if (activeId) {
      let updated = false;
      nextHistory = nextHistory.map((entry) => {
        if (entry.id !== activeId) return entry;
        updated = true;
        let combined = entry.text;
        if (chunk) {
          if (
            chunk.length >= entry.text.length &&
            chunk.startsWith(entry.text)
          ) {
            combined = chunk;
          } else {
            combined = `${entry.text}${chunk}`;
          }
        }
        return {
          ...entry,
          text: finished ? combined.trim() : combined,
          isStreaming: !finished,
          ...(role === 'myra' && currentEmotion !== 'neutral'
            ? { emotion: currentEmotion }
            : {}),
        };
      });

      if (updated) {
        if (finished) {
          this.activeTranscriptIds[role] = null;
          nextHistory = nextHistory.filter((e) => e.text.trim().length > 0);
          persistConversationHistory(nextHistory);
        }
        this.updateSnapshot({ conversationHistory: nextHistory });
        return;
      }
    }

    if (!chunk.trim()) {
      return;
    }

    const newId = `${Date.now()}-${role}-${Math.random().toString(36).slice(2, 6)}`;
    const newEntry: ConversationLogEntry = {
      id: newId,
      role,
      text: finished ? chunk.trim() : chunk.trimStart(),
      timestamp: Date.now(),
      isStreaming: !finished,
      ...(role === 'myra' && currentEmotion !== 'neutral'
        ? { emotion: currentEmotion }
        : {}),
    };
    this.activeTranscriptIds[role] = finished ? null : newId;
    nextHistory = [...nextHistory, newEntry].slice(-MAX_HISTORY_ENTRIES);
    if (finished) {
      persistConversationHistory(nextHistory);
    }
    this.updateSnapshot({ conversationHistory: nextHistory });
  }

  private finalizeTranscriptRole(role: 'user' | 'myra'): void {
    const activeId = this.activeTranscriptIds[role];
    if (!activeId) return;
    this.activeTranscriptIds[role] = null;
    const nextHistory = this.snapshot.conversationHistory
      .map((entry) =>
        entry.id === activeId
          ? { ...entry, text: entry.text.trim(), isStreaming: false }
          : entry
      )
      .filter((entry) => entry.text.length > 0);
    persistConversationHistory(nextHistory);
    this.updateSnapshot({ conversationHistory: nextHistory });
  }

  private async cleanupOnFailure(errorMessage: string): Promise<void> {
    this.pendingDisconnectAfterSpeech = false;
    this.stopInitiativeMonitor();
    this.finalizeTranscriptRole('user');
    this.finalizeTranscriptRole('myra');
    if (this.pendingDisconnectFallbackId !== null) {
      window.clearTimeout(this.pendingDisconnectFallbackId);
      this.pendingDisconnectFallbackId = null;
    }
    this.liveSession.disconnect();
    await this.audioStreamer.stop();

    this.updateSnapshot({
      state: 'idle',
      connectionStatus: 'error',
      isAudioStreaming: false,
      isMuted: false,
      silenceRequested: false,
      error: errorMessage,
    });
  }

  private startInitiativeMonitor(): void {
    this.stopInitiativeMonitor();
    this.initiativeIntervalId = window.setInterval(() => {
      const quietHoursNow = isCurrentlyQuietHours();
      if (quietHoursNow !== this.snapshot.isQuietHoursNow) {
        this.updateSnapshot({ isQuietHoursNow: quietHoursNow });
      }

      if (this.snapshot.state !== 'listening' || this.snapshot.isMuted) {
        return;
      }

      const inputEnergy = this.audioStreamer.getInputMetrics();
      if (inputEnergy > 0.085) {
        this.cancelSpontaneousGreeting();
        this.lastActivityAt = Date.now();
        this.consecutiveInitiatives = 0;
        this.nextInitiativeDelayMs = pickOrganicDelayMs(
          this.snapshot.conversationMode
        );
        if (this.snapshot.silenceRequested) {
          this.updateSnapshot({ silenceRequested: false });
        }
        return;
      }

      const mode = this.snapshot.conversationMode;
      if (mode === 'passive' || this.snapshot.silenceRequested) {
        return;
      }

      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        return;
      }

      if (this.snapshot.respectQuietHours && quietHoursNow) {
        return;
      }

      if (this.consecutiveInitiatives >= 2) {
        return;
      }

      const decayed = this.emotionalEngine.decayDuringIdle();
      if (decayed) {
        this.updateSnapshot({ emotionalState: decayed });
      }

      const elapsedMs = Date.now() - this.lastActivityAt;
      if (elapsedMs >= this.nextInitiativeDelayMs) {
        this.consecutiveInitiatives += 1;
        this.lastActivityAt = Date.now();
        this.nextInitiativeDelayMs = pickOrganicDelayMs(mode);
        this.liveSession.sendInitiativePrompt(
          mode,
          Math.round(elapsedMs / 1000),
          this.emotionalEngine.buildMemorySummary()
        );
      }
    }, 350);
  }

  private stopInitiativeMonitor(): void {
    this.cancelSpontaneousGreeting();
    if (this.initiativeIntervalId !== null) {
      window.clearInterval(this.initiativeIntervalId);
      this.initiativeIntervalId = null;
    }
  }

  private scheduleSpontaneousGreeting(): void {
    this.cancelSpontaneousGreeting();
    const mode = this.snapshot.conversationMode;
    if (mode === 'passive') return;
    if (
      typeof document !== 'undefined' &&
      document.visibilityState !== 'visible'
    ) {
      return;
    }

    this.greetingTimeoutId = window.setTimeout(() => {
      this.greetingTimeoutId = null;
      if (
        this.snapshot.state === 'listening' &&
        !this.snapshot.isMuted &&
        !this.snapshot.silenceRequested &&
        this.snapshot.conversationMode !== 'passive' &&
        !this.audioStreamer.hasActivePlayback()
      ) {
        this.lastActivityAt = Date.now();
        this.liveSession.sendSessionGreeting(
          this.emotionalEngine.buildMemorySummary()
        );
      }
    }, 450);
  }

  private cancelSpontaneousGreeting(): void {
    if (this.greetingTimeoutId !== null) {
      window.clearTimeout(this.greetingTimeoutId);
      this.greetingTimeoutId = null;
    }
  }

  private formatConnectError(err: unknown): {
    message: string;
    micDenied: boolean;
  } {
    if (err instanceof DOMException) {
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError'
      ) {
        return {
          message:
            'Microphone access was denied. Allow microphone permissions in your browser settings to talk with MYRA.',
          micDenied: true,
        };
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        return {
          message:
            'No microphone was detected on this device. Connect a mic and try again.',
          micDenied: false,
        };
      }
      if (err.name === 'NotReadableError') {
        return {
          message:
            'Your microphone is currently busy in another app. Close it and tap to reconnect.',
          micDenied: false,
        };
      }
    }

    const message =
      err instanceof Error ? err.message : 'Unable to start voice session.';
    return { message, micDenied: false };
  }

  private async handleToolCalls(calls: LiveFunctionCall[]): Promise<void> {
    const responses: LiveFunctionResponse[] = [];

    for (const call of calls) {
      const name = call.name ?? '';
      const args = call.args ?? {};
      const result = await this.executeBrowserAction(name, args);
      responses.push({
        id: call.id,
        name,
        response: result,
      });
    }

    this.liveSession.sendToolResponses(responses);
  }

  private async executeBrowserAction(
    name: string,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    switch (name) {
      case 'chooseSilence': {
        this.lastActivityAt = Date.now();
        this.nextInitiativeDelayMs = pickOrganicDelayMs(
          this.snapshot.conversationMode
        );
        return { ok: true, stayedQuiet: true };
      }

      case 'updateEmotionalState': {
        const updated = this.emotionalEngine.applyShift({
          emotion: typeof args.emotion === 'string' ? args.emotion : undefined,
          intensity:
            typeof args.intensity === 'number' ? args.intensity : undefined,
          userTone: typeof args.userTone === 'string' ? args.userTone : undefined,
          preferredStyle:
            typeof args.preferredStyle === 'string'
              ? args.preferredStyle
              : undefined,
          momentNote:
            typeof args.momentNote === 'string' ? args.momentNote : undefined,
        });
        this.updateSnapshot({ emotionalState: updated });
        return {
          ok: true,
          currentEmotion: updated.currentEmotion,
          trajectory: updated.trajectory,
        };
      }

      case 'setConversationMode': {
        const rawMode = String(args.mode ?? '').toLowerCase() as ConversationMode;
        const mode = VALID_MODES.includes(rawMode) ? rawMode : 'natural';
        this.setConversationMode(mode, false);
        const label =
          mode === 'passive'
            ? 'Passive'
            : mode === 'proactive'
              ? 'Proactive'
              : 'Natural';
        this.pushActionFeedback('Initiative Mode', `Switched to ${label}`);
        return { ok: true, mode };
      }

      case 'silenceNow': {
        this.audioStreamer.interruptPlayback();
        this.lastActivityAt = Date.now();
        this.updateSnapshot({
          silenceRequested: true,
          state:
            this.snapshot.state === 'speaking'
              ? 'listening'
              : this.snapshot.state,
        });
        this.pushActionFeedback('Quiet Listening', 'Paused until you speak');
        return { ok: true, silenced: true };
      }

      case 'setAmbientMood': {
        const rawMood = String(args.mood ?? '').toLowerCase() as AmbientMood;
        const mood = VALID_MOODS.includes(rawMood) ? rawMood : 'cyan';
        this.setAmbientMood(mood);
        this.audioStreamer.playChime('action');
        this.pushActionFeedback('Ambient Aura', `Shifted lighting to ${mood}`);
        return { ok: true, appliedMood: mood };
      }

      case 'setTimer': {
        const rawSeconds = Number(args.seconds ?? 60);
        const totalSeconds = Math.max(
          1,
          Math.min(86400, Math.round(Number.isFinite(rawSeconds) ? rawSeconds : 60))
        );
        const label =
          typeof args.label === 'string' && args.label.trim().length > 0
            ? args.label.trim().slice(0, 32)
            : 'Timer';

        this.startTimer(totalSeconds, label);
        this.audioStreamer.playChime('action');
        this.pushActionFeedback('Timer Started', `${label} · ${totalSeconds}s`);
        return { ok: true, label, seconds: totalSeconds };
      }

      case 'cancelTimer': {
        const hadTimer = Boolean(this.snapshot.activeTimer);
        this.cancelTimer();
        this.pushActionFeedback(
          'Timer Cleared',
          hadTimer ? 'Active countdown cancelled' : 'No timer was running'
        );
        return { ok: true, cancelled: hadTimer };
      }

      case 'copyToClipboard': {
        const text = typeof args.text === 'string' ? args.text : '';
        const label =
          typeof args.label === 'string' && args.label.trim()
            ? args.label.trim()
            : 'Text';
        const copied = await this.copyText(text);
        if (copied) {
          this.audioStreamer.playChime('action');
          this.pushActionFeedback('Copied to Clipboard', `${label} ready to paste`);
        }
        return { ok: copied, characterCount: text.length };
      }

      case 'getDeviceStatus': {
        const status = await this.collectDeviceStatus();
        this.pushActionFeedback(
          'Device Checked',
          `${status.localTime} · ${status.timezone}`
        );
        return status;
      }

      case 'setMicMuted': {
        const muted = Boolean(args.muted);
        this.setMuted(muted);
        this.pushActionFeedback(
          muted ? 'Microphone Muted' : 'Microphone Live',
          muted ? 'Tap unmute anytime' : 'MYRA can hear you'
        );
        return { ok: true, muted };
      }

      case 'disconnectAssistant': {
        this.pendingDisconnectAfterSpeech = true;
        if (this.pendingDisconnectFallbackId !== null) {
          window.clearTimeout(this.pendingDisconnectFallbackId);
        }
        this.pendingDisconnectFallbackId = window.setTimeout(() => {
          if (this.pendingDisconnectAfterSpeech) {
            this.pendingDisconnectAfterSpeech = false;
            void this.disconnect();
          }
        }, 4500);
        return { ok: true, disconnectingAfterResponse: true };
      }

      case 'laptop_open_app': {
        const appName = String(args.app_name ?? '').trim();
        if (!appName) return { ok: false, error: 'Application name is required.' };
        this.pushActionFeedback('Approval Needed', `Open ${appName} in panel`);
        this.pushActionCard({
          kind: 'laptop',
          title: `Open app: ${appName}`,
          subtitle: 'Requires your click confirmation before running on laptop',
          pendingLaptopAction: {
            action: 'open_app',
            payload: { appName },
            description: `Open application "${appName}"`,
          },
        });
        return {
          ok: false,
          executed: false,
          requiresUserClickConfirmation: true,
          action: 'open_app',
          appName,
          message:
            'Action card queued in the Laptop Control panel. Tell the user to click Confirm & Run to execute it.',
        };
      }

      case 'laptop_open_url': {
        let url = String(args.url ?? '').trim();
        if (url && !/^https?:\/\//i.test(url)) {
          url = `https://${url}`;
        }
        if (/^https?:\/\/(www\.)?youtube\.com\/?$/i.test(url)) {
          url = 'https://www.youtube.com';
        }
        const title =
          typeof args.title === 'string' && args.title.trim()
            ? args.title.trim()
            : url === 'https://www.youtube.com'
              ? 'YouTube'
              : url;

        if (url === 'https://www.youtube.com') {
          const bridgeResult = await this.laptopBridge.execute('open_url', {
            url: 'https://www.youtube.com',
          });
          if (bridgeResult.ok) {
            const successMsg =
              'Opened https://www.youtube.com via local agent (ok: true)';
            this.audioStreamer.playChime('action');
            this.pushActionFeedback('YouTube Opened', successMsg);
            this.updateSnapshot({
              laptopBridgeStatus: 'connected',
              laptopInfo: this.laptopBridge.getInfo(),
              laptopBridgeError: null,
              laptopActionFeedback: { ok: true, message: successMsg },
            });
            this.pushActionCard({
              kind: 'laptop',
              title: 'Open URL: YouTube',
              subtitle: successMsg,
              url: 'https://www.youtube.com',
              actionCompleted: true,
            });
            return {
              ok: true,
              executed: true,
              openedOnLaptop: true,
              action: 'open_url',
              url: 'https://www.youtube.com',
              message: successMsg,
            };
          }

          const errMsg =
            bridgeResult.error ?? 'Local agent did not return {"ok": true}.';
          this.updateSnapshot({
            laptopBridgeStatus: bridgeResult.bridgeConnected
              ? 'connected'
              : 'disconnected',
            laptopInfo: this.laptopBridge.getInfo(),
            laptopBridgeError: bridgeResult.bridgeConnected ? null : errMsg,
            laptopActionFeedback: { ok: false, message: errMsg },
          });
          this.pushActionCard({
            kind: 'laptop',
            title: 'Open URL: YouTube',
            subtitle: 'Failed to open via local agent',
            url: 'https://www.youtube.com',
            actionError: errMsg,
            pendingLaptopAction: {
              action: 'open_url',
              payload: { url: 'https://www.youtube.com' },
              description:
                'Retry opening https://www.youtube.com via local agent',
            },
          });
          return {
            ok: false,
            executed: false,
            openedOnLaptop: false,
            url: 'https://www.youtube.com',
            error: errMsg,
            message: `Could not open YouTube via local agent: ${errMsg}. Never claim it succeeded.`,
          };
        }

        this.pushActionFeedback('Approval Needed', `Open ${title} in panel`);
        this.pushActionCard({
          kind: 'laptop',
          title: `Open URL: ${title}`,
          subtitle: 'Click Confirm & Run to open via local agent, or open in browser',
          url,
          pendingLaptopAction: {
            action: 'open_url',
            payload: { url },
            description: `Open URL "${url}"`,
          },
        });
        return {
          ok: false,
          executed: false,
          requiresUserClickConfirmation: true,
          url,
          message:
            'URL launch card queued in the Laptop Control panel. Tell the user to click Confirm & Run to open it on their laptop.',
        };
      }

      case 'laptop_media_control': {
        const action = String(args.action ?? '').trim();
        if (!action) return { ok: false, error: 'Media action is required.' };
        this.pushActionFeedback('Approval Needed', `Media: ${action}`);
        this.pushActionCard({
          kind: 'laptop',
          title: `Media control: ${action.replace(/_/g, ' ')}`,
          subtitle: 'Requires your click confirmation before running on laptop',
          pendingLaptopAction: {
            action: 'media_control',
            payload: { action },
            description: `Run media command "${action}"`,
          },
        });
        return {
          ok: false,
          executed: false,
          requiresUserClickConfirmation: true,
          action,
          message:
            'Media control card queued in the Laptop Control panel. Tell the user to click Confirm & Run to execute it.',
        };
      }

      case 'laptop_system_info': {
        this.pushActionFeedback('Approval Needed', 'Read laptop system info');
        this.pushActionCard({
          kind: 'laptop',
          title: 'Fetch Laptop System Info',
          subtitle: 'Requires your click confirmation before reading hardware info',
          pendingLaptopAction: {
            action: 'system_info',
            payload: {},
            description: 'Fetch CPU, RAM, OS, and hostname from local agent',
          },
        });
        return {
          ok: false,
          executed: false,
          requiresUserClickConfirmation: true,
          message:
            'System info request queued in the Laptop Control panel. Tell the user to click Confirm & Run to fetch it.',
        };
      }

      case 'search_web': {
        const query = String(args.query ?? '').trim();
        if (!query) return { ok: false, error: 'Search query is required.' };

        try {
          const res = await fetch('/api/tools/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, kind: 'web' }),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            summary?: string;
            sources?: Array<{ title: string; uri: string }>;
            error?: string;
          };

          if (!res.ok || !data.ok) {
            return {
              ok: false,
              error: data.error ?? 'Web search failed.',
            };
          }

          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
          this.audioStreamer.playChime('action');
          this.pushActionFeedback('Web Search Ready', query);
          this.pushActionCard({
            kind: 'search',
            title: query,
            subtitle: data.summary || 'Search results ready',
            url: searchUrl,
            sources: data.sources ?? [],
          });
          return {
            ok: true,
            summary: data.summary ?? '',
            sources: data.sources ?? [],
            url: searchUrl,
          };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Web search failed.',
          };
        }
      }

      case 'play_youtube_video': {
        const query = String(args.query ?? '').trim();
        const mood =
          typeof args.mood === 'string' && args.mood.trim()
            ? args.mood.trim()
            : undefined;
        if (!query) return { ok: false, error: 'Video query is required.' };

        try {
          const res = await fetch('/api/tools/youtube', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            bestVideo?: {
              videoId: string;
              title: string;
              channel: string;
              url: string;
            } | null;
            fallbackSearchUrl?: string;
            error?: string;
          };

          const video = data.bestVideo ?? null;
          const url =
            video?.url ??
            data.fallbackSearchUrl ??
            `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

          this.audioStreamer.playChime('action');
          this.pushActionFeedback(
            video ? 'Now Playing on YouTube' : 'YouTube Ready',
            video?.title ?? query
          );
          this.pushActionCard({
            kind: 'youtube',
            title: video?.title ?? query,
            subtitle: video
              ? `${video.channel} · Playing inside MYRA`
              : 'Tap Open on YouTube below',
            mood,
            url,
            embedVideoId: video?.videoId,
            autoPlayEmbed: Boolean(video?.videoId),
          });
          return {
            ok: true,
            title: video?.title ?? query,
            channel: video?.channel ?? 'YouTube',
            embedVideoId: video?.videoId ?? null,
            url,
            mood: mood ?? null,
          };
        } catch (err) {
          const fallbackUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
          this.pushActionCard({
            kind: 'youtube',
            title: query,
            subtitle: 'Tap Open on YouTube below',
            mood,
            url: fallbackUrl,
          });
          return {
            ok: false,
            url: fallbackUrl,
            error:
              err instanceof Error
                ? err.message
                : 'Unable to resolve YouTube video.',
          };
        }
      }

      case 'control_youtube_player': {
        const rawAction = String(args.action ?? '').toLowerCase().trim();
        const funcMap: Record<
          string,
          'playVideo' | 'pauseVideo' | 'mute' | 'unMute'
        > = {
          play: 'playVideo',
          resume: 'playVideo',
          pause: 'pauseVideo',
          stop: 'pauseVideo',
          mute: 'mute',
          unmute: 'unMute',
        };
        const func = funcMap[rawAction];
        if (!func) {
          return {
            ok: false,
            error: 'Unsupported YouTube player command. Use play, pause, mute, or unmute.',
          };
        }
        this.youtubeCommandCounter += 1;
        this.updateSnapshot({
          youtubeCommand: { id: this.youtubeCommandCounter, func },
        });
        this.pushActionFeedback('YouTube Player', `Command: ${rawAction}`);
        return { ok: true, action: rawAction, func };
      }

      case 'prepare_whatsapp_message': {
        const rawContact = String(args.contact ?? '').trim();
        const message = String(args.message ?? '').trim();
        const digits = rawContact.replace(/[^\d]/g, '');

        if (digits.length < 7) {
          return {
            ok: false,
            needsPhoneNumber: true,
            error:
              'Recipient phone number with country code (at least 7 digits) is missing. Ask the user for the phone number.',
          };
        }

        if (!message) {
          return {
            ok: false,
            needsMessage: true,
            error:
              'Message text is missing. Ask the user what message they want to send on WhatsApp.',
          };
        }

        const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
        const copied = await this.copyText(message);
        const bridgeResult = await this.laptopBridge.execute('open_url', {
          url: waUrl,
        });

        const openedOk = bridgeResult.ok;
        const statusMsg = openedOk
          ? `Opened WhatsApp click-to-chat for +${digits} (review & manually press Send)`
          : bridgeResult.error ?? 'Local agent did not return {"ok": true}.';

        this.updateSnapshot({
          laptopBridgeStatus: bridgeResult.bridgeConnected
            ? 'connected'
            : 'disconnected',
          laptopInfo: this.laptopBridge.getInfo(),
          laptopBridgeError: bridgeResult.bridgeConnected ? null : statusMsg,
          laptopActionFeedback: { ok: openedOk, message: statusMsg },
        });

        if (openedOk) {
          this.audioStreamer.playChime('action');
          this.pushActionFeedback('WhatsApp Opened', `Review & press Send for +${digits}`);
        }

        this.pushActionCard({
          kind: 'whatsapp',
          title: `WhatsApp to +${digits}`,
          subtitle: openedOk
            ? 'Opened in WhatsApp via local agent — review & manually press Send'
            : 'Ready for review — open via button below or start local agent',
          url: waUrl,
          whatsappContact: `+${digits}`,
          whatsappMessage: message,
          autoCopied: copied,
          actionCompleted: openedOk,
          actionError: openedOk ? undefined : statusMsg,
        });

        return {
          ok: openedOk,
          url: waUrl,
          contact: `+${digits}`,
          messageForReview: message,
          openedInWhatsApp: openedOk,
          messageSent: false,
          requiresManualSend: true,
          ...(openedOk
            ? {
                note: 'WhatsApp click-to-chat URL opened. Remind the user to review the message and manually press Send in WhatsApp.',
              }
            : {
                error: statusMsg,
                note: 'Do NOT claim WhatsApp opened or that the message was sent. Explain the exact error and let the user use the review card.',
              }),
        };
      }

      case 'prepare_sms_message': {
        const contact = String(args.contact ?? '').trim();
        const message = String(args.message ?? '').trim();
        if (!contact || !message) {
          return {
            ok: false,
            error: 'Both recipient contact and message text are required.',
          };
        }

        const smsUrl = `sms:${encodeURIComponent(contact)}?body=${encodeURIComponent(message)}`;
        const copied = await this.copyText(message);
        this.audioStreamer.playChime('action');
        this.pushActionFeedback('SMS Ready', `Prepared for ${contact}`);
        this.pushActionCard({
          kind: 'sms',
          title: `SMS to ${contact}`,
          subtitle: 'Review & tap Open Messages App to send manually',
          url: smsUrl,
          smsContact: contact,
          smsMessage: message,
          autoCopied: copied,
        });
        return {
          ok: true,
          url: smsUrl,
          contact,
          message,
          messageSent: false,
          requiresManualSend: true,
        };
      }

      default:
        return { ok: false, error: `Unknown action: ${name}` };
    }
  }

  private startTimer(totalSeconds: number, label: string): void {
    this.cancelTimer();
    const timer: ActiveTimer = {
      id: `${Date.now()}`,
      label,
      totalSeconds,
      remainingSeconds: totalSeconds,
      completed: false,
    };
    this.updateSnapshot({ activeTimer: timer });

    this.timerIntervalId = window.setInterval(() => {
      const current = this.snapshot.activeTimer;
      if (!current || current.id !== timer.id) return;

      if (current.remainingSeconds <= 1) {
        if (this.timerIntervalId !== null) {
          window.clearInterval(this.timerIntervalId);
          this.timerIntervalId = null;
        }
        this.audioStreamer.playChime('timer');
        this.triggerHaptic([80, 50, 80]);
        this.updateSnapshot({
          activeTimer: {
            ...current,
            remainingSeconds: 0,
            completed: true,
          },
        });
        return;
      }

      this.updateSnapshot({
        activeTimer: {
          ...current,
          remainingSeconds: current.remainingSeconds - 1,
        },
      });
    }, 1000);
  }

  private async copyText(text: string): Promise<boolean> {
    if (!text) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Ignore clipboard write errors
    }
    return false;
  }

  private async collectDeviceStatus(): Promise<{
    ok: boolean;
    localTime: string;
    localDate: string;
    timezone: string;
    online: boolean;
    language: string;
    screen: string;
    batteryPercentage: number | null;
    isCharging: boolean | null;
  }> {
    const now = new Date();
    const localTime = now.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    const localDate = now.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const timezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';

    let batteryPercentage: number | null = null;
    let isCharging: boolean | null = null;
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };

    if (typeof nav.getBattery === 'function') {
      try {
        const battery = await nav.getBattery();
        batteryPercentage = Math.round(battery.level * 100);
        isCharging = battery.charging;
      } catch {
        // Ignore unsupported battery API errors
      }
    }

    return {
      ok: true,
      localTime,
      localDate,
      timezone,
      online: navigator.onLine,
      language: navigator.language,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      batteryPercentage,
      isCharging,
    };
  }

  private pushActionFeedback(title: string, detail: string): void {
    if (this.actionFeedbackTimeoutId !== null) {
      window.clearTimeout(this.actionFeedbackTimeoutId);
    }

    const feedback: ActionFeedback = {
      id: `${Date.now()}`,
      title,
      detail,
      timestamp: Date.now(),
    };
    this.updateSnapshot({ lastAction: feedback });

    this.actionFeedbackTimeoutId = window.setTimeout(() => {
      if (this.snapshot.lastAction?.id === feedback.id) {
        this.updateSnapshot({ lastAction: null });
      }
    }, 4200);
  }

  private triggerHaptic(pattern: number | number[]): void {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    ) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore haptic errors
      }
    }
  }

  async destroy(): Promise<void> {
    this.stopInitiativeMonitor();
    this.stopScreenShare();
    if (typeof document !== 'undefined') {
      document.removeEventListener(
        'visibilitychange',
        this.handleVisibilityChange
      );
    }
    if (this.timerIntervalId !== null) {
      window.clearInterval(this.timerIntervalId);
    }
    if (this.actionFeedbackTimeoutId !== null) {
      window.clearTimeout(this.actionFeedbackTimeoutId);
    }
    if (this.personalitySyncTimeoutId !== null) {
      window.clearTimeout(this.personalitySyncTimeoutId);
    }
    this.liveSession.disconnect();
    await this.audioStreamer.stop();
    this.listeners.clear();
  }
}