import * as Tone from 'tone';
import { SpiralEvent } from '../types/altar';

class AltarAudioEngine {
  private isInitialized = false;
  private isMuted = false;
  
  // Synthesizers
  private bellSynth: Tone.PolySynth | null = null;
  private plucker: Tone.PluckSynth | null = null;
  private padSynth: Tone.PolySynth | null = null;
  private waterNoise: Tone.NoiseSynth | null = null;
  private reverb: Tone.Reverb | null = null;
  private delay: Tone.FeedbackDelay | null = null;

  public async init() {
    if (this.isInitialized) return;
    
    await Tone.start();
    
    // Ambient spatial reverb
    this.reverb = new Tone.Reverb({
      decay: 5,
      preDelay: 0.1,
      wet: 0.45
    }).toDestination();
    await this.reverb.generate();

    this.delay = new Tone.FeedbackDelay({
      delayTime: '8n.',
      feedback: 0.25,
      wet: 0.2
    }).connect(this.reverb);

    // High crystalline chime / bell synth
    this.bellSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3.01,
      modulationIndex: 8,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 2.5, sustain: 0.1, release: 3.0 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.01, decay: 1.2, sustain: 0, release: 1.2 }
    }).connect(this.delay);
    this.bellSynth.volume.value = -10;

    // Guqin / bronze resonance pluck
    this.plucker = new Tone.PluckSynth({
      attackNoise: 1.2,
      dampening: 3500,
      resonance: 0.92
    }).connect(this.delay);
    this.plucker.volume.value = -8;

    // Warm deep modal pad
    this.padSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle8' },
      envelope: { attack: 0.8, decay: 1.5, sustain: 0.6, release: 4.0 }
    }).connect(this.reverb);
    this.padSynth.volume.value = -16;

    // Water ripple subtle noise
    this.waterNoise = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0 }
    }).connect(this.reverb);
    this.waterNoise.volume.value = -24;

    this.isInitialized = true;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    Tone.getDestination().mute = muted;
  }

  public getMuted() {
    return this.isMuted;
  }

  public triggerSeatEvent(event: SpiralEvent) {
    if (!this.isInitialized || this.isMuted) return;

    const noteName = event.midi_note_name;
    const isFinale = event.is_finale;
    const now = Tone.now();

    // 1. Water drop noise
    this.waterNoise?.triggerAttack(now);

    // 2. Chime / Bell note
    if (this.bellSynth) {
      const duration = isFinale ? '2n' : '8n';
      this.bellSynth.triggerAttackRelease(noteName, duration, now + 0.02, event.midi_velocity / 127);
    }

    // 3. Bronze / Guqin Pluck resonance
    if (this.plucker) {
      this.plucker.triggerAttack(noteName, now + 0.05);
    }

    // 4. Pad chord underpinning every tier shift or special harmonic marker
    if (this.padSynth && (event.seat_id % 7 === 1 || isFinale)) {
      if (isFinale) {
        // Finale Grand Pentatonic Cadence (C - G - D - A - C)
        this.padSynth.triggerAttackRelease(['C3', 'G3', 'D4', 'E4', 'G4', 'C5'], '1n', now + 0.1);
      } else {
        const rootOctave = Math.max(2, Math.floor(event.midi_note / 12) - 2);
        this.padSynth.triggerAttackRelease([`C${rootOctave}`, `G${rootOctave}`, `D${rootOctave + 1}`], '2n', now + 0.1);
      }
    }
  }

  public triggerFountainPulse() {
    if (!this.isInitialized || this.isMuted) return;
    const now = Tone.now();
    this.padSynth?.triggerAttackRelease(['D2', 'A2', 'E3'], '2n', now);
    this.waterNoise?.triggerAttack(now);
  }
}

export const altarAudio = new AltarAudioEngine();
