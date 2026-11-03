/**
 * Web Audio API Emergency Siren Synthesizer
 * 
 * Generates an acoustic dual-tone emergency warning siren (960Hz / 770Hz)
 * without requiring external MP3 files. Operates 100% client-side and offline.
 */

class EmergencySirenService {
  private audioCtx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private intervalId: any = null;
  private isPlaying: boolean = false;
  private highTone: boolean = true;

  private initContext() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
  }

  public start() {
    if (this.isPlaying) return;

    try {
      this.initContext();
      if (!this.audioCtx) return;

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.oscillator = this.audioCtx.createOscillator();
      this.gainNode = this.audioCtx.createGain();

      this.oscillator.type = 'sawtooth';
      this.oscillator.frequency.setValueAtTime(960, this.audioCtx.currentTime);

      // Master volume
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
    } catch {
      // Audio autoplay policy may require user interaction
    }
  }

  public stop() {
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

    setTimeout(() => {
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
    }, 120);
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export const emergencySiren = new EmergencySirenService();
