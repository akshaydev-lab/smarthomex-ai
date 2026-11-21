/**
 * Web Audio API Emergency Siren & Diagnostic Sound Synthesizer
 * 
 * Generates an acoustic dual-tone emergency warning siren (960Hz / 770Hz)
 * and diagnostic speaker test chimes (880Hz sine) without requiring external MP3 files.
 * Operates 100% client-side and offline.
 */

export type AudioDiagnosticStatus = 'READY' | 'PLAYING' | 'BLOCKED' | 'ERROR';

export interface AudioDiagnosticDetails {
  isSupported: boolean;
  state: AudioContextState | 'uninitialized' | 'unsupported';
  sampleRate: number | null;
  isPlayingSiren: boolean;
  isBeepPlaying: boolean;
  hasActiveContext: boolean;
  lastError: string | null;
}

class EmergencySirenService {
  private audioCtx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private intervalId: any = null;
  private stopTimeoutId: any = null;
  private isPlaying: boolean = false;
  private shouldBePlaying: boolean = false;
  private highTone: boolean = true;
  private unlockListenerAttached: boolean = false;

  // Diagnostic Test Beep Properties
  private beepOsc: OscillatorNode | null = null;
  private beepGain: GainNode | null = null;
  private beepTimeoutId: any = null;
  private isBeeping: boolean = false;
  private lastError: string | null = null;

  public initContext(): AudioContext | null {
    if (!this.audioCtx && typeof window !== 'undefined') {
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          this.audioCtx = new AudioCtxClass();
        }
      } catch (err: any) {
        this.lastError = err?.message || 'Failed to initialize AudioContext';
      }
    }
    return this.audioCtx;
  }

  private setupAutoplayUnlock() {
    if (typeof window === 'undefined' || this.unlockListenerAttached) return;
    this.unlockListenerAttached = true;

    const unlock = () => {
      this.unlockListenerAttached = false;
      if (this.audioCtx && this.audioCtx.state !== 'running') {
        this.audioCtx.resume().then(() => {
          if (this.gainNode && this.audioCtx && this.isPlaying) {
            this.gainNode.gain.setValueAtTime(0.25, this.audioCtx.currentTime);
          }
          if (this.shouldBePlaying && !this.isPlaying) {
            this.start();
          }
        }).catch((err: any) => {
          this.lastError = err?.message || 'Autoplay unlock failed';
        });
      } else if (this.shouldBePlaying && !this.isPlaying) {
        this.start();
      }
    };

    window.addEventListener('click', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('touchstart', unlock, { once: true, capture: true });
  }

  public start(): boolean {
    this.shouldBePlaying = true;
    this.lastError = null;

    if (this.stopTimeoutId) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }

    // Stop any diagnostic beep when emergency siren activates
    this.stopTestBeep();

    if (this.isPlaying) return true;

    try {
      this.initContext();
      if (!this.audioCtx) return false;

      if (this.audioCtx.state !== 'running') {
        this.audioCtx.resume().catch((err: any) => {
          this.lastError = err?.message || 'AudioContext resume error';
        });
        this.setupAutoplayUnlock();
      }

      this.oscillator = this.audioCtx.createOscillator();
      this.gainNode = this.audioCtx.createGain();

      this.oscillator.type = 'sawtooth';
      this.oscillator.frequency.setValueAtTime(960, this.audioCtx.currentTime);

      // Master volume with smooth ramp
      this.gainNode.gain.setValueAtTime(0.001, this.audioCtx.currentTime);
      this.gainNode.gain.exponentialRampToValueAtTime(0.25, this.audioCtx.currentTime + 0.1);

      this.oscillator.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      this.oscillator.start();
      this.isPlaying = true;

      // Alternate tone between 960Hz and 770Hz every 250ms (standard emergency warble)
      this.intervalId = setInterval(() => {
        if (!this.oscillator || !this.audioCtx) return;
        this.highTone = !this.highTone;
        const freq = this.highTone ? 960 : 770;
        this.oscillator.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      }, 250);

      return true;
    } catch (err: any) {
      this.lastError = err?.message || 'Failed to start siren';
      this.setupAutoplayUnlock();
      return false;
    }
  }

  public stop(): void {
    this.shouldBePlaying = false;

    if (this.stopTimeoutId) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }

    if (!this.isPlaying) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.gainNode && this.audioCtx) {
      try {
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.audioCtx.currentTime);
        this.gainNode.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.1);
      } catch {
        // ignore
      }
    }

    this.stopTimeoutId = setTimeout(() => {
      if (this.oscillator) {
        try {
          this.oscillator.stop();
          this.oscillator.disconnect();
        } catch {
          // ignore
        }
        this.oscillator = null;
      }
      this.isPlaying = false;
      this.stopTimeoutId = null;
    }, 120);
  }

  /**
   * Diagnostic Speaker Test Beep
   * Plays a clean, pleasant 880Hz sine wave chime for speaker verification.
   */
  public async playTestBeep(frequency: number = 880, durationMs: number = 500): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    this.stopTestBeep();
    this.lastError = null;

    try {
      this.initContext();
      if (!this.audioCtx) return false;

      if (this.audioCtx.state === 'suspended') {
        try {
          await this.audioCtx.resume();
        } catch (err: any) {
          this.lastError = err?.message || 'AudioContext suspended by browser autoplay policy';
          this.setupAutoplayUnlock();
          return false;
        }
      }

      const now = this.audioCtx.currentTime;
      this.beepOsc = this.audioCtx.createOscillator();
      this.beepGain = this.audioCtx.createGain();

      this.beepOsc.type = 'sine';
      this.beepOsc.frequency.setValueAtTime(frequency, now);

      // Clean chime envelope (gentle attack, sustain, smooth decay)
      this.beepGain.gain.setValueAtTime(0.001, now);
      this.beepGain.gain.exponentialRampToValueAtTime(0.20, now + 0.05);
      this.beepGain.gain.setValueAtTime(0.20, now + Math.max(0.06, (durationMs / 1000) - 0.1));
      this.beepGain.gain.exponentialRampToValueAtTime(0.0001, now + (durationMs / 1000));

      this.beepOsc.connect(this.beepGain);
      this.beepGain.connect(this.audioCtx.destination);

      this.beepOsc.start(now);
      this.isBeeping = true;

      this.beepTimeoutId = setTimeout(() => {
        this.stopTestBeep();
      }, durationMs);

      return true;
    } catch (err: any) {
      this.lastError = err?.message || 'Speaker test beep error';
      this.stopTestBeep();
      return false;
    }
  }

  public stopTestBeep(): void {
    if (this.beepTimeoutId) {
      clearTimeout(this.beepTimeoutId);
      this.beepTimeoutId = null;
    }
    if (this.beepOsc) {
      try {
        this.beepOsc.stop();
        this.beepOsc.disconnect();
      } catch {
        // ignore
      }
      this.beepOsc = null;
    }
    if (this.beepGain) {
      try {
        this.beepGain.disconnect();
      } catch {
        // ignore
      }
      this.beepGain = null;
    }
    this.isBeeping = false;
  }

  /**
   * Immediately halts all audio (both emergency siren and test chime).
   */
  public stopAll(): void {
    this.stopTestBeep();
    this.stop();
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getIsBeeping(): boolean {
    return this.isBeeping;
  }

  /**
   * Evaluates current Web Audio API status for diagnostic badge:
   * - 'READY': AudioContext is ready or currently idle in running state.
   * - 'PLAYING': Audio is actively being synthesized through oscillator & gain node.
   * - 'BLOCKED': AudioContext is suspended by browser autoplay policy (click required to unblock).
   * - 'ERROR': Web Audio API unsupported or context is closed/faulted.
   */
  public getDiagnosticStatus(): AudioDiagnosticStatus {
    if (typeof window === 'undefined') return 'READY';
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return 'ERROR';

    if (this.isPlaying || this.isBeeping) return 'PLAYING';

    if (!this.audioCtx) return 'READY';

    if (this.audioCtx.state === 'running') return 'READY';
    if (this.audioCtx.state === 'suspended') return 'BLOCKED';
    if (this.audioCtx.state === 'closed') return 'ERROR';

    return 'READY';
  }

  public getDiagnosticDetails(): AudioDiagnosticDetails {
    const isSupported = typeof window !== 'undefined' && Boolean(window.AudioContext || (window as any).webkitAudioContext);
    return {
      isSupported,
      state: !isSupported ? 'unsupported' : this.audioCtx ? this.audioCtx.state : 'uninitialized',
      sampleRate: this.audioCtx ? this.audioCtx.sampleRate : null,
      isPlayingSiren: this.isPlaying,
      isBeepPlaying: this.isBeeping,
      hasActiveContext: Boolean(this.audioCtx),
      lastError: this.lastError,
    };
  }
}

export const emergencySiren = new EmergencySirenService();
