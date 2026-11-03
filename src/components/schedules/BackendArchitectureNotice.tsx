import React, { useState } from 'react';
import { Database, ShieldCheck, Cpu, Code2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { SUPABASE_SCHEDULES_TABLE_SQL } from '../../services/scheduleService';

export const BackendArchitectureNotice: React.FC = () => {
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEDULES_TABLE_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-cyan-500/30 bg-gradient-to-br from-slate-900/95 via-slate-950 to-slate-900/95 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">
                Reliable Cloud & Hardware Scheduler Architecture
              </h3>
              <Badge variant="teal" size="sm">Supabase PostgreSQL</Badge>
              <Badge variant="demo" size="sm">Zero Browser Reliance</Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict compliance with Section 6 & 7: Independent execution and idempotent relay state tracking
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowSql(!showSql)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>{showSql ? 'Hide Supabase SQL' : 'View Supabase SQL Schema'}</span>
          {showSql ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* 3 Core Architecture Pillars */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <span className="font-bold text-teal-300 block mb-1 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-teal-400" /> 1. Zero Tab Dependency
          </span>
          <p className="text-slate-400 leading-relaxed">
            Real production scheduling does not rely on an open browser tab. Schedules are stored in Supabase and executed either via Supabase Edge Functions / pg_cron or synced directly to the ESP32 internal RTC memory.
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <span className="font-bold text-cyan-300 block mb-1 flex items-center gap-1.5">
            <Cpu className="h-4 w-4 text-cyan-400" /> 2. Idempotent Command Safety
          </span>
          <p className="text-slate-400 leading-relaxed">
            Every schedule execution records an idempotent timestamp key (`dateStr_timeStr`). This prevents duplicate electrical triggers or repetitive relay pulses if a re-try or network reconnection occurs.
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <span className="font-bold text-amber-300 block mb-1 flex items-center gap-1.5">
            <Database className="h-4 w-4 text-amber-400" /> 3. Row Level Security (RLS)
          </span>
          <p className="text-slate-400 leading-relaxed">
            Each schedule row in Supabase is keyed to `user_id` with strict RLS policies, ensuring only authorized household occupants can create, edit, or toggle their home's automation schedules.
          </p>
        </div>
      </div>

      {/* Collapsible Supabase DDL SQL Code Block */}
      {showSql && (
        <div className="mt-4 pt-4 border-t border-slate-800/80 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-cyan-300 font-semibold">
              supabase/migrations/20261101_schedules_table.sql
            </span>
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 text-slate-300 hover:text-cyan-300 text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? 'Copied' : 'Copy SQL'}</span>
            </button>
          </div>
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
            <code>{SUPABASE_SCHEDULES_TABLE_SQL}</code>
          </pre>
        </div>
      )}
    </Card>
  );
};
