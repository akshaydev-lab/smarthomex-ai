import React from 'react';
import { SmartHomeProvider, useSmartHome } from './context/SmartHomeContext';
import { Layout } from './components/layout/Layout';
import { OverviewPage } from './pages/OverviewPage';
import { DevicesPage } from './pages/DevicesPage';
import { SchedulesPage } from './pages/SchedulesPage';
import { SensorsPage } from './pages/SensorsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { VoiceAssistantPage } from './pages/VoiceAssistantPage';
import { AutomationsPage } from './pages/AutomationsPage';
import { AlertsPage } from './pages/AlertsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthPage } from './pages/AuthPage';

const AppContent: React.FC = () => {
  const { currentPage, isAuthenticated } = useSmartHome();

  const renderCurrentPage = () => {
    // Protected Dashboard Routes: Intercept unauthenticated access to system dashboard
    if (!isAuthenticated && currentPage !== 'auth') {
      return <AuthPage />;
    }

    switch (currentPage) {
      case 'overview':
        return <OverviewPage />;
      case 'devices':
        return <DevicesPage />;
      case 'schedules':
        return <SchedulesPage />;
      case 'sensors':
        return <SensorsPage />;
      case 'analytics':
        return <AnalyticsPage />;
      case 'voice':
        return <VoiceAssistantPage />;
      case 'automations':
        return <AutomationsPage />;
      case 'alerts':
        return <AlertsPage />;
      case 'settings':
        return <SettingsPage />;
      case 'auth':
        return <AuthPage />;
      default:
        return <OverviewPage />;
    }
  };

  return <Layout>{renderCurrentPage()}</Layout>;
};

export function App() {
  return (
    <SmartHomeProvider>
      <AppContent />
    </SmartHomeProvider>
  );
}

export default App;
