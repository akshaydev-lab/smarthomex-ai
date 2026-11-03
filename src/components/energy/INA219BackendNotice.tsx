import React, { useState } from 'react';
import { 
  Database, 
  ShieldCheck, 
  Code2, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Cpu 
} from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { SUPABASE_INA219_TABLE_SQL } from '../../services/sensorService';

export const INA219BackendNotice: React.FC = () => {
  const [copied, setCopied] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(SUPABASE_INA219_TABLE_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="p-4 sm:p-5 border-cyan-500/20 bg-slate-950/70">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-100">Supabase Backend & Continuous Integration Architecture</h3>
              <Badge variant="teal" size="sm">Time-Series Ready</Badge>
              {!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true' && (
                <Badge variant="demo" size="sm">DEMO PROTOCOL</Badge>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Elapsed-time Riemann energy accumulation and anti-double-counting reconnection traps
            </p>
          </div>
        </div>

        <Button
          variant="glass"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          rightIcon={isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        >
          {isExpanded ? 'Hide Architecture' : 'View Architecture & SQL'}
        </Button>
      </div>

      {/* Hardware Status Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs font-mono">
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] text-slate-400 block">Sensor Bus</span>
          <span className="font-bold text-cyan-300">I2C (0x40)</span>
          <span className="text-[10px] text-slate-500 block">SDA: 21, SCL: 22</span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] text-slate-400 block">Integration Method</span>
          <span className="font-bold text-teal-300">Trapezoidal Δt</span>
          <span className="text-[10px] text-slate-500 block">dE = P × dt / 3600</span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] text-slate-400 block">Reconnection Guard</span>
          <span className="font-bold text-emerald-400">Zero Double-Count</span>
          <span className="text-[10px] text-slate-500 block">Gap clamped &gt; 20s</span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] text-slate-400 block">Database Target</span>
          <span className="font-bold text-blue-400">Supabase PG</span>
          <span className="text-[10px] text-slate-500 block">RLS Enabled</span>
        </div>
      </div>

      {/* Expanded Technical Detail */}
      {isExpanded && (
        <div className="space-y-4 pt-3 border-t border-slate-800/80 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <h4 className="font-bold text-cyan-300 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                Actual Elapsed Time & Reconnection Guard
              </h4>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                To ensure continuous precision, energy is accumulated using the exact timestamp delta between consecutive sensor packets:
              </p>
              <div className="p-2 rounded bg-slate-950 font-mono text-[11px] text-teal-300 border border-slate-800">
                ΔE (Wh) = [ P(t_now) × (t_now - t_last) ] / 3600
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                <strong>Anti-Double Counting:</strong> If the ESP32 disconnects or the browser tab suspends, the time gap (<code>Δt &gt; 20s</code>) is detected and clamped to the nominal sampling interval (4s), preventing false surge spikes upon reconnection.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <h4 className="font-bold text-teal-300 flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-teal-400" />
                Validated Readings vs Synthetic Extrapolations
              </h4>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                The INA219 hardware measures:
              </p>
              <ul className="list-disc list-inside text-slate-400 text-[11px] space-y-1">
                <li><strong>Bus Voltage (V_bus):</strong> Up to 26V DC native, or 250V AC/DC through isolated potential divider.</li>
                <li><strong>Shunt Voltage (V_shunt):</strong> Across precision 0.100Ω shunt resistor in mV.</li>
                <li><strong>Current (I):</strong> Calculated as V_shunt / R_shunt.</li>
                <li><strong>Power (P):</strong> Validated as V_bus × I.</li>
              </ul>
            </div>
          </div>

          {/* SQL Migration Schema */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
            <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-mono text-cyan-300 font-semibold flex items-center gap-1.5">
                <Code2 className="h-4 w-4 text-cyan-400" />
                Supabase Migration: public.ina219_readings
              </span>
              <Button
                variant="glass"
                size="sm"
                onClick={handleCopy}
                leftIcon={copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                className="text-xs"
              >
                {copied ? 'Copied' : 'Copy DDL SQL'}
              </Button>
            </div>
            <pre className="p-4 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-56">
              <code>{SUPABASE_INA219_TABLE_SQL}</code>
            </pre>
          </div>
        </div>
      )}
    </Card>
  );
};
