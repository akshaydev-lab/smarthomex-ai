import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { 
  Device, 
  SensorTelemetry, 
  SystemAlert, 
  AutomationRule, 
  VoiceLog, 
  AppSettings, 
  NavigationPage, 
  GasSafetyLevel, 
  EmergencyLockoutStatus,
  GasSafetySystemState,
  DeviceSchedule,
  INA219Reading,
  HardwareBridgeStatus,
  DeviceControlMode,
  DeviceCommandRecord
} from '../types';
import { 
  INITIAL_DEVICES, 
  INITIAL_TELEMETRY, 
  INITIAL_ALERTS, 
  INITIAL_AUTOMATIONS,
  getInitialINA219Readings 
} from '../services/sensorService';
import { 
  INITIAL_SCHEDULES, 
  getCurrentIST, 
  checkScheduleDue, 
  formatTimeIST,
  getNextScheduledActionForDevice 
} from '../services/scheduleService';
import { dispatchAuthenticatedDeviceCommand } from '../services/hardwareBridgeService';
import { 
  getCurrentSession, 
  subscribeToAuthChanges, 
  signOut, 
  isSupabaseConfigured,
  subscribeToDeviceChanges,
  subscribeToAlerts,
  subscribeToSensorReadings,
  subscribeToDeviceStatus
} from '../lib/supabaseClient';
import { emergencySiren } from '../lib/emergencySound';
import { 
  insertAlertToSupabase,
  acknowledgeAlertInSupabase,
  resolveGasAlertsInSupabase,
  fetchDevicesFromSupabase,
  fetchLatestSensorTelemetry,
  fetchLatestDeviceStatus,
  fetchAlertsFromSupabase,
  fetchRecentSensorTelemetry
} from '../services/supabaseDataService';

interface SmartHomeContextType {
  // Navigation
  currentPage: NavigationPage;
  setCurrentPage: (page: NavigationPage) => void;

  // Devices & Relays
  devices: Device[];
  toggleDevice: (id: string) => Promise<void>;
  setAllDevices: (state: boolean) => Promise<void>;
  setDeviceState: (id: string, state: boolean) => void;

  // Manual & Timer Control Architecture
  hardwareBridge: HardwareBridgeStatus;
  updateHardwareBridge: (partial: Partial<HardwareBridgeStatus>) => void;
  setDeviceControlMode: (deviceId: string, mode: DeviceControlMode) => void;
  resumeAutoSchedule: (deviceId: string) => void;
  testAccelerateWaterMotorCutoff: () => void;

  // Telemetry & Sensors
  telemetry: SensorTelemetry;
  simulateIncident: (type: 'gas_leak' | 'high_temp' | 'power_surge') => void;
  clearSimulatedIncident: () => void;

  // INA219 Energy Intelligence
  ina219Readings: INA219Reading[];
  tariffRate: number;
  setTariffRate: (rate: number) => void;
  triggerPowerAnomaly: (type: 'overcurrent' | 'voltage_sag' | 'voltage_surge' | 'overpower') => void;

  // Emergency Gas Alert & Life-Safety System
  gasSafetyState: GasSafetySystemState;
  isGasEmergencyModalOpen: boolean;
  setIsGasEmergencyModalOpen: (open: boolean) => void;
  isSirenMuted: boolean;
  toggleSirenMute: () => void;
  silenceMobileSiren: () => void; // Dedicated SILENCE SIREN method
  pushNotificationStatus: 'default' | 'granted' | 'denied' | 'unsupported';
  requestPushPermission: () => Promise<void>;
  triggerGasLeakAlert: (indicativeIndex?: number, room?: string, isHardware?: boolean) => void;
  simulateGasClearance: () => void;
  authorizeSafetyReset: (authorizedBy?: string) => Promise<void>;
  setExhaustSafetyCertified: (certified: boolean) => void;
  simulateSensorFault: () => void;

  // Additional Sensor and Device Alert Dispatchers
  triggerHighTempAlert: (temp?: number) => void;
  triggerSensorDisconnectedAlert: (sensor: 'mq2' | 'dht11') => void;
  triggerInvalidReadingAlert: (sensor: 'dht11') => void;
  triggerWifiDisconnectedAlert: () => void;
  triggerDeviceOfflineAlert: () => void;
  triggerUnexpectedRestartAlert: () => void;
  triggerRelayMismatchAlert: (deviceId: string) => void;
  triggerRecoveryNotification: (faultType: string) => void;

  // Device Scheduling System
  schedules: DeviceSchedule[];
  addSchedule: (schedule: Omit<DeviceSchedule, 'id' | 'createdAt' | 'status'>) => void;
  updateSchedule: (id: string, updated: Partial<DeviceSchedule>) => void;
  deleteSchedule: (id: string) => void;
  toggleSchedule: (id: string) => void;
  executeScheduleNow: (id: string) => void;

  // Alerts
  alerts: SystemAlert[];
  acknowledgeAlert: (id: string) => void;
  dismissAlert: (id: string) => void;

  // Automations
  automations: AutomationRule[];
  toggleAutomation: (id: string) => void;
  addAutomation: (rule: Omit<AutomationRule, 'id'>) => void;
  deleteAutomation: (id: string) => void;

  // AI Voice Assistant
  voiceLogs: VoiceLog[];
  addVoiceLog: (log: Omit<VoiceLog, 'id' | 'timestamp'>) => void;
  clearVoiceLogs: () => void;

  // Settings
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;

  // Authentication
  isAuthenticated: boolean;
  user: { id?: string; name: string; email: string; role: string } | null;
  login: (email: string, name?: string, userId?: string) => void;
  logout: () => void;

  // Active load summary
  activeDeviceCount: number;
  totalActiveWatts: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  homeName: 'SmartHomeX Smart Villa',
  esp32IpAddress: '',
  esp32MqttTopic: 'smarthomex/main-board',
  mqttBroker: 'mqtt://broker.emqx.io:1883',
  tempAlarmThreshold: 32,
  gasAlarmThreshold: 350,
  powerAlarmThreshold: 1200,
  voiceFeedbackEnabled: true,
  demoSimulationActive: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
  soundAlertsEnabled: true,
  pushNotificationsEnabled: true,
  timezone: 'Asia/Kolkata',
  userProfile: {
    name: 'Alex Vance',
    email: 'alex.vance@smarthomex.ai',
    role: 'Lead IoT Administrator',
  },
};

const SmartHomeContext = createContext<SmartHomeContextType | undefined>(undefined);

export const SmartHomeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPage, setCurrentPage] = useState<NavigationPage>('overview');
  const [devices, setDevices] = useState<Device[]>(() => {
    const saved = localStorage.getItem('smarthomex_devices');
    if (saved) {
      try {
        const parsed: Device[] = JSON.parse(saved);
        return parsed.map(d => ({
          ...d,
          state: import.meta.env.PROD ? false : d.state,
          isHardwareConnected: false,
          controlMode: d.controlMode || 'MANUAL',
          manualOverrideActive: d.manualOverrideActive ?? false,
          pendingCommand: false,
          maxRuntimeMinutes: d.type === 'motor' ? 30 : d.maxRuntimeMinutes,
          activeRuntimeSeconds: import.meta.env.PROD ? 0 : (d.activeRuntimeSeconds || 0),
        }));
      } catch {
        return INITIAL_DEVICES;
      }
    }
    return INITIAL_DEVICES;
  });

  const [hardwareBridge, setHardwareBridge] = useState<HardwareBridgeStatus>({
    esp32Connected: false,
    internetConnected: typeof navigator !== 'undefined' ? navigator.onLine : true,
    simulateFailure: false,
    lastCommandSent: null,
  });

  const updateHardwareBridge = useCallback((partial: Partial<HardwareBridgeStatus>) => {
    setHardwareBridge(prev => ({ ...prev, ...partial }));
  }, []);

  const [telemetry, setTelemetry] = useState<SensorTelemetry>(() => ({
    ...INITIAL_TELEMETRY,
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
    estimatedBillToday: 0,
    estimatedBillMonth: 0,
    gasPpm: null,
    gasRawAdc: null,
    gasStatus: 'offline',
    esp32Status: 'offline',
    wifiRssi: null,
    lastUpdated: '--',
    isHardwareConnected: false,
  }));

  const [alerts, setAlerts] = useState<SystemAlert[]>(() => {
    if (import.meta.env.PROD || isSupabaseConfigured) {
      const saved = localStorage.getItem('smarthomex_alerts');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return Array.isArray(parsed) ? parsed.filter((a: SystemAlert) => !a.isDemo) : [];
        } catch {
          return [];
        }
      }
      return [];
    }
    const saved = localStorage.getItem('smarthomex_alerts');
    return saved ? JSON.parse(saved) : INITIAL_ALERTS;
  });

  const [automations, setAutomations] = useState<AutomationRule[]>(() => {
    const saved = localStorage.getItem('smarthomex_automations');
    return saved ? JSON.parse(saved) : INITIAL_AUTOMATIONS;
  });

  // Schedules state persisted in localStorage
  const [schedules, setSchedules] = useState<DeviceSchedule[]>(() => {
    const saved = localStorage.getItem('smarthomex_schedules');
    return saved ? JSON.parse(saved) : INITIAL_SCHEDULES;
  });

  // INA219 Energy Intelligence State
  const [ina219Readings, setIna219Readings] = useState<INA219Reading[]>(() => {
    if (import.meta.env.PROD || isSupabaseConfigured) {
      return [];
    }
    return getInitialINA219Readings();
  });
  const [tariffRate, setTariffRate] = useState<number>(7.50); // Default ₹7.50 / kWh
  const lastReadingTimeRef = useRef<number>(0);

  const [voiceLogs, setVoiceLogs] = useState<VoiceLog[]>(() => {
    if (import.meta.env.PROD || isSupabaseConfigured) {
      return [];
    }
    return [
      {
        id: 'voice-init-1',
        transcript: 'Turn on living room light',
        response: 'Living Room Light turned ON. [Demo Mode]',
        executedAction: 'Relay 1 (GPIO 14) -> Active',
        matchedDeviceId: 'relay-1',
        confidence: 0.98,
        timestamp: '15 mins ago',
        success: true,
      },
      {
        id: 'voice-init-2',
        transcript: 'What is the temperature in the house?',
        response: 'The current ambient temperature is 24.8°C with 52% relative humidity according to the DHT11 sensor.',
        confidence: 0.96,
        timestamp: '42 mins ago',
        success: true,
      },
    ];
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('smarthomex_settings');
    const base = saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    if (import.meta.env.PROD) {
      return { ...base, demoSimulationActive: false };
    }
    return base;
  });

  // Emergency Gas Alert Modal, Siren & Life-Safety System State
  const [gasSafetyState, setGasSafetyState] = useState<GasSafetySystemState>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('smarthomex_gas_safety_state');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Demo alerts/simulations must NEVER activate physical hardware lockouts!
          // If state was simulated or in production, do not restore a simulated lockout!
          if (import.meta.env.PROD || parsed.isSimulated) {
            return {
              lockoutStatus: 'NORMAL',
              mainContactorTripped: false,
              exhaustSafetyCertified: Boolean(parsed.exhaustSafetyCertified),
              exhaustFanActive: false,
              buzzerActive: false,
              gasClearedPendingReset: false,
              sensorFault: false,
              isMobileSirenSilenced: false,
              lastIncidentTimestamp: null,
              lastResetTimestamp: parsed.lastResetTimestamp || null,
              resetAuthorizedBy: null,
              isSimulated: false,
              rawAdc: null,
            };
          }
          return parsed;
        } catch {
          // fallback
        }
      }
    }
    return {
      lockoutStatus: 'NORMAL',
      mainContactorTripped: false,
      exhaustSafetyCertified: false, // Default: Uncertified DC fan -> Disabled for spark safety
      exhaustFanActive: false,
      buzzerActive: false,
      gasClearedPendingReset: false,
      sensorFault: false,
      isMobileSirenSilenced: false,
      lastIncidentTimestamp: null,
      lastResetTimestamp: null,
      resetAuthorizedBy: null,
      isSimulated: false,
      rawAdc: null,
    };
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('smarthomex_gas_safety_state', JSON.stringify(gasSafetyState));
    }
  }, [gasSafetyState]);

  const [isGasEmergencyModalOpen, setIsGasEmergencyModalOpen] = useState<boolean>(false);
  const [isSirenMuted, setIsSirenMuted] = useState<boolean>(false);
  const [pushNotificationStatus, setPushNotificationStatus] = useState<'default' | 'granted' | 'denied' | 'unsupported'>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission as 'default' | 'granted' | 'denied';
    }
    return 'unsupported';
  });

  // When in production or Supabase configured, always start unauthenticated.
  // Let getCurrentSession() be the authoritative source of truth.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (import.meta.env.PROD || isSupabaseConfigured) return false;
    // Demo mode only: restore from localStorage
    if (typeof window !== 'undefined') {
      const savedAuth = localStorage.getItem('smarthomex_auth_session');
      if (savedAuth) return true;
    }
    return Boolean(!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true');
  });

  const [user, setUser] = useState<{ id?: string; name: string; email: string; role: string } | null>(() => {
    if (import.meta.env.PROD || isSupabaseConfigured) return null;
    // Demo mode: restore from localStorage
    if (typeof window !== 'undefined') {
      const savedAuth = localStorage.getItem('smarthomex_auth_session');
      if (savedAuth) {
        try {
          return JSON.parse(savedAuth);
        } catch {
          // fallback
        }
      }
      return {
        id: 'demo-admin-usr',
        name: 'Alex Vance',
        email: 'alex.vance@smarthomex.ai',
        role: 'Lead IoT Administrator',
      };
    }
    return null;
  });

  // Supabase Auth Session Synchronization & Hardware Hydration
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const hydrateFromSupabase = async (userId: string) => {
      try {
        // Fetch registered devices and controller status in parallel
        const [remoteDevices, status] = await Promise.all([
          fetchDevicesFromSupabase(userId),
          fetchLatestDeviceStatus(userId)
        ]);

        const hbTime = status?.last_heartbeat ? new Date(status.last_heartbeat).getTime() : 0;
        const hbAgeSec = (Date.now() - hbTime) / 1000;
        const isLive = Boolean(status?.online && hbAgeSec < 75);

        setHardwareBridge(prev => ({
          ...prev,
          esp32Connected: isLive,
        }));

        if (remoteDevices && remoteDevices.length > 0) {
          setDevices(prev => {
            return remoteDevices.map(rd => {
              const localMatch = prev.find(p => 
                p.id === rd.id || 
                (p.dbId && p.dbId === rd.dbId) || 
                p.relayChannel === rd.relayChannel ||
                (rd.deviceSlug && (p.deviceSlug === rd.deviceSlug || p.id === rd.deviceSlug))
              );
              return {
                ...rd,
                isHardwareConnected: isLive,
                controlMode: rd.controlMode || localMatch?.controlMode || 'MANUAL',
                manualOverrideActive: rd.manualOverrideActive ?? localMatch?.manualOverrideActive ?? false,
                pendingCommand: false,
                lastCommandStatus: localMatch?.lastCommandStatus || 'success',
                commandHistory: localMatch?.commandHistory || [],
              };
            });
          });
        } else {
          setDevices(prev =>
            prev.map(d => ({
              ...d,
              isHardwareConnected: isLive,
            }))
          );
        }

        // 3. Fetch latest sensor telemetry from Supabase
        const remoteTelemetry = await fetchLatestSensorTelemetry(userId);
        if (remoteTelemetry) {
          const recTime = remoteTelemetry.recorded_at ? new Date(remoteTelemetry.recorded_at).getTime() : 0;
          const telemetryAgeSec = (Date.now() - recTime) / 1000;
          const isFreshTelemetry = isLive && telemetryAgeSec < 75;

          const rawAdcHydrated = remoteTelemetry.gas_raw_adc != null
            ? Number(remoteTelemetry.gas_raw_adc)
            : remoteTelemetry.raw_adc != null
            ? Number(remoteTelemetry.raw_adc)
            : remoteTelemetry.gas_ppm != null
            ? Number(remoteTelemetry.gas_ppm)
            : null;

          setTelemetry(prev => ({
            ...prev,
            esp32Status: isLive ? 'connected' : 'offline',
            wifiRssi: isLive ? (status?.wifi_rssi ?? null) : null,
            temperature: isFreshTelemetry && remoteTelemetry.temperature_c != null ? Number(remoteTelemetry.temperature_c) : null,
            humidity: isFreshTelemetry && remoteTelemetry.humidity_pct != null ? Number(remoteTelemetry.humidity_pct) : null,
            voltage: isFreshTelemetry && remoteTelemetry.bus_voltage_v != null ? Number(remoteTelemetry.bus_voltage_v) : null,
            busVoltageV: isFreshTelemetry && remoteTelemetry.bus_voltage_v != null ? Number(remoteTelemetry.bus_voltage_v) : null,
            shuntVoltageMv: isFreshTelemetry && remoteTelemetry.shunt_voltage_mv != null ? Number(remoteTelemetry.shunt_voltage_mv) : null,
            current: isFreshTelemetry && remoteTelemetry.current_a != null ? Number(remoteTelemetry.current_a) : null,
            currentMa: isFreshTelemetry && remoteTelemetry.current_ma != null ? Number(remoteTelemetry.current_ma) : null,
            power: isFreshTelemetry && remoteTelemetry.power_w != null ? Number(remoteTelemetry.power_w) : null,
            powerMw: isFreshTelemetry && remoteTelemetry.power_w != null ? Number(remoteTelemetry.power_w) * 1000 : null,
            energyWh: remoteTelemetry.energy_wh != null ? Number(remoteTelemetry.energy_wh) : prev.energyWh,
            energyTodayKWh: remoteTelemetry.energy_wh != null ? Number((Number(remoteTelemetry.energy_wh) / 1000).toFixed(3)) : prev.energyTodayKWh,
            gasPpm: isFreshTelemetry && remoteTelemetry.gas_ppm != null ? Number(remoteTelemetry.gas_ppm) : null,
            gasRawAdc: isFreshTelemetry ? rawAdcHydrated : null,
            gasStatus: isFreshTelemetry ? ((remoteTelemetry.gas_status as GasSafetyLevel) || 'safe') : 'offline',
            lastTelemetryAt: remoteTelemetry.recorded_at,
            lastUpdated: remoteTelemetry.recorded_at
              ? new Date(remoteTelemetry.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '--',
            isHardwareConnected: isLive && !remoteTelemetry.is_demo,
          }));

          if (isFreshTelemetry && remoteTelemetry.gas_status === 'danger' && !remoteTelemetry.is_demo) {
            setIsGasEmergencyModalOpen(true);
            setGasSafetyState(prev => ({
              ...prev,
              lockoutStatus: 'CRITICAL',
              mainContactorTripped: true,
              buzzerActive: true,
              isSimulated: false,
              rawAdc: rawAdcHydrated ?? prev.rawAdc,
            }));
          } else if (isFreshTelemetry && remoteTelemetry.gas_status === 'sensor_fault' && !remoteTelemetry.is_demo) {
            setGasSafetyState(prev => ({
              ...prev,
              lockoutStatus: prev.lockoutStatus === 'CRITICAL' || prev.lockoutStatus === 'EMERGENCY_LOCKOUT' ? prev.lockoutStatus : 'SENSOR_FAULT',
              sensorFault: true,
              isSimulated: false,
              rawAdc: rawAdcHydrated ?? prev.rawAdc,
            }));
          }
        } else {
          // No sensor readings in DB yet: preserve clean empty state with nulls
          setTelemetry(prev => ({
            ...prev,
            esp32Status: isLive ? 'connected' : 'offline',
            wifiRssi: isLive ? (status?.wifi_rssi ?? null) : null,
            temperature: null,
            humidity: null,
            voltage: null,
            busVoltageV: null,
            shuntVoltageMv: null,
            current: null,
            currentMa: null,
            power: null,
            powerMw: null,
            gasPpm: null,
            gasRawAdc: null,
            gasStatus: 'offline',
            lastTelemetryAt: null,
            lastUpdated: 'No readings available',
            isHardwareConnected: false,
          }));
        }

        // 4. Fetch real alerts for the authenticated user (removing demo fallback)
        const remoteAlerts = await fetchAlertsFromSupabase(userId);
        if (remoteAlerts) {
          setAlerts(prev => {
            const existingIds = new Set(remoteAlerts.map(a => a.id));
            const newFromRealtime = prev.filter(a => !existingIds.has(a.id) && !a.isDemo);
            return [...newFromRealtime, ...remoteAlerts];
          });

          // Check if there is an active REAL hardware danger alert in Supabase.
          // CRITICAL: Acknowledged alerts continue to block until explicitly resolved!
          const activeRealGasAlert = remoteAlerts.find(a => 
            a.type === 'gas_leak' && 
            a.severity === 'danger' && 
            !a.isDemo &&
            (a.emergencyStatus !== 'RESOLVED' || !a.resolvedTimestamp)
          );

          if (activeRealGasAlert && isLive) {
            setIsGasEmergencyModalOpen(true);
            setGasSafetyState(prev => ({
              ...prev,
              lockoutStatus: (activeRealGasAlert.emergencyStatus as any) || 'CRITICAL',
              mainContactorTripped: true,
              buzzerActive: true,
              isSimulated: false,
              rawAdc: activeRealGasAlert.gasPpm ? Math.round(activeRealGasAlert.gasPpm * 3.8) : prev.rawAdc,
            }));
          } else if (!activeRealGasAlert && remoteTelemetry?.gas_status === 'safe') {
            // When gas reading is verified SAFE and no real danger alert is active,
            // ensure any lingering simulated lockout is cleared.
            setGasSafetyState(prev => {
              if (prev.isSimulated || prev.lockoutStatus === 'CRITICAL' || prev.lockoutStatus === 'EMERGENCY_LOCKOUT') {
                return {
                  ...prev,
                  lockoutStatus: 'NORMAL',
                  mainContactorTripped: false,
                  buzzerActive: false,
                  gasClearedPendingReset: false,
                  isSimulated: false,
                };
              }
              return prev;
            });
          }
        } else {
          setAlerts(prev => prev.filter(a => !a.isDemo));
        }

        // 5. Fetch latest 20-30 real sensor_readings for chart history
        const remoteReadings = await fetchRecentSensorTelemetry(userId, 30);
        if (remoteReadings && remoteReadings.length > 0) {
          setIna219Readings(prev => {
            if (prev.length === 0) return remoteReadings;
            const existingIds = new Set(remoteReadings.map(r => r.id));
            const newFromRealtime = prev.filter(r => r.id && !existingIds.has(r.id) && !r.isDemo);
            const combined = [...remoteReadings, ...newFromRealtime];
            return combined.length > 30 ? combined.slice(combined.length - 30) : combined;
          });
        } else {
          setIna219Readings(prev => prev.filter(r => !r.isDemo));
        }
      } catch (err) {
        console.warn('Error hydrating hardware state from Supabase:', err);
      }
    };

    getCurrentSession().then(session => {
      if (session?.user) {
        setIsAuthenticated(true);
        const userData = {
          id: session.user.id,
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email || '',
          role: 'IoT Administrator',
        };
        setUser(userData);
        localStorage.setItem('smarthomex_auth_session', JSON.stringify(userData));
        hydrateFromSupabase(session.user.id);
      } else {
        const savedAuth = localStorage.getItem('smarthomex_auth_session');
        if (!savedAuth) {
          setIsAuthenticated(false);
          setUser(null);
        }
      }
    });

    const subscription = subscribeToAuthChanges((event, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
        const userData = {
          id: session.user.id,
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email || '',
          role: 'IoT Administrator',
        };
        setUser(userData);
        localStorage.setItem('smarthomex_auth_session', JSON.stringify(userData));
        hydrateFromSupabase(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('smarthomex_auth_session');
        setIsAuthenticated(false);
        setUser(null);
        setAlerts([]);
        setIna219Readings([]);
        setCurrentPage('auth');
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Realtime Supabase Hardware Subscriptions (ESP32 Node synchronization)
  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return;
    const currentUserId = user.id;

    // 1. Devices Realtime: Confirm physical relay state from ESP32
    const devSub = subscribeToDeviceChanges(currentUserId, (payload: unknown) => {
      const p = payload as { new?: { id?: string; device_slug?: string; state?: boolean; is_hardware_connected?: boolean } };
      if (p?.new) {
        const updatedSlug = p.new.device_slug;
        const updatedId = p.new.id;
        const newState = p.new.state ?? false;
        setDevices(prev =>
          prev.map(d =>
            (d.id === updatedSlug || d.id === updatedId || (updatedId && d.dbId === updatedId) || (updatedSlug && d.deviceSlug === updatedSlug))
              ? {
                  ...d,
                  state: newState,
                  isHardwareConnected: p.new?.is_hardware_connected ?? d.isHardwareConnected,
                  powerWatts: newState ? d.ratedWatts : 0,
                  lastToggled: 'Just now',
                  pendingCommand: false,
                  lastCommandStatus: 'success',
                }
              : d
          )
        );
      }
    });

    // 2. Alerts Realtime: Listen to hardware gas hazard or critical alarms from ESP32
    const alertSub = subscribeToAlerts(currentUserId, (payload: unknown) => {
      const p = payload as { new?: Record<string, unknown> };
      if (p?.new) {
        const row = p.new;
        const createdAt = (row.created_at as string) || new Date().toISOString();
        const formattedTimestamp = new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', Today';

        const newAlert: SystemAlert = {
          id: String(row.id || `alert-${Date.now()}`),
          type: (row.type as any) || 'gas_leak',
          severity: (row.severity as any) || 'warning',
          emergencyStatus: (row.emergency_status as any) || (row.severity === 'danger' ? 'CRITICAL' : 'NORMAL'),
          category: (row.category as any) || (row.severity === 'danger' ? 'critical' : 'device'),
          title: String(row.title || 'System Alert'),
          description: String(row.description || ''),
          timestamp: formattedTimestamp,
          resolvedTimestamp: (row.resolved_at as string) || undefined,
          isDemo: Boolean(row.is_demo ?? false),
          acknowledged: Boolean(row.acknowledged ?? false),
          source: String(row.source || 'ESP32 Hardware Node'),
          actionTaken: (row.action_taken as string) || undefined,
          gasPpm: row.gas_ppm != null ? Number(row.gas_ppm) : undefined,
          room: (row.room as string) || undefined,
          evacuationAdvised: Boolean(row.evacuation_advised ?? false),
        };
        setAlerts(prev => {
          const exists = prev.some(a => a.id === newAlert.id);
          if (exists) {
            return prev.map(a => a.id === newAlert.id ? newAlert : a);
          }
          return [newAlert, ...prev];
        });

        // If real gas leak danger, trip local modal & life-safety lockout
        // Demo alerts (is_demo === true) MUST NEVER activate the physical hardware interlock!
        const isRealAlert = !row.is_demo;
        const isResolved = Boolean(row.resolved_at) || row.emergency_status === 'RESOLVED';
        if (row.type === 'gas_leak' && row.severity === 'danger' && isRealAlert && !isResolved) {
          setIsGasEmergencyModalOpen(true);
          setIsSirenMuted(false);
          emergencySiren.start();
          setGasSafetyState(prev => ({
            ...prev,
            lockoutStatus: (row.emergency_status as any) || 'CRITICAL',
            mainContactorTripped: true,
            buzzerActive: true,
            gasClearedPendingReset: false,
            lastIncidentTimestamp: createdAt,
            rawAdc: row.gas_ppm != null ? Number(row.gas_ppm) : prev.rawAdc,
            isSimulated: false,
          }));
          setDevices(prev =>
            prev.map(d => {
              if (d.id === 'relay-exhaust') {
                return d;
              }
              return {
                ...d,
                state: false,
                powerWatts: 0,
                activeRuntimeSeconds: 0,
                lastToggled: 'Just now',
                lastCommandStatus: 'gas_inhibited',
              };
            })
          );
        } else if (isRealAlert && isResolved) {
          // Hardware safety reset confirmed via Realtime
          emergencySiren.stop();
          setIsGasEmergencyModalOpen(false);
          setGasSafetyState(prev => ({
            ...prev,
            lockoutStatus: 'NORMAL',
            mainContactorTripped: false,
            buzzerActive: false,
            gasClearedPendingReset: false,
            lastResetTimestamp: (row.resolved_at as string) || new Date().toISOString(),
          }));
        }
      }
    });

    // 3. Telemetry Realtime: Stream INA219 + DHT11 telemetry from ESP32
    const sensorSub = subscribeToSensorReadings(currentUserId, (payload: unknown) => {
      const p = payload as { new?: Record<string, unknown> };
      if (p?.new) {
        const row = p.new;
        const recTime = (row.recorded_at as string) || new Date().toISOString();
        const timeStr = new Date(recTime).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const rawAdcVal = row.gas_raw_adc != null
          ? Number(row.gas_raw_adc)
          : row.raw_adc != null
          ? Number(row.raw_adc)
          : row.gas_ppm != null
          ? Number(row.gas_ppm)
          : null;

        const newGasStatus = (row.gas_status as GasSafetyLevel) || 'warming_up';

        setTelemetry(prev => ({
          ...prev,
          temperature: row.temperature_c != null ? Number(row.temperature_c) : null,
          humidity: row.humidity_pct != null ? Number(row.humidity_pct) : null,
          voltage: row.bus_voltage_v != null ? Number(row.bus_voltage_v) : null,
          busVoltageV: row.bus_voltage_v != null ? Number(row.bus_voltage_v) : null,
          shuntVoltageMv: row.shunt_voltage_mv != null ? Number(row.shunt_voltage_mv) : null,
          current: row.current_a != null ? Number(row.current_a) : null,
          currentMa: row.current_ma != null ? Number(row.current_ma) : null,
          power: row.power_w != null ? Number(row.power_w) : null,
          powerMw: row.power_w != null ? Number(row.power_w) * 1000 : null,
          energyWh: row.energy_wh != null ? Number(row.energy_wh) : prev.energyWh,
          energyTodayKWh: row.energy_wh != null ? Number((Number(row.energy_wh) / 1000).toFixed(3)) : prev.energyTodayKWh,
          gasPpm: row.gas_ppm != null ? Number(row.gas_ppm) : null,
          gasRawAdc: rawAdcVal != null ? rawAdcVal : prev.gasRawAdc,
          gasStatus: newGasStatus,
          lastTelemetryAt: recTime,
          lastUpdated: 'Just now',
          isHardwareConnected: true,
        }));

        // Tasks 3 & 4: Immediately update safety state & interlocks based on gas_status
        if (newGasStatus === 'danger') {
          setIsGasEmergencyModalOpen(true);
          setIsSirenMuted(false);
          emergencySiren.start();

          setGasSafetyState(prev => ({
            ...prev,
            lockoutStatus: 'CRITICAL',
            mainContactorTripped: true,
            buzzerActive: true,
            gasClearedPendingReset: false,
            lastIncidentTimestamp: recTime,
            rawAdc: rawAdcVal ?? prev.rawAdc,
          }));

          // Immediately disconnect Light, Fan, and Motor relays for spark safety
          setDevices(prev =>
            prev.map(d => {
              if (d.id === 'relay-exhaust') {
                return d; // DC exhaust fan handled per certified status
              }
              return {
                ...d,
                state: false,
                powerWatts: 0,
                activeRuntimeSeconds: 0,
                lastToggled: 'Just now',
                lastCommandStatus: 'gas_inhibited',
              };
            })
          );
        } else if (newGasStatus === 'sensor_fault') {
          // Sensor fault: open circuit / ADC < 45
          setGasSafetyState(prev => {
            const preserveCritical =
              prev.lockoutStatus === 'CRITICAL' ||
              prev.lockoutStatus === 'EMERGENCY_LOCKOUT' ||
              prev.lockoutStatus === 'LOCKOUT_PENDING_RESET';

            return {
              ...prev,
              lockoutStatus: preserveCritical ? prev.lockoutStatus : 'SENSOR_FAULT',
              sensorFault: true,
              rawAdc: rawAdcVal != null ? rawAdcVal : (prev.rawAdc && prev.rawAdc < 45 ? prev.rawAdc : undefined),
            };
          });
        } else if (newGasStatus === 'safe' || newGasStatus === 'warning' || newGasStatus === 'warming_up') {
          // Task 4: Preserve existing safety lockout behavior. Never clear a lockout from a frontend Realtime event!
          setGasSafetyState(prev => {
            if (prev.lockoutStatus === 'CRITICAL' || prev.lockoutStatus === 'EMERGENCY_LOCKOUT') {
              // Gas cleared below trip threshold while in lockout -> Transition to LOCKOUT_PENDING_RESET
              // Circuits and contactor remain TRIPPED until verified manual safety reset!
              return {
                ...prev,
                lockoutStatus: 'LOCKOUT_PENDING_RESET',
                gasClearedPendingReset: true,
                mainContactorTripped: true,
                rawAdc: rawAdcVal ?? prev.rawAdc,
              };
            }
            if (prev.lockoutStatus === 'LOCKOUT_PENDING_RESET') {
              return {
                ...prev,
                gasClearedPendingReset: true,
                mainContactorTripped: true,
                rawAdc: rawAdcVal ?? prev.rawAdc,
              };
            }
            // If normal, clear transient sensorFault flag
            return {
              ...prev,
              sensorFault: false,
              rawAdc: rawAdcVal ?? prev.rawAdc,
            };
          });
        }

        if (row.power_w != null || row.bus_voltage_v != null) {
          setIna219Readings(prev => {
            const pWatts = row.power_w != null ? Number(row.power_w) : null;
            const newPoint: INA219Reading = {
              timestamp: recTime,
              timeLabel: timeStr,
              busVoltageV: row.bus_voltage_v != null ? Number(row.bus_voltage_v) : null,
              shuntVoltageMv: row.shunt_voltage_mv != null ? Number(row.shunt_voltage_mv) : null,
              currentMa: row.current_ma != null ? Number(row.current_ma) : null,
              currentA: row.current_a != null ? Number(row.current_a) : null,
              powerW: pWatts,
              powerMw: pWatts != null ? pWatts * 1000 : null,
              energyWh: row.energy_wh != null ? Number(row.energy_wh) : null,
              energyKWh: row.energy_wh != null ? Number(((Number(row.energy_wh)) / 1000).toFixed(3)) : null,
              isDemo: false,
              anomaly: (row.anomaly as any) || 'normal',
            };
            const next = [...prev, newPoint];
            return next.length > 30 ? next.slice(next.length - 30) : next;
          });
        }
      }
    });

    // 4. Device Status Realtime: Real-time Heartbeat & Online Status from ESP32
    const statusSub = subscribeToDeviceStatus(currentUserId, (payload: unknown) => {
      const p = payload as { new?: { online?: boolean; last_heartbeat?: string; wifi_rssi?: number } };
      if (p?.new) {
        const hb = p.new.last_heartbeat ? new Date(p.new.last_heartbeat).getTime() : Date.now();
        const isRecent = (Date.now() - hb) < 75000;
        const isLive = Boolean(p.new.online && isRecent);

        setHardwareBridge(prev => ({
          ...prev,
          esp32Connected: isLive,
        }));

        setTelemetry(prev => ({
          ...prev,
          esp32Status: isLive ? 'connected' : 'offline',
          wifiRssi: isLive ? (p.new?.wifi_rssi ?? null) : null,
        }));

        setDevices(prev =>
          prev.map(d => ({
            ...d,
            isHardwareConnected: isLive,
          }))
        );
      }
    });

    // 5. Periodic Heartbeat Freshness Verification (Every 15s)
    const heartbeatCheckInterval = setInterval(async () => {
      const status = await fetchLatestDeviceStatus(currentUserId);
      if (status) {
        const hbTime = status.last_heartbeat ? new Date(status.last_heartbeat).getTime() : 0;
        const ageSec = (Date.now() - hbTime) / 1000;
        const isLive = Boolean(status.online && ageSec < 75);

        setHardwareBridge(prev => {
          if (prev.esp32Connected !== isLive) {
            return { ...prev, esp32Connected: isLive };
          }
          return prev;
        });

        setTelemetry(prev => {
          const nextStatus = isLive ? 'connected' : 'offline';
          const nextRssi = isLive ? (status.wifi_rssi ?? null) : null;
          if (prev.esp32Status !== nextStatus || prev.wifiRssi !== nextRssi) {
            return { ...prev, esp32Status: nextStatus, wifiRssi: nextRssi };
          }
          return prev;
        });

        setDevices(prev =>
          prev.map(d => (d.isHardwareConnected !== isLive ? { ...d, isHardwareConnected: isLive } : d))
        );
      } else {
        setHardwareBridge(prev => (prev.esp32Connected !== false ? { ...prev, esp32Connected: false } : prev));
        setTelemetry(prev => (prev.esp32Status !== 'offline' || prev.wifiRssi !== null ? { ...prev, esp32Status: 'offline', wifiRssi: null } : prev));
        setDevices(prev =>
          prev.map(d => (d.isHardwareConnected !== false ? { ...d, isHardwareConnected: false } : d))
        );
      }
    }, 15000);

    return () => {
      devSub?.unsubscribe();
      alertSub?.unsubscribe();
      sensorSub?.unsubscribe();
      statusSub?.unsubscribe();
      clearInterval(heartbeatCheckInterval);
    };
  }, [user?.id]);

  // Save devices to localStorage
  useEffect(() => {
    localStorage.setItem('smarthomex_devices', JSON.stringify(devices));
  }, [devices]);

  // Save alerts to localStorage
  useEffect(() => {
    localStorage.setItem('smarthomex_alerts', JSON.stringify(alerts));
  }, [alerts]);

  // Save automations to localStorage
  useEffect(() => {
    localStorage.setItem('smarthomex_automations', JSON.stringify(automations));
  }, [automations]);

  // Save schedules to localStorage
  useEffect(() => {
    localStorage.setItem('smarthomex_schedules', JSON.stringify(schedules));
  }, [schedules]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('smarthomex_settings', JSON.stringify(settings));
  }, [settings]);

  // Calculate live power & current based on active devices
  const activeDeviceCount = useMemo(() => {
    return devices.filter(d => d.state).length;
  }, [devices]);

  const totalActiveWatts = useMemo(() => {
    // Only in non-production explicit demo mode do we add a mock standby floor; in production, never fabricate a baseline
    const baselineStandbyWatts = (!import.meta.env.PROD && settings.demoSimulationActive) ? 12 : 0;
    const devicesWatts = devices.reduce((sum, d) => (d.state ? sum + d.ratedWatts : sum), 0);
    return baselineStandbyWatts + devicesWatts;
  }, [devices, settings.demoSimulationActive]);

  // Background simulation tick: INA219 energy calculation using actual elapsed time
  useEffect(() => {
    // Strictly disable demo simulation tick in production, or whenever real ESP32 hardware is connected or user is in authenticated Supabase mode
    if (import.meta.env.PROD || !settings.demoSimulationActive || hardwareBridge.esp32Connected || (isSupabaseConfigured && isAuthenticated)) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (lastReadingTimeRef.current === 0) {
        lastReadingTimeRef.current = now - 4000;
      }
      const rawDeltaSec = (now - lastReadingTimeRef.current) / 1000;
      lastReadingTimeRef.current = now;

      // Anti-double-counting guard: If disconnected or tab was asleep (> 20s), clamp delta to 4s
      const deltaSec = (rawDeltaSec <= 0 || rawDeltaSec > 20) ? 4 : rawDeltaSec;

      let currentBusV = 230.0;
      let currentDrawA = 0.48;
      let activeP = 110;
      let shuntMv = 48.0;

      setTelemetry(prev => {
        // Voltage micro-fluctuation between 228.0V and 233.5V
        const voltageDelta = (Math.random() - 0.5) * 0.8;
        const baseVoltage = prev.voltage ?? 230.0;
        const newVoltage = Math.min(233.5, Math.max(228.0, Number((baseVoltage + voltageDelta).toFixed(1))));

        // Total power with slight load jitter (± 3W)
        const loadJitter = (Math.random() - 0.5) * 4;
        const newPower = Math.max(12, Math.round(totalActiveWatts + loadJitter));

        // Current = P / V (Ohm's & Watt's law)
        const newCurrent = Number((newPower / newVoltage).toFixed(2));
        const currentMa = Math.round(newCurrent * 1000);
        const powerMw = Math.round(newPower * 1000);
        // Shunt voltage drop across 0.1Ω shunt (V_shunt = I * R) in mV
        const shuntVoltageMv = Number((newCurrent * 0.1 * 1000).toFixed(1));

        currentBusV = newVoltage;
        currentDrawA = newCurrent;
        activeP = newPower;
        shuntMv = shuntVoltageMv;

        // Temperature micro-fluctuation (0.1°C)
        const tempDelta = (Math.random() - 0.5) * 0.15;
        const baseTemp = prev.temperature ?? 24.5;
        const newTemp = Number(Math.min(30.0, Math.max(22.0, baseTemp + tempDelta)).toFixed(1));

        // Humidity micro-fluctuation
        const humDelta = Math.random() > 0.5 ? (Math.random() > 0.5 ? 1 : -1) : 0;
        const baseHum = prev.humidity ?? 50;
        const newHum = Math.min(68, Math.max(42, baseHum + humDelta));

        // Gas PPM (if not in simulated emergency)
        let newGas = prev.gasPpm ?? 120;
        if (prev.gasStatus === 'safe') {
          const gasDelta = Math.floor((Math.random() - 0.5) * 6);
          newGas = Math.min(180, Math.max(90, (prev.gasPpm ?? 120) + gasDelta));
        }

        // Energy increment using actual elapsed time between readings: E (Wh) += P (W) * dt (sec) / 3600
        const energyIncrementWh = (newPower * deltaSec) / 3600;
        const prevWh = prev.energyWh || (prev.energyTodayKWh * 1000);
        const newEnergyWh = Number((prevWh + energyIncrementWh).toFixed(2));
        const newEnergyTodayKWh = Number((newEnergyWh / 1000).toFixed(3));

        const estimatedBillToday = Number((newEnergyTodayKWh * tariffRate).toFixed(2));
        const estimatedBillMonth = Number((newEnergyTodayKWh * 30 * tariffRate).toFixed(2));

        return {
          ...prev,
          voltage: newVoltage,
          busVoltageV: newVoltage,
          shuntVoltageMv,
          current: newCurrent,
          currentMa,
          power: newPower,
          powerMw,
          energyWh: newEnergyWh,
          energyTodayKWh: newEnergyTodayKWh,
          tariffRatePerKwh: tariffRate,
          estimatedBillToday,
          estimatedBillMonth,
          temperature: newTemp,
          humidity: newHum,
          gasPpm: newGas,
          lastUpdated: 'Just now',
        };
      });

      // Update rolling INA219 readings buffer (last 30 samples)
      setIna219Readings(prevReadings => {
        const timeLabel = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const lastWh = prevReadings.length > 0 ? (prevReadings[prevReadings.length - 1].energyWh ?? 3840) : 3840;
        const wh = Number((lastWh + (activeP * deltaSec) / 3600).toFixed(2));

        const newPoint: INA219Reading = {
          id: `reading-${now}`,
          timestamp: new Date(now).toISOString(),
          timeLabel,
          busVoltageV: currentBusV,
          shuntVoltageMv: shuntMv,
          currentMa: Math.round(currentDrawA * 1000),
          currentA: currentDrawA,
          powerMw: activeP * 1000,
          powerW: activeP,
          energyWh: wh,
          energyKWh: Number((wh / 1000).toFixed(3)),
          isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
          anomaly: currentDrawA > 5.0 ? 'overcurrent' : activeP > 1000 ? 'overpower' : 'normal',
        };

        const next = [...prevReadings, newPoint];
        return next.length > 30 ? next.slice(next.length - 30) : next;
      });

      // Water Motor 30-Minute Continuous Run-Time Auto-Cutoff Protection Loop
      setDevices(prevDevices => {
        let cutoffTriggered = false;
        let motorName = 'Water Booster Motor';
        const updated = prevDevices.map(d => {
          if (d.type === 'motor' && d.state && d.maxRuntimeMinutes) {
            motorName = d.name;
            const nextSec = (d.activeRuntimeSeconds || 0) + deltaSec;
            if (nextSec >= d.maxRuntimeMinutes * 60) {
              cutoffTriggered = true;
              return {
                ...d,
                state: false,
                powerWatts: 0,
                activeRuntimeSeconds: 0,
                lastToggled: 'Just now',
                lastCommandStatus: 'success' as const,
              };
            }
            return {
              ...d,
              activeRuntimeSeconds: nextSec,
            };
          }
          return d;
        });

        if (cutoffTriggered) {
          const alert: SystemAlert = {
            id: `motor-auto-trip-${Date.now()}`,
            type: 'device_offline',
            severity: 'warning',
            title: 'Water Motor Auto-Cutoff Triggered',
            description: `${motorName} continuous run-time reached the 30-minute safety limit. Automatically tripped OFF to prevent pump dry-run and stator burnout.`,
            timestamp: 'Just now',
            isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
            acknowledged: false,
            source: 'Pump Protection System (Relay Ch 3, GPIO 26)',
          };
          setAlerts(aPrev => [alert, ...aPrev]);
        }
        return updated;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [settings.demoSimulationActive, hardwareBridge.esp32Connected, isAuthenticated, totalActiveWatts, tariffRate]);

  // Mode Switcher: MANUAL vs AUTO
  const setDeviceControlMode = useCallback((deviceId: string, mode: DeviceControlMode) => {
    setDevices(prev =>
      prev.map(device => {
        if (device.id === deviceId) {
          return {
            ...device,
            controlMode: mode,
            manualOverrideActive: false, // Reset override flag on mode switch
          };
        }
        return device;
      })
    );
  }, []);

  // Resume Auto Schedule (clears manual override without altering schedules)
  const resumeAutoSchedule = useCallback((deviceId: string) => {
    setDevices(prev =>
      prev.map(device => {
        if (device.id === deviceId) {
          return {
            ...device,
            controlMode: 'AUTO',
            manualOverrideActive: false,
          };
        }
        return device;
      })
    );

    const target = devices.find(d => d.id === deviceId);
    const alert: SystemAlert = {
      id: `auto-resumed-${Date.now()}`,
      type: 'device_offline',
      severity: 'info',
      title: 'Automated Mode Resumed',
      description: `Manual override cleared for ${target?.name || 'Device'}. Relay is now synchronized with scheduled automation rules.`,
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'Automation Manager',
    };
    setAlerts(prev => [alert, ...prev]);
  }, [devices]);

  // QA / Test Helper: Instantly trigger 30-minute water motor cutoff safety
  const testAccelerateWaterMotorCutoff = useCallback(() => {
    setDevices(prev =>
      prev.map(device => {
        if (device.type === 'motor') {
          return {
            ...device,
            state: false,
            powerWatts: 0,
            activeRuntimeSeconds: 0,
            lastToggled: 'Just now',
            lastCommandStatus: 'success',
          };
        }
        return device;
      })
    );

    const alert: SystemAlert = {
      id: `water-cutoff-test-${Date.now()}`,
      type: 'device_offline',
      severity: 'warning',
      title: 'Safety Cutoff Executed (30m Protection)',
      description: 'Water Booster Motor exceeded maximum 30-minute continuous run-time limit. Automatic power disconnect executed to prevent pump dry-run damage and coil overheating.',
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'Pump Protection Circuit (30m Auto-Cutoff)',
    };
    setAlerts(prev => [alert, ...prev]);
  }, []);

  // Directly set device state (used by scheduler and automations) with Hardware ACK verification
  const setDeviceState = useCallback(async (id: string, state: boolean, source: 'manual' | 'schedule' | 'master' = 'manual') => {
    const target = devices.find(d => 
      d.id === id || 
      (d.dbId && d.dbId === id) || 
      (d.deviceSlug && d.deviceSlug === id) ||
      (d.relayChannel && (id === `relay-${d.relayChannel}` || id === d.type))
    );
    if (!target) return;

    if (target.type === 'unused' || target.relayChannel === 4) return;

    // Safety Inhibit Check: Enforce lockout during gas danger or pending reset
    // Demo alerts/simulations must NEVER activate physical hardware lockouts!
    const isLockoutActive = 
      telemetry.gasStatus === 'danger' || 
      ((gasSafetyState.lockoutStatus === 'EMERGENCY_LOCKOUT' || gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET') && !gasSafetyState.isSimulated);

    if (isLockoutActive && state === true) {
      const reasonMsg = gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET'
        ? `Cannot actuate ${target.name} ON. System is in LOCKOUT_PENDING_RESET. Combustible gas normalized, but manual safety verification and reset is required before circuits can be energized.`
        : `Cannot actuate ${target.name} ON. All relay switching is locked out during emergency combustible gas hazard (spark ignition prevention).`;

      const alert: SystemAlert = {
        id: `gas-inhibit-${Date.now()}`,
        type: 'gas_leak',
        severity: 'danger',
        title: 'Safety Interlock: Action Inhibited',
        description: reasonMsg,
        timestamp: 'Just now',
        isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
        acknowledged: false,
        source: 'Hardware Safety Interlock',
      };
      setAlerts(prev => [alert, ...prev]);
      return;
    }

    setDevices(prev =>
      prev.map(d => (d.id === target.id || (target.dbId && d.dbId === target.dbId) ? { ...d, pendingCommand: true, lastCommandStatus: 'pending' } : d))
    );

    const result = await dispatchAuthenticatedDeviceCommand(
      target,
      state,
      hardwareBridge,
      telemetry.gasStatus,
      source,
      user?.id,
      gasSafetyState.lockoutStatus,
      gasSafetyState.isSimulated
    );

    const cmdTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const cmdRecord: DeviceCommandRecord = {
      id: `cmd-rec-${Date.now()}`,
      commandId: `cmd_${Date.now()}_${target.id}`,
      deviceId: target.id,
      action: state ? 'ON' : 'OFF',
      timestamp: cmdTimestamp,
      status: result.success ? 'acknowledged' : result.statusCode === 403 ? 'rejected_gas_safety' : result.statusCode === 504 ? 'timeout' : 'failed',
      errorMessage: result.errorMessage,
      roundTripMs: result.roundTripMs,
      confirmedByHardware: result.confirmedByHardware,
      source,
    };

    if (result.success) {
      setDevices(prev => 
        prev.map(device => {
          if (device.id === target.id || (target.dbId && device.dbId === target.dbId)) {
            return {
              ...device,
              state: result.actualDeviceState,
              powerWatts: result.actualDeviceState ? device.ratedWatts : 0,
              lastToggled: 'Just now',
              pendingCommand: false,
              lastCommandStatus: 'success',
              lastCommandError: undefined,
              manualOverrideActive: source === 'schedule' ? false : (device.controlMode === 'AUTO' ? true : device.manualOverrideActive),
              activeRuntimeSeconds: result.actualDeviceState ? (device.activeRuntimeSeconds || 0) : 0,
              commandHistory: [cmdRecord, ...(device.commandHistory || [])].slice(0, 10),
            };
          }
          return device;
        })
      );
    } else {
      setDevices(prev =>
        prev.map(device => {
          if (device.id === target.id || (target.dbId && device.dbId === target.dbId)) {
            return {
              ...device,
              pendingCommand: false,
              lastCommandStatus: result.statusCode === 403 ? 'gas_inhibited' : result.statusCode === 504 ? 'timeout' : 'failed',
              lastCommandError: result.errorMessage,
              commandHistory: [cmdRecord, ...(device.commandHistory || [])].slice(0, 10),
            };
          }
          return device;
        })
      );
    }
  }, [devices, hardwareBridge, telemetry.gasStatus, user?.id, gasSafetyState.lockoutStatus, gasSafetyState.isSimulated]);

  // Primary Device Toggle Switch with Authenticated Supabase-to-ESP32 Hardware Pipeline
  const toggleDevice = useCallback(async (id: string) => {
    const target = devices.find(d => 
      d.id === id || 
      (d.dbId && d.dbId === id) || 
      (d.deviceSlug && d.deviceSlug === id) ||
      (d.relayChannel && (id === `relay-${d.relayChannel}` || id === d.type))
    );
    if (!target) return;

    // Requirement: Relay 4 on the 4-channel module must remain unused!
    if (target.type === 'unused') {
      const alert: SystemAlert = {
        id: `unused-channel-${Date.now()}`,
        type: 'command_failure',
        severity: 'warning',
        category: 'device',
        title: 'Action Blocked: Channel 4 is Reserved / Unused',
        description: 'Relay channel 4 on the 4-channel module is permanently designated as unused per hardware safety specification.',
        timestamp: 'Just now',
        isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
        acknowledged: false,
        source: 'Hardware Controller',
      };
      setAlerts(prev => [alert, ...prev]);
      return;
    }

    if (target.pendingCommand) return; // Debounce rapid spam clicks

    const nextState = !target.state;

    // Set pending state so the button displays spinner immediately
    setDevices(prev =>
      prev.map(d => (d.id === target.id || (target.dbId && d.dbId === target.dbId) ? { ...d, pendingCommand: true, lastCommandStatus: 'pending' } : d))
    );

    // Dispatch authenticated command through Supabase to ESP32
    const result = await dispatchAuthenticatedDeviceCommand(
      target,
      nextState,
      hardwareBridge,
      telemetry.gasStatus,
      'manual',
      user?.id,
      gasSafetyState.lockoutStatus,
      gasSafetyState.isSimulated
    );

    const cmdTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const cmdRecord: DeviceCommandRecord = {
      id: `cmd-rec-${Date.now()}`,
      commandId: `cmd_${Date.now()}_${target.id}`,
      deviceId: target.id,
      action: nextState ? 'ON' : 'OFF',
      timestamp: cmdTimestamp,
      status: result.success
        ? 'acknowledged'
        : result.statusCode === 403
        ? 'rejected_gas_safety'
        : result.statusCode === 504
        ? 'timeout'
        : 'failed',
      errorMessage: result.errorMessage,
      roundTripMs: result.roundTripMs,
      confirmedByHardware: result.confirmedByHardware,
      source: 'manual',
    };

    // Update hardware bridge audit status
    setHardwareBridge(prev => ({
      ...prev,
      lastCommandSent: {
        deviceId: target.id,
        deviceName: target.name,
        action: nextState ? 'ON' : 'OFF',
        timestamp: 'Just now',
        status: cmdRecord.status,
        roundTripMs: result.roundTripMs,
        confirmedByHardware: result.confirmedByHardware,
        error: result.errorMessage,
      },
    }));

    if (result.success) {
      setDevices(prev =>
        prev.map(device => {
          if (device.id === target.id || (target.dbId && device.dbId === target.dbId)) {
            const isManualOverride = device.controlMode === 'AUTO';
            const history = [cmdRecord, ...(device.commandHistory || [])].slice(0, 10);
            return {
              ...device,
              state: result.actualDeviceState,
              powerWatts: result.actualDeviceState ? device.ratedWatts : 0,
              lastToggled: 'Just now',
              pendingCommand: false,
              lastCommandStatus: 'success',
              lastCommandError: undefined,
              manualOverrideActive: isManualOverride ? true : device.manualOverrideActive,
              activeRuntimeSeconds: result.actualDeviceState ? (device.activeRuntimeSeconds || 0) : 0,
              commandHistory: history,
            };
          }
          return device;
        })
      );
    } else {
      // Hardware failure or safety lockout: relay state remains unchanged!
      setDevices(prev =>
        prev.map(device => {
          if (device.id === target.id || (target.dbId && device.dbId === target.dbId)) {
            const history = [cmdRecord, ...(device.commandHistory || [])].slice(0, 10);
            return {
              ...device,
              pendingCommand: false,
              lastCommandStatus: result.statusCode === 403 
                ? 'gas_inhibited' 
                : result.statusCode === 504 
                ? 'timeout' 
                : 'failed',
              lastCommandError: result.errorMessage,
              commandHistory: history,
            };
          }
          return device;
        })
      );

      const alert: SystemAlert = {
        id: `cmd-fail-${Date.now()}`,
        type: result.statusCode === 403 ? 'gas_leak' : 'command_failure',
        severity: result.statusCode === 403 ? 'danger' : 'warning',
        emergencyStatus: result.statusCode === 403 ? 'CRITICAL' : 'WARNING',
        category: result.statusCode === 403 ? 'critical' : 'device',
        title: result.statusCode === 403 ? 'Safety Inhibit: Relay Action Blocked' : 'Device Command Failed',
        description: result.errorMessage || 'Hardware command could not be delivered to ESP32 node.',
        timestamp: 'Just now',
        isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
        acknowledged: false,
        source: 'Hardware Bridge / Supabase Gateway',
      };
      setAlerts(aPrev => [alert, ...aPrev]);
    }
  }, [devices, hardwareBridge, telemetry.gasStatus, user?.id, gasSafetyState.lockoutStatus, gasSafetyState.isSimulated]);

  // Master Control: All Devices ON / All Devices OFF with Hardware ACK verification
  const setAllDevices = useCallback(async (state: boolean) => {
    const isLockoutActive = 
      telemetry.gasStatus === 'danger' || 
      ((gasSafetyState.lockoutStatus === 'EMERGENCY_LOCKOUT' || gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET') && !gasSafetyState.isSimulated);

    if (isLockoutActive && state === true) {
      const alert: SystemAlert = {
        id: `gas-inhibit-all-${Date.now()}`,
        type: 'gas_leak',
        severity: 'danger',
        title: 'Safety Interlock: Master ON Blocked',
        description: 'Master relay energization is completely prohibited while system is in EMERGENCY LOCKOUT or awaiting manual safety reset.',
        timestamp: 'Just now',
        isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
        acknowledged: false,
        source: 'Hardware Safety Interlock',
      };
      setAlerts(prev => [alert, ...prev]);
      return;
    }

    if (!hardwareBridge.internetConnected || !hardwareBridge.esp32Connected) {
      const alert: SystemAlert = {
        id: `bridge-offline-${Date.now()}`,
        type: 'device_offline',
        severity: 'warning',
        title: 'Master Control Hardware Offline',
        description: !hardwareBridge.internetConnected
          ? 'Cannot send master command: Internet disconnected.'
          : 'Cannot send master command: ESP32 node is offline.',
        timestamp: 'Just now',
        isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
        acknowledged: false,
        source: 'Hardware Bridge',
      };
      setAlerts(prev => [alert, ...prev]);
      return;
    }

    // Filter controllable user devices (exclude permanently reserved Channel 4 and auto exhaust fan)
    const targets = devices.filter(d => d.type !== 'unused' && d.relayChannel !== 4 && d.type !== 'exhaust_fan');

    // Mark targets as pending
    setDevices(prev =>
      prev.map(d => targets.some(t => t.id === d.id) ? { ...d, pendingCommand: true, lastCommandStatus: 'pending' } : d)
    );

    // Dispatch authenticated commands through the hardware pipeline for each target
    for (const target of targets) {
      const result = await dispatchAuthenticatedDeviceCommand(
        target,
        state,
        hardwareBridge,
        telemetry.gasStatus,
        'master',
        user?.id,
        gasSafetyState.lockoutStatus,
        gasSafetyState.isSimulated
      );

      const cmdTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const cmdRecord: DeviceCommandRecord = {
        id: `cmd-rec-${Date.now()}-${target.id}`,
        commandId: `cmd_${Date.now()}_${target.id}`,
        deviceId: target.id,
        action: state ? 'ON' : 'OFF',
        timestamp: cmdTimestamp,
        status: result.success
          ? 'acknowledged'
          : result.statusCode === 403
          ? 'rejected_gas_safety'
          : result.statusCode === 504
          ? 'timeout'
          : 'failed',
        errorMessage: result.errorMessage,
        roundTripMs: result.roundTripMs,
        confirmedByHardware: result.confirmedByHardware,
        source: 'master',
      };

      setDevices(prev =>
        prev.map(d => {
          if (d.id !== target.id && (!target.dbId || d.dbId !== target.dbId)) return d;
          if (result.success) {
            return {
              ...d,
              state: result.actualDeviceState,
              powerWatts: result.actualDeviceState ? d.ratedWatts : 0,
              lastToggled: 'Just now',
              pendingCommand: false,
              lastCommandStatus: 'success',
              lastCommandError: undefined,
              manualOverrideActive: false,
              commandHistory: [cmdRecord, ...(d.commandHistory || [])].slice(0, 10),
            };
          } else {
            return {
              ...d,
              pendingCommand: false,
              lastCommandStatus: result.statusCode === 403 ? 'gas_inhibited' : result.statusCode === 504 ? 'timeout' : 'failed',
              lastCommandError: result.errorMessage,
              commandHistory: [cmdRecord, ...(d.commandHistory || [])].slice(0, 10),
            };
          }
        })
      );
    }
  }, [devices, hardwareBridge, telemetry.gasStatus, user?.id, gasSafetyState.lockoutStatus, gasSafetyState.isSimulated]);

  // Request browser push notification permission
  const requestPushPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushNotificationStatus('unsupported');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setPushNotificationStatus(permission as 'default' | 'granted' | 'denied');
      if (permission === 'granted') {
        new Notification('SmartHomeX AI - Push Alert Subscribed', {
          body: 'Emergency gas alerts and telemetry anomalies will be dispatched directly to this device.',
        });
      }
    } catch {
      // Permission request failed or blocked
    }
  }, []);

  // Toggle siren mute
  const toggleSirenMute = useCallback(() => {
    setIsSirenMuted(prev => {
      const next = !prev;
      if (next) {
        emergencySiren.stop();
      } else if (telemetry.gasStatus === 'danger' || gasSafetyState.lockoutStatus === 'EMERGENCY_LOCKOUT') {
        emergencySiren.start();
      }
      return next;
    });
  }, [telemetry.gasStatus, gasSafetyState.lockoutStatus]);

  // Dedicated Gas Leak Alert Trigger & Life-Safety Emergency Lockout
  const triggerGasLeakAlert = useCallback((indicativeIndex: number = 485, room: string = 'Kitchen & Utility Area', isHardware: boolean = false) => {
    if (import.meta.env.PROD && !isHardware) {
      console.warn('[SmartHomeX] Manual gas leak simulation is disabled in production.');
      return;
    }
    const gasLevel = indicativeIndex;
    const status: GasSafetyLevel = 'danger';
    const nowIso = new Date().toISOString();
    const rawAdc = Math.round(indicativeIndex * 3.8);

    // 1. Immediately disconnect Light, Fan, and Motor relays
    // DC Exhaust Fan: Energized ONLY if certified for hazardous atmospheres
    const shouldRunExhaust = gasSafetyState.exhaustSafetyCertified;

    setDevices(prev =>
      prev.map(d => {
        if (d.id === 'relay-exhaust') {
          // Dedicated DC Exhaust Fan
          return {
            ...d,
            state: shouldRunExhaust,
            powerWatts: shouldRunExhaust ? d.ratedWatts : 0,
            lastToggled: 'Just now',
            lastCommandStatus: shouldRunExhaust ? 'success' : 'gas_inhibited',
          };
        }
        // Ordinary household loads: Light (Ch 1), Fan (Ch 2), Motor (Ch 3), Relay 4 FORCED OFF
        return {
          ...d,
          state: false,
          powerWatts: 0,
          activeRuntimeSeconds: 0,
          lastToggled: 'Just now',
          lastCommandStatus: 'gas_inhibited',
        };
      })
    );

    // 2. Update life-safety lockout system state
    const newSafetyState: GasSafetySystemState = {
      lockoutStatus: 'CRITICAL',
      mainContactorTripped: true, // Emergency Trip via independent safety circuit
      exhaustSafetyCertified: gasSafetyState.exhaustSafetyCertified,
      exhaustFanActive: shouldRunExhaust,
      buzzerActive: true,
      gasClearedPendingReset: false,
      sensorFault: false,
      isMobileSirenSilenced: false,
      lastIncidentTimestamp: nowIso,
      lastResetTimestamp: gasSafetyState.lastResetTimestamp,
      resetAuthorizedBy: null,
      isSimulated: !isHardware,
      rawAdc,
    };
    setGasSafetyState(newSafetyState);

    // 3. Update telemetry state
    setTelemetry(prev => ({
      ...prev,
      gasPpm: gasLevel,
      gasStatus: status,
      smokeDetected: true,
      buzzerState: true,
      mainContactorTripped: true,
      emergencyState: newSafetyState,
    }));

    // 4. Open full-screen emergency modal & start acoustic siren
    setIsGasEmergencyModalOpen(true);
    setIsSirenMuted(false);
    emergencySiren.start();

    // 5. Record CRITICAL gas leakage alert in notification history & Supabase
    const now = new Date();
    const timestampStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', Today';

    const exhaustNotice = shouldRunExhaust
      ? 'Exhaust Fan: ACTIVATED (ATEX/IECEx explosion-proof certified hazardous exhaust system).'
      : 'Exhaust Fan: INHIBITED / DISABLED (Standard DC fan contacts present spark ignition risk in combustible gas).';

    const newAlert: SystemAlert = {
      id: `gas-leak-${Date.now()}`,
      type: 'gas_leak',
      severity: 'danger',
      title: '🚨 CRITICAL GAS LEAKAGE ALERT',
      description: `MQ-2 sensor reported dangerous combustible gas level (${gasLevel} indicative index) in ${room}. Main Contactor TRIPPED. Light, Fan and Motor forced OFF. System status set to EMERGENCY LOCKOUT. ${exhaustNotice}`,
      timestamp: timestampStr,
      isDemo: !isHardware,
      acknowledged: false,
      source: isHardware ? 'ESP32 Hardware Node (GPIO 34)' : 'MQ-2 Safety Simulation',
      actionTaken: 'Main Contactor TRIPPED. Local Buzzer ACTIVE. Ordinary relays OFF. Lockout engaged.',
      gasPpm: gasLevel,
      room,
      evacuationAdvised: true,
    };

    setAlerts(prev => [newAlert, ...prev]);

    if (user?.id) {
      insertAlertToSupabase(user.id, newAlert).catch(err => {
        console.warn('Failed to insert emergency gas alert to Supabase:', err);
      });
    }

    // 6. Mobile Web Push notification if supported
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('🚨 CRITICAL GAS LEAKAGE ALERT', {
          body: `MQ-2 Danger Level in ${room}! Main contactor TRIPPED. Evacuate immediately! Do NOT flip electrical switches.`,
        });
      } catch {
        // ignore notification error
      }
    }
  }, [gasSafetyState.exhaustSafetyCertified, gasSafetyState.lastResetTimestamp, user?.id]);

  // Gas Normalization Below Trip Threshold:
  // CRITICAL REQUIREMENT: Do NOT automatically restore Light, Fan, or Motor.
  // Do NOT automatically re-energize the main contactor.
  // Require independent safety verification and manual reset!
  const simulateGasClearance = useCallback(() => {
    if (import.meta.env.PROD) {
      console.warn('[SmartHomeX] Gas clearance simulation is disabled in production.');
      return;
    }
    const safeReading = 112; // Indicative relative index (clean baseline)
    const safeAdc = 410;

    setGasSafetyState(prev => {
      const updated: GasSafetySystemState = {
        ...prev,
        lockoutStatus: 'LOCKOUT_PENDING_RESET',
        gasClearedPendingReset: true,
        mainContactorTripped: true, // Main Contactor remains TRIPPED until verified manual reset!
        buzzerActive: true, // Buzzer continues until safety verification and reset
        rawAdc: safeAdc,
      };
      return updated;
    });

    setTelemetry(prev => ({
      ...prev,
      gasPpm: safeReading,
      gasStatus: 'safe', // Sensor reading is now below threshold
      smokeDetected: false,
      mainContactorTripped: true,
    }));

    const alert: SystemAlert = {
      id: `gas-cleared-lockout-${Date.now()}`,
      type: 'gas_leak',
      severity: 'warning',
      title: 'Gas Normalized Below Threshold — Safety Lockout Maintained',
      description: 'MQ-2 readings have returned to clean baseline. Automatic relay or contactor restoration is strictly prohibited. Qualified personnel must physically inspect the premises for gas pockets and authorize a manual safety reset before any circuit can be re-energized.',
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'Gas Emergency Life-Safety Monitor',
      actionTaken: 'Status: LOCKOUT_PENDING_RESET. Contactor remains TRIPPED. Manual reset required.',
      gasPpm: safeReading,
    };

    setAlerts(prev => [alert, ...prev]);

    if (user?.id) {
      insertAlertToSupabase(user.id, alert).catch(err => {
        console.warn('Failed to insert clearance alert to Supabase:', err);
      });
    }
  }, [user?.id]);

  // Manual Safety Reset:
  // Requires independent gas-free verification before disarming lockout.
  // Re-arms main contactor. Relays 1-3 remain OFF as fail-safe!
  const authorizeSafetyReset = useCallback(async (authorizedBy: string = 'Authorized Safety Operator') => {
    // 1. Safety verification check
    if (telemetry.gasStatus === 'danger' || (gasSafetyState.rawAdc && gasSafetyState.rawAdc >= 900)) {
      const rejectAlert: SystemAlert = {
        id: `reset-rejected-${Date.now()}`,
        type: 'gas_leak',
        severity: 'danger',
        emergencyStatus: 'CRITICAL',
        title: 'Safety Reset REJECTED: Active Gas Hazard',
        description: `Manual safety reset was denied. MQ-2 sensor detects dangerous gas levels (${gasSafetyState.rawAdc ?? telemetry.gasPpm} ADC). Clear gas condition (< 900 ADC) must be verified before reset can proceed.`,
        timestamp: 'Just now',
        isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
        acknowledged: false,
        source: 'Safety Verification Engine',
      };
      setAlerts(prev => [rejectAlert, ...prev]);
      return;
    }

    // 2. Submit server-side reset validation to Gateway (if real hardware mode)
    if (user?.id && !gasSafetyState.isSimulated) {
      const resetResult = await resolveGasAlertsInSupabase(user.id, authorizedBy).catch(err => ({
        success: false,
        error: err?.message || 'Gateway connection error',
      }));

      if (!resetResult.success) {
        const rejectAlert: SystemAlert = {
          id: `reset-rejected-${Date.now()}`,
          type: 'gas_leak',
          severity: 'danger',
          emergencyStatus: 'CRITICAL',
          title: 'Safety Reset REJECTED by Gateway',
          description: resetResult.error || 'Gateway rejected safety reset. Atmosphere condition not safe or ESP32 node offline.',
          timestamp: 'Just now',
          isDemo: false,
          acknowledged: false,
          source: 'Gateway Safety Verification',
        };
        setAlerts(prev => [rejectAlert, ...prev]);
        return;
      }
    }

    const nowIso = new Date().toISOString();

    // 3. Disarm lockout & stop acoustic sirens
    emergencySiren.stop();
    setIsGasEmergencyModalOpen(false);
    setIsSirenMuted(false);

    // Turn OFF exhaust fan if it was running during ventilation
    setDevices(prev =>
      prev.map(d => (d.id === 'relay-4' && d.state ? { ...d, state: false, powerWatts: 0 } : d))
    );

    const resetState: GasSafetySystemState = {
      lockoutStatus: 'NORMAL',
      mainContactorTripped: false, // Contactor safely re-armed
      exhaustSafetyCertified: gasSafetyState.exhaustSafetyCertified,
      exhaustFanActive: false,
      buzzerActive: false,
      gasClearedPendingReset: false,
      sensorFault: false,
      isMobileSirenSilenced: false,
      lastIncidentTimestamp: gasSafetyState.lastIncidentTimestamp,
      lastResetTimestamp: nowIso,
      resetAuthorizedBy: authorizedBy,
      isSimulated: gasSafetyState.isSimulated,
      rawAdc: 410,
    };

    setGasSafetyState(resetState);

    setTelemetry(prev => ({
      ...prev,
      gasStatus: 'safe',
      buzzerState: false,
      smokeDetected: false,
      mainContactorTripped: false,
      emergencyState: resetState,
    }));

    // 4. Record verified safety reset audit in alerts & Supabase
    const resetAuditAlert: SystemAlert = {
      id: `safety-reset-${Date.now()}`,
      type: 'device_offline',
      severity: 'info',
      title: '✅ Manual Safety Reset Authorized',
      description: `Life-safety lockout cleared by authorized operator (${authorizedBy}). Gas-free condition independently verified. Main contactor re-armed. Electrical relays 1-3 remain OFF as fail-safe until explicitly commanded.`,
      timestamp: 'Just now',
      isDemo: gasSafetyState.isSimulated,
      acknowledged: true,
      emergencyStatus: 'RESOLVED',
      resolvedTimestamp: nowIso,
      source: 'Life-Safety Verification Protocol',
      actionTaken: 'Status: NORMAL. Main contactor re-energized. Circuit safety audit logged.',
    };

    // Mark active real gas alerts in local state as resolved
    setAlerts(prev => [
      resetAuditAlert,
      ...prev.map(a =>
        a.type === 'gas_leak' && !a.isDemo && (a.emergencyStatus !== 'RESOLVED' || !a.resolvedTimestamp)
          ? { ...a, emergencyStatus: 'RESOLVED' as const, resolvedTimestamp: nowIso, acknowledged: true }
          : a
      ),
    ]);

    if (user?.id) {
      await insertAlertToSupabase(user.id, resetAuditAlert).catch(err => {
        console.warn('Failed to record safety reset to Supabase:', err);
      });
    }
  }, [telemetry.gasStatus, telemetry.gasPpm, gasSafetyState, user?.id]);

  // Exhaust Safety Certification Configuration
  const setExhaustSafetyCertified = useCallback((certified: boolean) => {
    setGasSafetyState(prev => {
      const isCurrentlyInDanger = 
        prev.lockoutStatus === 'CRITICAL' || 
        prev.lockoutStatus === 'SILENCED' || 
        prev.lockoutStatus === 'EMERGENCY_LOCKOUT';

      const updated: GasSafetySystemState = {
        ...prev,
        exhaustSafetyCertified: certified,
        exhaustFanActive: isCurrentlyInDanger ? certified : prev.exhaustFanActive,
      };

      if (isCurrentlyInDanger) {
        setDevices(dPrev =>
          dPrev.map(d =>
            d.id === 'relay-exhaust'
              ? {
                  ...d,
                  state: certified,
                  powerWatts: certified ? d.ratedWatts : 0,
                  lastToggled: 'Just now',
                  lastCommandStatus: certified ? 'success' : 'gas_inhibited',
                }
              : d
          )
        );
      }

      return updated;
    });

    const alert: SystemAlert = {
      id: `exhaust-cert-${Date.now()}`,
      type: 'device_offline',
      severity: 'info',
      title: certified ? 'Exhaust Fan: Hazardous Atmosphere Certified' : 'Exhaust Fan: Uncertified (Spark Hazard)',
      description: certified
        ? 'Exhaust fan configuration confirmed as ATEX/IECEx certified explosion-proof. Automatic activation during gas emergencies is now permitted.'
        : 'Exhaust fan uncertified safety setting active. Automatic exhaust activation during combustible gas hazards is strictly disabled to prevent brush/relay spark ignition.',
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'Ventilation Safety Manager',
    };
    setAlerts(prev => [alert, ...prev]);
  }, []);

  // MQ-2 Sensor Disconnection / Cable Fault Simulation (ADC < 45)
  const simulateSensorFault = useCallback(() => {
    if (import.meta.env.PROD) {
      console.warn('[SmartHomeX] Sensor fault simulation is disabled in production.');
      return;
    }
    const faultAdc = 18;

    setGasSafetyState(prev => ({
      ...prev,
      lockoutStatus: 'SENSOR_FAULT',
      sensorFault: true,
      rawAdc: faultAdc,
    }));

    const alert: SystemAlert = {
      id: `sensor-fault-${Date.now()}`,
      type: 'device_offline',
      severity: 'warning',
      title: '⚠️ MQ-2 Sensor Fault Detected (ADC < 45)',
      description: `MQ-2 analog channel reported raw ADC ${faultAdc} (below hardware noise threshold 45). Possible disconnected jumper, open sensor circuit, or power fault on GPIO 34. System placed in fail-safe alert.`,
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'MQ-2 Hardware Diagnostic Watchdog',
      actionTaken: 'Status: SENSOR_FAULT. Check hardware wiring on GPIO 34.',
    };
    setAlerts(prev => [alert, ...prev]);

    if (user?.id) {
      insertAlertToSupabase(user.id, alert).catch(err => {
        console.warn('Failed to record sensor fault to Supabase:', err);
      });
    }
  }, [user?.id]);

  // Dedicated Mobile Siren Manual Silence
  const silenceMobileSiren = useCallback(() => {
    emergencySiren.stop();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(0); } catch { /* noop */ }
    }
    setIsSirenMuted(true);

    setGasSafetyState(prev => ({
      ...prev,
      isMobileSirenSilenced: true,
      lockoutStatus: 'SILENCED',
      buzzerActive: false,
    }));

    setTelemetry(prev => ({
      ...prev,
      buzzerState: false,
    }));

    const alert: SystemAlert = {
      id: `siren-silenced-${Date.now()}`,
      type: 'gas_leak',
      severity: 'danger',
      emergencyStatus: 'SILENCED',
      category: 'critical',
      title: '🔇 Audible Siren Silenced (Emergency Remains ACTIVE)',
      description: 'Audible mobile siren silenced by user. CRITICAL gas emergency remains fully ACTIVE in the background. Main contactor remains TRIPPED and all electrical relays remain locked OUT. Safety reset is still required.',
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'Mobile Emergency Controller',
      actionTaken: 'Audible siren stopped. Vibration stopped. Safety lockout maintained.',
    };
    setAlerts(prev => [alert, ...prev]);
  }, []);

  // Additional Sensor Alert Triggers
  const triggerHighTempAlert = useCallback((temp: number = 34.5) => {
    setTelemetry(prev => ({ ...prev, temperature: temp }));
    const alert: SystemAlert = {
      id: `dht11-temp-${Date.now()}`,
      type: 'high_temp',
      severity: 'warning',
      emergencyStatus: 'WARNING',
      category: 'warning',
      title: 'DHT11: High Ambient Temperature Alert',
      description: `Ambient temperature reached ${temp}°C exceeding configured comfort threshold (32.0°C). Ceiling Fan Relay engaged for thermal relief.`,
      sensorReading: `${temp}°C (DHT11 GPIO 32)`,
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'DHT11 Sensor (GPIO 32)',
      actionTaken: 'Fan Relay 2 activated for thermal dissipation.',
    };
    setAlerts(prev => [alert, ...prev]);
  }, []);

  const triggerSensorDisconnectedAlert = useCallback((sensor: 'mq2' | 'dht11') => {
    if (sensor === 'mq2') {
      setGasSafetyState(prev => ({
        ...prev,
        lockoutStatus: 'SENSOR_FAULT',
        sensorFault: true,
        rawAdc: 12,
      }));
      const alert: SystemAlert = {
        id: `mq2-disconnect-${Date.now()}`,
        type: 'sensor_disconnected',
        severity: 'danger',
        emergencyStatus: 'SENSOR_FAULT',
        category: 'sensor_fault',
        title: '⚠️ MQ-2 Gas Sensor Disconnected',
        description: 'MQ-2 analog signal dropped below hardware noise threshold (< 45 ADC). Sensor wire disconnected or power lost on GPIO 34. Fail-safe lockout engaged.',
        sensorReading: 'ADC: 12 (Noise Floor: 45)',
        timestamp: 'Just now',
        isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
        acknowledged: false,
        source: 'MQ-2 Diagnostic Watchdog (GPIO 34)',
        actionTaken: 'System placed in SENSOR_FAULT fail-safe. Check wiring.',
      };
      setAlerts(prev => [alert, ...prev]);
    } else {
      const alert: SystemAlert = {
        id: `dht11-disconnect-${Date.now()}`,
        type: 'sensor_disconnected',
        severity: 'warning',
        emergencyStatus: 'WARNING',
        category: 'sensor_fault',
        title: 'DHT11 Sensor Disconnected',
        description: 'DHT11 Single-Bus data pin on GPIO 32 failed handshake (response timeout). Environmental streaming paused.',
        sensorReading: 'GPIO 32: High-Z / No Response',
        timestamp: 'Just now',
        isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
        acknowledged: false,
        source: 'DHT11 Sensor Watchdog (GPIO 32)',
        actionTaken: 'Flagged sensor fault in diagnostic registry.',
      };
      setAlerts(prev => [alert, ...prev]);
    }
  }, []);

  const triggerInvalidReadingAlert = useCallback((_sensor: 'dht11') => {
    const alert: SystemAlert = {
      id: `invalid-reading-${Date.now()}`,
      type: 'sensor_fault',
      severity: 'warning',
      category: 'sensor_fault',
      title: 'Sensor Checksum Error / Invalid Reading',
      description: 'DHT11 CRC checksum failure detected. Signal corrupted by RF interference or loose jumper wire on GPIO 32.',
      sensorReading: 'Checksum: MISMATCH (NaN)',
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'Sensor Diagnostic Watchdog',
    };
    setAlerts(prev => [alert, ...prev]);
  }, []);

  const triggerWifiDisconnectedAlert = useCallback(() => {
    setHardwareBridge(prev => ({ ...prev, internetConnected: false }));
    const alert: SystemAlert = {
      id: `wifi-lost-${Date.now()}`,
      type: 'wifi_disconnected',
      severity: 'warning',
      emergencyStatus: 'DEVICE_OFFLINE',
      category: 'device',
      title: 'ESP32 Wi-Fi Disconnected',
      description: 'ESP32 node disconnected from Wi-Fi access point. Local life-safety gas lockout remains fully autonomous and operational on-chip.',
      sensorReading: 'Wi-Fi Status: DISCONNECTED',
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'ESP32 Network Watchdog',
      actionTaken: 'Background Wi-Fi retry loop engaged. Local safety intact.',
    };
    setAlerts(prev => [alert, ...prev]);
  }, []);

  const triggerDeviceOfflineAlert = useCallback(() => {
    setHardwareBridge(prev => ({ ...prev, esp32Connected: false }));
    const alert: SystemAlert = {
      id: `node-offline-${Date.now()}`,
      type: 'device_offline',
      severity: 'danger',
      emergencyStatus: 'DEVICE_OFFLINE',
      category: 'device',
      title: 'ESP32 Hardware Node Offline',
      description: 'No heartbeat response received from ESP32 controller node for over 90 seconds. Remote actuation suspended.',
      sensorReading: 'Node Health: TIMEOUT (>90s)',
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'Gateway Heartbeat Monitor',
      actionTaken: 'Marked device_status offline. Relay states preserved.',
    };
    setAlerts(prev => [alert, ...prev]);
  }, []);

  const triggerUnexpectedRestartAlert = useCallback(() => {
    const alert: SystemAlert = {
      id: `reboot-${Date.now()}`,
      type: 'unexpected_restart',
      severity: 'warning',
      category: 'device',
      title: 'ESP32 Unexpected Restart Detected',
      description: 'ESP32 controller recovered from unexpected reboot (Reset Reason: SW_CPU_RESET / Brownout). Flash NVS deduplication successfully restored.',
      sensorReading: 'Boot Reason: Watchdog / Brownout',
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'ESP32 Boot Monitor',
      actionTaken: 'Relays initialized to fail-safe OFF. NVS deduplication active.',
    };
    setAlerts(prev => [alert, ...prev]);
  }, []);

  const triggerRelayMismatchAlert = useCallback((deviceId: string) => {
    const target = devices.find(d => d.id === deviceId);
    const alert: SystemAlert = {
      id: `relay-mismatch-${Date.now()}`,
      type: 'state_mismatch',
      severity: 'danger',
      category: 'device',
      title: 'Relay Feedback State Mismatch',
      description: `Hardware verification failed for ${target?.name || deviceId}: Commanded state does not match physical optocoupler coil feedback signal.`,
      sensorReading: 'Coil Feedback: OPEN vs Commanded: CLOSED',
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'Optocoupler Hardware Feedback Circuit',
      actionTaken: 'Tripped safety warning. Relay marked unconfirmed.',
    };
    setAlerts(prev => [alert, ...prev]);
  }, [devices]);

  const triggerRecoveryNotification = useCallback((faultType: string) => {
    const alert: SystemAlert = {
      id: `recovery-${Date.now()}`,
      type: 'recovery',
      severity: 'info',
      category: 'recovery',
      title: `Fault Recovered: ${faultType}`,
      description: `The hardware condition for "${faultType}" has normalized and normal telemetry polling has resumed. Note: Life-safety gas lockout is NOT cleared automatically.`,
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'System Recovery Watchdog',
      actionTaken: 'Recovery logged. System operating nominally.',
    };
    setAlerts(prev => [alert, ...prev]);
  }, []);

  // Generic simulateIncident dispatcher
  const simulateIncident = useCallback((type: 'gas_leak' | 'high_temp' | 'power_surge') => {
    if (import.meta.env.PROD) {
      console.warn('[SmartHomeX] Incident simulation disabled in production environment.');
      return;
    }
    if (type === 'gas_leak') {
      triggerGasLeakAlert(485, 'Kitchen & Utility Area');
    } else if (type === 'high_temp') {
      setTelemetry(prev => ({
        ...prev,
        temperature: 34.2,
      }));
      // Turn on ceiling fan
      setDeviceState('relay-2', true);

      const newAlert: SystemAlert = {
        id: `sim-alert-${Date.now()}`,
        type: 'high_temp',
        severity: 'warning',
        title: 'High Ambient Temperature Alert',
        description: 'DHT11 recorded 34.2°C exceeding comfort threshold (32°C). Ceiling Fan Relay engaged.',
        timestamp: 'Just now',
        isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
        acknowledged: false,
        source: 'DHT11 Sensor (GPIO 32)',
        actionTaken: 'Fan Relay 2 activated',
      };
      setAlerts(prev => [newAlert, ...prev]);
    } else if (type === 'power_surge') {
      const surgeWatts = 1450;
      setTelemetry(prev => ({
        ...prev,
        power: surgeWatts,
        current: 6.28,
      }));

      const newAlert: SystemAlert = {
        id: `sim-alert-${Date.now()}`,
        type: 'abnormal_power',
        severity: 'warning',
        title: 'High Load Anomaly Detected',
        description: 'INA219 logged aggregate load spike above threshold. Monitored for thermal limits.',
        timestamp: 'Just now',
        isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
        acknowledged: false,
        source: 'INA219 Power Monitor (I2C 0x40)',
      };
      setAlerts(prev => [newAlert, ...prev]);
    }
  }, [triggerGasLeakAlert, setDeviceState]);

  // Dedicated INA219 Power Anomaly Simulator
  const triggerPowerAnomaly = useCallback((type: 'overcurrent' | 'voltage_sag' | 'voltage_surge' | 'overpower') => {
    const now = Date.now();
    let simVoltage = 230.0;
    let simCurrent = 0.5;
    let simPower = 115;
    let title = '';
    let desc = '';

    if (type === 'overcurrent') {
      simCurrent = 5.85;
      simPower = Math.round(229 * 5.85);
      title = 'INA219: Severe Overcurrent Event';
      desc = `Current draw peaked at ${simCurrent} A (rated limit: 5.0 A). Check for motor stall or relay channel 3 inductive lock.`;
    } else if (type === 'overpower') {
      simPower = 1380;
      simCurrent = Number((1380 / 228).toFixed(2));
      title = 'INA219: Overpower Threshold Exceeded';
      desc = `Aggregate power reached ${simPower} W exceeding 1000 W safety ceiling. High continuous thermal risk.`;
    } else if (type === 'voltage_sag') {
      simVoltage = 198.4;
      simCurrent = Number((180 / 198.4).toFixed(2));
      title = 'INA219: Mains Voltage Sag Detected';
      desc = `Bus voltage dropped to ${simVoltage} V (nominal: 230V). Grid brownout protection alert.`;
    } else if (type === 'voltage_surge') {
      simVoltage = 254.2;
      simCurrent = Number((120 / 254.2).toFixed(2));
      title = 'INA219: High Voltage Surge Detected';
      desc = `Mains transient peak reached ${simVoltage} V. Varistor and inductive spike suppression recommended.`;
    }

    const shuntMv = Number((simCurrent * 0.1 * 1000).toFixed(1));

    setTelemetry(prev => ({
      ...prev,
      voltage: simVoltage,
      busVoltageV: simVoltage,
      current: simCurrent,
      currentMa: Math.round(simCurrent * 1000),
      power: simPower,
      powerMw: simPower * 1000,
      shuntVoltageMv: shuntMv,
    }));

    // Append directly to rolling readings
    setIna219Readings(prev => {
      const timeLabel = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const lastWh = prev.length > 0 ? (prev[prev.length - 1].energyWh ?? 3840) : 3840;
      const newPoint: INA219Reading = {
        id: `reading-${now}`,
        timestamp: new Date(now).toISOString(),
        timeLabel,
        busVoltageV: simVoltage,
        shuntVoltageMv: shuntMv,
        currentMa: Math.round(simCurrent * 1000),
        currentA: simCurrent,
        powerMw: simPower * 1000,
        powerW: simPower,
        energyWh: lastWh,
        energyKWh: Number((lastWh / 1000).toFixed(3)),
        isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
        anomaly: type,
      };
      const next = [...prev, newPoint];
      return next.length > 30 ? next.slice(next.length - 30) : next;
    });

    const alert: SystemAlert = {
      id: `ina219-anomaly-${Date.now()}`,
      type: 'abnormal_power',
      severity: 'warning',
      title,
      description: desc,
      timestamp: 'Just now',
      isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
      acknowledged: false,
      source: 'INA219 Power Monitor (I2C 0x40)',
      actionTaken: 'Flagged in energy harmonics log. Relay protection monitoring active.',
    };

    setAlerts(prev => [alert, ...prev]);
  }, []);

  // Clear simulated incident
  const clearSimulatedIncident = useCallback(() => {
    emergencySiren.stop();
    setIsGasEmergencyModalOpen(false);
    setIsSirenMuted(false);

    setTelemetry(prev => ({
      ...prev,
      gasPpm: 118,
      gasStatus: 'safe',
      smokeDetected: false,
      buzzerState: false,
      temperature: 24.6,
    }));
  }, []);

  // Alert management
  const acknowledgeAlert = useCallback((id: string) => {
    setAlerts(prev => 
      prev.map(a => (a.id === id ? { ...a, acknowledged: true } : a))
    );
    if (user?.id) {
      acknowledgeAlertInSupabase(user.id, id).catch(err => {
        console.warn('Failed to update alert acknowledgement in Supabase:', err);
      });
    }
  }, [user?.id]);

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  // Automations
  const toggleAutomation = useCallback((id: string) => {
    setAutomations(prev =>
      prev.map(rule => (rule.id === id ? { ...rule, enabled: !rule.enabled } : rule))
    );
  }, []);

  const addAutomation = useCallback((rule: Omit<AutomationRule, 'id'>) => {
    const newRule: AutomationRule = {
      ...rule,
      id: `rule-${Date.now()}`,
    };
    setAutomations(prev => [newRule, ...prev]);
  }, []);

  const deleteAutomation = useCallback((id: string) => {
    setAutomations(prev => prev.filter(rule => rule.id !== id));
  }, []);

  // ----------------------------------------------------
  // Device Schedules Management & Idempotent Automation
  // ----------------------------------------------------
  const addSchedule = useCallback((newSched: Omit<DeviceSchedule, 'id' | 'createdAt' | 'status'>) => {
    const created: DeviceSchedule = {
      ...newSched,
      id: `sched-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: newSched.enabled ? 'upcoming' : 'disabled',
    };
    setSchedules(prev => [created, ...prev]);
  }, []);

  const updateSchedule = useCallback((id: string, updated: Partial<DeviceSchedule>) => {
    setSchedules(prev =>
      prev.map(s => {
        if (s.id === id) {
          const merged = { ...s, ...updated };
          merged.status = merged.enabled ? 'upcoming' : 'disabled';
          return merged;
        }
        return s;
      })
    );
  }, []);

  const deleteSchedule = useCallback((id: string) => {
    setSchedules(prev => prev.filter(s => s.id !== id));
  }, []);

  const toggleSchedule = useCallback((id: string) => {
    setSchedules(prev =>
      prev.map(s => {
        if (s.id === id) {
          const nextEnabled = !s.enabled;
          return {
            ...s,
            enabled: nextEnabled,
            status: nextEnabled ? 'upcoming' : 'disabled',
          };
        }
        return s;
      })
    );
  }, []);

  // Manual Trigger for testing schedule execution
  const executeScheduleNow = useCallback((id: string) => {
    setSchedules(prev =>
      prev.map(sched => {
        if (sched.id === id) {
          const targetDevice = devices.find(d => d.id === sched.deviceId);
          const targetState = sched.action === 'ON';
          setDeviceState(sched.deviceId, targetState);

          const { timeStr } = getCurrentIST();
          const executedAtStr = `Today at ${formatTimeIST(timeStr)}`;

          // Create notification alert for executed schedule
          const schedAlert: SystemAlert = {
            id: `sched-exec-${Date.now()}`,
            type: 'device_offline',
            severity: 'info',
            title: `Schedule Executed: ${sched.name}`,
            description: `${targetDevice?.name || 'Device'} was automatically turned ${sched.action} at ${formatTimeIST(timeStr)} (IST).`,
            timestamp: 'Just now',
            isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
            acknowledged: false,
            source: 'Device Scheduler Engine (IST)',
          };
          setAlerts(aPrev => [schedAlert, ...aPrev]);

          return {
            ...sched,
            lastExecutedAt: executedAtStr,
            status: (sched.repeatType === 'once' ? 'completed' : 'upcoming') as 'completed' | 'upcoming',
            enabled: sched.repeatType === 'once' ? false : sched.enabled,
          };
        }
        return sched;
      })
    );
  }, [devices, setDeviceState]);

  // Scheduler Background Loop: Evaluates every 5 seconds against Asia/Kolkata (IST)
  useEffect(() => {
    const timer = setInterval(() => {
      const currentIST = getCurrentIST();

      setSchedules(prevSchedules => {
        let changed = false;

        const updated: DeviceSchedule[] = prevSchedules.map(sched => {
          if (checkScheduleDue(sched, currentIST)) {
            changed = true;
            // Execute device action
            const targetState = sched.action === 'ON';
            setDeviceState(sched.deviceId, targetState);

            const executedKey = `${currentIST.dateStr}_${currentIST.timeStr}`;
            const targetDevice = devices.find(d => d.id === sched.deviceId);

            // Add notification alert
            const schedAlert: SystemAlert = {
              id: `sched-auto-${Date.now()}-${sched.id}`,
              type: 'device_offline',
              severity: 'info',
              title: `Schedule Executed: ${sched.name}`,
              description: `${targetDevice?.name || 'Device'} automatically turned ${sched.action} at ${formatTimeIST(currentIST.timeStr)} (IST).`,
              timestamp: 'Just now',
              isDemo: !import.meta.env.PROD && Boolean(import.meta.env.VITE_DEMO_MODE === 'true'),
              acknowledged: false,
              source: 'Device Scheduler Engine (IST)',
            };
            setAlerts(aPrev => [schedAlert, ...aPrev]);

            return {
              ...sched,
              lastExecutedAt: `Executed on ${currentIST.dateStr} at ${formatTimeIST(currentIST.timeStr)} (${executedKey})`,
              status: (sched.repeatType === 'once' ? 'completed' : 'upcoming') as 'completed' | 'upcoming',
              enabled: sched.repeatType === 'once' ? false : sched.enabled,
            };
          }
          return sched;
        });

        return changed ? updated : prevSchedules;
      });
    }, 5000);

    return () => clearInterval(timer);
  }, [devices, setDeviceState]);

  // Voice Logs
  const addVoiceLog = useCallback((log: Omit<VoiceLog, 'id' | 'timestamp'>) => {
    const newLog: VoiceLog = {
      ...log,
      id: `voice-${Date.now()}`,
      timestamp: 'Just now',
    };
    setVoiceLogs(prev => [newLog, ...prev.slice(0, 19)]);
  }, []);

  const clearVoiceLogs = useCallback(() => {
    setVoiceLogs([]);
  }, []);

  // Settings
  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({
      ...prev,
      ...newSettings,
      ...(import.meta.env.PROD ? { demoSimulationActive: false } : {}),
    }));
  }, []);

  // Auth
  // BUG 4 FIX: Accept optional userId so Supabase UUID is persisted, enabling
  // realtime subscriptions (subscribeToDeviceChanges etc.) that need user.id.
  const login = useCallback((email: string, name?: string, userId?: string) => {
    setIsAuthenticated(true);
    const userData = {
      id: userId,
      name: name || email.split('@')[0],
      email,
      role: 'IoT Administrator',
    };
    setUser(userData);
    localStorage.setItem('smarthomex_auth_session', JSON.stringify(userData));
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // Clean fallback if offline
    }
    localStorage.removeItem('smarthomex_auth_session');
    setIsAuthenticated(false);
    setUser(null);
    setAlerts([]);
    setIna219Readings([]);
    setCurrentPage('auth');
  }, []);

  // Dynamically enrich devices with next scheduled action in Asia/Kolkata (IST)
  const enrichedDevices = useMemo(() => {
    return devices.map(device => ({
      ...device,
      nextScheduledAction: getNextScheduledActionForDevice(device.id, schedules),
    }));
  }, [devices, schedules]);

  const value = useMemo(() => ({
    currentPage,
    setCurrentPage,
    devices: enrichedDevices,
    toggleDevice,
    setAllDevices,
    setDeviceState,
    hardwareBridge,
    updateHardwareBridge,
    setDeviceControlMode,
    resumeAutoSchedule,
    testAccelerateWaterMotorCutoff,
    telemetry,
    simulateIncident,
    clearSimulatedIncident,
    ina219Readings,
    tariffRate,
    setTariffRate,
    triggerPowerAnomaly,
    gasSafetyState,
    isGasEmergencyModalOpen,
    setIsGasEmergencyModalOpen,
    isSirenMuted,
    toggleSirenMute,
    silenceMobileSiren,
    pushNotificationStatus,
    requestPushPermission,
    triggerGasLeakAlert,
    simulateGasClearance,
    authorizeSafetyReset,
    setExhaustSafetyCertified,
    simulateSensorFault,
    triggerHighTempAlert,
    triggerSensorDisconnectedAlert,
    triggerInvalidReadingAlert,
    triggerWifiDisconnectedAlert,
    triggerDeviceOfflineAlert,
    triggerUnexpectedRestartAlert,
    triggerRelayMismatchAlert,
    triggerRecoveryNotification,
    schedules,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    toggleSchedule,
    executeScheduleNow,
    alerts,
    acknowledgeAlert,
    dismissAlert,
    automations,
    toggleAutomation,
    addAutomation,
    deleteAutomation,
    voiceLogs,
    addVoiceLog,
    clearVoiceLogs,
    settings,
    updateSettings,
    isAuthenticated,
    user,
    login,
    logout,
    activeDeviceCount,
    totalActiveWatts,
  }), [
    currentPage,
    enrichedDevices,
    toggleDevice,
    setAllDevices,
    setDeviceState,
    hardwareBridge,
    updateHardwareBridge,
    setDeviceControlMode,
    resumeAutoSchedule,
    testAccelerateWaterMotorCutoff,
    telemetry,
    simulateIncident,
    clearSimulatedIncident,
    ina219Readings,
    tariffRate,
    setTariffRate,
    triggerPowerAnomaly,
    gasSafetyState,
    isGasEmergencyModalOpen,
    isSirenMuted,
    toggleSirenMute,
    silenceMobileSiren,
    pushNotificationStatus,
    requestPushPermission,
    triggerGasLeakAlert,
    simulateGasClearance,
    authorizeSafetyReset,
    setExhaustSafetyCertified,
    simulateSensorFault,
    triggerHighTempAlert,
    triggerSensorDisconnectedAlert,
    triggerInvalidReadingAlert,
    triggerWifiDisconnectedAlert,
    triggerDeviceOfflineAlert,
    triggerUnexpectedRestartAlert,
    triggerRelayMismatchAlert,
    triggerRecoveryNotification,
    schedules,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    toggleSchedule,
    executeScheduleNow,
    alerts,
    acknowledgeAlert,
    dismissAlert,
    automations,
    toggleAutomation,
    addAutomation,
    deleteAutomation,
    voiceLogs,
    addVoiceLog,
    clearVoiceLogs,
    settings,
    updateSettings,
    isAuthenticated,
    user,
    login,
    logout,
    activeDeviceCount,
    totalActiveWatts,
  ]);

  return (
    <SmartHomeContext.Provider value={value}>
      {children}
    </SmartHomeContext.Provider>
  );
};

export const useSmartHome = (): SmartHomeContextType => {
  const context = useContext(SmartHomeContext);
  if (!context) {
    throw new Error('useSmartHome must be used within a SmartHomeProvider');
  }
  return context;
};
