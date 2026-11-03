import type { 
  EnergyHourlyData, 
  EnergyDailyData, 
  EnergyWeeklyData, 
  EnergyMonthlyData,
  INA219Reading,
  SensorTelemetry, 
  Device, 
  SystemAlert, 
  AutomationRule 
} from '../types';

export const INITIAL_DEVICES: Device[] = [
  {
    id: 'relay-1',
    name: 'Living Room Light',
    type: 'light',
    relayChannel: 1,
    gpioPin: 14,
    state: false, // Default OFF on boot
    room: 'Living Room',
    powerWatts: 0,
    ratedWatts: 45,
    lastToggled: 'On system startup',
    isHardwareConnected: false,
    controlMode: 'MANUAL',
    manualOverrideActive: false,
    lastCommandStatus: 'success',
    commandHistory: [],
  },
  {
    id: 'relay-2',
    name: 'Master Ceiling Fan',
    type: 'fan',
    relayChannel: 2,
    gpioPin: 25,
    state: false, // Default OFF on boot
    room: 'Master Bedroom',
    powerWatts: 0,
    ratedWatts: 75,
    lastToggled: 'On system startup',
    isHardwareConnected: false,
    controlMode: 'MANUAL',
    manualOverrideActive: false,
    lastCommandStatus: 'success',
    commandHistory: [],
  },
  {
    id: 'relay-3',
    name: 'Water Booster Motor',
    type: 'motor',
    relayChannel: 3,
    gpioPin: 26,
    state: false, // Default OFF on boot
    room: 'Utility / Pump Room',
    powerWatts: 0,
    ratedWatts: 750,
    lastToggled: 'On system startup',
    isHardwareConnected: false,
    controlMode: 'MANUAL',
    manualOverrideActive: false,
    maxRuntimeMinutes: 30, // 30-min dry run auto-cutoff protection
    activeRuntimeSeconds: 0,
    lastCommandStatus: 'success',
    commandHistory: [],
  },
  {
    id: 'relay-4',
    name: '4-Ch Relay Ch 4 (Unused)',
    type: 'unused',
    relayChannel: 4,
    gpioPin: 0, // Unused channel on 4-channel module
    state: false, // Always OFF / Unused
    room: 'Hardware Panel',
    powerWatts: 0,
    ratedWatts: 0,
    lastToggled: 'Never',
    isHardwareConnected: false,
    controlMode: 'MANUAL',
    manualOverrideActive: false,
    lastCommandStatus: 'success',
    commandHistory: [],
  },
  {
    id: 'relay-exhaust',
    name: 'Automatic Exhaust Fan',
    type: 'exhaust_fan',
    relayChannel: 5, // Separate Single-Channel Relay
    gpioPin: 27,
    state: false, // Default OFF on boot
    room: 'Kitchen Area',
    powerWatts: 0,
    ratedWatts: 60,
    lastToggled: 'On system startup',
    isHardwareConnected: false,
    controlMode: 'AUTO',
    manualOverrideActive: false,
    isExhaustSafetyCertified: false, // Uncertified: Disabled for spark safety
    lastCommandStatus: 'success',
    commandHistory: [],
  },
];

export const INITIAL_TELEMETRY: SensorTelemetry = {
  temperature: null,
  humidity: null,
  voltage: null,
  busVoltageV: null,
  shuntVoltageMv: null,
  current: null,
  currentMa: null,
  power: null,
  powerMw: null,
  energyWh: 0,
  energyTodayKWh: 0,
  tariffRatePerKwh: 7.50, // Default ₹7.50 / kWh
  currencySymbol: '₹',
  estimatedBillToday: 0,
  estimatedBillMonth: 0,
  ina219Status: 'disconnected',
  gasPpm: null,
  gasRawAdc: null,
  gasStatus: 'offline',
  smokeDetected: false,
  buzzerState: false,
  esp32Status: 'offline',
  wifiRssi: null,
  lastUpdated: '--',
  isHardwareConnected: false,
};

export const INITIAL_ALERTS: SystemAlert[] = (!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true') ? [
  {
    id: 'alert-1',
    type: 'gas_leak',
    severity: 'danger',
    emergencyStatus: 'NORMAL',
    category: 'critical',
    title: 'CRITICAL: GAS LEAKAGE DETECTED',
    description: 'MQ-2 Sensor reported combustible gas above critical threshold in Kitchen & Utility area. Mandatory evacuation advisory issued.',
    sensorReading: '485 PPM (Indicative Relative Index)',
    timestamp: 'Today at 02:15 PM',
    isDemo: true,
    acknowledged: false,
    source: 'MQ-2 Gas Sensor (GPIO 34)',
    actionTaken: 'Acoustic siren sounded. Electrical relays inhibited for spark prevention. Emergency lockout active.',
    gasPpm: 485,
    room: 'Kitchen & Utility Area',
    evacuationAdvised: true,
  },
  {
    id: 'alert-2',
    type: 'high_temp',
    severity: 'warning',
    emergencyStatus: 'NORMAL',
    category: 'warning',
    title: 'High Ambient Temperature',
    description: 'DHT11 recorded 31.5°C in server / utility cabinet.',
    sensorReading: '31.5°C, 58% RH',
    timestamp: 'Today at 11:30 AM',
    isDemo: true,
    acknowledged: true,
    source: 'DHT11 Sensor (GPIO 32)',
    actionTaken: 'Fan Relay 2 engaged for heat dissipation',
  },
  {
    id: 'alert-3',
    type: 'device_offline',
    severity: 'info',
    emergencyStatus: 'NORMAL',
    category: 'device',
    title: 'ESP32 Hardware Node Online',
    description: 'System running with secure token-authenticated ESP32 hardware gateway.',
    sensorReading: 'RSSI: -58 dBm, Heap: 184 KB',
    timestamp: 'Today at 08:00 AM',
    isDemo: true,
    acknowledged: true,
    source: 'ESP32 Hardware Monitor',
  },
  {
    id: 'alert-4',
    type: 'abnormal_power',
    severity: 'warning',
    emergencyStatus: 'NORMAL',
    category: 'warning',
    title: 'Current Surge Protection Check',
    description: 'INA219 logged peak inductive startup surge of 4.2A on Water Motor ignition.',
    sensorReading: 'Peak 4.2A, 966W',
    timestamp: 'Yesterday at 06:45 PM',
    isDemo: true,
    acknowledged: true,
    source: 'INA219 Power Monitor (I2C 0x40)',
    actionTaken: 'Logged to energy harmonics telemetry database',
  },
] : [];

export const INITIAL_AUTOMATIONS: AutomationRule[] = [
  {
    id: 'rule-gas-safety',
    name: 'Emergency Gas Leak Alert & Relay Inhibit',
    category: 'safety',
    triggerType: 'sensor_threshold',
    conditionSummary: 'IF MQ-2 Gas Sensor > 350 PPM',
    actionSummary: 'Sound Dual-Tone Siren + Inhibit Electrical Relay Switching',
    targetDeviceId: undefined,
    actionState: false,
    enabled: true,
    isEsp32LocalRule: true,
    description: 'Life-safety protocol: Triggers acoustic warning siren and locks relays to eliminate spark ignition risk.',
  },
  {
    id: 'rule-temp-comfort',
    name: 'Climate Comfort Thermal Guard',
    category: 'comfort',
    triggerType: 'sensor_threshold',
    conditionSummary: 'IF Ambient Temp > 28°C and Humidity > 65%',
    actionSummary: 'Turn ON Master Ceiling Fan',
    targetDeviceId: 'relay-2',
    actionState: true,
    enabled: true,
    isEsp32LocalRule: false,
    description: 'Maintains optimal bedroom temperature and humidity balance.',
  },
  {
    id: 'rule-pump-cutoff',
    name: 'Dry-Run Motor Protection Timer',
    category: 'safety',
    triggerType: 'time_schedule',
    conditionSummary: 'IF Water Booster Motor ON for > 30 minutes',
    actionSummary: 'Automatically Turn OFF Motor',
    targetDeviceId: 'relay-3',
    actionState: false,
    enabled: true,
    isEsp32LocalRule: true,
    description: 'Prevents pump overheating and overhead tank overflow incidents.',
  },
  {
    id: 'rule-night-eco',
    name: 'Eco Night Power Down',
    category: 'energy',
    triggerType: 'time_schedule',
    conditionSummary: 'EVERY DAY at 11:30 PM',
    actionSummary: 'Turn OFF Living Room Light & verify low-load idle state',
    targetDeviceId: 'relay-1',
    actionState: false,
    enabled: true,
    isEsp32LocalRule: false,
    description: 'Reduces phantom standby drain across non-essential household zones.',
  },
];

export function getHourlyTelemetryData(): EnergyHourlyData[] {
  if (import.meta.env.PROD || import.meta.env.VITE_DEMO_MODE !== 'true') {
    return [];
  }
  return [
    { time: '00:00', powerWatts: 72, voltage: 233.1, current: 0.31, temp: 22.4, humidity: 58 },
    { time: '02:00', powerWatts: 68, voltage: 233.8, current: 0.29, temp: 21.9, humidity: 60 },
    { time: '04:00', powerWatts: 65, voltage: 234.2, current: 0.28, temp: 21.5, humidity: 62 },
    { time: '06:00', powerWatts: 140, voltage: 232.0, current: 0.60, temp: 22.1, humidity: 59 },
    { time: '08:00', powerWatts: 380, voltage: 230.5, current: 1.65, temp: 23.5, humidity: 55 },
    { time: '10:00', powerWatts: 860, voltage: 228.9, current: 3.75, temp: 25.2, humidity: 50 },
    { time: '12:00', powerWatts: 180, voltage: 231.2, current: 0.78, temp: 27.4, humidity: 46 },
    { time: '14:00', powerWatts: 210, voltage: 229.8, current: 0.91, temp: 28.1, humidity: 44 },
    { time: '16:00', powerWatts: 240, voltage: 230.4, current: 1.04, temp: 27.6, humidity: 47 },
    { time: '18:00', powerWatts: 890, voltage: 228.4, current: 3.90, temp: 26.2, humidity: 51 },
    { time: '20:00', powerWatts: 420, voltage: 230.1, current: 1.82, temp: 25.1, humidity: 53 },
    { time: '22:00', powerWatts: 190, voltage: 232.3, current: 0.82, temp: 23.8, humidity: 56 },
  ];
}

export function getDailyEnergyData(): EnergyDailyData[] {
  if (import.meta.env.PROD || import.meta.env.VITE_DEMO_MODE !== 'true') {
    return [];
  }
  return [
    { day: 'Mon', kwh: 4.8, costEstimate: 0.72, peakWatts: 920 },
    { day: 'Tue', kwh: 5.2, costEstimate: 0.78, peakWatts: 980 },
    { day: 'Wed', kwh: 3.9, costEstimate: 0.58, peakWatts: 840 },
    { day: 'Thu', kwh: 4.4, costEstimate: 0.66, peakWatts: 890 },
    { day: 'Fri', kwh: 5.8, costEstimate: 0.87, peakWatts: 1040 },
    { day: 'Sat', kwh: 6.7, costEstimate: 1.01, peakWatts: 1120 },
    { day: 'Sun (Today)', kwh: 3.84, costEstimate: 0.58, peakWatts: 880 },
  ];
}

export function getWeeklyEnergyData(): EnergyWeeklyData[] {
  if (import.meta.env.PROD || import.meta.env.VITE_DEMO_MODE !== 'true') {
    return [];
  }
  return [
    { week: 'Week 1', kwh: 34.2, targetKwh: 38.0, savingsPercent: 10.0 },
    { week: 'Week 2', kwh: 31.8, targetKwh: 38.0, savingsPercent: 16.3 },
    { week: 'Week 3', kwh: 36.5, targetKwh: 38.0, savingsPercent: 3.9 },
    { week: 'Week 4 (Current)', kwh: 28.4, targetKwh: 38.0, savingsPercent: 25.2 },
  ];
}

export function getMonthlyEnergyData(): EnergyMonthlyData[] {
  if (import.meta.env.PROD || import.meta.env.VITE_DEMO_MODE !== 'true') {
    return [];
  }
  return [
    { month: 'Jan', kwh: 142.5, costEstimate: 1068.75, avgDailyKwh: 4.60, peakWatts: 1020 },
    { month: 'Feb', kwh: 128.0, costEstimate: 960.00, avgDailyKwh: 4.57, peakWatts: 980 },
    { month: 'Mar', kwh: 155.4, costEstimate: 1165.50, avgDailyKwh: 5.01, peakWatts: 1140 },
    { month: 'Apr', kwh: 184.2, costEstimate: 1381.50, avgDailyKwh: 6.14, peakWatts: 1250 },
    { month: 'May', kwh: 210.6, costEstimate: 1579.50, avgDailyKwh: 6.79, peakWatts: 1320 },
    { month: 'Jun', kwh: 195.0, costEstimate: 1462.50, avgDailyKwh: 6.50, peakWatts: 1280 },
    { month: 'Jul', kwh: 168.3, costEstimate: 1262.25, avgDailyKwh: 5.43, peakWatts: 1180 },
    { month: 'Aug', kwh: 159.0, costEstimate: 1192.50, avgDailyKwh: 5.13, peakWatts: 1110 },
    { month: 'Sep', kwh: 148.5, costEstimate: 1113.75, avgDailyKwh: 4.95, peakWatts: 1060 },
    { month: 'Oct', kwh: 139.2, costEstimate: 1044.00, avgDailyKwh: 4.49, peakWatts: 990 },
    { month: 'Nov (Est)', kwh: 115.2, costEstimate: 864.00, avgDailyKwh: 3.84, peakWatts: 920 },
    { month: 'Dec (Proj)', kwh: 124.0, costEstimate: 930.00, avgDailyKwh: 4.00, peakWatts: 950 },
  ];
}

export function getInitialINA219Readings(): INA219Reading[] {
  // Returns empty initial telemetry buffer. Real readings will hydrate from Supabase or ESP32 node.
  return [];
}

export const SUPABASE_INA219_TABLE_SQL = `-- Supabase PostgreSQL Schema for INA219 Energy Telemetry
create table if not exists public.ina219_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  device_bus_id text default 'main_bus_0x40' not null,
  bus_voltage_v numeric(6, 2) not null,   -- e.g. 231.40 V
  shunt_voltage_mv numeric(6, 2) not null, -- e.g. 48.00 mV across 0.1 ohm shunt
  current_a numeric(6, 3) not null,        -- e.g. 0.480 A
  power_w numeric(7, 2) not null,          -- calculated: bus_voltage_v * current_a
  energy_wh numeric(10, 3) not null,       -- continuous trapezoidal integration
  elapsed_seconds integer not null,        -- delta time since prior reading
  is_anomaly boolean default false,
  anomaly_type text,                       -- 'overcurrent', 'voltage_sag', 'surge', etc.
  created_at timestamptz default timezone('Asia/Kolkata', now()) not null
);

-- Row Level Security (RLS)
alter table public.ina219_readings enable row level security;

create policy "Users can select own energy readings"
  on public.ina219_readings for select
  using (auth.uid() = user_id);

create policy "IoT Device insert energy readings"
  on public.ina219_readings for insert
  with check (auth.uid() = user_id);

-- Time-series optimized index for rapid reporting
create index idx_ina219_time_user on public.ina219_readings(user_id, created_at desc);`;

