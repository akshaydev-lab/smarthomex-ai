import React from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Flame, 
  Cpu, 
  X, 
  Zap, 
  Clock 
} from 'lucide-react';
import { useSmartHome } from '../../hooks/useSmartHome';
import { LiveToast } from '../../types';

export const LiveNotificationToast: React.FC = () => {
  const { toasts, dismissToast } = useSmartHome();

  if (!toasts || toasts.length === 0) return null;

  const getToastIcon = (type: LiveToast['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />;
      case 'gas_emergency':
        return <Flame className="h-5 w-5 text-red-400 shrink-0 animate-bounce" />;
      case 'info':
      default:
        return <Cpu className="h-5 w-5 text-cyan-400 shrink-0" />;
    }
  };

  const getToastBorder = (type: LiveToast['type']) => {
    switch (type) {
      case 'success':
        return 'border-emerald-500/40 bg-[#0B1510]/95 shadow-[0_4px_20px_rgba(16,185,129,0.2)]';
      case 'warning':
        return 'border-amber-500/40 bg-[#171208]/95 shadow-[0_4px_20px_rgba(245,158,11,0.2)]';
      case 'error':
        return 'border-rose-500/40 bg-[#18090C]/95 shadow-[0_4px_20px_rgba(244,63,94,0.2)]';
      case 'gas_emergency':
        return 'border-red-500 bg-[#25080E]/95 shadow-[0_4px_25px_rgba(239,68,68,0.4)] animate-pulse-subtle';
      case 'info':
      default:
        return 'border-cyan-500/30 bg-[#0A131A]/95 shadow-[0_4px_20px_rgba(6,182,212,0.15)]';
    }
  };

  return (
    <aside 
      aria-label="Live System Notifications" 
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-50 flex flex-col-reverse gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none"
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-2xl border p-3.5 backdrop-blur-md transition-all duration-300 transform translate-y-0 opacity-100 flex items-start justify-between gap-3 ${getToastBorder(toast.type)}`}
        >
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="mt-0.5">{getToastIcon(toast.type)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-100 tracking-wide">
                  {toast.title}
                </span>
                {toast.gpio != null && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-emerald-300 border border-white/[0.06]">
                    GPIO {toast.gpio}
                  </span>
                )}
                <span className="text-[10px] font-mono text-slate-400 ml-auto flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {toast.timestamp}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 leading-snug break-words">
                {toast.message}
              </p>
            </div>
          </div>

          <button
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </aside>
  );
};
