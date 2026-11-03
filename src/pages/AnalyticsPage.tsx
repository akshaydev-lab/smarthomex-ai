import React, { useState } from 'react';
import { 
  Zap, 
  Download 
} from 'lucide-react';
import { INA219MetricsCards } from '../components/energy/INA219MetricsCards';
import { LivePowerStreamingGraph } from '../components/energy/LivePowerStreamingGraph';
import { INA219UsageReportsChart } from '../components/energy/INA219UsageReportsChart';
import { VoltageCurrentHistoryChart } from '../components/energy/VoltageCurrentHistoryChart';
import { AbnormalPowerAlertsPanel } from '../components/energy/AbnormalPowerAlertsPanel';
import { DeviceWiseEnergyAllocation } from '../components/energy/DeviceWiseEnergyAllocation';
import { INA219BackendNotice } from '../components/energy/INA219BackendNotice';
import { TemperatureChart } from '../components/charts/TemperatureChart';
import { HumidityChart } from '../components/charts/HumidityChart';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { 
  getHourlyTelemetryData, 
  getDailyEnergyData, 
  getWeeklyEnergyData,
  getMonthlyEnergyData 
} from '../services/sensorService';

export const AnalyticsPage: React.FC = () => {
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const hourlyData = getHourlyTelemetryData();
  const dailyData = getDailyEnergyData();
  const weeklyData = getWeeklyEnergyData();
  const monthlyData = getMonthlyEnergyData();

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      alert('INA219 Energy Telemetry Report exported. (Simulated CSV including Bus Voltage, Shunt Voltage, Current, Power & Wh integration)');
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Export Action */}
      <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-cyan-500/20">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-500 to-teal-400 text-slate-950 font-bold shadow-glow-cyan">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100">INA219 Precision Energy Intelligence Center</h2>
              <Badge variant="teal" size="sm">Hardware Monitored</Badge>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              High-side DC/AC voltage, current shunt & real-time Riemann energy accumulation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true' && (
            <Badge variant="demo" size="md">DEMO DATA</Badge>
          )}

          <Button
            variant="glass"
            size="sm"
            isLoading={isExporting}
            leftIcon={<Download className="h-3.5 w-3.5" />}
            onClick={handleExport}
          >
            Export Energy CSV
          </Button>
        </div>
      </Card>

      {/* 1. Live INA219 Metrics Cards: Voltage, Current, Power, Energy (Wh/kWh), Estimated Bill */}
      <INA219MetricsCards />

      {/* 2. Live Power Consumption Streaming Graph (4s Tick) */}
      <LivePowerStreamingGraph />

      {/* 3. Daily, Weekly & Monthly Energy Reports */}
      <INA219UsageReportsChart 
        dailyData={dailyData} 
        weeklyData={weeklyData} 
        monthlyData={monthlyData} 
      />

      {/* 4. Voltage & Current Telemetry History (Dual-Axis with Sag/Surge Bounds) */}
      <VoltageCurrentHistoryChart data={hourlyData} />

      {/* 5. Abnormal Power Consumption & Anomaly Guards Panel */}
      <AbnormalPowerAlertsPanel />

      {/* 6. Device-Wise Energy Analytics & Hardware Isolation Notice */}
      <DeviceWiseEnergyAllocation />

      {/* 7. Climate Environmental Telemetry: Temperature & Humidity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TemperatureChart data={hourlyData} />
        <HumidityChart data={hourlyData} />
      </div>

      {/* 8. Backend Integration Architecture & Supabase SQL Notice */}
      <INA219BackendNotice />
    </div>
  );
};
