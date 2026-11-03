import React, { useState, useMemo } from 'react';
import { 
  Bell, 
  Flame, 
  AlertTriangle, 
  Cpu, 
  Unplug, 
  CheckCircle2, 
  History, 
  Clock, 
  Filter, 
  Check, 
  Trash2,
  RefreshCw,
  Zap,
  Activity,
  Radio
} from 'lucide-react';
import { SystemAlert, AlertCategory, SystemAlertType } from '../../types';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import { useSmartHome } from '../../hooks/useSmartHome';

export const NotificationCenter: React.FC = () => {
  const { 
    alerts, 
    acknowledgeAlert, 
    dismissAlert,
    triggerHighTempAlert,
    triggerSensorDisconnectedAlert,
    triggerWifiDisconnectedAlert,
    triggerDeviceOfflineAlert,
    triggerUnexpectedRestartAlert,
    triggerRecoveryNotification
  } = useSmartHome();

  const [selectedCategory, setSelectedCategory] = useState<AlertCategory | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'danger' | 'warning' | 'info'>('all');

  // Categorize alerts dynamically
  const categorizedAlerts = useMemo(() => {
    return alerts.map(alert => {
      let cat: AlertCategory = alert.category || 'history';
      if (!alert.category) {
        if (alert.severity === 'danger' || alert.type === 'gas_leak') cat = 'critical';
        else if (alert.type === 'sensor_fault' || alert.type === 'sensor_disconnected') cat = 'sensor_fault';
        else if (alert.type === 'recovery') cat = 'recovery';
        else if (alert.type === 'high_temp' || alert.type === 'abnormal_power') cat = 'warning';
        else cat = 'device';
      }
      return { ...alert, resolvedCategory: cat };
    });
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return categorizedAlerts.filter(alert => {
      const matchCat = selectedCategory === 'all' || alert.resolvedCategory === selectedCategory;
      const matchSev = severityFilter === 'all' || alert.severity === severityFilter;
      return matchCat && matchSev;
    });
  }, [categorizedAlerts, selectedCategory, severityFilter]);

  const counts = useMemo(() => {
    return {
      all: alerts.length,
      critical: categorizedAlerts.filter(a => a.resolvedCategory === 'critical').length,
      warning: categorizedAlerts.filter(a => a.resolvedCategory === 'warning').length,
      device: categorizedAlerts.filter(a => a.resolvedCategory === 'device').length,
      sensor_fault: categorizedAlerts.filter(a => a.resolvedCategory === 'sensor_fault').length,
      recovery: categorizedAlerts.filter(a => a.resolvedCategory === 'recovery').length,
      history: alerts.filter(a => a.acknowledged).length,
    };
  }, [alerts, categorizedAlerts]);

  const getAlertIcon = (type: SystemAlertType) => {
    switch (type) {
      case 'gas_leak':
        return <Flame className="h-5 w-5 text-rose-400" />;
      case 'high_temp':
        return <AlertTriangle className="h-5 w-5 text-amber-400" />;
      case 'sensor_fault':
      case 'sensor_disconnected':
        return <Unplug className="h-5 w-5 text-amber-400" />;
      case 'device_offline':
      case 'wifi_disconnected':
        return <Cpu className="h-5 w-5 text-rose-400" />;
      case 'abnormal_power':
        return <Zap className="h-5 w-5 text-amber-400" />;
      case 'recovery':
        return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
      default:
        return <Bell className="h-5 w-5 text-cyan-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Simulation Triggers */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-3xl bg-slate-900 border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Radio className="h-5 w-5 text-cyan-400" />
            Dashboard Notification & Alert Center
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time life-safety events, device status anomalies, sensor diagnostics, and audit history.
          </p>
        </div>

        {/* Quick Diagnostics Strip */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-mono text-slate-400">Diagnostic Tests:</span>
          <button
            onClick={() => triggerHighTempAlert(34.8)}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-mono cursor-pointer"
          >
            DHT11 High Temp
          </button>
          <button
            onClick={() => triggerSensorDisconnectedAlert('mq2')}
            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-mono cursor-pointer"
          >
            MQ-2 Disconnect
          </button>
          <button
            onClick={triggerWifiDisconnectedAlert}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-mono cursor-pointer"
          >
            Wi-Fi Lost
          </button>
          <button
            onClick={triggerDeviceOfflineAlert}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-mono cursor-pointer"
          >
            Node Offline
          </button>
          <button
            onClick={triggerUnexpectedRestartAlert}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-mono cursor-pointer"
          >
            Reboot
          </button>
          <button
            onClick={() => triggerRecoveryNotification('ESP32 Wi-Fi & MQ-2 Telemetry')}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-mono cursor-pointer"
          >
            Recovery Event
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'all'
              ? 'bg-cyan-600 text-white shadow-glow-cyan'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          All Alerts ({counts.all})
        </button>

        <button
          onClick={() => setSelectedCategory('critical')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'critical'
              ? 'bg-rose-600 text-white shadow-glow-danger'
              : 'bg-slate-900 text-rose-300 hover:bg-rose-950/40 border border-slate-800'
          }`}
        >
          <Flame className="h-3.5 w-3.5 text-rose-400" />
          Critical Alerts ({counts.critical})
        </button>

        <button
          onClick={() => setSelectedCategory('warning')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'warning'
              ? 'bg-amber-600 text-white'
              : 'bg-slate-900 text-amber-300 hover:bg-amber-950/40 border border-slate-800'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          Warning Alerts ({counts.warning})
        </button>

        <button
          onClick={() => setSelectedCategory('device')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'device'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-900 text-indigo-300 hover:bg-indigo-950/40 border border-slate-800'
          }`}
        >
          <Cpu className="h-3.5 w-3.5 text-indigo-400" />
          Device Alerts ({counts.device})
        </button>

        <button
          onClick={() => setSelectedCategory('sensor_fault')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'sensor_fault'
              ? 'bg-orange-600 text-white'
              : 'bg-slate-900 text-orange-300 hover:bg-orange-950/40 border border-slate-800'
          }`}
        >
          <Unplug className="h-3.5 w-3.5 text-orange-400" />
          Sensor Fault Alerts ({counts.sensor_fault})
        </button>

        <button
          onClick={() => setSelectedCategory('recovery')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'recovery'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-900 text-emerald-300 hover:bg-emerald-950/40 border border-slate-800'
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          Recovery Notifications ({counts.recovery})
        </button>

        <button
          onClick={() => setSelectedCategory('history')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'history'
              ? 'bg-slate-700 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <History className="h-3.5 w-3.5" />
          Emergency History ({counts.history})
        </button>
      </div>

      {/* Alert Cards Feed */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-slate-900/50 border border-slate-800 text-slate-400 font-mono text-xs">
            No notification events found for the selected filter.
          </div>
        ) : (
          filteredAlerts.map(alert => {
            const isDanger = alert.severity === 'danger';
            const isRecovery = alert.type === 'recovery';
            return (
              <div
                key={alert.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isDanger
                    ? 'bg-gradient-to-r from-rose-950/50 via-slate-900 to-slate-950 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)]'
                    : isRecovery
                    ? 'bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-950 border-emerald-500/40'
                    : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                      isDanger
                        ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                        : isRecovery
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}>
                      {getAlertIcon(alert.type)}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm text-slate-100">
                          {alert.title}
                        </h4>
                        <Badge
                          variant={isDanger ? 'rose' : alert.severity === 'warning' ? 'amber' : 'emerald'}
                          size="sm"
                        >
                          {alert.severity.toUpperCase()}
                        </Badge>
                        {alert.emergencyStatus && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            STATUS: {alert.emergencyStatus}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">
                        {alert.description}
                      </p>

                      {/* Detailed Meta Strip: All 10 Required Event Fields */}
                      <div className="pt-2 flex items-center gap-3 flex-wrap text-[11px] font-mono text-slate-400">
                        <span><strong>Alert ID:</strong> {alert.id}</span>
                        {alert.deviceId && <span><strong>Device ID:</strong> {alert.deviceId}</span>}
                        <span><strong>Type:</strong> {alert.type}</span>
                        {alert.sensorReading && (
                          <span className="text-cyan-300">
                            <strong>Reading:</strong> {alert.sensorReading}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {alert.timestamp}
                        </span>
                        {alert.source && (
                          <span><strong>Source:</strong> {alert.source}</span>
                        )}
                      </div>

                      {alert.actionTaken && (
                        <div className="mt-1.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          <span><strong>Action Taken:</strong> {alert.actionTaken}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions: Acknowledge & Dismiss */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!alert.acknowledged && (
                      <button
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        title="Acknowledge alert"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                      title="Dismiss alert"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

