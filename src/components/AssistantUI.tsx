import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Globe,
  History,
  Laptop,
  Loader2,
  MessageCircle,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Moon,
  Palette,
  PhoneOff,
  Play,
  RefreshCw,
  ShieldCheck,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Timer,
  Trash2,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { MyraAssistant } from '../services/MyraAssistant';
import type {
  AmbientMood,
  AssistantSnapshot,
  AssistantState,
  ConversationMode,
  PendingLaptopAction,
} from '../types/assistant';
import { AudioVisualizer } from './AudioVisualizer';
import { ConversationLog } from './ConversationLog';
import { SettingsMenu } from './SettingsMenu';

const CONVERSATION_MODES: Array<{
  id: ConversationMode;
  label: string;
  hint: string;
}> = [
  { id: 'passive', label: 'Passive', hint: 'Replies only when spoken to' },
  { id: 'natural', label: 'Natural', hint: 'Occasional spontaneous thoughts' },
  { id: 'proactive', label: 'Proactive', hint: 'Initiates conversation more often' },
];

const MOOD_OPTIONS: Array<{
  id: AmbientMood;
  label: string;
  dotClass: string;
  ringClass: string;
  glowClass: string;
  accentText: string;
}> = [
  {
    id: 'cyan',
    label: 'Electric Cyan',
    dotClass: 'bg-cyan-400',
    ringClass: 'border-cyan-400/50 hover:border-cyan-300',
    glowClass: 'shadow-[0_0_55px_-8px_rgba(34,211,238,0.55)]',
    accentText: 'text-cyan-300',
  },
  {
    id: 'violet',
    label: 'Ultraviolet',
    dotClass: 'bg-violet-400',
    ringClass: 'border-violet-400/50 hover:border-violet-300',
    glowClass: 'shadow-[0_0_55px_-8px_rgba(167,139,250,0.55)]',
    accentText: 'text-violet-300',
  },
  {
    id: 'rose',
    label: 'Crimson Rose',
    dotClass: 'bg-rose-400',
    ringClass: 'border-rose-400/50 hover:border-rose-300',
    glowClass: 'shadow-[0_0_55px_-8px_rgba(251,113,133,0.55)]',
    accentText: 'text-rose-300',
  },
  {
    id: 'emerald',
    label: 'Aurora Mint',
    dotClass: 'bg-emerald-400',
    ringClass: 'border-emerald-400/50 hover:border-emerald-300',
    glowClass: 'shadow-[0_0_55px_-8px_rgba(52,211,153,0.55)]',
    accentText: 'text-emerald-300',
  },
  {
    id: 'amber',
    label: 'Solar Amber',
    dotClass: 'bg-amber-400',
    ringClass: 'border-amber-400/50 hover:border-amber-300',
    glowClass: 'shadow-[0_0_55px_-8px_rgba(251,191,36,0.55)]',
    accentText: 'text-amber-300',
  },
];

function formatCountdown(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

function getStateMeta(
  state: AssistantState,
  isMuted: boolean,
  silenceRequested: boolean
): { label: string; prompt: string; indicatorTone: string } {
  switch (state) {
    case 'connecting':
      return {
        label: 'Connecting',
        prompt: 'Waking MYRA up...',
        indicatorTone: 'bg-amber-400 animate-pulse',
      };
    case 'listening':
      if (isMuted) {
        return {
          label: 'Muted',
          prompt: 'Microphone muted — tap unmute when ready',
          indicatorTone: 'bg-slate-400',
        };
      }
      if (silenceRequested) {
        return {
          label: 'Quiet',
          prompt: 'Staying quiet — speak whenever you want me',
          indicatorTone: 'bg-slate-400',
        };
      }
      return {
        label: 'Listening',
        prompt: 'MYRA is listening — go ahead and talk',
        indicatorTone: 'bg-cyan-400 animate-pulse',
      };
    case 'speaking':
      return {
        label: 'Speaking',
        prompt: 'MYRA is talking — interrupt anytime',
        indicatorTone: 'bg-emerald-400 animate-pulse',
      };
    case 'disconnecting':
      return {
        label: 'Disconnecting',
        prompt: 'Wrapping up voice link...',
        indicatorTone: 'bg-slate-400 animate-pulse',
      };
    case 'idle':
    default:
      return {
        label: 'Standby',
        prompt: 'Tap the mic to start talking with MYRA',
        indicatorTone: 'bg-slate-600',
      };
  }
}

export function AssistantUI() {
  const assistant = useMemo(() => new MyraAssistant(), []);
  const [snapshot, setSnapshot] = useState<AssistantSnapshot>(() =>
    assistant.getSnapshot()
  );
  const [moodMenuOpen, setMoodMenuOpen] = useState(false);
  const [actionsPanelOpen, setActionsPanelOpen] = useState(false);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [copiedAgentCmd, setCopiedAgentCmd] = useState(false);
  const [showWindowsGuide, setShowWindowsGuide] = useState(true);
  const [appNameInput, setAppNameInput] = useState('notepad');
  const [openUrlInput, setOpenUrlInput] = useState('https://google.com');
  const [whatsappPhoneInput, setWhatsappPhoneInput] = useState('');
  const [whatsappMessageInput, setWhatsappMessageInput] = useState('');
  const [whatsappValidationError, setWhatsappValidationError] = useState<
    string | null
  >(null);
  const [pendingConfirm, setPendingConfirm] =
    useState<PendingLaptopAction | null>(null);
  const pendingWaDraftRef = useRef<{
    digits: string;
    message: string;
    waUrl: string;
  } | null>(null);
  const lastSeenCardIdRef = useRef<string | null>(null);
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null);
  const portraitImgRef = useRef<HTMLImageElement | null>(null);
  const portraitAuraRef = useRef<HTMLDivElement | null>(null);
  const screenPreviewRef = useRef<HTMLVideoElement | null>(null);
  const panelScreenPreviewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const unsubscribe = assistant.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      void assistant.destroy();
    };
  }, [assistant]);

  useEffect(() => {
    const stream =
      snapshot.screenShareStatus === 'active'
        ? assistant.getScreenStream()
        : null;

    for (const videoEl of [
      screenPreviewRef.current,
      panelScreenPreviewRef.current,
    ]) {
      if (!videoEl) continue;
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
      if (stream) {
        void videoEl.play().catch(() => {});
      }
    }
  }, [assistant, snapshot.screenShareStatus, actionsPanelOpen]);

  useEffect(() => {
    let rafId = 0;
    const animatePortrait = () => {
      const img = portraitImgRef.current;
      const aura = portraitAuraRef.current;
      if (img) {
        const metrics = assistant.getVisualizerMetrics();
        const isSpeaking = metrics.state === 'speaking';
        const isListening = metrics.state === 'listening' && !metrics.isMuted;
        const energy = isSpeaking
          ? metrics.outputEnergy
          : isListening
            ? metrics.inputEnergy * 0.45
            : 0;

        const baseScale = isSpeaking ? 1.028 : isListening ? 1.012 : 1;
        const dynamicScale = baseScale + energy * 0.032;
        const brightness = (isSpeaking ? 1.04 : isListening ? 0.98 : 0.92) + energy * 0.14;
        img.style.transform = `scale(${dynamicScale.toFixed(4)})`;
        img.style.filter = `brightness(${brightness.toFixed(3)})`;

        if (aura) {
          aura.style.opacity = isSpeaking
            ? (0.35 + Math.min(0.55, energy * 0.9)).toFixed(3)
            : isListening
              ? (0.18 + Math.min(0.25, energy * 0.5)).toFixed(3)
              : '0.12';
        }
      }
      rafId = window.requestAnimationFrame(animatePortrait);
    };

    rafId = window.requestAnimationFrame(animatePortrait);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [assistant]);

  useEffect(() => {
    const newest = snapshot.actionCards[0];
    if (!newest || newest.id === lastSeenCardIdRef.current) return;
    lastSeenCardIdRef.current = newest.id;

    if (
      newest.kind === 'youtube' ||
      newest.kind === 'whatsapp' ||
      newest.kind === 'sms' ||
      newest.kind === 'search' ||
      newest.kind === 'laptop' ||
      snapshot.laptopBridgeStatus !== 'connected'
    ) {
      setActionsPanelOpen(true);
    }
  }, [snapshot.actionCards, snapshot.laptopBridgeStatus]);

  useEffect(() => {
    const cmd = snapshot.youtubeCommand;
    if (!cmd || !youtubeIframeRef.current?.contentWindow) return;
    youtubeIframeRef.current.contentWindow.postMessage(
      JSON.stringify({
        event: 'command',
        func: cmd.func,
        args: [],
      }),
      '*'
    );
  }, [snapshot.youtubeCommand]);

  const activeMood =
    MOOD_OPTIONS.find((m) => m.id === snapshot.ambientMood) ?? MOOD_OPTIONS[0];
  const stateMeta = getStateMeta(
    snapshot.state,
    snapshot.isMuted,
    snapshot.silenceRequested
  );
  const activeMode =
    CONVERSATION_MODES.find((m) => m.id === snapshot.conversationMode) ??
    CONVERSATION_MODES[0];
  const isLive =
    snapshot.state === 'listening' || snapshot.state === 'speaking';
  const isTransitioning =
    snapshot.state === 'connecting' || snapshot.state === 'disconnecting';

  const handlePrimaryTap = () => {
    setMoodMenuOpen(false);
    void assistant.toggleConnection();
  };

  const handleCopyAgentCommand = async (
    cmd = 'cd $env:USERPROFILE\\Downloads; node myra-laptop-agent.mjs'
  ) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedAgentCmd(true);
      window.setTimeout(() => setCopiedAgentCmd(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const requestOpenAppConfirm = () => {
    const clean = appNameInput.trim();
    if (!clean) return;
    assistant.clearLaptopActionFeedback();
    setPendingConfirm({
      action: 'open_app',
      payload: { appName: clean },
      description: `Open application "${clean}" on your laptop`,
    });
  };

  const requestOpenUrlConfirm = () => {
    let clean = openUrlInput.trim();
    if (!clean) return;
    if (!/^https?:\/\//i.test(clean)) {
      clean = `https://${clean}`;
    }
    assistant.clearLaptopActionFeedback();
    pendingWaDraftRef.current = null;
    setPendingConfirm({
      action: 'open_url',
      payload: { url: clean },
      description: `Open "${clean}" in your laptop browser`,
    });
  };

  const requestOpenYouTubeConfirm = () => {
    assistant.clearLaptopActionFeedback();
    pendingWaDraftRef.current = null;
    setPendingConfirm({
      action: 'open_url',
      payload: { url: 'https://www.youtube.com' },
      description: 'Open YouTube (https://www.youtube.com) via local agent',
    });
  };

  const requestWhatsAppConfirm = () => {
    const digits = whatsappPhoneInput.replace(/[^\d]/g, '');
    const msg = whatsappMessageInput.trim();
    if (digits.length < 7) {
      setWhatsappValidationError(
        'Please enter a valid recipient phone number with country code (at least 7 digits).'
      );
      return;
    }
    if (!msg) {
      setWhatsappValidationError(
        'Please enter the message you want to review and send on WhatsApp.'
      );
      return;
    }
    setWhatsappValidationError(null);
    assistant.clearLaptopActionFeedback();
    const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
    pendingWaDraftRef.current = { digits, message: msg, waUrl };
    setPendingConfirm({
      action: 'open_url',
      payload: { url: waUrl },
      description: `Open WhatsApp click-to-chat for +${digits} (you will manually press Send in WhatsApp)`,
    });
  };

  const requestMediaConfirm = (mediaAction: string, label: string) => {
    assistant.clearLaptopActionFeedback();
    pendingWaDraftRef.current = null;
    setPendingConfirm({
      action: 'media_control',
      payload: { action: mediaAction },
      description: `Send media control "${label}" to your laptop`,
    });
  };

  const requestSystemInfoConfirm = () => {
    assistant.clearLaptopActionFeedback();
    pendingWaDraftRef.current = null;
    setPendingConfirm({
      action: 'system_info',
      payload: {},
      description: 'Fetch system information from your laptop agent',
    });
  };

  const handleConfirmAndRun = async () => {
    if (!pendingConfirm) return;
    const actionToRun = pendingConfirm;
    const waDraft = pendingWaDraftRef.current;
    pendingWaDraftRef.current = null;
    setPendingConfirm(null);
    const ok = await assistant.runConfirmedLaptopAction(
      actionToRun.action,
      actionToRun.payload
    );
    if (waDraft) {
      await assistant.recordManualWhatsAppCard(
        waDraft.digits,
        waDraft.message,
        waDraft.waUrl,
        ok,
        ok
          ? undefined
          : assistant.getSnapshot().laptopActionFeedback?.message ??
              'Local agent did not return {"ok": true}.'
      );
    }
  };

  return (
    <div className="relative flex h-[100dvh] w-full flex-col justify-between overflow-hidden bg-[#06070B] text-slate-100 select-none">
      {/* Full-Screen Edge-to-Edge Audio-Reactive AI Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <img
          ref={portraitImgRef}
          src="/assets/aistudio/WhatsApp_Image_2026-11-18_at_3.33.37_PM_558ed7e3.jpeg"
          alt="MYRA AI Assistant"
          className={`h-full w-full object-cover object-[50%_18%] transition-opacity duration-500 will-change-transform ${
            snapshot.state === 'speaking'
              ? 'opacity-95'
              : snapshot.state === 'listening'
                ? 'opacity-90'
                : 'opacity-85'
          }`}
        />
      </div>

      {/* Speaking / Voice-Reactive Neon Aura */}
      <div
        ref={portraitAuraRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: 0.12,
          background:
            'radial-gradient(circle at 50% 26%, rgba(244, 114, 182, 0.24) 0%, rgba(34, 211, 238, 0.16) 35%, transparent 70%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#06070B]/45 via-transparent to-[#06070B]/88 transition-opacity duration-500"
      />

      {/* Top Header Bar */}
      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 pt-4 pb-2 sm:px-8 sm:pt-6">
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <span className="text-lg font-bold tracking-tight text-white sm:text-xl">
            MYRA
          </span>
        </div>

        <div
          className="flex items-center gap-2.5 text-xs font-medium text-slate-300 whitespace-nowrap shrink-0"
          role="status"
          aria-live="polite"
        >
          <span
            className={`h-2 w-2 rounded-full transition-colors duration-300 ${stateMeta.indicatorTone}`}
            aria-hidden="true"
          />
          <span>{stateMeta.label}</span>
          {isLive && snapshot.emotionalState.currentEmotion !== 'neutral' && (
            <>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className={`capitalize ${activeMood.accentText}`}>
                {snapshot.emotionalState.currentEmotion}
              </span>
            </>
          )}
        </div>

        <div className="relative flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void assistant.toggleScreenShare()}
            aria-label={
              snapshot.screenShareStatus === 'active'
                ? 'Stop live laptop screen share'
                : 'Share live laptop screen with MYRA'
            }
            aria-pressed={snapshot.screenShareStatus === 'active'}
            className={`relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              snapshot.screenShareStatus === 'active'
                ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            {snapshot.screenShareStatus === 'active' ? (
              <Monitor className="h-4 w-4" />
            ) : (
              <MonitorOff className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setMoodMenuOpen(false);
              setActionsPanelOpen(false);
              setSettingsMenuOpen(false);
              setHistoryPanelOpen((open) => !open);
            }}
            aria-label="Open conversation log"
            aria-expanded={historyPanelOpen}
            className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <History className="h-4 w-4" />
            {snapshot.conversationHistory.length > 0 && (
              <span className="font-mono-tabular absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white/90 px-1 text-[10px] font-bold text-slate-950">
                {snapshot.conversationHistory.length > 99
                  ? '99+'
                  : snapshot.conversationHistory.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setMoodMenuOpen(false);
              setHistoryPanelOpen(false);
              setSettingsMenuOpen(false);
              setActionsPanelOpen((open) => !open);
            }}
            aria-label="Open laptop bridge and action cards"
            aria-expanded={actionsPanelOpen}
            className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <Laptop className="h-4 w-4" />
            <span
              aria-hidden="true"
              className={`absolute right-2.5 bottom-2.5 h-1.5 w-1.5 rounded-full ${
                snapshot.laptopBridgeStatus === 'connected'
                  ? 'bg-emerald-400'
                  : snapshot.laptopBridgeStatus === 'checking'
                    ? 'bg-amber-400'
                    : 'bg-slate-500'
              }`}
            />
            {snapshot.actionCards.length > 0 && (
              <span className="font-mono-tabular absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-cyan-400 px-1 text-[10px] font-bold text-slate-950">
                {snapshot.actionCards.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActionsPanelOpen(false);
              setHistoryPanelOpen(false);
              setSettingsMenuOpen(false);
              setMoodMenuOpen((open) => !open);
            }}
            aria-label="Change ambient aura color"
            aria-expanded={moodMenuOpen}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <Palette className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setMoodMenuOpen(false);
              setActionsPanelOpen(false);
              setHistoryPanelOpen(false);
              setSettingsMenuOpen((open) => !open);
            }}
            aria-label="Open personality settings"
            aria-expanded={settingsMenuOpen}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          {moodMenuOpen && (
            <div
              role="menu"
              aria-label="Ambient color options"
              className="absolute top-13 right-0 z-30 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0D1017]/95 p-2 backdrop-blur-xl shadow-2xl"
            >
              {MOOD_OPTIONS.map((option) => {
                const selected = option.id === snapshot.ambientMood;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    aria-label={option.label}
                    onClick={() => {
                      assistant.setAmbientMood(option.id);
                      setMoodMenuOpen(false);
                    }}
                    className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                      selected ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full ${option.dotClass}`}
                    >
                      {selected && <Check className="h-3 w-3 text-slate-950" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {/* Main Stage: Portrait framed above, Visualizer + Voice Core in lower stage */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-end px-6 pb-2 sm:pb-4">
        {/* Optional Active Timer or Action Feedback Strip */}
        <div className="mb-2 flex min-h-[36px] flex-col items-center justify-center gap-2">
          {snapshot.activeTimer && (
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0D1017]/85 px-4 py-1.5 backdrop-blur-md">
              <Timer className={`h-4 w-4 ${activeMood.accentText}`} />
              <span className="font-mono-tabular text-sm font-medium text-white">
                {snapshot.activeTimer.completed
                  ? '00:00'
                  : formatCountdown(snapshot.activeTimer.remainingSeconds)}
              </span>
              <span className="text-xs text-slate-400">
                {snapshot.activeTimer.label}
              </span>
              <button
                type="button"
                onClick={() => assistant.cancelTimer()}
                aria-label="Cancel timer"
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {!snapshot.activeTimer && snapshot.lastAction && (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0D1017]/75 px-3 py-1.5 text-xs text-slate-200 backdrop-blur-md transition-opacity duration-200">
              <span className={`font-medium ${activeMood.accentText}`}>
                {snapshot.lastAction.title}
              </span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span className="text-slate-300">{snapshot.lastAction.detail}</span>
              {snapshot.actionCards.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActionsPanelOpen(true)}
                  className="ml-1 text-xs font-medium text-white underline underline-offset-2 hover:text-cyan-300 whitespace-nowrap"
                >
                  Open
                </button>
              )}
            </div>
          )}
        </div>

        {/* Central Interactive Core */}
        <div className="relative flex h-[228px] w-full max-w-[380px] items-center justify-center sm:h-[260px] sm:max-w-[440px]">
          <AudioVisualizer
            assistant={assistant}
            state={snapshot.state}
            mood={snapshot.ambientMood}
            isMuted={snapshot.isMuted}
          />

          <button
            type="button"
            onClick={handlePrimaryTap}
            disabled={isTransitioning}
            aria-label={
              isLive
                ? 'Disconnect MYRA voice session'
                : isTransitioning
                  ? stateMeta.label
                  : 'Connect and talk with MYRA'
            }
            className={`group relative z-10 flex h-28 w-28 flex-col items-center justify-center overflow-hidden rounded-full border-2 bg-[#0D1017]/85 backdrop-blur-xl transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 active:scale-95 disabled:cursor-wait sm:h-32 sm:w-32 ${
              isLive
                ? `${activeMood.ringClass} ${activeMood.glowClass}`
                : snapshot.state === 'idle'
                  ? 'border-white/25 hover:border-cyan-300/60 hover:bg-[#131824]/90 shadow-[0_0_48px_-8px_rgba(34,211,238,0.45)]'
                  : `${activeMood.ringClass} opacity-95`
            }`}
          >
            {/* Cropped Talking Avatar Portrait inside Voice Orb */}
            <img
              src="/assets/aistudio/WhatsApp_Image_2026-11-18_at_3.33.37_PM_558ed7e3.jpeg"
              alt=""
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 h-full w-full object-cover object-[49%_16%] transition-all duration-300 ${
                snapshot.state === 'speaking'
                  ? 'scale-[1.35] opacity-60'
                  : 'scale-[1.28] opacity-38 group-hover:opacity-52'
              }`}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#06070B]/40 via-[#06070B]/55 to-[#06070B]/80"
            />
            {/* Subtle inner sheen */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-1.5 rounded-full border border-white/[0.15]"
            />

            <span className="relative z-10 flex flex-col items-center justify-center gap-1">
              {snapshot.state === 'connecting' ||
              snapshot.state === 'disconnecting' ? (
                <Loader2
                  className={`h-7 w-7 animate-spin sm:h-8 sm:w-8 ${activeMood.accentText}`}
                />
              ) : snapshot.state === 'speaking' ? (
                <Volume2
                  className={`h-7 w-7 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] transition-transform duration-200 group-hover:scale-105 sm:h-8 sm:w-8 ${activeMood.accentText}`}
                />
              ) : snapshot.state === 'listening' && snapshot.isMuted ? (
                <MicOff className="h-7 w-7 text-slate-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] transition-transform duration-200 group-hover:scale-105 sm:h-8 sm:w-8" />
              ) : (
                <Mic
                  className={`h-7 w-7 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] transition-all duration-200 group-hover:scale-105 sm:h-8 sm:w-8 ${
                    snapshot.state === 'listening'
                      ? activeMood.accentText
                      : 'text-white group-hover:text-cyan-200'
                  }`}
                />
              )}
              <span
                className={`text-xs font-bold tracking-[0.2em] drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] sm:text-sm ${
                  isLive ? activeMood.accentText : 'text-white'
                }`}
              >
                MYRA
              </span>
            </span>
          </button>
        </div>

        {/* Conversational State Guidance */}
        <div className="mt-3 flex flex-col items-center text-center">
          <p className="text-sm font-medium tracking-wide text-slate-200 sm:text-base">
            {stateMeta.prompt}
          </p>
        </div>

        {/* Live Laptop Screen PIP Preview (when sharing) */}
        {snapshot.screenShareStatus === 'active' && (
          <div className="mb-3 w-full max-w-[260px] overflow-hidden rounded-2xl border border-emerald-400/35 bg-[#0D1017]/90 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
              <div className="flex items-center gap-1.5 text-emerald-300">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"
                />
                <span className="font-medium">
                  {isLive ? 'MYRA sees screen' : 'Screen preview'}
                </span>
                {snapshot.screenShareResolution && (
                  <span className="font-mono-tabular text-slate-400">
                    · {snapshot.screenShareResolution}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => assistant.stopScreenShare()}
                className="text-[11px] font-medium text-rose-300 hover:text-rose-200 whitespace-nowrap"
              >
                Stop
              </button>
            </div>
            <video
              ref={screenPreviewRef}
              muted
              playsInline
              autoPlay
              className="aspect-video w-full bg-black object-contain"
            />
          </div>
        )}

        {/* Screen Share Error Banner */}
        {snapshot.screenShareError && (
          <div
            role="alert"
            className="mt-3 flex w-full max-w-md items-start justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/35 px-4 py-3 text-left backdrop-blur-md"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-xs leading-relaxed text-amber-100">
                {snapshot.screenShareError}
              </p>
            </div>
            <button
              type="button"
              onClick={() => assistant.clearScreenShareError()}
              aria-label="Dismiss screen share error"
              className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg text-amber-300 transition-colors hover:bg-amber-500/20 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Error / Mic Permission Recovery Banner */}
        {snapshot.error && (
          <div
            role="alert"
            className="mt-5 flex w-full max-w-md items-start justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/35 px-4 py-3 text-left backdrop-blur-md"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs leading-relaxed text-rose-100">
                {snapshot.error}
              </p>
            </div>
            <button
              type="button"
              onClick={() => assistant.clearError()}
              aria-label="Dismiss error"
              className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg text-rose-300 transition-colors hover:bg-rose-500/20 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </main>

      {/* Bottom Ergonomic Thumb-Zone Controls */}
      <footer className="relative z-20 mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-3 px-6 pt-2 pb-5 sm:pb-7">
        {/* Conversational Initiative Mode Selector */}
        <div className="flex flex-col items-center gap-1.5">
          <div
            role="radiogroup"
            aria-label="Conversation initiative mode"
            className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#0D1017]/85 p-1 backdrop-blur-md"
          >
            {CONVERSATION_MODES.map((modeOption) => {
              const selected = snapshot.conversationMode === modeOption.id;
              return (
                <button
                  key={modeOption.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => assistant.setConversationMode(modeOption.id)}
                  className={`min-h-[40px] rounded-lg px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    selected
                      ? `bg-white/12 ${activeMood.accentText}`
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {modeOption.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{activeMode.hint}</span>
            {snapshot.isQuietHoursNow &&
              snapshot.conversationMode !== 'passive' && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => assistant.toggleQuietHoursRespect()}
                    className="inline-flex items-center gap-1 text-slate-400 underline-offset-2 transition-colors hover:text-slate-200 hover:underline whitespace-nowrap"
                  >
                    <Moon className="h-3 w-3" />
                    <span>
                      {snapshot.respectQuietHours
                        ? 'Quiet hours on'
                        : 'Quiet hours off'}
                    </span>
                  </button>
                </>
              )}
          </div>
        </div>

        {isLive ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => assistant.toggleMute()}
              className={`flex min-h-[48px] items-center gap-2 rounded-full border px-5 text-sm font-medium transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 whitespace-nowrap shrink-0 ${
                snapshot.isMuted
                  ? 'border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                  : 'border-white/15 bg-white/[0.05] text-slate-200 hover:border-white/25 hover:bg-white/[0.1]'
              }`}
            >
              {snapshot.isMuted ? (
                <>
                  <MicOff className="h-4 w-4" />
                  <span>Unmute</span>
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  <span>Mute Mic</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => void assistant.toggleScreenShare()}
              className={`flex min-h-[48px] items-center gap-2 rounded-full border px-5 text-sm font-medium transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 whitespace-nowrap shrink-0 ${
                snapshot.screenShareStatus === 'active'
                  ? 'border-emerald-400/45 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30'
                  : 'border-white/15 bg-white/[0.05] text-slate-200 hover:border-white/25 hover:bg-white/[0.1]'
              }`}
            >
              {snapshot.screenShareStatus === 'active' ? (
                <>
                  <Monitor className="h-4 w-4" />
                  <span>Stop Screen</span>
                </>
              ) : (
                <>
                  <MonitorOff className="h-4 w-4" />
                  <span>Share Screen</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => void assistant.disconnect()}
              className="flex min-h-[48px] items-center gap-2 rounded-full border border-rose-500/35 bg-rose-500/15 px-5 text-sm font-medium text-rose-200 transition-all hover:border-rose-400/60 hover:bg-rose-500/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 whitespace-nowrap shrink-0"
            >
              <PhoneOff className="h-4 w-4" />
              <span>End Voice</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
            <span>Voice-to-voice</span>
            <span aria-hidden="true">·</span>
            <span>Real-time audio</span>
            <span aria-hidden="true">·</span>
            <span>
              {snapshot.micPermission === 'denied'
                ? 'Mic permission blocked'
                : 'Hands-free actions'}
            </span>
          </div>
        )}
      </footer>

      {/* Laptop Bridge & Live Action Cards Slide-Over Sheet */}
      {actionsPanelOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-xs">
          <div
            className="flex-1"
            onClick={() => setActionsPanelOpen(false)}
            aria-hidden="true"
          />
          <aside
            aria-label="Laptop Bridge and Live Actions"
            className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0B0E15]/95 p-5 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Laptop className={`h-5 w-5 ${activeMood.accentText}`} />
                <h2 className="text-base font-semibold text-white">
                  Laptop Control & Actions
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActionsPanelOpen(false)}
                aria-label="Close panel"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-1 flex-col gap-5 overflow-y-auto pr-1">
              {/* Laptop Companion Bridge Card */}
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                      Laptop Companion Bridge
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {snapshot.laptopBridgeStatus === 'connected' &&
                      snapshot.laptopInfo
                        ? `Connected · ${snapshot.laptopInfo.hostname} (${snapshot.laptopInfo.platform})`
                        : snapshot.laptopBridgeStatus === 'checking'
                          ? 'Checking local agent...'
                          : 'Disconnected · 127.0.0.1:3847'}
                    </p>
                  </div>
                  <span
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      snapshot.laptopBridgeStatus === 'connected'
                        ? 'bg-emerald-400'
                        : snapshot.laptopBridgeStatus === 'checking'
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-slate-600'
                    }`}
                    aria-hidden="true"
                  />
                </div>

                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  Run the lightweight Node.js agent on your laptop (`127.0.0.1:3847`).
                  All laptop actions require your explicit click and confirmation.
                </p>

                {snapshot.laptopBridgeStatus !== 'connected' &&
                  snapshot.laptopBridgeError && (
                    <div
                      role="status"
                      className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2.5 text-xs leading-relaxed text-amber-100"
                    >
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <div className="min-w-0 flex-1">
                        <p className="break-words">{snapshot.laptopBridgeError}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          {typeof window !== 'undefined' &&
                            window.self !== window.top && (
                              <a
                                href={window.location.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-semibold text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
                              >
                                <span>Open MYRA in Standalone Tab</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          <a
                            href="http://127.0.0.1:3847/health"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-amber-300 underline underline-offset-2 hover:text-amber-200"
                          >
                            <span>Test 127.0.0.1:3847/health</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void assistant.checkLaptopBridge()}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-3.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/25 hover:bg-white/[0.1] whitespace-nowrap shrink-0"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        snapshot.laptopBridgeStatus === 'checking'
                          ? 'animate-spin'
                          : ''
                      }`}
                    />
                    <span>Check Connection</span>
                  </button>

                  <a
                    href="/api/laptop-agent/download"
                    download="myra-laptop-agent.mjs"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-3.5 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 whitespace-nowrap shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Agent (.mjs)</span>
                  </a>

                  <a
                    href="/api/laptop-agent/download-bat"
                    download="myra-start-windows.bat"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-3.5 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25 whitespace-nowrap shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Windows (.bat)</span>
                  </a>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#06070B] px-3 py-2">
                  <code className="font-mono-tabular truncate text-[11px] text-slate-300">
                    cd $env:USERPROFILE\Downloads; node myra-laptop-agent.mjs
                  </code>
                  <button
                    type="button"
                    onClick={() => void handleCopyAgentCommand()}
                    aria-label="Copy Windows PowerShell command"
                    className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {copiedAgentCmd ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                <div className="mt-3 border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowWindowsGuide((v) => !v)}
                    aria-expanded={showWindowsGuide}
                    className="flex w-full items-center justify-between text-left text-xs font-medium text-slate-300 transition-colors hover:text-white"
                  >
                    <span>Windows Setup Guide (127.0.0.1:3847)</span>
                    <span className="text-[11px] text-slate-400">
                      {showWindowsGuide ? 'Hide' : 'Show'}
                    </span>
                  </button>

                  {showWindowsGuide && (
                    <ol className="mt-2.5 list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-slate-400">
                      <li>
                        Install <span className="text-slate-200">Node.js 18+ LTS</span> on Windows if not installed.
                      </li>
                      <li>
                        Download both <span className="text-slate-200">myra-laptop-agent.mjs</span> and <span className="text-slate-200">myra-start-windows.bat</span> into your <span className="text-slate-200">Downloads</span> folder.
                      </li>
                      <li>
                        Double-click <span className="text-slate-200">myra-start-windows.bat</span> (or run the PowerShell command above) so it listens on <code className="text-cyan-300">127.0.0.1:3847</code>.
                      </li>
                      <li>
                        If using AI Studio preview iframe, click <span className="text-cyan-300">Open MYRA in Standalone Tab</span>, allow Chrome/Edge <span className="text-slate-200">Local network access</span> when prompted, then tap <span className="text-slate-200">Check Connection</span>.
                      </li>
                    </ol>
                  )}
                </div>
              </section>

              {/* Live Laptop Screen Vision */}
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                      Live Laptop Screen
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {snapshot.screenShareStatus === 'active'
                        ? isLive
                          ? `Streaming live frames to MYRA${snapshot.screenShareResolution ? ` (${snapshot.screenShareResolution})` : ''}`
                          : 'Screen captured — connect voice so MYRA can see and talk about it'
                        : 'Share your screen or window so MYRA can see it live'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void assistant.toggleScreenShare()}
                    disabled={snapshot.screenShareStatus === 'starting'}
                    className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      snapshot.screenShareStatus === 'active'
                        ? 'border-rose-400/35 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25'
                        : 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25'
                    }`}
                  >
                    {snapshot.screenShareStatus === 'active' ? (
                      <>
                        <MonitorOff className="h-3.5 w-3.5" />
                        <span>Stop Sharing</span>
                      </>
                    ) : (
                      <>
                        <Monitor className="h-3.5 w-3.5" />
                        <span>Share Screen</span>
                      </>
                    )}
                  </button>
                </div>

                {snapshot.screenShareStatus === 'active' && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-emerald-400/25 bg-black">
                    <video
                      ref={panelScreenPreviewRef}
                      muted
                      playsInline
                      autoPlay
                      className="aspect-video w-full object-contain"
                    />
                  </div>
                )}

                {snapshot.screenShareError && (
                  <p className="mt-2.5 text-xs text-amber-200">
                    {snapshot.screenShareError}
                  </p>
                )}
              </section>

              {/* Explicit User Confirmation Bar */}
              {pendingConfirm && (
                <section
                  role="alertdialog"
                  aria-label="Confirm laptop action"
                  className="rounded-2xl border border-cyan-400/40 bg-cyan-950/30 p-4"
                >
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold tracking-wider text-cyan-200 uppercase">
                        Confirm Laptop Action
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-100">
                        {pendingConfirm.description}
                      </p>
                      <code className="font-mono-tabular mt-2 block overflow-x-auto rounded-lg bg-[#06070B]/90 px-2.5 py-1.5 text-[11px] text-slate-300">
                        {JSON.stringify({
                          action: pendingConfirm.action,
                          payload: pendingConfirm.payload,
                        })}
                      </code>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={snapshot.laptopActionBusy}
                      onClick={() => void handleConfirmAndRun()}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-cyan-400/45 bg-cyan-500/20 px-4 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/30 disabled:opacity-50 whitespace-nowrap"
                    >
                      {snapshot.laptopActionBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      <span>Confirm & Run</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingConfirm(null)}
                      className="inline-flex min-h-[44px] items-center rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.08] whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  </div>
                </section>
              )}

              {/* Action Execution Feedback (only reports success on {"ok": true}) */}
              {snapshot.laptopActionFeedback && (
                <div
                  role="status"
                  className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                    snapshot.laptopActionFeedback.ok
                      ? 'border-emerald-500/35 bg-emerald-950/30 text-emerald-100'
                      : 'border-rose-500/35 bg-rose-950/30 text-rose-100'
                  }`}
                >
                  <p className="leading-relaxed break-words">
                    {snapshot.laptopActionFeedback.message}
                  </p>
                  <button
                    type="button"
                    onClick={() => assistant.clearLaptopActionFeedback()}
                    aria-label="Dismiss action result"
                    className="flex min-h-[28px] min-w-[28px] shrink-0 items-center justify-center rounded-lg opacity-75 hover:bg-white/10 hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Explicit Laptop Controls (System Info, Open App, Open URL, Media) */}
              <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Laptop Controls
                </p>

                {/* System Info */}
                <div className="rounded-xl border border-white/10 bg-[#06070B]/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-cyan-300" />
                      <span className="text-xs font-medium text-white">
                        System Information
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={snapshot.laptopActionBusy}
                      onClick={requestSystemInfoConfirm}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 text-xs font-medium text-slate-100 transition-colors hover:bg-white/[0.12] disabled:opacity-50 whitespace-nowrap"
                    >
                      <span>Fetch Info</span>
                    </button>
                  </div>

                  {snapshot.laptopSystemInfo && (
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-white/10 pt-2.5 text-xs">
                      <div>
                        <dt className="text-[11px] text-slate-500">Hostname</dt>
                        <dd className="font-mono-tabular truncate text-slate-200">
                          {snapshot.laptopSystemInfo.hostname}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">OS / Version</dt>
                        <dd className="font-mono-tabular truncate text-slate-200">
                          {snapshot.laptopSystemInfo.platform}{' '}
                          {snapshot.laptopSystemInfo.release}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">CPU Count</dt>
                        <dd className="font-mono-tabular text-slate-200">
                          {snapshot.laptopSystemInfo.cpuCount} cores (
                          {snapshot.laptopSystemInfo.arch})
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">Memory (Free / Total)</dt>
                        <dd className="font-mono-tabular text-slate-200">
                          {snapshot.laptopSystemInfo.freeRamGb} /{' '}
                          {snapshot.laptopSystemInfo.totalRamGb} GB
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>

                {/* Open Application */}
                <div className="rounded-xl border border-white/10 bg-[#06070B]/60 p-3">
                  <label
                    htmlFor="myra-laptop-app-input"
                    className="block text-xs font-medium text-white"
                  >
                    Open Application
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      id="myra-laptop-app-input"
                      type="text"
                      value={appNameInput}
                      onChange={(e) => setAppNameInput(e.target.value)}
                      placeholder="notepad, chrome, vscode..."
                      className="min-h-[42px] w-full min-w-0 rounded-lg border border-white/15 bg-[#0B0E15] px-3 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={snapshot.laptopActionBusy || !appNameInput.trim()}
                      onClick={requestOpenAppConfirm}
                      className="min-h-[42px] shrink-0 rounded-lg border border-white/15 bg-white/[0.06] px-3.5 text-xs font-medium text-slate-100 transition-colors hover:bg-white/[0.12] disabled:opacity-50 whitespace-nowrap"
                    >
                      Open App
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['notepad', 'chrome', 'vscode', 'calculator', 'terminal'].map(
                      (preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAppNameInput(preset)}
                          className="min-h-[30px] rounded-md border border-white/10 bg-white/[0.03] px-2 text-[11px] text-slate-300 transition-colors hover:border-white/25 hover:text-white"
                        >
                          {preset}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Open URL */}
                <div className="rounded-xl border border-white/10 bg-[#06070B]/60 p-3">
                  <label
                    htmlFor="myra-laptop-url-input"
                    className="block text-xs font-medium text-white"
                  >
                    Open URL in Laptop Browser
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      id="myra-laptop-url-input"
                      type="url"
                      value={openUrlInput}
                      onChange={(e) => setOpenUrlInput(e.target.value)}
                      placeholder="https://google.com"
                      className="min-h-[42px] w-full min-w-0 rounded-lg border border-white/15 bg-[#0B0E15] px-3 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={snapshot.laptopActionBusy || !openUrlInput.trim()}
                      onClick={requestOpenUrlConfirm}
                      className="min-h-[42px] shrink-0 rounded-lg border border-white/15 bg-white/[0.06] px-3.5 text-xs font-medium text-slate-100 transition-colors hover:bg-white/[0.12] disabled:opacity-50 whitespace-nowrap"
                    >
                      Open URL
                    </button>
                  </div>
                </div>

                {/* YouTube & WhatsApp Quick Launch */}
                <div className="rounded-xl border border-white/10 bg-[#06070B]/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-white">
                      YouTube & WhatsApp (wa.me)
                    </span>
                    <button
                      type="button"
                      disabled={snapshot.laptopActionBusy}
                      onClick={requestOpenYouTubeConfirm}
                      className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-rose-400/35 bg-rose-500/15 px-3 text-xs font-medium text-rose-100 transition-colors hover:bg-rose-500/25 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Open YouTube</span>
                    </button>
                  </div>

                  <div className="mt-3 space-y-2 border-t border-white/10 pt-2.5">
                    <label
                      htmlFor="myra-wa-phone-input"
                      className="block text-[11px] font-medium text-slate-300"
                    >
                      WhatsApp Click-to-Chat (Review & Send manually)
                    </label>
                    <input
                      id="myra-wa-phone-input"
                      type="tel"
                      value={whatsappPhoneInput}
                      onChange={(e) => {
                        setWhatsappPhoneInput(e.target.value);
                        if (whatsappValidationError) {
                          setWhatsappValidationError(null);
                        }
                      }}
                      placeholder="Phone with country code, e.g. 919876543210"
                      className="min-h-[40px] w-full rounded-lg border border-white/15 bg-[#0B0E15] px-3 text-xs text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
                    />
                    <textarea
                      id="myra-wa-message-input"
                      rows={2}
                      value={whatsappMessageInput}
                      onChange={(e) => {
                        setWhatsappMessageInput(e.target.value);
                        if (whatsappValidationError) {
                          setWhatsappValidationError(null);
                        }
                      }}
                      placeholder="Message to review and open in WhatsApp..."
                      className="w-full rounded-lg border border-white/15 bg-[#0B0E15] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
                    />
                    {whatsappValidationError && (
                      <p className="text-[11px] text-rose-300">
                        {whatsappValidationError}
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={snapshot.laptopActionBusy}
                      onClick={requestWhatsAppConfirm}
                      className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-emerald-400/35 bg-emerald-500/15 px-3 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>Open in WhatsApp (wa.me)</span>
                    </button>
                  </div>
                </div>

                {/* Media Controls */}
                <div className="rounded-xl border border-white/10 bg-[#06070B]/60 p-3">
                  <p className="text-xs font-medium text-white">Media Controls</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => requestMediaConfirm('play_pause', 'Play / Pause')}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-slate-200 transition-colors hover:bg-white/[0.1]"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Play/Pause</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => requestMediaConfirm('volume_down', 'Volume Down')}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-slate-200 transition-colors hover:bg-white/[0.1]"
                    >
                      <Volume1 className="h-3.5 w-3.5" />
                      <span>Vol -</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => requestMediaConfirm('volume_up', 'Volume Up')}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-slate-200 transition-colors hover:bg-white/[0.1]"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      <span>Vol +</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => requestMediaConfirm('mute', 'Mute Toggle')}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-slate-200 transition-colors hover:bg-white/[0.1]"
                    >
                      <VolumeX className="h-3.5 w-3.5" />
                      <span>Mute</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => requestMediaConfirm('prev_track', 'Previous Track')}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-slate-200 transition-colors hover:bg-white/[0.1]"
                    >
                      <SkipBack className="h-3.5 w-3.5" />
                      <span>Prev</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => requestMediaConfirm('next_track', 'Next Track')}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-slate-200 transition-colors hover:bg-white/[0.1]"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                      <span>Next</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* Live Action Cards */}
              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                    Active Voice Actions
                  </p>
                  {snapshot.actionCards.length > 0 && (
                    <button
                      type="button"
                      onClick={() => assistant.clearActionCards()}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-white whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Clear all</span>
                    </button>
                  )}
                </div>

                {snapshot.actionCards.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-500">
                    Ask MYRA to play a song matching your mood on YouTube,
                    prepare a WhatsApp or SMS message, search the web, or queue a
                    laptop action for approval.
                  </div>
                ) : (
                  snapshot.actionCards.map((card, cardIdx) => {
                    const isFirstYoutube =
                      card.kind === 'youtube' &&
                      Boolean(card.embedVideoId) &&
                      snapshot.actionCards.findIndex(
                        (c) => c.kind === 'youtube' && Boolean(c.embedVideoId)
                      ) === cardIdx;

                    return (
                      <div
                        key={card.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2.5">
                            {card.kind === 'youtube' ? (
                              <Play className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                            ) : card.kind === 'whatsapp' ? (
                              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                            ) : card.kind === 'sms' ? (
                              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                            ) : card.kind === 'search' ? (
                              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                            ) : (
                              <Laptop className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                            )}
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-medium text-white">
                                {card.title}
                              </h3>
                              {(card.mood || card.subtitle) && (
                                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                                  {card.mood && (
                                    <span className={`font-medium capitalize ${activeMood.accentText}`}>
                                      {card.mood} vibe
                                      {card.subtitle ? ' · ' : ''}
                                    </span>
                                  )}
                                  {card.subtitle}
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => assistant.dismissActionCard(card.id)}
                            aria-label="Dismiss card"
                            className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {card.pendingLaptopAction && (
                          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-cyan-400/25 bg-cyan-950/20 p-3">
                            <p className="text-xs text-cyan-100">
                              {card.pendingLaptopAction.description}
                            </p>
                            {card.actionError && (
                              <p className="text-xs text-rose-300">
                                {card.actionError}
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={snapshot.laptopActionBusy}
                                onClick={() =>
                                  void assistant.runConfirmedLaptopAction(
                                    card.pendingLaptopAction!.action,
                                    card.pendingLaptopAction!.payload,
                                    card.id
                                  )
                                }
                                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/30 disabled:opacity-50 whitespace-nowrap"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>Confirm & Run</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => assistant.dismissActionCard(card.id)}
                                className="inline-flex min-h-[40px] items-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-slate-300 transition-colors hover:bg-white/[0.08] whitespace-nowrap"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {card.kind === 'youtube' && card.embedVideoId && (
                          <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black aspect-video">
                            <iframe
                              ref={isFirstYoutube ? youtubeIframeRef : undefined}
                              src={`https://www.youtube.com/embed/${card.embedVideoId}?autoplay=${
                                card.autoPlayEmbed !== false ? 1 : 0
                              }&enablejsapi=1`}
                              title={card.title}
                              allow="autoplay; encrypted-media; picture-in-picture"
                              allowFullScreen
                              className="h-full w-full"
                            />
                          </div>
                        )}

                        {card.kind === 'whatsapp' && card.whatsappMessage && (
                          <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3 text-xs text-slate-200">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-emerald-300">
                                To: {card.whatsappContact}
                              </p>
                              {card.autoCopied && (
                                <span className="text-[11px] text-emerald-400/80">
                                  Copied
                                </span>
                              )}
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-black/25 p-2 text-slate-100">
                              {card.whatsappMessage}
                            </p>
                            {card.url && (
                              <p className="mt-1.5 truncate font-mono text-[11px] text-slate-400">
                                {card.url}
                              </p>
                            )}
                            <p className="mt-2 text-[11px] text-amber-200/90">
                              Draft for review — press Send manually in WhatsApp.
                            </p>
                          </div>
                        )}

                        {!card.pendingLaptopAction && card.actionCompleted && (
                          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
                            <Check className="h-3.5 w-3.5 shrink-0" />
                            <span>Local agent confirmed (ok: true)</span>
                          </p>
                        )}

                        {!card.pendingLaptopAction && card.actionError && (
                          <p className="mt-2.5 flex items-start gap-1.5 text-[11px] text-rose-300">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{card.actionError}</span>
                          </p>
                        )}

                        {card.kind === 'sms' && card.smsMessage && (
                          <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-950/20 p-3 text-xs text-slate-200">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-sky-300">
                                To: {card.smsContact}
                              </p>
                              {card.autoCopied && (
                                <span className="text-[11px] text-sky-400/80">
                                  Copied
                                </span>
                              )}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-slate-200">
                              {card.smsMessage}
                            </p>
                          </div>
                        )}

                        {card.sources && card.sources.length > 0 && (
                          <div className="mt-3 flex flex-col gap-1.5">
                            {card.sources.slice(0, 3).map((src, idx) => (
                              <a
                                key={`${src.uri}-${idx}`}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2 text-xs text-slate-300 transition-colors hover:border-white/15 hover:text-white"
                              >
                                <span className="truncate">{src.title}</span>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              </a>
                            ))}
                          </div>
                        )}

                        {card.url && (
                          <div className="mt-3">
                            <a
                              href={card.url}
                              target={card.kind === 'sms' ? undefined : '_blank'}
                              rel={
                                card.kind === 'sms'
                                  ? undefined
                                  : 'noopener noreferrer'
                              }
                              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3.5 text-xs font-medium transition-colors whitespace-nowrap ${
                                card.kind === 'whatsapp'
                                  ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                                  : card.kind === 'sms'
                                    ? 'border-sky-400/35 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
                                    : 'border-white/15 bg-white/[0.05] text-slate-200 hover:bg-white/[0.1]'
                              }`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span>
                                {card.kind === 'whatsapp'
                                  ? 'Open WhatsApp to Send'
                                  : card.kind === 'sms'
                                    ? 'Open Messages App'
                                    : card.kind === 'youtube'
                                      ? 'Open on YouTube'
                                      : card.kind === 'search'
                                        ? 'Open Google Search'
                                        : 'Open in Browser'}
                              </span>
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </section>
            </div>
          </aside>
        </div>
      )}

      {historyPanelOpen && (
        <ConversationLog
          entries={snapshot.conversationHistory}
          accentTextClass={activeMood.accentText}
          onClose={() => setHistoryPanelOpen(false)}
          onClearHistory={() => assistant.clearConversationHistory()}
          onDeleteEntry={(id) => assistant.deleteConversationEntry(id)}
        />
      )}

      {settingsMenuOpen && (
        <SettingsMenu
          settings={snapshot.personalitySettings}
          isLive={isLive}
          accentTextClass={activeMood.accentText}
          onChange={(partial) => assistant.setPersonalitySettings(partial)}
          onReset={() => assistant.resetPersonalitySettings()}
          onClose={() => setSettingsMenuOpen(false)}
        />
      )}
    </div>
  );
}

