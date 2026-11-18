import { useEffect } from 'react';
import { RotateCcw, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { PersonalitySettings } from '../types/assistant';

interface SettingsMenuProps {
  settings: PersonalitySettings;
  isLive: boolean;
  accentTextClass: string;
  onChange: (partial: Partial<PersonalitySettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

const DEFAULT_WITTINESS = 72;
const DEFAULT_CONFIDENCE = 78;

function getWittinessDescriptor(value: number): {
  title: string;
  summary: string;
} {
  if (value < 25) {
    return {
      title: 'Earnest & Direct',
      summary: 'Minimal banter — warm, clear, and focused straight on your request.',
    };
  }
  if (value < 55) {
    return {
      title: 'Lightly Playful',
      summary: 'Approachable and conversational with subtle, well-timed humor.',
    };
  }
  if (value < 80) {
    return {
      title: 'Quick-Witted',
      summary: 'Clever banter, dry punchlines, and natural repartee on the fly.',
    };
  }
  return {
    title: 'Razor-Sharp & Sassy',
    summary: 'Teasing, rapid-fire comebacks and unapologetic playful charm.',
  };
}

function getConfidenceDescriptor(value: number): {
  title: string;
  summary: string;
} {
  if (value < 25) {
    return {
      title: 'Gentle & Tentative',
      summary: 'Soft-spoken, deferential, and careful to double-check preferences.',
    };
  }
  if (value < 55) {
    return {
      title: 'Relaxed & Warm',
      summary: 'Calm, encouraging, and collaborative without taking over.',
    };
  }
  if (value < 80) {
    return {
      title: 'Assured & Poised',
      summary: 'Decisive, composed, and ready with clear recommendations.',
    };
  }
  return {
    title: 'Bold & Unapologetic',
    summary: 'Commanding presence, direct takes, and strong conviction.',
  };
}

export function SettingsMenu({
  settings,
  isLive,
  accentTextClass,
  onChange,
  onReset,
  onClose,
}: SettingsMenuProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const wittinessMeta = getWittinessDescriptor(settings.wittiness);
  const confidenceMeta = getConfidenceDescriptor(settings.confidence);
  const isDefault =
    settings.wittiness === DEFAULT_WITTINESS &&
    settings.confidence === DEFAULT_CONFIDENCE;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/55 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="MYRA personality settings"
        className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0A0D14]/95 shadow-2xl backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal
                className={`h-4 w-4 shrink-0 ${accentTextClass}`}
              />
              <h2 className="text-sm font-semibold text-white">
                MYRA Settings
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Personality tuning · Saved locally
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings menu"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="myra-wittiness-slider"
                className="text-sm font-medium text-white"
              >
                Wittiness
              </label>
              <span
                className={`font-mono-tabular text-sm font-semibold ${accentTextClass}`}
              >
                {settings.wittiness}%
              </span>
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-slate-200">
                {wittinessMeta.title}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {wittinessMeta.summary}
            </p>

            <div className="mt-4">
              <input
                id="myra-wittiness-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={settings.wittiness}
                aria-label="MYRA wittiness level"
                aria-valuetext={`${settings.wittiness}% — ${wittinessMeta.title}`}
                onChange={(e) =>
                  onChange({ wittiness: Number(e.target.value) })
                }
                style={{
                  background: `linear-gradient(to right, rgba(34,211,238,0.85) 0%, rgba(34,211,238,0.85) ${settings.wittiness}%, rgba(255,255,255,0.12) ${settings.wittiness}%, rgba(255,255,255,0.12) 100%)`,
                }}
                className="h-2 w-full cursor-pointer appearance-none rounded-full accent-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0D14]"
              />
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>Straightforward</span>
                <span>Balanced</span>
                <span>Sharp &amp; Sassy</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="myra-confidence-slider"
                className="text-sm font-medium text-white"
              >
                Confidence
              </label>
              <span
                className={`font-mono-tabular text-sm font-semibold ${accentTextClass}`}
              >
                {settings.confidence}%
              </span>
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-slate-200">
                {confidenceMeta.title}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {confidenceMeta.summary}
            </p>

            <div className="mt-4">
              <input
                id="myra-confidence-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={settings.confidence}
                aria-label="MYRA confidence level"
                aria-valuetext={`${settings.confidence}% — ${confidenceMeta.title}`}
                onChange={(e) =>
                  onChange({ confidence: Number(e.target.value) })
                }
                style={{
                  background: `linear-gradient(to right, rgba(34,211,238,0.85) 0%, rgba(34,211,238,0.85) ${settings.confidence}%, rgba(255,255,255,0.12) ${settings.confidence}%, rgba(255,255,255,0.12) 100%)`,
                }}
                className="h-2 w-full cursor-pointer appearance-none rounded-full accent-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0D14]"
              />
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>Gentle</span>
                <span>Steady</span>
                <span>Bold</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-slate-400">
            <div className="flex items-start gap-2.5">
              <Sparkles
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${accentTextClass}`}
              />
              <p>
                {isLive
                  ? 'Live calibration active — changes adjust MYRA’s tone and delivery immediately during your voice session.'
                  : 'Your tuning is saved and will shape MYRA’s voice personality as soon as you connect.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onReset}
            disabled={isDefault}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset to defaults</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-4 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            Done
          </button>
        </div>
      </aside>
    </div>
  );
}
