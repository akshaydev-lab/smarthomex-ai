import React from 'react';
import { LayoutDashboard, ToggleRight, Activity, Mic, ShieldAlert } from 'lucide-react';
import { useSmartHome } from '../../hooks/useSmartHome';
import { NavigationPage } from '../../types';

export const MobileNav: React.FC = () => {
  const { currentPage, setCurrentPage, alerts } = useSmartHome();
  const unreadAlerts = alerts.filter(a => !a.acknowledged).length;

  const items: { id: NavigationPage; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'devices', label: 'Devices', icon: ToggleRight },
    { id: 'sensors', label: 'Sensors', icon: Activity },
    { id: 'voice', label: 'HomeX', icon: Mic },
    { id: 'alerts', label: 'Alerts', icon: ShieldAlert, badge: unreadAlerts },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#080D11]/95 backdrop-blur-xl border-t border-white/[0.08] py-2 px-3">
      <div className="flex items-center justify-around">
        {items.map(item => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all relative cursor-pointer ${
                isActive
                  ? 'text-emerald-400 font-semibold'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <div className="relative">
                <Icon className={`h-5 w-5 ${isActive ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]' : ''}`} />
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-glow-danger">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
