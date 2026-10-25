export type AmbientAudioOptions = { enabled?: boolean; volume?: number };

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export class AmbientAudio {
  enabled: boolean;
  volume: number;
  context: AudioContext | null;
  playing: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  master!: GainNode;

  constructor({ enabled = false, volume = 0.5 }: AmbientAudioOptions = {}) {
    this.enabled = enabled; this.volume = volume; this.context = null; this.playing = false; this.timer = null;
  }

  create(): void {
    if (this.context) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const context = this.context = new Context();
    const master = this.master = context.createGain(); master.gain.value = 0;
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 520; filter.Q.value = 0.35;
    filter.connect(master); master.connect(context.destination);
    for (const [index, frequency] of [65.406, 98, 130.812, 164.814].entries()) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      oscillator.detune.value = index % 2 ? 3 : -3;
      gain.gain.value = 0.045 / (1 + index * 0.5);
      oscillator.connect(gain); gain.connect(filter); oscillator.start();
      const breath = context.createOscillator(), depth = context.createGain();
      breath.frequency.value = 0.035 + index * 0.008; depth.gain.value = 0.012 / (index + 1);
      breath.connect(depth); depth.connect(gain.gain); breath.start();
    }
  }

  async sync(playing: boolean): Promise<void> {
    this.playing = playing;
    clearTimeout(this.timer ?? undefined);
    const audible = playing && this.enabled && this.volume > 0;
    if (audible) this.create();
    const context = this.context;
    if (!context || context.state === 'closed') return;
    if (audible) {
      try { await context.resume(); } catch { return; }
    }
    const target = this.playing && this.enabled ? this.volume * 0.65 : 0;
    this.master.gain.cancelScheduledValues(context.currentTime);
    this.master.gain.setTargetAtTime(target, context.currentTime, 0.18);
    if (!audible) this.timer = setTimeout(() => {
      if (!(this.playing && this.enabled && this.volume > 0)) context.suspend().catch(() => {});
    }, 800);
  }

  settings(): { enabled: boolean; volume: number } { return { enabled: this.enabled, volume: this.volume }; }
  dispose(): Promise<void> | undefined { clearTimeout(this.timer ?? undefined); return this.context?.close().catch(() => {}); }
}
