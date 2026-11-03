import React, { useState } from 'react';
import { Cpu, ShieldCheck, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import { Badge } from './Badge';
import { isSupabaseConfigured } from '../../lib/supabaseClient';
import { useSmartHome } from '../../hooks/useSmartHome';

export const DemoNotice: React.FC = () => {
  const [expanded, setExpanded] = useState<boolean>(false);
  const { isAuthenticated, settings } = useSmartHome();

  const isDemoExplicitlyEnabled = import.meta.env.VITE_DEMO_MODE === 'true';

  // In production mode (when Supabase is configured and user is authenticated),
  // NEVER render prototype/demo simulation notices unless demo mode is explicitly enabled.
  if (isSupabaseConfigured && isAuthenticated && !isDemoExplicitlyEnabled && !settings.demoSimulationActive) {
    return null;
  }

  return (
    <div className="mb-6 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/30 via-slate-900/60 to-cyan-950/20 p-3.5 sm:p-4 backdrop-blur-md transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
            <Radio className="h-4 w-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-100">
                Developer Sandbox & Simulation Mode
              </span>
              <Badge variant="demo" size="sm">
                SANDBOX ACTIVE
              </Badge>
              <Badge variant="teal" size="sm" icon={<Cpu className="h-3 w-3" />}>
                ESP32 Ready
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Running in local developer sandbox mode.
            </p>
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors px-2 py-1 rounded-lg hover:bg-amber-500/10 cursor-pointer"
        >
          {expanded ? 'Hide Safety & Architecture Note' : 'Hardware Architecture Note'}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3.5 pt-3 border-t border-slate-800/80 text-xs text-slate-300 grid grid-cols-1 md:grid-cols-2 gap-3.5 animate-fade-in">
          <div className="flex gap-2.5 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-emerald-400 block mb-0.5">ESP32 Hardware Autonomous Safety Loop:</span>
              <span>
                Safety-critical cutoffs (such as MQ-2 gas evacuation via Exhaust Fan & Buzzer) run locally in ESP32 firmware interrupts. Emergency shutoff never depends on cloud or browser websocket connectivity.
              </span>
            </div>
          </div>

          <div className="flex gap-2.5 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800">
            <Cpu className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-cyan-400 block mb-0.5">Hardware Communication Pipeline:</span>
              <span>
                Relay commands are authenticated via cryptographic nonce and dispatched through Supabase database queues with physical readback confirmation.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
