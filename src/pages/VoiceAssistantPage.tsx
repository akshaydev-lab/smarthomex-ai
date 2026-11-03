import React from 'react';
import { HomeXAssistant } from '../components/ai/HomeXAssistant';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Terminal, Shield, CheckCircle2 } from 'lucide-react';

export const VoiceAssistantPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* HomeX Assistant Master Component */}
      <HomeXAssistant />

      {/* Voice Assistant Capability Guide */}
      <Card className="p-5">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800 mb-4">
          <Terminal className="h-5 w-5 text-cyan-400" />
          <h3 className="text-base font-bold text-slate-100">
            HomeX Voice Processing & Grammar Syntax
          </h3>
          <Badge variant="teal" size="sm">Natural Language</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="font-bold text-cyan-300 block mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-cyan-400" /> Relay Actuation
            </span>
            <ul className="space-y-1 text-slate-400 font-mono">
              <li>• "Turn on living room light"</li>
              <li>• "Turn off ceiling fan"</li>
              <li>• "Start water motor / pump"</li>
              <li>• "Emergency exhaust fan"</li>
              <li>• "Turn off all devices"</li>
            </ul>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="font-bold text-teal-300 block mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-teal-400" /> Sensor Inquiries
            </span>
            <ul className="space-y-1 text-slate-400 font-mono">
              <li>• "What is the temperature?"</li>
              <li>• "How hot is the house?"</li>
              <li>• "Check gas sensor level"</li>
              <li>• "Is the air quality safe?"</li>
              <li>• "What is the humidity?"</li>
            </ul>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="font-bold text-amber-300 block mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-amber-400" /> Electrical Telemetry
            </span>
            <ul className="space-y-1 text-slate-400 font-mono">
              <li>• "What is the current power load?"</li>
              <li>• "Check mains voltage"</li>
              <li>• "How many watts am I using?"</li>
              <li>• "Report energy status"</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-2.5">
          <Shield className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-400">
            <strong className="text-amber-300">Phase 1 Voice Architecture Notice: </strong>
            HomeX leverages the browser Web Speech API (with standard SpeechSynthesis vocal synthesis). Command intents are parsed client-side and dispatched to demo state hooks. When physical ESP32 and Supabase are linked in Phase 2, commands will publish to MQTT topics (`smarthomex/relays/command`).
          </p>
        </div>
      </Card>
    </div>
  );
};
