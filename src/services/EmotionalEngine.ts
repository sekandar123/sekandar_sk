import type {
  EmotionalMemoryEntry,
  EmotionalMemorySnapshot,
  EmotionState,
} from '../types/assistant';

export const SUPPORTED_EMOTIONS: EmotionState[] = [
  'neutral',
  'happy',
  'excited',
  'playful',
  'amused',
  'curious',
  'surprised',
  'sad',
  'empathetic',
  'caring',
  'calm',
  'confident',
  'frustrated',
  'disappointed',
  'affectionate',
  'sarcastic',
  'thoughtful',
  'sleepy',
  'concerned',
];

export interface EmotionVisualProfile {
  tempoMultiplier: number;
  turbulence: number;
  pulseAmplitude: number;
  softness: number;
}

const EMOTION_VISUAL_PROFILES: Record<EmotionState, EmotionVisualProfile> = {
  neutral: { tempoMultiplier: 1.0, turbulence: 0.35, pulseAmplitude: 1.0, softness: 0.5 },
  happy: { tempoMultiplier: 1.22, turbulence: 0.52, pulseAmplitude: 1.18, softness: 0.45 },
  excited: { tempoMultiplier: 1.48, turbulence: 0.82, pulseAmplitude: 1.38, softness: 0.25 },
  playful: { tempoMultiplier: 1.28, turbulence: 0.64, pulseAmplitude: 1.22, softness: 0.4 },
  amused: { tempoMultiplier: 1.32, turbulence: 0.68, pulseAmplitude: 1.25, softness: 0.38 },
  curious: { tempoMultiplier: 1.12, turbulence: 0.48, pulseAmplitude: 1.12, softness: 0.45 },
  surprised: { tempoMultiplier: 1.4, turbulence: 0.78, pulseAmplitude: 1.32, softness: 0.28 },
  sad: { tempoMultiplier: 0.72, turbulence: 0.18, pulseAmplitude: 0.78, softness: 0.85 },
  empathetic: { tempoMultiplier: 0.82, turbulence: 0.24, pulseAmplitude: 0.9, softness: 0.82 },
  caring: { tempoMultiplier: 0.84, turbulence: 0.22, pulseAmplitude: 0.92, softness: 0.84 },
  calm: { tempoMultiplier: 0.8, turbulence: 0.2, pulseAmplitude: 0.86, softness: 0.8 },
  confident: { tempoMultiplier: 1.08, turbulence: 0.42, pulseAmplitude: 1.15, softness: 0.32 },
  frustrated: { tempoMultiplier: 1.26, turbulence: 0.75, pulseAmplitude: 1.2, softness: 0.2 },
  disappointed: { tempoMultiplier: 0.78, turbulence: 0.24, pulseAmplitude: 0.82, softness: 0.72 },
  affectionate: { tempoMultiplier: 0.9, turbulence: 0.3, pulseAmplitude: 1.04, softness: 0.78 },
  sarcastic: { tempoMultiplier: 1.05, turbulence: 0.45, pulseAmplitude: 1.06, softness: 0.3 },
  thoughtful: { tempoMultiplier: 0.85, turbulence: 0.26, pulseAmplitude: 0.9, softness: 0.68 },
  sleepy: { tempoMultiplier: 0.65, turbulence: 0.14, pulseAmplitude: 0.72, softness: 0.9 },
  concerned: { tempoMultiplier: 0.88, turbulence: 0.32, pulseAmplitude: 0.94, softness: 0.74 },
};

const STORAGE_MEMORY_KEY = 'myra_emotional_memory_v1';

export class EmotionalEngine {
  private memory: EmotionalMemorySnapshot;
  private lastUpdatedAt = Date.now();

  constructor() {
    this.memory = this.loadSessionMemory();
  }

  private loadSessionMemory(): EmotionalMemorySnapshot {
    const fallback: EmotionalMemorySnapshot = {
      currentEmotion: 'calm',
      previousEmotion: 'neutral',
      intensity: 0.45,
      userTone: 'unknown',
      preferredStyle: 'warm and witty banter',
      recentMoments: [],
      trajectory: ['calm'],
    };

    try {
      const raw = sessionStorage.getItem(STORAGE_MEMORY_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<EmotionalMemorySnapshot>;
      if (
        parsed.currentEmotion &&
        SUPPORTED_EMOTIONS.includes(parsed.currentEmotion)
      ) {
        return {
          currentEmotion: parsed.currentEmotion,
          previousEmotion:
            parsed.previousEmotion &&
            SUPPORTED_EMOTIONS.includes(parsed.previousEmotion)
              ? parsed.previousEmotion
              : 'neutral',
          intensity:
            typeof parsed.intensity === 'number'
              ? Math.max(0.1, Math.min(1, parsed.intensity))
              : 0.45,
          userTone:
            typeof parsed.userTone === 'string' && parsed.userTone
              ? parsed.userTone
              : 'unknown',
          preferredStyle:
            typeof parsed.preferredStyle === 'string' && parsed.preferredStyle
              ? parsed.preferredStyle
              : 'warm and witty banter',
          recentMoments: Array.isArray(parsed.recentMoments)
            ? parsed.recentMoments.slice(-6)
            : [],
          trajectory: Array.isArray(parsed.trajectory)
            ? parsed.trajectory.slice(-8)
            : [parsed.currentEmotion],
        };
      }
    } catch {
      // Ignore storage read issues
    }
    return fallback;
  }

  private persistSessionMemory(): void {
    try {
      sessionStorage.setItem(STORAGE_MEMORY_KEY, JSON.stringify(this.memory));
    } catch {
      // Ignore storage write issues
    }
  }

  getSnapshot(): EmotionalMemorySnapshot {
    return {
      ...this.memory,
      recentMoments: [...this.memory.recentMoments],
      trajectory: [...this.memory.trajectory],
    };
  }

  getVisualProfile(): EmotionVisualProfile {
    return EMOTION_VISUAL_PROFILES[this.memory.currentEmotion] ?? EMOTION_VISUAL_PROFILES.neutral;
  }

  applyShift(params: {
    emotion?: string;
    intensity?: number;
    userTone?: string;
    preferredStyle?: string;
    momentNote?: string;
  }): EmotionalMemorySnapshot {
    const rawEmotion = String(params.emotion ?? '').toLowerCase().trim() as EmotionState;
    const nextEmotion: EmotionState = SUPPORTED_EMOTIONS.includes(rawEmotion)
      ? rawEmotion
      : this.memory.currentEmotion;

    const nextIntensity =
      typeof params.intensity === 'number' && Number.isFinite(params.intensity)
        ? Math.max(0.1, Math.min(1, params.intensity))
        : nextEmotion === 'neutral'
          ? 0.25
          : 0.65;

    const nextTrajectory = [...this.memory.trajectory];
    if (nextTrajectory[nextTrajectory.length - 1] !== nextEmotion) {
      nextTrajectory.push(nextEmotion);
      if (nextTrajectory.length > 8) {
        nextTrajectory.shift();
      }
    }

    const userTone =
      typeof params.userTone === 'string' && params.userTone.trim()
        ? params.userTone.trim().slice(0, 48)
        : this.memory.userTone;

    const preferredStyle =
      typeof params.preferredStyle === 'string' && params.preferredStyle.trim()
        ? params.preferredStyle.trim().slice(0, 72)
        : this.memory.preferredStyle;

    const recentMoments = [...this.memory.recentMoments];
    if (typeof params.momentNote === 'string' && params.momentNote.trim()) {
      const entry: EmotionalMemoryEntry = {
        emotion: nextEmotion,
        note: params.momentNote.trim().slice(0, 140),
        userTone,
        timestamp: Date.now(),
      };
      recentMoments.push(entry);
      if (recentMoments.length > 6) {
        recentMoments.shift();
      }
    }

    this.memory = {
      currentEmotion: nextEmotion,
      previousEmotion:
        nextEmotion !== this.memory.currentEmotion
          ? this.memory.currentEmotion
          : this.memory.previousEmotion,
      intensity: nextIntensity,
      userTone,
      preferredStyle,
      recentMoments,
      trajectory: nextTrajectory,
    };
    this.lastUpdatedAt = Date.now();
    this.persistSessionMemory();
    return this.getSnapshot();
  }

  decayDuringIdle(now = Date.now()): EmotionalMemorySnapshot | null {
    const idleMs = now - this.lastUpdatedAt;
    if (idleMs < 42000) return null;

    if (
      this.memory.currentEmotion === 'calm' ||
      this.memory.currentEmotion === 'neutral' ||
      this.memory.currentEmotion === 'sleepy'
    ) {
      return null;
    }

    const nextEmotion: EmotionState =
      this.memory.intensity > 0.55 ? 'calm' : 'neutral';
    return this.applyShift({
      emotion: nextEmotion,
      intensity: 0.35,
    });
  }

  hasSessionMemory(): boolean {
    return (
      this.memory.recentMoments.length > 0 ||
      this.memory.trajectory.length > 1 ||
      this.memory.userTone !== 'unknown'
    );
  }

  buildMemorySummary(): string {
    const moments = this.memory.recentMoments
      .slice(-3)
      .map((m) => `${m.emotion}: ${m.note}`)
      .join(' | ');
    const flow = this.memory.trajectory.slice(-5).join(' -> ');
    return [
      `Current mood=${this.memory.currentEmotion} (${Math.round(this.memory.intensity * 100)}%)`,
      `Recent trajectory=${flow}`,
      `User tone=${this.memory.userTone}`,
      `Preferred style=${this.memory.preferredStyle}`,
      moments ? `Key moments=${moments}` : '',
    ]
      .filter(Boolean)
      .join('; ');
  }
}
