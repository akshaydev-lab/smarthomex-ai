import React, { useState } from 'react';
import { 
  Menu, 
  Bell, 
  Mic, 
  Flame, 
  Zap, 
  Thermometer, 
  CheckCircle2, 
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Eye
} from 'lucide-react';
import { useSmartHome } from '../../hooks/useSmartHome';
import { formatTemperature, formatVoltage, formatWatts } from '../../lib/utils';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

export const Header: React.FC<{ onMenuToggle: () => void }> = ({ onMenuToggle }) => {
  const { 
    currentPage, 
    setCurrentPage, 
    telemetry, 
    totalActiveWatts, 
    alerts, 
    acknowledgeAlert, 
    triggerGasLeakAlert,
    clearSimulatedIncident,
    setIsGasEmergencyModalOpen,
    user 
  } = useSmartHome();

  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);
  const isDemoMode = !import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true';

  const unreadAlerts = alerts.filter(a => !a.acknowledged);

  const getPageTitle = () => {
    switch (currentPage) {
      case 'overview': return { title: 'Overview Dashboard', subtitle: 'Live IoT telemetry, relay actuation & energy summary' };
      case 'devices': return { title: 'Device Management', subtitle: '4-channel relay controls, power telemetry & room allocation' };
      case 'schedules': return { title: 'Device Schedules & Timers', subtitle: 'Automated ON/OFF execution in Asia/Kolkata (IST)' };
      case 'sensors': return { title: 'Sensor Monitoring', subtitle: 'DHT11, MQ-2 & INA219 real-time sensor streams' };
      case 'analytics': return { title: 'Energy Analytics', subtitle: 'Historical power draw, hourly metrics & efficiency insights' };
      case 'voice': return { title: 'HomeX AI Voice Assistant', subtitle: 'Natural speech recognition & autonomous IoT command execution' };
      case 'automations': return { title: 'Automation Rules', subtitle: 'Rule engine for local ESP32 safety triggers & smart comfort' };
      case 'alerts': return { title: 'Safety & System Alerts', subtitle: 'Gas leak, smoke, thermal & abnormal electrical events' };
      case 'settings': return { title: 'System Settings', subtitle: 'ESP32 Wi-Fi configuration, MQTT topics & user preferences' };
      case 'auth': return { title: 'Account & Supabase Auth', subtitle: 'Authentication gateway & cloud database sync settings' };
      default: return { title: 'SmartHomeX AI', subtitle: 'Intelligent IoT Platform' };
    }
  };

  const { title, subtitle } = getPageTitle();

  return (
    <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-cyan-500/15 px-4 sm:px-6 lg:px-8 py-3.5">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Hamburger & Page Titles */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuToggle}
            className="p-2 rounded-xl text-slate-400 hover:text-cyan-300 hover:bg-slate-800/60 lg:hidden border border-slate-800 transition-colors cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-100">
                {title}
              </h1>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Right: Telemetry Chips & Action Buttons */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Real-time Telemetry Pills (Desktop/Tablet) */}
          <div className="hidden md:flex items-center gap-2 bg-slate-900/60 p-1.5 rounded-xl border border-cyan-500/15">
            {/* Live Voltage */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800/60 text-xs font-mono">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-slate-400">INA219:</span>
              <span className="text-slate-200 font-semibold">{formatVoltage(telemetry.voltage)}</span>
            </div>

            {/* Total Active Load */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800/60 text-xs font-mono">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span className="text-slate-400">Load:</span>
              <span className="text-cyan-300 font-semibold">{telemetry.power != null ? formatWatts(telemetry.power) : '-- W'}</span>
            </div>

            {/* Ambient Temp */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800/60 text-xs font-mono">
              <Thermometer className="h-3.5 w-3.5 text-teal-400" />
              <span className="text-slate-400">DHT11:</span>
              <span className="text-teal-300 font-semibold">{formatTemperature(telemetry.temperature)}</span>
            </div>
          </div>

          {/* Emergency Alert Indicator or Trigger Simulator */}
          {telemetry.gasStatus === 'danger' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsGasEmergencyModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white shadow-glow-danger border border-rose-400 animate-pulse cursor-pointer"
              >
                <Flame className="h-4 w-4" />
                <span className="hidden sm:inline">CRITICAL: GAS LEAK</span>
                <Eye className="h-3.5 w-3.5" />
              </button>

              {isDemoMode && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<RotateCcw className="h-3.5 w-3.5 text-emerald-400" />}
                  onClick={clearSimulatedIncident}
                  className="text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10"
                >
                  <span className="hidden sm:inline">Reset</span>
                </Button>
              )}
            </div>
          ) : isDemoMode ? (
            <button
              onClick={() => triggerGasLeakAlert(485, 'Kitchen & Utility Area')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-all shadow-[0_0_12px_rgba(244,63,94,0.2)] cursor-pointer"
              title="Trigger simulated MQ-2 gas leakage emergency alert"
            >
              <Flame className="h-3.5 w-3.5 text-rose-400 animate-pulse" />
              <span className="hidden sm:inline">Simulate Gas Leak</span>
            </button>
          ) : null}

          {/* HomeX AI Quick Trigger */}
          <button
            onClick={() => setCurrentPage('voice')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500/20 to-teal-500/20 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 hover:shadow-glow-cyan transition-all cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden sm:inline">HomeX AI</span>
            <Mic className="h-3.5 w-3.5" />
          </button>

          {/* Notification Bell Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowAlertsDropdown(!showAlertsDropdown)}
              className="relative p-2 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-slate-800/60 border border-slate-800 transition-colors cursor-pointer"
              aria-label="Alerts"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-glow-danger animate-pulse">
                  {unreadAlerts.length}
                </span>
              )}
            </button>

            {showAlertsDropdown && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl glass-panel shadow-2xl p-4 border border-cyan-500/20 z-50 animate-slide-up">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-100">System Notifications</span>
                    {isDemoMode && <Badge variant="demo" size="sm">DEMO</Badge>}
                  </div>
                  <button 
                    onClick={() => {
                      setShowAlertsDropdown(false);
                      setCurrentPage('alerts');
                    }}
                    className="text-xs text-cyan-400 hover:underline cursor-pointer"
                  >
                    View All ({alerts.length})
                  </button>
                </div>

                <div className="mt-3 space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {alerts.slice(0, 3).map(alert => (
                    <div
                      key={alert.id}
                      className={`p-2.5 rounded-xl border text-xs ${
                        alert.severity === 'danger'
                          ? 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                          : alert.severity === 'warning'
                          ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold flex items-center gap-1.5">
                          {alert.severity === 'danger' ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          )}
                          {alert.title}
                        </span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{alert.timestamp}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1">{alert.description}</p>
                      {!alert.acknowledged && (
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="mt-2 text-[10px] flex items-center gap-1 text-cyan-400 hover:underline cursor-pointer"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Mark acknowledged
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User Profile trigger */}
          <button
            onClick={() => setCurrentPage('auth')}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-800 cursor-pointer"
          >
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 p-0.5">
              <div className="h-full w-full rounded-full bg-slate-950 flex items-center justify-center text-xs font-bold text-cyan-300">
                {user ? user.name.charAt(0) : 'U'}
              </div>
            </div>
            <div className="text-left hidden xl:block">
              <div className="text-xs font-semibold text-slate-200 leading-tight">
                {user ? user.name : 'Sign In'}
              </div>
              <div className="text-[10px] text-cyan-400 font-mono">
                {user ? user.role : 'Guest Mode'}
              </div>
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};
