import React, { useState, useEffect, useCallback } from 'react';
import { 
  Mic, 
  MicOff, 
  Sparkles, 
  Send, 
  Volume2, 
  VolumeX, 
  CheckCircle2, 
  AlertCircle, 
  Clock 
} from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useSmartHome } from '../../hooks/useSmartHome';
import { parseVoiceCommand, speakText } from '../../lib/voiceAssistant';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import { VoiceVisualizer } from './VoiceVisualizer';

export const HomeXAssistant: React.FC = () => {
  const { 
    devices, 
    setDeviceState, 
    setAllDevices, 
    telemetry, 
    voiceLogs, 
    addVoiceLog, 
    clearVoiceLogs,
    settings 
  } = useSmartHome();

  const {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    resetTranscript,
    error: speechError,
  } = useSpeechRecognition();

  const [textInput, setTextInput] = useState('');
  const [lastResponse, setLastResponse] = useState<string>('');
  const [commandPreview, setCommandPreview] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Command prompt suggestion chips
  const promptSuggestions = [
    'Turn on living room light',
    'Turn off fan',
    'Turn on water motor',
    'Emergency exhaust fan',
    'Turn on all devices',
    'Turn off all devices',
    'What is the temperature?',
    'Check gas sensor level',
    'What is current power load?',
  ];

  // Update command preview live as user speaks or types
  useEffect(() => {
    const query = transcript || interimTranscript || textInput;
    if (query.trim().length > 3) {
      const parsed = parseVoiceCommand(query, devices, telemetry);
      if (parsed.understood) {
        setCommandPreview(`Target Action: ${parsed.action} • ${parsed.details || ''}`);
      } else {
        setCommandPreview('Listening... (e.g. "turn on light", "check temperature")');
      }
    } else {
      setCommandPreview('');
    }
  }, [transcript, interimTranscript, textInput, devices, telemetry]);

  // Execute parsed command
  const executeCommand = useCallback(async (commandText: string) => {
    if (!commandText.trim()) return;

    setIsProcessing(true);
    const parsed = parseVoiceCommand(commandText, devices, telemetry);

    // Apply state change if mapped
    if (parsed.action === 'TOGGLE_DEVICE' && parsed.targetDeviceId && parsed.desiredState !== undefined) {
      setDeviceState(parsed.targetDeviceId, parsed.desiredState);
    } else if (parsed.action === 'ALL_ON') {
      setAllDevices(true);
    } else if (parsed.action === 'ALL_OFF') {
      setAllDevices(false);
    }

    setLastResponse(parsed.replyText);

    // Log to history
    addVoiceLog({
      transcript: commandText,
      response: parsed.replyText,
      executedAction: parsed.details,
      matchedDeviceId: parsed.targetDeviceId,
      confidence: parsed.understood ? 0.95 : 0.4,
      success: parsed.understood,
    });

    // Voice audio reply
    if (soundEnabled && settings.voiceFeedbackEnabled) {
      await speakText(parsed.replyText, true);
    }

    setTextInput('');
    resetTranscript();
    setIsProcessing(false);
  }, [devices, telemetry, setDeviceState, setAllDevices, addVoiceLog, soundEnabled, settings.voiceFeedbackEnabled, resetTranscript]);

  // Automatically execute when speech recognition captures a final phrase
  useEffect(() => {
    if (transcript && !isListening) {
      executeCommand(transcript);
    }
  }, [transcript, isListening, executeCommand]);

  return (
    <div className="space-y-6">
      {/* HomeX AI Banner Card */}
      <Card className="border-cyan-500/30 bg-gradient-to-br from-cyan-950/30 via-slate-900/90 to-slate-950 shadow-glow-cyan">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-cyan-500/15">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-teal-400 p-0.5 shadow-glow-cyan shrink-0">
              <div className="h-full w-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">HomeX AI Voice Assistant</h2>
                {!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true' ? (
                  <Badge variant="demo" size="sm">Prototype Simulation</Badge>
                ) : (
                  <Badge variant="teal" size="sm">Voice AI Interface</Badge>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Natural speech command interface for 4-channel ESP32 relays & IoT telemetry queries
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                soundEnabled
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
              title="Toggle Audio Text-to-Speech playback"
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              <span>{soundEnabled ? 'Speech ON' : 'Speech Muted'}</span>
            </button>
          </div>
        </div>

        {/* Center Microphone & Waveform Section */}
        <div className="py-6 flex flex-col items-center justify-center text-center">
          <div className="relative mb-3">
            {/* Pulsing ring when active */}
            {isListening && (
              <div className="absolute inset-0 rounded-full bg-cyan-400/30 animate-ping" />
            )}

            <button
              onClick={isListening ? stopListening : startListening}
              disabled={!isSupported}
              className={`relative h-20 w-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl cursor-pointer ${
                isListening
                  ? 'bg-gradient-to-tr from-rose-500 to-red-600 text-white shadow-glow-danger scale-105'
                  : 'bg-gradient-to-tr from-cyan-500 to-teal-400 text-slate-950 shadow-glow-cyan hover:scale-105'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              aria-label={isListening ? 'Stop listening' : 'Start voice recognition'}
            >
              {isListening ? (
                <MicOff className="h-8 w-8 animate-pulse" />
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </button>
          </div>

          <VoiceVisualizer isListening={isListening} />

          <p className="text-xs font-mono text-slate-400 mt-1">
            {isListening ? (
              <span className="text-cyan-300 font-semibold animate-pulse">
                Listening... Speak your command now
              </span>
            ) : isSupported ? (
              'Click microphone or type command below'
            ) : (
              'Web Speech Recognition not supported in this browser. Use text input below.'
            )}
          </p>

          {/* Live speech preview */}
          {(transcript || interimTranscript) && (
            <div className="mt-3 px-4 py-2 rounded-xl bg-slate-950/80 border border-cyan-500/30 max-w-lg text-xs font-mono text-cyan-200 animate-fade-in">
              "{transcript || interimTranscript}"
            </div>
          )}

          {/* Action preview pill */}
          {commandPreview && (
            <div className="mt-2 text-[11px] font-mono text-teal-400 bg-teal-950/40 px-3 py-1 rounded-full border border-teal-500/30">
              {commandPreview}
            </div>
          )}

          {speechError && (
            <div className="mt-2 text-xs text-rose-400 flex items-center gap-1 bg-rose-950/30 px-3 py-1 rounded-lg border border-rose-500/20">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{speechError}</span>
            </div>
          )}
        </div>

        {/* Text Fallback Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeCommand(textInput);
          }}
          className="mt-2 flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder='Type a command: "Turn on light", "What is the temperature?", "Emergency exhaust"...'
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm text-slate-100 placeholder:text-slate-400 font-mono"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isProcessing}
            leftIcon={<Send className="h-4 w-4" />}
          >
            Execute
          </Button>
        </form>

        {/* Suggestion Chips */}
        <div className="mt-4 pt-4 border-t border-slate-800/80">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block mb-2 font-semibold">
            Quick Command Suggestions (Click to Test)
          </span>
          <div className="flex flex-wrap gap-2">
            {promptSuggestions.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setTextInput(prompt);
                  executeCommand(prompt);
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-cyan-500/10 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/30 transition-all font-mono cursor-pointer"
              >
                "{prompt}"
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Response Display Box (if available) */}
      {lastResponse && (
        <Card className="border-teal-500/30 bg-teal-950/15 animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-teal-500/20 border border-teal-500/30 text-teal-300 shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-teal-400 font-mono uppercase tracking-wider block">
                HomeX Assistant Response
              </span>
              <p className="text-sm text-slate-100 mt-1 leading-relaxed">
                {lastResponse}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Command History Log */}
      <Card>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-slate-200">Voice Command Execution Log</h3>
          </div>
          {voiceLogs.length > 0 && (
            <button
              onClick={clearVoiceLogs}
              className="text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              Clear History
            </button>
          )}
        </div>

        <div className="mt-3 divide-y divide-slate-800/80">
          {voiceLogs.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 font-mono">
              No recent voice commands. Use the microphone or click a prompt above.
            </div>
          ) : (
            voiceLogs.map((log) => (
              <div key={log.id} className="py-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-cyan-300">
                    "{log.transcript}"
                  </span>
                  <span className="text-[10px] text-slate-400">{log.timestamp}</span>
                </div>
                <p className="text-slate-300 pl-2 border-l border-slate-700">
                  {log.response}
                </p>
                {log.executedAction && (
                  <span className="inline-block text-[10px] font-mono text-teal-400 bg-teal-950/40 px-2 py-0.5 rounded border border-teal-500/20">
                    Action: {log.executedAction}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
