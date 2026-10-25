/** Soft procedural ocean ambience. Off by default; starts only after the user enables sound. */

export type AudioSettings = { enabled: boolean; volume: number };

export class OceanAudio {
  enabled: boolean;
  volume: number;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private started = false;

  constructor(settings: AudioSettings = { enabled: false, volume: 0.35 }) {
    this.enabled = settings.enabled;
    this.volume = settings.volume;
  }

  settings(): AudioSettings {
    return { enabled: this.enabled, volume: this.volume };
  }

  async sync(active: boolean): Promise<void> {
    if (!this.enabled || !active) {
      if (this.master) this.master.gain.value = 0;
      return;
    }
    await this.ensure();
    if (this.master) this.master.gain.value = this.volume * 0.4;
  }

  private async ensure(): Promise<void> {
    if (this.started) {
      if (this.context?.state === 'suspended') await this.context.resume();
      return;
    }
    const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    this.context = new Context();
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);

    // Brown-ish noise through a lowpass for surf.
    const bufferSize = 2 * this.context.sampleRate;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = this.context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    filter.Q.value = 0.7;
    const surf = this.context.createGain();
    surf.gain.value = 0.55;
    noise.connect(filter);
    filter.connect(surf);
    surf.connect(this.master);

    // Soft wind tone.
    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 90;
    const oscGain = this.context.createGain();
    oscGain.gain.value = 0.03;
    osc.connect(oscGain);
    oscGain.connect(this.master);

    noise.start();
    osc.start();
    this.started = true;
    if (this.context.state === 'suspended') await this.context.resume();
  }
}
