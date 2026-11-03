import React from 'react';
import { ShieldCheck, Cpu, ZapOff, CheckCircle2 } from 'lucide-react';
import { Card } from '../common/Card';

export const SafetyArchitectureNotice: React.FC = () => {
  return (
    <Card className="border-rose-500/30 bg-gradient-to-br from-rose-950/20 via-slate-900/90 to-slate-950">
      <div className="flex items-start gap-3.5">
        <div className="p-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 shrink-0">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 flex-wrap">
              <span>Hardware-First IoT Safety & Gas Evacuation Mandate</span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase">
                Zero Cloud Delay
              </span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                Anti-Spark Relay Inhibit
              </span>
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              In commercial-grade smart home automation, <strong>life-safety triggers must never depend on the internet or cloud backends</strong>. Crucially, ordinary domestic relays or electric exhaust fans must <strong>NEVER</strong> automatically switch during a combustible gas leak, as non-certified electrical contact arcing can trigger catastrophic vapor ignition.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="font-semibold text-rose-400 flex items-center gap-1.5 mb-1">
                <ZapOff className="h-4 w-4" /> Relay Spark Prevention
              </span>
              <span>
                Standard mechanical relays create micro-arcs during contact make/break. SmartHomeX inhibits domestic relay actuation during gas leaks.
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="font-semibold text-teal-400 flex items-center gap-1.5 mb-1">
                <Cpu className="h-4 w-4" /> Local RTOS Siren
              </span>
              <span>
                Acoustic sirens and piezoelectric buzzers (GPIO 23) execute on the ESP32 bare-metal FreeRTOS loop at 100ms intervals regardless of network status.
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="font-semibold text-cyan-400 flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="h-4 w-4" /> Certified Safety Systems
              </span>
              <span>
                Physical gas mitigation must interface with certified ATEX explosion-proof shutoff solenoid valves and independent safety controls.
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
