import React from 'react';
import { History, X, CheckCircle2, XCircle, ShieldAlert, Clock, Cpu } from 'lucide-react';
import { DeviceCommandRecord } from '../../types';
import { Badge } from '../common/Badge';

interface CommandHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceName: string;
  channel: number;
  gpio: number;
  history?: DeviceCommandRecord[];
}

export const CommandHistoryModal: React.FC<CommandHistoryModalProps> = ({
  isOpen,
  onClose,
  deviceName,
  channel,
  gpio,
  history = [],
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex items-center justify-center">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-100">
                Command History: {deviceName}
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Relay Channel {channel} • GPIO {gpio} • Audit Log
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* History List */}
        <div className="mt-4 max-h-80 overflow-y-auto space-y-2.5 pr-1">
          {history.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-mono">
              No recent commands recorded for this device.
            </div>
          ) : (
            history.map((record) => {
              const isSuccess = record.status === 'acknowledged';
              const isGasBlocked = record.status === 'rejected_gas_safety';
              return (
                <div
                  key={record.id}
                  className={`p-3 rounded-xl border text-xs transition-all ${
                    isSuccess
                      ? 'bg-slate-950/70 border-emerald-500/30'
                      : isGasBlocked
                      ? 'bg-rose-950/30 border-rose-500/40'
                      : 'bg-slate-950/70 border-rose-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                        record.action === 'ON' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-300'
                      }`}>
                        Action: {record.action}
                      </span>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                        <Clock className="h-3 w-3" /> {record.timestamp}
                      </span>
                    </div>

                    <Badge
                      variant={isSuccess ? 'emerald' : isGasBlocked ? 'rose' : 'amber'}
                      size="sm"
                    >
                      {record.status.toUpperCase()}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 font-mono">
                    <span className="flex items-center gap-1">
                      <Cpu className="h-3 w-3 text-cyan-400" />
                      Source: {record.source}
                    </span>
                    {record.roundTripMs != null && (
                      <span>RTT: {record.roundTripMs} ms</span>
                    )}
                  </div>

                  {record.errorMessage && (
                    <div className="mt-1.5 p-1.5 rounded-lg bg-rose-950/40 text-rose-300 text-[10px] flex items-start gap-1 font-mono">
                      {isGasBlocked ? <ShieldAlert className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" /> : <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />}
                      <span>{record.errorMessage}</span>
                    </div>
                  )}

                  {isSuccess && record.confirmedByHardware && (
                    <div className="mt-1 text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                      <CheckCircle2 className="h-3 w-3" /> Hardware Coil State Confirmed via ESP32 ACK
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

