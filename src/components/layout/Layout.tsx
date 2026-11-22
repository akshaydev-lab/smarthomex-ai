import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { DemoNotice } from '../common/DemoNotice';
import { GasEmergencyModal } from '../alerts/GasEmergencyModal';
import { EmergencyStatusBanner } from '../alerts/EmergencyStatusBanner';
import { LiveNotificationToast } from '../common/LiveNotificationToast';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0B0F12] text-[#F8FAFC] flex flex-col relative overflow-x-hidden selection:bg-emerald-500 selection:text-slate-950">
      {/* Subtle emerald architectural ambient lighting */}
      <div className="ambient-bg">
        <div className="ambient-orb-1" />
        <div className="ambient-orb-2" />
        <div className="ambient-orb-3" />
      </div>

      {/* Live System Feedback Toast Container */}
      <LiveNotificationToast />

      {/* Full-Screen Red Emergency Gas Alert Modal (Highest Priority) */}
      <GasEmergencyModal />

      {/* Responsive Emerald Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="lg:pl-72 flex-1 flex flex-col min-h-screen relative z-10 pb-16 lg:pb-8">
        <Header onMenuToggle={() => setSidebarOpen(prev => !prev)} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fade-in">
          {/* Dashboard Persistent Emergency Hazard Indicator */}
          <EmergencyStatusBanner />

          <DemoNotice />
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />
    </div>
  );
};
