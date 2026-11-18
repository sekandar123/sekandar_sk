import { useEffect, useRef } from 'react';
import type { MyraAssistant } from '../services/MyraAssistant';
import type { AmbientMood, AssistantState } from '../types/assistant';

interface AudioVisualizerProps {
  assistant: MyraAssistant;
  state: AssistantState;
  mood: AmbientMood;
  isMuted: boolean;
}

const MOOD_PALETTES: Record<
  AmbientMood,
  { primary: string; secondary: string; glow: string }
> = {
  cyan: {
    primary: '34, 211, 238',
    secondary: '129, 140, 248',
    glow: '6, 182, 212',
  },
  violet: {
    primary: '167, 139, 250',
    secondary: '232, 121, 249',
    glow: '139, 92, 246',
  },
  rose: {
    primary: '251, 113, 133',
    secondary: '244, 114, 182',
    glow: '244, 63, 94',
  },
  emerald: {
    primary: '52, 211, 153',
    secondary: '45, 212, 191',
    glow: '16, 185, 129',
  },
  amber: {
    primary: '251, 191, 36',
    secondary: '251, 146, 60',
    glow: '245, 158, 11',
  },
};

export function AudioVisualizer({
  assistant,
  state,
  mood,
  isMuted,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const moodRef = useRef(mood);
  const mutedRef = useRef(isMuted);

  stateRef.current = state;
  moodRef.current = mood;
  mutedRef.current = isMuted;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const inputBins = new Uint8Array(128);
    const outputBins = new Uint8Array(128);
    const smoothedBars = new Float32Array(64);
    let smoothedEnergy = 0;
    let phase = 0;
    let animationId = 0;

    let width = 360;
    let height = 360;

    const updateCanvasSize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(240, rect.width);
      height = Math.max(240, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    updateCanvasSize();
    const observer = new ResizeObserver(updateCanvasSize);
    if (canvas.parentElement) {
      observer.observe(canvas.parentElement);
    }

    const renderFrame = () => {
      const metrics = assistant.getVisualizerMetrics(inputBins, outputBins);
      const activeState = stateRef.current;
      const palette = MOOD_PALETTES[moodRef.current];
      const muted = mutedRef.current;

      const targetEnergy =
        activeState === 'speaking'
          ? metrics.outputEnergy
          : activeState === 'listening'
            ? muted
              ? 0
              : metrics.inputEnergy
            : 0;

      const tempo = metrics.emotionProfile.tempoMultiplier;
      const turbulence = metrics.emotionProfile.turbulence;
      const pulseAmp = metrics.emotionProfile.pulseAmplitude;

      smoothedEnergy += (targetEnergy - smoothedEnergy) * 0.18;
      phase += prefersReducedMotion
        ? 0.005
        : (activeState === 'speaking'
            ? 0.042 + smoothedEnergy * 0.05
            : activeState === 'connecting' || activeState === 'disconnecting'
              ? 0.06
              : 0.018) * tempo;

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const minDim = Math.min(width, height);
      const coreRadius = Math.max(66, Math.min(92, minDim * 0.21));

      // Ambient radial aura behind the central core
      const auraRadius =
        coreRadius * (2.15 + smoothedEnergy * 0.65 * pulseAmp);
      const auraGrad = ctx.createRadialGradient(
        cx,
        cy,
        coreRadius * 0.5,
        cx,
        cy,
        auraRadius
      );
      const baseAlpha =
        activeState === 'idle'
          ? 0.12
          : activeState === 'speaking'
            ? 0.28 + smoothedEnergy * 0.22 * pulseAmp
            : 0.18 + smoothedEnergy * 0.18;

      auraGrad.addColorStop(0, `rgba(${palette.primary}, ${baseAlpha})`);
      auraGrad.addColorStop(
        0.55,
        `rgba(${palette.secondary}, ${baseAlpha * 0.45})`
      );
      auraGrad.addColorStop(1, 'rgba(6, 7, 11, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, auraRadius, 0, Math.PI * 2);
      ctx.fill();

      // Subtle precision orbital track rings
      ctx.strokeStyle = `rgba(${palette.primary}, ${
        activeState === 'idle' ? 0.1 : 0.18
      })`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 1.42, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(${palette.secondary}, 0.08)`;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 1.85, 0, Math.PI * 2);
      ctx.stroke();

      // Connecting / Disconnecting sweeping arcs
      if (activeState === 'connecting' || activeState === 'disconnecting') {
        ctx.save();
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const arcRadius = coreRadius * (1.22 + i * 0.2);
          const startAngle = phase * (i % 2 === 0 ? 1.4 : -1.1) + i * 2.1;
          ctx.strokeStyle = `rgba(${
            i === 1 ? palette.secondary : palette.primary
          }, ${0.72 - i * 0.18})`;
          ctx.lineWidth = 2.5 - i * 0.4;
          ctx.beginPath();
          ctx.arc(cx, cy, arcRadius, startAngle, startAngle + Math.PI * 0.65);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Listening state: pulsating acoustic rings + subtle radial voice bars
      if (activeState === 'listening') {
        const ringCount = 3;
        for (let r = 0; r < ringCount; r++) {
          const progress = ((phase * 0.35 + r / ringCount) % 1 + 1) % 1;
          const radius =
            coreRadius * (1.06 + progress * (0.78 + smoothedEnergy * 0.42));
          const alpha = (1 - progress) * (muted ? 0.14 : 0.38 + smoothedEnergy * 0.3);
          ctx.strokeStyle = `rgba(${palette.primary}, ${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (!muted) {
          const barCount = 48;
          const baseR = coreRadius * 1.15;
          ctx.lineCap = 'round';
          for (let i = 0; i < barCount; i++) {
            const binIdx = Math.floor((i / barCount) * 40);
            const rawVal = inputBins[binIdx] / 255;
            smoothedBars[i] += (rawVal - smoothedBars[i]) * 0.25;
            const barLen = 3 + smoothedBars[i] * 26;
            const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
            const x1 = cx + Math.cos(angle) * baseR;
            const y1 = cy + Math.sin(angle) * baseR;
            const x2 = cx + Math.cos(angle) * (baseR + barLen);
            const y2 = cy + Math.sin(angle) * (baseR + barLen);

            ctx.strokeStyle = `rgba(${palette.primary}, ${
              0.22 + smoothedBars[i] * 0.72
            })`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        }
      }

      // Speaking state: fluid harmonic ring waveform + dynamic inner spectrum
      if (activeState === 'speaking') {
        const barCount = 64;
        const ringBase = coreRadius * 1.18;

        // Smooth closed harmonic waveform path
        for (let layer = 0; layer < 2; layer++) {
          const layerScale = layer === 0 ? 1 : 0.65;
          const layerOffset = layer === 0 ? 0 : 0.35;
          ctx.beginPath();
          for (let i = 0; i <= barCount; i++) {
            const idx = i % barCount;
            const binIndex = Math.floor((idx / barCount) * 44);
            const target = outputBins[binIndex] / 255;
            if (layer === 0) {
              smoothedBars[idx] += (target - smoothedBars[idx]) * 0.3;
            }
            const amp = smoothedBars[idx];
            const wave =
              Math.sin(idx * 0.35 + phase * 1.8 + layerOffset) *
              (3 + smoothedEnergy * 10 * (0.6 + turbulence));
            const r = ringBase + (amp * 38 * pulseAmp + wave) * layerScale;
            const angle = (idx / barCount) * Math.PI * 2 - Math.PI / 2;
            const px = cx + Math.cos(angle) * r;
            const py = cy + Math.sin(angle) * r;
            if (i === 0) {
              ctx.moveTo(px, py);
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.closePath();
          ctx.strokeStyle =
            layer === 0
              ? `rgba(${palette.primary}, ${0.55 + smoothedEnergy * 0.4})`
              : `rgba(${palette.secondary}, ${0.35 + smoothedEnergy * 0.35})`;
          ctx.lineWidth = layer === 0 ? 2.4 : 1.5;
          ctx.stroke();
        }

        // Dynamic radial spectrum spikes
        ctx.lineCap = 'round';
        for (let i = 0; i < barCount; i++) {
          const val = smoothedBars[i];
          const len = 4 + val * 34;
          const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
          const rStart = coreRadius * 1.06;
          const x1 = cx + Math.cos(angle) * rStart;
          const y1 = cy + Math.sin(angle) * rStart;
          const x2 = cx + Math.cos(angle) * (rStart + len);
          const y2 = cy + Math.sin(angle) * (rStart + len);

          ctx.strokeStyle =
            i % 2 === 0
              ? `rgba(${palette.primary}, ${0.3 + val * 0.65})`
              : `rgba(${palette.secondary}, ${0.25 + val * 0.6})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }

      // Idle state: serene gentle breathing ring
      if (activeState === 'idle') {
        const breathe = Math.sin(phase) * 4;
        ctx.strokeStyle = `rgba(${palette.primary}, 0.28)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, coreRadius * 1.14 + breathe, 0, Math.PI * 2);
        ctx.stroke();
      }

      animationId = window.requestAnimationFrame(renderFrame);
    };

    animationId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(animationId);
      observer.disconnect();
    };
  }, [assistant]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
