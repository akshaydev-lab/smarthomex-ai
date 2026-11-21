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
  Eye,
  ShieldCheck,
  Radio
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
    gasSafetyState,
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
      case 'overview': return { title: 'Dashboard', subtitle: 'Live IoT telemetry, relay actuation & energy summary' };
      case 'devices': return { title: 'Device Controls', subtitle: '4-channel active-LOW relays & real-time load telemetry' };
      case 'schedules': return { title: 'Device Schedules', subtitle: 'Autonomous timer execution in Asia/Kolkata (IST)' };
      case 'sensors': return { title: 'Sensor Intelligence', subtitle: 'DHT11, MQ-2 analog ADC & INA219 power monitors' };
      case 'analytics': return { title: 'Energy Analytics', subtitle: 'Historical power consumption & real-time load analytics' };
      case 'voice': return { title: 'HomeX AI Voice Assistant', subtitle: 'Natural speech recognition & autonomous IoT command execution' };
      case 'automations': return { title: 'Automation Engine', subtitle: 'Local safety interlocks & environmental comfort triggers' };
      case 'alerts': return { title: 'Safety & System Logs', subtitle: 'Gas leak, smoke, thermal & abnormal electrical events' };
      case 'settings': return { title: 'System Settings', subtitle: 'Hardware tokens, thresholds & audio speaker diagnostics' };
      case 'auth': return { title: 'Account & Security', subtitle: 'Supabase authentication & cloud database sync settings' };
      default: return { title: 'SmartHomeX AI', subtitle: 'Smart Control Center' };
    }
  };

  const { title, subtitle } = getPageTitle();

  return (
    <header className="sticky top-0 z-30 bg-[#0B0F12]/85 backdrop-blur-xl border-b border-white/[0.08] px-4 sm:px-6 lg:px-8 py-3.5">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Mobile Menu & Page Titles */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuToggle}
            className="p-2 rounded-xl text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#141C23] lg:hidden border border-white/[0.08] transition-colors cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#F8FAFC]">
                {title}
              </h1>
            </div>
            <p className="text-xs text-[#94A3B8] hidden sm:block">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Right: Telemetry Chips & Action Buttons */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Real-time Telemetry Pills (Desktop/Tablet) */}
          <div className="hidden md:flex items-center gap-2 bg-[#111820] p-1.5 rounded-xl border border-white/[0.08]">
            {/* Live Voltage */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141C23] border border-white/[0.06] text-xs font-mono">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[#64748B]">INA219:</span>
              <span className="text-[#F8FAFC] font-semibold">{formatVoltage(telemetry.voltage)}</span>
            </div>

            {/* Total Active Load */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141C23] border border-white/[0.06] text-xs font-mono">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-glow-emerald"></span>
              <span className="text-[#64748B]">Load:</span>
              <span className="text-emerald-300 font-semibold">{telemetry.power != null ? formatWatts(telemetry.power) : '-- W'}</span>
            </div>

            {/* Ambient Temp */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141C23] border border-white/[0.06] text-xs font-mono">
              <Thermometer className="h-3.5 w-3.5 text-teal-400" />
              <span className="text-[#64748B]">DHT11:</span>
              <span className="text-teal-300 font-semibold">{formatTemperature(telemetry.temperature)}</span>
            </div>
          </div>

          {/* Emergency Alert Indicator or Trigger Simulator */}
          {telemetry.gasStatus === 'danger' || (telemetry.gasRawAdc != null && telemetry.gasRawAdc >= 1600) || gasSafetyState.lockoutStatus === 'CRITICAL' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsGasEmergencyModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-600 text-white shadow-glow-danger border border-red-400 animate-pulse cursor-pointer"
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition-all shadow-[0_0_12px_rgba(239,68,68,0.2)] cursor-pointer"
              title="Trigger simulated MQ-2 gas leakage emergency alert"
            >
              <Flame className="h-3.5 w-3.5 text-red-400 animate-pulse" />
              <span className="hidden sm:inline">Simulate Hazard</span>
            </button>
          ) : null}

          {/* HomeX AI Quick Trigger */}
          <button
            onClick={() => setCurrentPage('voice')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/12 text-emerald-300 border border-emerald-500/30 hover:border-emerald-400 hover:shadow-glow-emerald transition-all cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden sm:inline">HomeX AI</span>
            <Mic className="h-3.5 w-3.5" />
          </button>

          {/* Notification Bell Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowAlertsDropdown(!showAlertsDropdown)}
              className="relative p-2 rounded-xl text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#141C23] border border-white/[0.08] transition-colors cursor-pointer"
              aria-label="Alerts"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-glow-danger animate-pulse">
                  {unreadAlerts.length}
                </span>
              )}
            </button>

            {showAlertsDropdown && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl glass-panel shadow-2xl p-4 border border-white/[0.1] z-50 animate-slide-up bg-[#141C23]">
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[#F8FAFC]">System Notifications</span>
                    {isDemoMode && <Badge variant="demo" size="sm">DEMO</Badge>}
                  </div>
                  <button 
                    onClick={() => {
                      setShowAlertsDropdown(false);
                      setCurrentPage('alerts');
                    }}
                    className="text-xs text-emerald-400 hover:underline cursor-pointer"
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
                          ? 'bg-red-950/30 border-red-500/30 text-red-200'
                          : alert.severity === 'warning'
                          ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                          : 'bg-[#111820] border-white/[0.06] text-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold flex items-center gap-1.5">
                          {alert.severity === 'danger' ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          )}
                          {alert.title}
                        </span>
                        <span className="text-[10px] text-[#64748B] whitespace-nowrap">{alert.timestamp}</span>
                      </div>
                      <p className="text-[11px] text-[#94A3B8] mt-1">{alert.description}</p>
                      {!alert.acknowledged && (
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="mt-2 text-[10px] flex items-center gap-1 text-emerald-400 hover:underline cursor-pointer"
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

          {/* User Profile Trigger */}
          <button
            onClick={() => setCurrentPage('auth')}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl hover:bg-[#141C23] transition-colors border border-transparent hover:border-white/[0.08] cursor-pointer"
          >
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5">
              <div className="h-full w-full rounded-full bg-[#0B0F12] flex items-center justify-center text-xs font-bold text-emerald-300">
                {user ? user.name.charAt(0) : 'U'}
              </div>
            </div>
            <div className="text-left hidden xl:block">
              <div className="text-xs font-semibold text-[#F8FAFC] leading-tight">
                {user ? user.name : 'Sign In'}
              </div>
              <div className="text-[10px] text-emerald-400 font-mono">
                {user ? user.role : 'Guest Mode'}
              </div>
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};
