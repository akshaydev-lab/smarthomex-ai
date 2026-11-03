/**
 * ESP32 Hardware Integration Architecture
 * 
 * Hardware Specs:
 * - Microcontroller: ESP32-WROOM-32 (Dual Core 240MHz, 2.4GHz Wi-Fi + BLE)
 * - 4-Channel Relay Module (Active LOW or Optocoupler Isolated)
 * - DHT11 (Digital Temperature & Humidity Sensor)
 * - MQ-2 (Combustible Gas & Smoke Sensor)
 * - INA219 (High-Side DC/AC Current & Voltage Sensor over I2C)
 * - Active Piezo Buzzer
 * 
 * CRITICAL SAFETY ARCHITECTURE:
 * The ESP32 firmware executes safety threshold monitoring directly in hardware interrupts
 * and high-priority FreeRTOS tasks (Core 0). The dashboard provides remote telemetry
 * and control, but local hardware shutoffs never rely on internet connectivity.
 */

export const ESP32_HARDWARE_SPECS = {
  microcontroller: 'ESP32-WROOM-32D',
  clockSpeed: '240 MHz',
  flashMemory: '4MB',
  pinout: {
    relayLight: { pin: 14, channel: 1, name: 'Living Room Light', activeState: 'LOW' },
    relayFan: { pin: 25, channel: 2, name: 'Master Ceiling Fan', activeState: 'LOW' },
    relayMotor: { pin: 26, channel: 3, name: 'Water Booster Motor (30m Limit)', activeState: 'LOW' },
    relayCh4Unused: { pin: -1, channel: 4, name: '4-Ch Relay Board (Unused / Reserved)', activeState: 'IDLE' },
    relayExhaust: { pin: 27, channel: 5, name: 'Separate Single-Ch Relay (Exhaust Fan)', activeState: 'LOW', controlMode: 'AUTO' },
    sensorDHT11: { pin: 32, protocol: '1-Wire Digital' },
    sensorMQ2: { pin: 34, protocol: 'ADC1 Analog Input' },
    sensorINA219_SDA: { pin: 21, protocol: 'I2C Data' },
    sensorINA219_SCL: { pin: 22, protocol: 'I2C Clock' },
    buzzerAlarm: { pin: 33, protocol: 'Digital 5V Active Buzzer' },
    physicalResetBtn: { pin: 0, protocol: 'BOOT Button (Active LOW pull-up)' },
  },
  mqttTopics: {
    telemetry: 'smarthomex/telemetry/sensors',
    relayCommand: 'smarthomex/relays/command',
    relayStatus: 'smarthomex/relays/status',
    safetyAlert: 'smarthomex/safety/alarm',
    emergencyStop: 'smarthomex/emergency/cutoff',
  },
};

export interface Esp32CommandPayload {
  channel: 1 | 2 | 3 | 4;
  state: 0 | 1; // 0 = OFF, 1 = ON
  source: 'dashboard_manual' | 'homex_voice' | 'automation_rule' | 'emergency_override';
  timestamp: number;
}

/**
 * Validates command payload structure for future ESP32 communication
 */
export function buildEsp32RelayPayload(channel: 1 | 2 | 3 | 4, state: boolean): Esp32CommandPayload {
  return {
    channel,
    state: state ? 1 : 0,
    source: 'dashboard_manual',
    timestamp: Date.now(),
  };
}
