import React from 'react';
import { 
  Flame, 
  Thermometer, 
  Zap, 
  WifiOff, 
  ShieldAlert, 
  CheckCircle2, 
  Trash2, 
  Cpu, 
  MapPin, 
  AlertOctagon 
} from 'lucide-react';
import type { SystemAlert } from '../../types';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';

export const AlertCard: React.FC<{
  alert: SystemAlert;
  onAcknowledge: (id: string) => void;
  onDismiss: (id: string) => void;
}> = ({ alert, onAcknowledge, onDismiss }) => {
  const getAlertIcon = () => {
    switch (alert.type) {
      case 'gas_leak':
        return <Flame className="h-5 w-5 text-rose-400" />;
      case 'smoke':
        return <Flame className="h-5 w-5 text-amber-400" />;
      case 'high_temp':
        return <Thermometer className="h-5 w-5 text-orange-400" />;
      case 'abnormal_power':
        return <Zap className="h-5 w-5 text-amber-400" />;
      case 'device_offline':
        return <WifiOff className="h-5 w-5 text-slate-400" />;
      default:
        return <ShieldAlert className="h-5 w-5 text-cyan-400" />;
    }
  };

  const getSeverityStyle = () => {
    switch (alert.severity) {
      case 'danger':
        return 'border-rose-500/40 bg-gradient-to-r from-rose-950/25 via-slate-900/90 to-slate-950 shadow-glow-danger';
      case 'warning':
        return 'border-amber-500/40 bg-gradient-to-r from-amber-950/25 via-slate-900/90 to-slate-950';
      case 'info':
      default:
        return 'border-slate-800 bg-slate-900/60';
    }
  };

  return (
    <Card className={`${getSeverityStyle()} transition-all`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl border mt-0.5 shrink-0 ${
            alert.severity === 'danger'
              ? 'bg-rose-500/20 border-rose-500/40'
              : alert.severity === 'warning'
              ? 'bg-amber-500/20 border-amber-500/40'
              : 'bg-slate-800 border-slate-700'
          }`}>
            {getAlertIcon()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-sm text-slate-100">{alert.title}</h4>
              {alert.isDemo && <Badge variant="demo" size="sm">DEMO SIMULATION</Badge>}
              <Badge
                variant={alert.severity === 'danger' ? 'rose' : alert.severity === 'warning' ? 'amber' : 'cyan'}
                size="sm"
              >
                {alert.severity.toUpperCase()}
              </Badge>
              {alert.evacuationAdvised && (
                <Badge variant="rose" size="sm" icon={<AlertOctagon className="h-3 w-3" />}>
                  EVACUATION ACTIVE
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              {alert.description}
            </p>

            {/* Room Location & PPM Pill */}
            {(alert.room || alert.gasPpm) && (
              <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                {alert.room && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-slate-300 font-mono text-[11px]">
                    <MapPin className="h-3 w-3 text-rose-400" /> {alert.room}
                  </span>
                )}
                {alert.gasPpm && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/60 border border-rose-500/30 text-rose-300 font-mono text-[11px] font-bold">
                    MQ-2 Reading: {alert.gasPpm} PPM
                  </span>
                )}
              </div>
            )}

            {alert.actionTaken && (
              <div className="mt-2 text-[11px] font-mono text-cyan-300 bg-cyan-950/40 p-2 rounded-lg border border-cyan-500/20">
                <strong>Autonomous Action:</strong> {alert.actionTaken}
              </div>
            )}
            <div className="flex items-center gap-3 mt-2 text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3 text-cyan-400" /> {alert.source}
              </span>
              <span>•</span>
              <span>{alert.timestamp}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end sm:self-start shrink-0 pt-2 sm:pt-0">
          {!alert.acknowledged && (
            <button
              onClick={() => onAcknowledge(alert.id)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Acknowledge</span>
            </button>
          )}

          <button
            onClick={() => onDismiss(alert.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors cursor-pointer"
            title="Dismiss Alert"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
};
