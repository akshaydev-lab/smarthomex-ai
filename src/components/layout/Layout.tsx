import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { DemoNotice } from '../common/DemoNotice';
import { GasEmergencyModal } from '../alerts/GasEmergencyModal';
import { EmergencyStatusBanner } from '../alerts/EmergencyStatusBanner';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-x-hidden">
      {/* Ambient glowing background orbs */}
      <div className="ambient-bg">
        <div className="ambient-orb-1" />
        <div className="ambient-orb-2" />
        <div className="ambient-orb-3" />
      </div>

      {/* Full-Screen Red Emergency Gas Alert Modal */}
      <GasEmergencyModal />

      {/* Responsive Sidebar */}
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
