import React, { useState, useEffect } from 'react';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Send, 
  Sparkles, 
  Clock, 
  Bot
} from 'lucide-react';
import { useSmartHome } from '../../hooks/useSmartHome';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { parseVoiceCommand, speakText } from '../../lib/voiceAssistant';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
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

  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(settings.voiceFeedbackEnabled);

  const {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  // Prompt suggestions
  const promptSuggestions = [
    'Turn on living room light',
    'Turn off fan',
    'Turn on water motor',
    'Turn on street light',
    'Emergency exhaust fan',
    'Turn on all devices',
    'Turn off all devices',
    'What is the current temperature?',
    'What is the gas reading in the house?',
    'How much power is the home using?',
    'System status overview',
  ];

  // Process incoming speech command
  const executeCommand = async (commandText: string) => {
    if (!commandText.trim()) return;

    setIsProcessing(true);
    const parsed = parseVoiceCommand(commandText, devices, telemetry);

    // If command is safety blocked, do not energize circuits
    if (parsed.safetyBlocked) {
      setLastResponse(parsed.replyText);
      addVoiceLog({
        transcript: commandText,
        response: parsed.replyText,
        executedAction: parsed.details,
        matchedDeviceId: parsed.targetDeviceId,
        confidence: 0.95,
        success: false,
      });

      if (soundEnabled && settings.voiceFeedbackEnabled) {
        await speakText(parsed.replyText, true);
      }

      setTextInput('');
      resetTranscript();
      setIsProcessing(false);
      return;
    }

    // Apply state change if mapped
    if (parsed.action === 'TOGGLE_DEVICE' && parsed.targetDeviceId && parsed.desiredState !== undefined) {
      setDeviceState(parsed.targetDeviceId, parsed.desiredState);
    } else if (parsed.action === 'ALL_ON') {
      setAllDevices(true);
    } else if (parsed.action === 'ALL_OFF') {
      setAllDevices(false);
    }

    // Record response
    setLastResponse(parsed.replyText);

    // Append to conversation log
    addVoiceLog({
      transcript: commandText,
      response: parsed.replyText,
      executedAction: parsed.details,
      matchedDeviceId: parsed.targetDeviceId,
      confidence: parsed.understood ? 0.95 : 0.4,
      success: parsed.understood,
    });

    // Voice response audio output
    if (soundEnabled && settings.voiceFeedbackEnabled) {
      await speakText(parsed.replyText, true);
    }

    setTextInput('');
    resetTranscript();
    setIsProcessing(false);
  };

  // When speech recognition finalizes a transcript
  useEffect(() => {
    if (transcript && !isListening) {
      executeCommand(transcript);
    }
  }, [transcript, isListening]);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim() && !isProcessing) {
      executeCommand(textInput);
    }
  };

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
                Natural speech command interface for 5-channel ESP32 relays & IoT telemetry queries
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
              <span>{soundEnabled ? 'Speech ON' : 'Muted'}</span>
            </button>
          </div>
        </div>

        {/* Microphone Recording Centerpiece */}
        <div className="py-8 flex flex-col items-center justify-center text-center">
          <div className="relative mb-3">
            {/* Pulsing ring when active */}
            {isListening && (
              <div className="absolute inset-0 rounded-full bg-cyan-400/30 animate-ping" />
            )}

            <button
              onClick={isListening ? stopListening : startListening}
              disabled={!isSupported || isProcessing}
              className={`relative h-20 w-20 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                isListening
                  ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-glow-danger scale-110 voice-ripple'
                  : 'bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 shadow-glow-cyan hover:scale-105'
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
              'Click microphone to speak or type command below'
            ) : (
              'Web Speech API not supported in this browser. Use text input below.'
            )}
          </p>

          {/* Live speech preview */}
          {(transcript || interimTranscript) && (
            <div className="mt-3 px-4 py-2 rounded-xl bg-slate-950/80 border border-cyan-500/30 max-w-lg text-xs font-mono text-cyan-200 animate-fade-in">
              "{transcript || interimTranscript}"
            </div>
          )}
        </div>

        {/* Text Input Form Fallback */}
        <form onSubmit={handleTextSubmit} className="flex gap-2 pt-2">
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
            disabled={!textInput.trim() || isProcessing}
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
            {promptSuggestions.map((prompt) => (
              <button
                key={prompt}
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

      {/* Latest Assistant Response Banner */}
      {lastResponse && (
        <Card className="border-teal-500/30 bg-gradient-to-r from-teal-950/30 via-slate-900/90 to-slate-950 p-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-300 shrink-0 mt-0.5">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs font-mono font-semibold text-teal-300 block">
                HomeX AI Response
              </span>
              <p className="text-sm text-slate-100 mt-0.5 font-medium leading-relaxed">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={clearVoiceLogs}
            >
              Clear Log
            </Button>
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
                  <span className="font-mono text-[10px] text-slate-400 block pl-2">
                    Executed: <span className="text-teal-400">{log.executedAction}</span>
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
