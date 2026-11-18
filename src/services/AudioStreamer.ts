export type PlaybackStateCallback = (isPlaying: boolean) => void;
export type PcmChunkCallback = (base64Pcm: string) => void;

const TARGET_INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

const WORKLET_PROCESSOR_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(1024);
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._offset++] = channel[i];
      if (this._offset >= this._buffer.length) {
        this.port.postMessage(this._buffer.slice(0, this._offset));
        this._offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
`;

function downsampleFloat32(
  input: Float32Array,
  inputRate: number,
  outputRate: number
): Float32Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = input[idx] ?? 0;
    const s1 = input[Math.min(idx + 1, input.length - 1)] ?? s0;
    result[i] = s0 + (s1 - s0) * frac;
  }
  return result;
}

function float32ToBase64Pcm16(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(i * 2, int16, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToFloat32Pcm24(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 / 32768;
  }
  return float32;
}

export class AudioStreamer {
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private zeroGain: GainNode | null = null;

  private activeSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private isPlaying = false;
  private isMuted = false;
  private workletUrl: string | null = null;

  private onChunkCallback: PcmChunkCallback | null = null;
  private onPlaybackChangeCallback: PlaybackStateCallback | null = null;

  setCallbacks(
    onChunk: PcmChunkCallback,
    onPlaybackChange: PlaybackStateCallback
  ): void {
    this.onChunkCallback = onChunk;
    this.onPlaybackChangeCallback = onPlaybackChange;
  }

  private createAudioContext(sampleRate: number): AudioContext {
    try {
      return new AudioContext({ sampleRate });
    } catch {
      return new AudioContext();
    }
  }

  async prepareContexts(): Promise<void> {
    if (!this.outputCtx || this.outputCtx.state === 'closed') {
      this.outputCtx = this.createAudioContext(OUTPUT_SAMPLE_RATE);
    }
    if (this.outputCtx.state === 'suspended') {
      await this.outputCtx.resume();
    }

    if (!this.outputAnalyser) {
      this.outputAnalyser = this.outputCtx.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputAnalyser.smoothingTimeConstant = 0.72;
      this.outputAnalyser.connect(this.outputCtx.destination);
    }

    if (!this.inputCtx || this.inputCtx.state === 'closed') {
      this.inputCtx = this.createAudioContext(TARGET_INPUT_SAMPLE_RATE);
    }
    if (this.inputCtx.state === 'suspended') {
      await this.inputCtx.resume();
    }
  }

  async startMicrophone(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported in this browser.');
    }

    await this.prepareContexts();

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    if (!this.inputCtx) return;

    if (this.inputCtx.state === 'suspended') {
      await this.inputCtx.resume();
    }
    if (this.outputCtx && this.outputCtx.state === 'suspended') {
      await this.outputCtx.resume();
    }

    this.micSource = this.inputCtx.createMediaStreamSource(this.mediaStream);
    this.inputAnalyser = this.inputCtx.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputAnalyser.smoothingTimeConstant = 0.75;

    this.zeroGain = this.inputCtx.createGain();
    this.zeroGain.gain.value = 0;

    this.micSource.connect(this.inputAnalyser);

    const handleFloatSamples = (rawSamples: Float32Array) => {
      if (this.isMuted || !this.inputCtx || !this.onChunkCallback) return;
      const resampled = downsampleFloat32(
        rawSamples,
        this.inputCtx.sampleRate,
        TARGET_INPUT_SAMPLE_RATE
      );
      const base64 = float32ToBase64Pcm16(resampled);
      this.onChunkCallback(base64);
    };

    let workletReady = false;
    if (this.inputCtx.audioWorklet) {
      try {
        const blob = new Blob([WORKLET_PROCESSOR_CODE], {
          type: 'application/javascript',
        });
        this.workletUrl = URL.createObjectURL(blob);
        await this.inputCtx.audioWorklet.addModule(this.workletUrl);
        this.workletNode = new AudioWorkletNode(
          this.inputCtx,
          'pcm-capture-processor'
        );
        this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
          handleFloatSamples(event.data);
        };
        this.micSource.connect(this.workletNode);
        this.workletNode.connect(this.zeroGain);
        this.zeroGain.connect(this.inputCtx.destination);
        workletReady = true;
      } catch {
        workletReady = false;
      }
    }

    if (!workletReady) {
      this.scriptProcessor = this.inputCtx.createScriptProcessor(2048, 1, 1);
      this.scriptProcessor.onaudioprocess = (e) => {
        const channel = e.inputBuffer.getChannelData(0);
        handleFloatSamples(new Float32Array(channel));
      };
      this.micSource.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.zeroGain);
      this.zeroGain.connect(this.inputCtx.destination);
    }
  }

  enqueueOutputAudio(base64Pcm: string): void {
    if (!this.outputCtx || !this.outputAnalyser) return;
    if (this.outputCtx.state === 'suspended') {
      void this.outputCtx.resume();
    }

    const samples = base64ToFloat32Pcm24(base64Pcm);
    if (samples.length === 0) return;

    const buffer = this.outputCtx.createBuffer(
      1,
      samples.length,
      OUTPUT_SAMPLE_RATE
    );
    buffer.copyToChannel(new Float32Array(samples), 0);

    const source = this.outputCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputAnalyser);

    const now = this.outputCtx.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now + 0.02;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    this.activeSources.add(source);
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.onPlaybackChangeCallback?.(true);
    }

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0 && this.isPlaying) {
        this.isPlaying = false;
        this.onPlaybackChangeCallback?.(false);
      }
    };
  }

  interruptPlayback(): void {
    for (const source of this.activeSources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // Source may already be stopped
      }
    }
    this.activeSources.clear();
    this.nextStartTime = 0;
    if (this.isPlaying) {
      this.isPlaying = false;
      this.onPlaybackChangeCallback?.(false);
    }
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  hasActivePlayback(): boolean {
    return this.activeSources.size > 0;
  }

  getInputMetrics(bins?: Uint8Array<ArrayBuffer>): number {
    if (this.isMuted || !this.inputAnalyser) {
      if (bins) bins.fill(0);
      return 0;
    }
    const target = bins ?? new Uint8Array(this.inputAnalyser.frequencyBinCount);
    this.inputAnalyser.getByteFrequencyData(target);
    let sum = 0;
    const limit = Math.min(target.length, 48);
    for (let i = 0; i < limit; i++) {
      sum += target[i];
    }
    return Math.min(1, sum / (limit * 140));
  }

  getOutputMetrics(bins?: Uint8Array<ArrayBuffer>): number {
    if (!this.outputAnalyser || !this.isPlaying) {
      if (bins) bins.fill(0);
      return 0;
    }
    const target = bins ?? new Uint8Array(this.outputAnalyser.frequencyBinCount);
    this.outputAnalyser.getByteFrequencyData(target);
    let sum = 0;
    const limit = Math.min(target.length, 48);
    for (let i = 0; i < limit; i++) {
      sum += target[i];
    }
    return Math.min(1, sum / (limit * 130));
  }

  playChime(kind: 'connect' | 'disconnect' | 'timer' | 'action'): void {
    const ctx = this.outputCtx;
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const playTone = (freq: number, start: number, duration: number, gainPeak: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    };

    if (kind === 'connect') {
      playTone(523.25, now, 0.16, 0.06);
      playTone(659.25, now + 0.08, 0.22, 0.07);
    } else if (kind === 'disconnect') {
      playTone(587.33, now, 0.14, 0.05);
      playTone(392.0, now + 0.08, 0.2, 0.05);
    } else if (kind === 'timer') {
      playTone(880, now, 0.18, 0.08);
      playTone(1046.5, now + 0.18, 0.24, 0.09);
      playTone(880, now + 0.44, 0.2, 0.08);
    } else {
      playTone(740, now, 0.12, 0.04);
    }
  }

  async stop(): Promise<void> {
    this.interruptPlayback();

    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {
        // Ignore cleanup errors
      }
      this.workletNode = null;
    }

    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
      this.workletUrl = null;
    }

    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.onaudioprocess = null;
        this.scriptProcessor.disconnect();
      } catch {
        // Ignore cleanup errors
      }
      this.scriptProcessor = null;
    }

    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        // Ignore cleanup errors
      }
      this.micSource = null;
    }

    if (this.zeroGain) {
      try {
        this.zeroGain.disconnect();
      } catch {
        // Ignore cleanup errors
      }
      this.zeroGain = null;
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    if (this.inputCtx && this.inputCtx.state !== 'closed') {
      await this.inputCtx.close().catch(() => {});
    }
    this.inputCtx = null;
    this.inputAnalyser = null;

    if (this.outputCtx && this.outputCtx.state !== 'closed') {
      await this.outputCtx.close().catch(() => {});
    }
    this.outputCtx = null;
    this.outputAnalyser = null;
    this.isMuted = false;
  }
}
