import React from 'react';
import {
  LayoutDashboard,
  ToggleRight,
  CalendarClock,
  Activity,
  Zap,
  Mic,
  Workflow,
  ShieldAlert,
  Settings,
  UserCheck,
  Cpu,
  Wifi,
  ExternalLink,
  Radio
} from 'lucide-react';
import { useSmartHome } from '../../hooks/useSmartHome';
import { NavigationPage } from '../../types';
import { Badge } from '../common/Badge';

interface NavItem {
  id: NavigationPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: 'emerald' | 'cyan' | 'teal' | 'rose' | 'amber';
}

export const Sidebar: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { currentPage, setCurrentPage, alerts, telemetry, schedules, hardwareBridge } = useSmartHome();

  const unreadAlerts = alerts.filter(a => !a.acknowledged).length;
  const activeSchedules = schedules ? schedules.filter(s => s.enabled).length : 0;

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'devices', label: 'Devices', icon: ToggleRight, badge: '5 Relays', badgeVariant: 'emerald' },
    { id: 'sensors', label: 'Sensors', icon: Activity },
    { id: 'automations', label: 'Automation', icon: Workflow },
    {
      id: 'schedules',
      label: 'Schedules',
      icon: CalendarClock,
      badge: activeSchedules > 0 ? `${activeSchedules}` : undefined,
      badgeVariant: 'emerald'
    },
    {
      id: 'alerts',
      label: 'Alerts & Logs',
      icon: ShieldAlert,
      badge: unreadAlerts > 0 ? `${unreadAlerts} New` : undefined,
      badgeVariant: unreadAlerts > 0 ? 'rose' : undefined
    },
    { id: 'analytics', label: 'Analytics', icon: Zap },
    { id: 'voice', label: 'Voice Assistant', icon: Mic, badge: 'HomeX', badgeVariant: 'emerald' },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'auth', label: 'Account & Auth', icon: UserCheck },
  ];

  const handleNavClick = (id: NavigationPage) => {
    setCurrentPage(id);
    onClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-[#0B0F12]/85 backdrop-blur-md z-40 lg:hidden"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-72 bg-[#080D11] border-r border-white/[0.08] flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
      >
        {/* Brand header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
          <div
            onClick={() => handleNavClick('overview')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 p-0.5 shadow-glow-emerald group-hover:scale-105 transition-transform shrink-0">
              <div className="h-full w-full bg-[#0B0F12] rounded-[10px] flex items-center justify-center">
                <Cpu className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-lg tracking-tight text-[#F8FAFC]">
                  SmartHomeX
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                  AI
                </span>
              </div>
              <p className="text-[11px] text-[#94A3B8] font-medium tracking-wide">
                AI-Powered Smart Home
              </p>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-[#64748B] font-semibold">
            Control Center
          </div>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group cursor-pointer ${isActive
                  ? 'bg-emerald-500/12 text-emerald-300 border-l-2 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.12)] font-semibold'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#141C23] border-l-2 border-transparent'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-4.5 w-4.5 transition-colors ${isActive ? 'text-emerald-400' : 'text-[#64748B] group-hover:text-emerald-400'
                      }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <Badge
                    variant={item.badgeVariant || (isActive ? 'emerald' : 'slate')}
                    size="sm"
                  >
                    {item.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Hardware Status Card */}
        <div className="p-3.5 border-t border-white/[0.08]">
          <div className="rounded-xl p-3 bg-[#111820] border border-white/[0.08]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  {hardwareBridge.esp32Connected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${hardwareBridge.esp32Connected ? 'bg-emerald-500 shadow-glow-emerald' : 'bg-slate-500'
                      }`}
                  ></span>
                </span>
                <span className="text-xs font-semibold text-[#F8FAFC]">ESP32 Node</span>
              </div>
              <Badge variant={hardwareBridge.esp32Connected ? 'emerald' : 'demo'} size="sm">
                {hardwareBridge.esp32Connected
                  ? 'ONLINE'
                  : (!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true')
                    ? 'DEMO'
                    : 'OFFLINE'}
              </Badge>
            </div>

            <div className="space-y-1.5 text-[11px] font-mono text-[#94A3B8]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[#64748B]">
                  <Wifi className="h-3 w-3 text-emerald-400" /> Wi-Fi RSSI
                </span>
                <span className={hardwareBridge.esp32Connected ? 'text-emerald-300' : 'text-slate-500'}>
                  {hardwareBridge.esp32Connected && telemetry.wifiRssi != null ? `${telemetry.wifiRssi} dBm` : '-- dBm'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#64748B]">Relay Bank:</span>
                <span className="text-slate-300">4 Relays Active</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#64748B]">Gas Safety:</span>
                {(() => {
                  const isOffline = !hardwareBridge.esp32Connected || telemetry.gasRawAdc == null || telemetry.gasStatus === 'offline';
                  return (
                    <span className={`font-semibold text-[11px] ${isOffline
                      ? 'text-slate-500'
                      : telemetry.gasStatus === 'danger'
                        ? 'text-red-400 font-bold'
                        : telemetry.gasStatus === 'warning'
                          ? 'text-amber-400'
                          : telemetry.gasStatus === 'warming_up'
                            ? 'text-cyan-400'
                            : 'text-emerald-400'
                      }`}>
                      {isOffline ? 'OFFLINE' : telemetry.gasStatus.toUpperCase()}
                    </span>
                  );
                })()}
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-white/[0.05] text-[10px]">
                <span className="text-[#64748B]">Telemetry:</span>
                <span className="text-slate-400 truncate max-w-[120px]">
                  {telemetry.lastUpdated || 'Connecting...'}
                </span>
              </div>
            </div>

            <button
              onClick={() => handleNavClick('sensors')}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium border border-emerald-500/20 transition-colors cursor-pointer"
            >
              <Radio className="h-3 w-3 text-emerald-400" />
              <span>Inspect Sensors</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
