export type DeviceType = 'light' | 'fan' | 'motor' | 'exhaust_fan' | 'unused';

export type DeviceControlMode = 'MANUAL' | 'AUTO';

export interface NextScheduledActionInfo {
  action: 'ON' | 'OFF';
  timeIST: string;
  scheduleName: string;
  scheduleId?: string;
}

export interface DeviceCommandRecord {
  id: string;
  commandId: string;
  deviceId: string;
  action: 'ON' | 'OFF';
  timestamp: string;
  status: 'pending' | 'acknowledged' | 'failed' | 'timeout' | 'rejected_gas_safety';
  errorMessage?: string;
  roundTripMs?: number;
  confirmedByHardware: boolean;
  source: 'manual' | 'schedule' | 'master' | 'safety_override' | 'ai_voice';
}

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  relayChannel: number; // 1 to 4
  gpioPin: number;
  state: boolean;
  room: string;
  powerWatts: number;
  ratedWatts: number;
  lastToggled: string;
  isHardwareConnected: boolean; // false in demo mode
  timerMinutesRemaining?: number;
  // Manual & Timer Control Architecture
  controlMode: DeviceControlMode; // 'MANUAL' (default) or 'AUTO'
  manualOverrideActive: boolean;
  manualOverrideExpiresAt?: string;
  nextScheduledAction?: NextScheduledActionInfo | null;
  pendingCommand?: boolean;
  lastCommandStatus?: 'success' | 'failed' | 'timeout' | 'gas_inhibited' | 'pending';
  lastCommandError?: string;
  maxRuntimeMinutes?: number; // e.g. 30 minutes for water motor dry-run protection
  activeRuntimeSeconds?: number;
  commandHistory?: DeviceCommandRecord[];
  isExhaustSafetyCertified?: boolean;
}

export interface HardwareBridgeStatus {
  esp32Connected: boolean; // Online or Offline
  internetConnected: boolean; // Connected or Disconnected
  simulateFailure: boolean; // Trigger simulated hardware failure
  lastCommandSent?: {
    deviceId: string;
    deviceName: string;
    action: 'ON' | 'OFF';
    timestamp: string;
    status: 'pending' | 'acknowledged' | 'failed' | 'timeout' | 'rejected_gas_safety';
    roundTripMs?: number;
    confirmedByHardware: boolean;
    error?: string;
  } | null;
}

export type GasSafetyLevel = 'safe' | 'warning' | 'danger' | 'warming_up' | 'sensor_fault';

export type EmergencyLifecycleState = 
  | 'NORMAL' 
  | 'WARNING' 
  | 'CRITICAL' 
  | 'SILENCED' 
  | 'RESOLVED' 
  | 'SENSOR_FAULT' 
  | 'DEVICE_OFFLINE'
  | 'EMERGENCY_LOCKOUT'
  | 'LOCKOUT_PENDING_RESET';

export type EmergencyLockoutStatus = EmergencyLifecycleState;

export interface GasSafetySystemState {
  lockoutStatus: EmergencyLifecycleState;
  mainContactorTripped: boolean;
  exhaustSafetyCertified: boolean; // false = ordinary uncertified DC fan (spark hazard, disabled); true = certified ATEX/IECEx
  exhaustFanActive: boolean;
  buzzerActive: boolean;
  gasClearedPendingReset: boolean;
  sensorFault: boolean;
  isMobileSirenSilenced: boolean; // SILENCED state: stops audible siren/vibe, keeps CRITICAL emergency active
  lastIncidentTimestamp: string | null;
  lastResetTimestamp: string | null;
  resetAuthorizedBy: string | null;
  isSimulated: boolean;
  rawAdc?: number;
}

export interface SensorTelemetry {
  temperature: number | null; // °C (DHT11, null if disconnected/fault)
  humidity: number | null;    // % (DHT11, null if disconnected/fault)
  voltage: number | null;     // V (INA219 Bus Voltage, null if disconnected/fault)
  busVoltageV: number | null; // V (INA219)
  shuntVoltageMv: number | null; // mV (INA219 across 0.1Ω shunt)
  current: number | null;     // A (INA219)
  currentMa: number | null;   // mA (INA219)
  power: number | null;       // W (INA219 calculated: V × I)
  powerMw: number | null;     // mW (INA219)
  energyWh: number;    // Wh accumulated
  energyTodayKWh: number; // kWh accumulated
  tariffRatePerKwh: number; // Configurable rate (e.g. ₹7.50 / $0.15)
  currencySymbol: string;   // '₹' or '$'
  estimatedBillToday: number;
  estimatedBillMonth: number;
  ina219Status: 'connected' | 'calibrated' | 'error' | 'demo_mode';
  gasPpm: number | null;      // MQ-2 Sensor Indicative Index (null if raw ADC only or disconnected)
  gasRawAdc?: number | null;  // MQ-2 Raw 12-bit ADC (0 - 4095)
  gasStatus: GasSafetyLevel;
  smokeDetected: boolean;
  buzzerState: boolean;
  esp32Status: 'connected' | 'offline' | 'demo_mode';
  wifiRssi?: number | null; // dBm (null when offline or unmeasured)
  lastUpdated: string;
  lastTelemetryAt?: string | null;
  isHardwareConnected?: boolean;
  emergencyState?: GasSafetySystemState;
  mainContactorTripped?: boolean;
}

export interface INA219Reading {
  id?: string;
  timestamp: string; // ISO string / time
  timeLabel: string; // e.g. "19:45:02"
  busVoltageV: number | null;
  shuntVoltageMv: number | null;
  currentMa: number | null;
  currentA: number | null;
  powerMw: number | null;
  powerW: number | null;
  energyWh: number | null;
  energyKWh: number | null;
  isDemo: boolean;
  anomaly?: 'overcurrent' | 'overpower' | 'voltage_sag' | 'voltage_surge' | 'normal';
}

export interface EnergyMonthlyData {
  month: string;
  kwh: number;
  costEstimate: number;
  avgDailyKwh: number;
  peakWatts: number;
}

export interface DeviceEnergyAllocation {
  deviceId: string;
  deviceName: string;
  room: string;
  relayChannel: number;
  ratedWatts: number;
  activeSecondsToday: number;
  estimatedKWh: number;
  estimatedCost: number;
  percentOfTotal: number;
  isDedicatedMeter: boolean; // false = mathematically apportioned from shared INA219; true = multi-channel circuit
}

export type AlertSeverity = 'info' | 'warning' | 'danger';

export type SystemAlertType = 
  | 'gas_leak' 
  | 'smoke' 
  | 'high_temp' 
  | 'device_offline' 
  | 'abnormal_power'
  | 'sensor_fault'
  | 'sensor_disconnected'
  | 'motor_cutoff'
  | 'command_failure'
  | 'state_mismatch'
  | 'wifi_disconnected'
  | 'unexpected_restart'
  | 'recovery';

export type AlertCategory = 
  | 'critical' 
  | 'warning' 
  | 'device' 
  | 'sensor_fault' 
  | 'recovery' 
  | 'history';

export interface SystemAlert {
  id: string;
  deviceId?: string;
  type: SystemAlertType;
  severity: AlertSeverity;
  emergencyStatus?: EmergencyLifecycleState;
  category?: AlertCategory;
  title: string;
  description: string;
  sensorReading?: string;
  timestamp: string;
  resolvedTimestamp?: string;
  isDemo: boolean;
  acknowledged: boolean;
  source: string;
  actionTaken?: string;
  gasPpm?: number;
  room?: string;
  evacuationAdvised?: boolean;
}

export interface AutomationRule {
  id: string;
  name: string;
  category: 'safety' | 'comfort' | 'energy';
  triggerType: 'sensor_threshold' | 'time_schedule' | 'device_state';
  conditionSummary: string;
  actionSummary: string;
  targetDeviceId?: string;
  actionState?: boolean;
  enabled: boolean;
  isEsp32LocalRule: boolean; // Crucial: whether rule executes on hardware firmware
  description: string;
}

export type ScheduleRepeatType = 'once' | 'daily' | 'weekdays' | 'weekends' | 'custom';

export type WeekdayShort = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export interface DeviceSchedule {
  id: string;
  userId?: string;
  name: string;
  deviceId: string;
  action: 'ON' | 'OFF';
  scheduledTime: string; // HH:MM in 24-hr format (IST)
  scheduledDate?: string; // YYYY-MM-DD
  repeatType: ScheduleRepeatType;
  repeatDays: WeekdayShort[];
  enabled: boolean;
  lastExecutedAt?: string;
  createdAt: string;
  nextExecutionTime?: string;
  status: 'upcoming' | 'completed' | 'disabled';
}

export interface VoiceLog {
  id: string;
  transcript: string;
  response: string;
  executedAction?: string;
  matchedDeviceId?: string;
  confidence: number;
  timestamp: string;
  success: boolean;
}

export interface EnergyHourlyData {
  time: string;
  powerWatts: number;
  voltage: number;
  current: number;
  temp: number;
  humidity: number;
}

export interface EnergyDailyData {
  day: string;
  kwh: number;
  costEstimate: number;
  peakWatts: number;
}

export interface EnergyWeeklyData {
  week: string;
  kwh: number;
  targetKwh: number;
  savingsPercent: number;
}

export interface AppSettings {
  homeName: string;
  esp32IpAddress: string;
  esp32MqttTopic: string;
  mqttBroker: string;
  tempAlarmThreshold: number; // °C
  gasAlarmThreshold: number;  // PPM
  powerAlarmThreshold: number; // Watts
  voiceFeedbackEnabled: boolean;
  demoSimulationActive: boolean;
  soundAlertsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  timezone: string; // 'Asia/Kolkata'
  userProfile: {
    name: string;
    email: string;
    role: string;
    avatarUrl?: string;
  };
}

export type NavigationPage = 
  | 'overview'
  | 'devices'
  | 'sensors'
  | 'analytics'
  | 'schedules'
  | 'voice'
  | 'automations'
  | 'alerts'
  | 'settings'
  | 'auth';
