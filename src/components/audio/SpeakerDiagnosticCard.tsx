import React from 'react';
import { 
  Volume2, 
  VolumeX, 
  Play, 
  Square, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Activity, 
  ShieldAlert, 
  HelpCircle,
  Radio
} from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { useSmartHome } from '../../hooks/useSmartHome';

export const SpeakerDiagnosticCard: React.FC = () => {
  const {
    isAlarmTesting,
    alarmTestCountdown,
    alarmTestError,
    startAlarmTest,
    stopAlarmTest,
    isSpeakerTesting,
    speakerTestError,
    playSpeakerTestBeep,
    stopAllTestAudio,
    audioDiagnosticStatus,
    telemetry,
    gasSafetyState,
  } = useSmartHome();

  const isRealEmergency =
    telemetry.gasStatus === 'danger' ||
    (telemetry.gasRawAdc != null && telemetry.gasRawAdc >= 1600) ||
    gasSafetyState.lockoutStatus === 'CRITICAL' ||
    gasSafetyState.lockoutStatus === 'EMERGENCY_LOCKOUT';

  const isAnyAudioActive = isAlarmTesting || isSpeakerTesting;

  // Determine badge styling and icon based on audioDiagnosticStatus
  const getStatusBadge = () => {
    switch (audioDiagnosticStatus) {
      case 'PLAYING':
        return (
          <Badge variant="rose" size="sm">
            <Radio className="h-3.5 w-3.5 animate-pulse mr-1" /> PLAYING
          </Badge>
        );
      case 'BLOCKED':
        return (
          <Badge variant="amber" size="sm">
            <AlertTriangle className="h-3.5 w-3.5 mr-1" /> BLOCKED (AUTOPLAY)
          </Badge>
        );
      case 'ERROR':
        return (
          <Badge variant="rose" size="sm">
            <XCircle className="h-3.5 w-3.5 mr-1" /> ERROR
          </Badge>
        );
      case 'READY':
      default:
        return (
          <Badge variant="emerald" size="sm">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> READY
          </Badge>
        );
    }
  };

  return (
    <Card className="p-5 border-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Volume2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Browser Audio & Speaker Diagnostic
            </h3>
            <p className="text-xs text-slate-400">
              Verify Web Audio API synthesis, browser speaker routing, and test alarm acoustics
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-slate-400 font-mono">Audio Status:</span>
          {getStatusBadge()}
        </div>
      </div>

      {/* Real Emergency Warning Banner if active */}
      {isRealEmergency && (
        <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 flex items-center gap-2.5 text-xs text-rose-200">
          <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 animate-bounce" />
          <div>
            <span className="font-bold block">REAL GAS EMERGENCY / LOCKOUT ACTIVE</span>
            <span>Diagnostic speaker testing is disabled to prioritize the genuine life-safety alarm system.</span>
          </div>
        </div>
      )}

      {/* Display errors if any */}
      {(alarmTestError || speakerTestError) && (
        <div className="mb-4 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span>{speakerTestError || alarmTestError}</span>
        </div>
      )}

      {/* Control Buttons Grid (3 Buttons) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {/* 1. TEST SPEAKER (Short 880Hz Test Chime) */}
        <button
          type="button"
          onClick={() => playSpeakerTestBeep()}
          disabled={isRealEmergency || isSpeakerTesting}
          title="Play a short diagnostic 880Hz chime to verify browser speaker output"
          className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
            isSpeakerTesting
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-glow-cyan animate-pulse'
              : 'bg-slate-900/60 hover:bg-slate-800/70 border-slate-800 hover:border-cyan-500/40 text-slate-200'
          } ${isRealEmergency ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
              Diagnostic Chime
            </span>
            <Play className={`h-4 w-4 ${isSpeakerTesting ? 'text-cyan-300 animate-spin' : 'text-slate-400'}`} />
          </div>
          <span className="text-xs font-bold block mb-1">
            {isSpeakerTesting ? '🔊 PLAYING CHIME...' : '🔊 TEST SPEAKER'}
          </span>
          <span className="text-[11px] text-slate-400 leading-tight">
            Plays short 880Hz sine tone (500ms) for quick speaker verification.
          </span>
        </button>

        {/* 2. TEST ALARM (Dual-tone 960Hz / 770Hz Emergency Siren) */}
        <button
          type="button"
          onClick={isAlarmTesting ? stopAlarmTest : startAlarmTest}
          disabled={isRealEmergency}
          title="Synthesizes emergency siren sound (960Hz / 770Hz) for 7 seconds without triggering hardware"
          className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
            isAlarmTesting
              ? 'bg-rose-900/40 border-rose-400 text-rose-100 shadow-glow-danger animate-pulse'
              : 'bg-slate-900/60 hover:bg-slate-800/70 border-slate-800 hover:border-rose-500/40 text-slate-200'
          } ${isRealEmergency ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-rose-400 font-bold uppercase tracking-wider">
              Evacuation Warble
            </span>
            <Volume2 className={`h-4 w-4 ${isAlarmTesting ? 'text-rose-400 animate-bounce' : 'text-slate-400'}`} />
          </div>
          <span className="text-xs font-bold block mb-1">
            {isAlarmTesting ? `🔔 STOP SIREN (${alarmTestCountdown}s)` : '🔔 TEST ALARM'}
          </span>
          <span className="text-[11px] text-slate-400 leading-tight">
            Synthesizes 960Hz / 770Hz emergency siren for 7s with auto-cutoff.
          </span>
        </button>

        {/* 3. STOP SOUND (Immediately Halts All Test Audio) */}
        <button
          type="button"
          onClick={stopAllTestAudio}
          disabled={!isAnyAudioActive}
          title="Immediately stop any active test sound"
          className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
            isAnyAudioActive
              ? 'bg-rose-600/30 hover:bg-rose-600/50 border-rose-500/60 text-rose-100 cursor-pointer shadow-sm'
              : 'bg-slate-950/40 border-slate-800 text-slate-400 cursor-not-allowed'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">
              Immediate Halt
            </span>
            <Square className={`h-4 w-4 ${isAnyAudioActive ? 'text-rose-400' : 'text-slate-400'}`} />
          </div>
          <span className="text-xs font-bold block mb-1">
            🔇 STOP SOUND
          </span>
          <span className="text-[11px] text-slate-400 leading-tight">
            Instantly cuts all browser oscillator nodes and clears gain timers.
          </span>
        </button>
      </div>

      {/* Mandatory Physical Verification Disclaimer */}
      <div className="mb-5 p-3.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-xs flex items-start gap-3">
        <Activity className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-slate-200 block">
            Audio generation verified, physical speaker output not verified.
          </span>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            The Web Audio API successfully synthesizes and routes the waveform buffers directly to your operating system's audio bus. Actual acoustic sound depends on your device's physical speakers, volume level, and browser permissions.
          </p>
        </div>
      </div>

      {/* Technical Audio Pipeline Specs */}
      <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs mb-5">
        <span className="text-slate-400 font-semibold block mb-2 font-mono text-[11px]">
          Web Audio API Pipeline Parameters:
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
          <div className="p-2 rounded bg-slate-900 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Synthesis Engine</span>
            <span className="text-cyan-300 font-semibold">Web Audio API</span>
          </div>
          <div className="p-2 rounded bg-slate-900 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Chime Waveform</span>
            <span className="text-emerald-300 font-semibold">880 Hz Sine</span>
          </div>
          <div className="p-2 rounded bg-slate-900 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Siren Waveform</span>
            <span className="text-rose-300 font-semibold">960 / 770 Hz Warble</span>
          </div>
          <div className="p-2 rounded bg-slate-900 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Master Volume</span>
            <span className="text-amber-300 font-semibold">0.25 (-12 dB)</span>
          </div>
        </div>
      </div>

      {/* Troubleshooting Guide */}
      <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/80 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-slate-300 mb-2">
          <HelpCircle className="h-4 w-4 text-cyan-400" />
          <span>Troubleshooting Speaker Output</span>
        </div>
        <ul className="space-y-1.5 text-[11px] text-slate-400">
          <li className="flex items-start gap-1.5">
            <span className="text-cyan-400 font-bold">•</span>
            <span><strong>Tab Muted:</strong> Verify that the browser tab is unmuted (look for a speaker icon on the tab in Chrome/Edge/Firefox/Safari).</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-cyan-400 font-bold">•</span>
            <span><strong>System Speaker Volume:</strong> Confirm your device's master volume is audible and external speakers/headphones are connected and powered on.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-cyan-400 font-bold">•</span>
            <span><strong>Browser Autoplay Policy:</strong> If the badge indicates <strong className="text-amber-400">BLOCKED</strong>, modern browsers require an explicit user click before allowing audio. Clicking <em>TEST SPEAKER</em> or <em>TEST ALARM</em> unlocks the context.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-cyan-400 font-bold">•</span>
            <span><strong>Hardware Isolation Guarantee:</strong> Testing audio here operates 100% inside your browser. It does not activate the physical buzzer on ESP32 GPIO 33 and does not trip electrical contactors.</span>
          </li>
        </ul>
      </div>
    </Card>
  );
};
