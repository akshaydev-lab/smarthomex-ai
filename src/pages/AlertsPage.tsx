import React from 'react';
import { SafetyArchitectureNotice } from '../components/alerts/SafetyArchitectureNotice';
import { AndroidSirenSimulator } from '../components/alerts/AndroidSirenSimulator';
import { NotificationCenter } from '../components/alerts/NotificationCenter';
import { EmergencyLockoutResetControl } from '../components/alerts/EmergencyLockoutResetControl';

export const AlertsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Safe Emergency Lockout Reset Feature (Prominently displayed during lockout) */}
      <EmergencyLockoutResetControl />

      {/* Safety Architecture Notice */}
      <SafetyArchitectureNotice />

      {/* Android Mobile Emergency Siren Simulator & FCM Push Architecture */}
      <AndroidSirenSimulator />

      {/* Complete Dashboard Notification Center */}
      <NotificationCenter />
    </div>
  );
};
