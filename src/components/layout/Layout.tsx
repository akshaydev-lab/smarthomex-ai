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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-x-hidden">
      {/* Ambient glowing background orbs */}
      <div className="ambient-bg">
        <div className="ambient-orb-1" />
        <div className="ambient-orb-2" />
        <div className="ambient-orb-3" />
      </div>

      {/* Live System Feedback Toast Container */}
      <LiveNotificationToast />

      {/* Full-Screen Red Emergency Gas Alert Modal */}
      <GasEmergencyModal />

      {/* Responsive Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex flex-col flex-1 min-w-0 z-10">
        <Header onMenuToggle={() => setSidebarOpen(true)} />

        {/* Demo Simulation Warning Notice */}
        <DemoNotice />

        {/* Real-Time Life-Safety Emergency Lockout Banner */}
        <EmergencyStatusBanner />

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileNav />
    </div>
  );
};
