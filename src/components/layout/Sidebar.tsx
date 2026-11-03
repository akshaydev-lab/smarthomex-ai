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
  ExternalLink
} from 'lucide-react';
import { useSmartHome } from '../../hooks/useSmartHome';
import { NavigationPage } from '../../types';
import { Badge } from '../common/Badge';

interface NavItem {
  id: NavigationPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: 'cyan' | 'teal' | 'rose' | 'amber';
}

export const Sidebar: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { currentPage, setCurrentPage, alerts, telemetry, schedules, hardwareBridge } = useSmartHome();

  const unreadAlerts = alerts.filter(a => !a.acknowledged).length;
  const activeSchedules = schedules ? schedules.filter(s => s.enabled).length : 0;

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview Dashboard', icon: LayoutDashboard },
    { id: 'devices', label: 'Device Management', icon: ToggleRight, badge: '4 Relays' },
    {
      id: 'schedules',
      label: 'Schedules',
      icon: CalendarClock,
      badge: activeSchedules > 0 ? `${activeSchedules} Active` : undefined,
      badgeVariant: 'teal'
    },
    { id: 'sensors', label: 'Sensor Monitoring', icon: Activity },
    { id: 'analytics', label: 'Energy Analytics', icon: Zap },
    { id: 'voice', label: 'AI Voice Assistant', icon: Mic, badge: 'HomeX', badgeVariant: 'teal' },
    { id: 'automations', label: 'Automation Rules', icon: Workflow },
    {
      id: 'alerts',
      label: 'Alerts & Safety',
      icon: ShieldAlert,
      badge: unreadAlerts > 0 ? `${unreadAlerts} New` : undefined,
      badgeVariant: unreadAlerts > 0 ? 'rose' : undefined
    },
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
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-72 bg-slate-950/95 lg:bg-slate-950/70 backdrop-blur-xl border-r border-cyan-500/15 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
      >
        {/* Brand header */}
        <div className="p-5 border-b border-cyan-500/15 flex items-center justify-between">
          <div
            onClick={() => handleNavClick('overview')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-teal-400 p-0.5 shadow-glow-cyan group-hover:scale-105 transition-transform">
              <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Cpu className="h-5 w-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">
                  SmartHomeX
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30">
                  AI
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono tracking-wider">
                IoT AUTOMATION CORE
              </p>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1.5">
          <div className="px-3 pb-2 text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
            System Console
          </div>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group cursor-pointer ${isActive
                  ? 'bg-gradient-to-r from-cyan-500/20 to-teal-500/10 text-cyan-300 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 hover:border-slate-800 border border-transparent'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-4.5 w-4.5 transition-colors ${isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-cyan-400'
                      }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <Badge
                    variant={item.badgeVariant || (isActive ? 'cyan' : 'slate')}
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
        <div className="p-3.5 border-t border-cyan-500/15">
          <div className="rounded-xl p-3 bg-gradient-to-b from-slate-900/80 to-slate-950 border border-cyan-500/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  {hardwareBridge.esp32Connected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${hardwareBridge.esp32Connected ? 'bg-emerald-500' : 'bg-slate-500'
                    }`}></span>
                </span>
                <span className="text-xs font-semibold text-slate-200">ESP32 Hardware</span>
              </div>
              <Badge variant={hardwareBridge.esp32Connected ? 'emerald' : 'demo'} size="sm">
                {hardwareBridge.esp32Connected
                  ? 'Connected'
                  : (!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true')
                    ? 'Demo Mode'
                    : 'Offline'}
              </Badge>
            </div>

            <div className="space-y-1.5 text-[11px] font-mono text-slate-400">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-slate-400">
                  <Wifi className="h-3 w-3 text-cyan-400" /> Wi-Fi RSSI
                </span>
                <span className={hardwareBridge.esp32Connected ? 'text-cyan-300' : 'text-slate-500'}>
                  {hardwareBridge.esp32Connected && telemetry.wifiRssi != null ? `${telemetry.wifiRssi} dBm` : '-- dBm'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Target Relays:</span>
                <span className="text-slate-300">4 Channels (GPIO 14, 25, 26, 27)</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">MQ-2 Gas State:</span>
                {(() => {
                  const isOffline = !hardwareBridge.esp32Connected || telemetry.gasRawAdc == null || telemetry.gasStatus === 'offline';
                  return (
                    <span className={`font-semibold text-[11px] ${
                      isOffline
                        ? 'text-slate-500'
                        : telemetry.gasStatus === 'danger'
                        ? 'text-rose-400'
                        : telemetry.gasStatus === 'warning'
                        ? 'text-amber-400'
                        : telemetry.gasStatus === 'warming_up'
                        ? 'text-cyan-400'
                        : 'text-emerald-400'
                    }`}>
                      {isOffline ? 'OFFLINE / NO DATA' : telemetry.gasStatus.toUpperCase()}
                    </span>
                  );
                })()}
              </div>
            </div>

            <button
              onClick={() => handleNavClick('sensors')}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-medium border border-cyan-500/20 transition-colors cursor-pointer"
            >
              <span>Hardware Telemetry</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
