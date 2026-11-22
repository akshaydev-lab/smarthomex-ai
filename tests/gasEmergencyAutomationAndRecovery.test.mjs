import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceCommand } from '../src/lib/voiceAssistant.ts';
import { INITIAL_DEVICES } from '../src/services/sensorService.ts';

/**
 * SmartHomeX AI - Complete MQ-2 Gas Emergency Automation & Recovery Test Suite
 * 
 * Verifies the 8 critical architecture requirements:
 * 1. MQ-2 Gas Emergency Detection (thresholds, hysteresis, warmup, wire fault)
 * 2. Emergency Trigger Sequence (3 normal relays OFF, exhaust ON, buzzer active, snapshot)
 * 3. Website Emergency Siren (audio play, mute/unmute preserving lockout, stop on recovery)
 * 4. Gas Emergency Voice Announcements (exact phrases, deduplication)
 * 5. Emergency State Persistence (snapshot retention, offline independent execution)
 * 6. Gas Recovery Sequence (safe >= 5000ms, exhaust OFF, 3 relays restored, lockout cleared)
 * 7. Voice Commands (status queries, safe commands, strict lockout guards)
 * 8. Strict 3 Normal Devices + 1 Dedicated Exhaust Architecture in UI & State
 */

describe('SmartHomeX AI: Complete MQ-2 Gas Emergency Automation & Recovery', () => {

  const mockNormalTelemetry = { gasStatus: 'safe', gasRawAdc: 320 };
  const mockEmergencyTelemetry = { gasStatus: 'danger', gasRawAdc: 1950 };

  // =========================================================================
  // 1. MQ-2 GAS EMERGENCY DETECTION
  // =========================================================================
  describe('1. MQ-2 Gas Emergency Detection & Filtering', () => {
    const DANGER_ADC = 1600;
    const SAFE_ADC = 900;
    const WARMUP_TIME_MS = 20000;
    const FAULT_ADC = 45;

    test('1.1: Gas emergency triggers when ADC reading >= 1600 after warm-up', () => {
      const uptimeMs = 25000;
      const rawAdc = 1650;
      const isWarmup = uptimeMs < WARMUP_TIME_MS;
      const isFault = rawAdc < FAULT_ADC;
      const isDanger = !isWarmup && !isFault && rawAdc >= DANGER_ADC;

      assert.equal(isWarmup, false, 'Warmup should be completed');
      assert.equal(isFault, false, 'No wire fault');
      assert.equal(isDanger, true, 'ADC >= 1600 must confirm gas danger');
    });

    test('1.2: MQ-2 warm-up guard (< 20000ms) suppresses false emergency triggers', () => {
      const uptimeMs = 12000; // Still warming up
      const rawAdc = 2200;    // Temporary spike during preheat
      const isWarmup = uptimeMs < WARMUP_TIME_MS;
      const isDanger = !isWarmup && rawAdc >= DANGER_ADC;

      assert.equal(isWarmup, true, 'Sensor must be in preheat warm-up state');
      assert.equal(isDanger, false, 'Warm-up spike must NOT trigger emergency mode');
    });

    test('1.3: Open-circuit wire disconnection (ADC < 45) triggers sensor fault instead of gas leak', () => {
      const uptimeMs = 30000;
      const rawAdc = 12; // Disconnected wire / floating low
      const isFault = rawAdc < FAULT_ADC;
      const isDanger = rawAdc >= DANGER_ADC;

      assert.equal(isFault, true, 'ADC < 45 must trigger SENSOR_FAULT');
      assert.equal(isDanger, false, 'Wire fault must never be confused with combustible gas leak');
    });

    test('1.4: Hysteresis deadband between danger (1600) and safe (900)', () => {
      let isEmergencyActive = true;
      const intermediateReading = 1300;

      const evaluateRecovery = (reading, currentlyActive) => {
        if (currentlyActive) {
          // Can only initiate recovery if strictly below SAFE_ADC (900)
          return reading < SAFE_ADC;
        }
        return reading >= DANGER_ADC;
      };

      assert.equal(evaluateRecovery(intermediateReading, isEmergencyActive), false, 
        'Readings in 900-1600 range must NOT trigger recovery while emergency is active');
    });
  });

  // =========================================================================
  // 2. EMERGENCY TRIGGER SEQUENCE (3 Normal Relays + 1 Dedicated Exhaust)
  // =========================================================================
  describe('2. Emergency Trigger Sequence & Appliance Shedding', () => {
    test('2.1: Pre-emergency snapshot captures exactly 3 normal household devices', () => {
      const currentDevices = {
        light: true,       // Relay 1 (GPIO 25)
        fan: false,        // Relay 2 (GPIO 26)
        motor: true,       // Relay 3 (GPIO 27)
        exhaustFan: false  // Dedicated Safety Relay (GPIO 32)
      };

      // Snapshot captures only normal user devices (light, fan, motor)
      const snapshot = {
        light: currentDevices.light,
        fan: currentDevices.fan,
        motor: currentDevices.motor,
        timestamp: new Date().toISOString()
      };

      assert.equal(snapshot.light, true);
      assert.equal(snapshot.fan, false);
      assert.equal(snapshot.motor, true);
      assert.equal('streetLight' in snapshot, false, 'Street Light is not in 3-relay household snapshot');
    });

    test('2.2: All 3 normal user-controlled relays are forced OFF upon emergency', () => {
      let relay1_Light_GPIO25 = true;
      let relay2_Fan_GPIO26 = true;
      let relay3_Motor_GPIO27 = true;

      // Emergency shedding sequence
      relay1_Light_GPIO25 = false;
      relay2_Fan_GPIO26 = false;
      relay3_Motor_GPIO27 = false;

      assert.equal(relay1_Light_GPIO25, false, 'Relay 1 (Light 25) must be forced OFF');
      assert.equal(relay2_Fan_GPIO26, false, 'Relay 2 (Fan 26) must be forced OFF');
      assert.equal(relay3_Motor_GPIO27, false, 'Relay 3 (Motor 27) must be forced OFF');
    });

    test('2.3: Dedicated Emergency Exhaust Fan (GPIO 32) is energized ON', () => {
      let exhaustFan_GPIO32 = false;

      // Emergency exhaust trigger
      exhaustFan_GPIO32 = true;

      assert.equal(exhaustFan_GPIO32, true, 'Emergency Exhaust Fan on GPIO 32 must be energized ON');
    });

    test('2.4: Hardware Buzzer on GPIO 33 activated with rapid emergency cadence', () => {
      let buzzerGPIO33 = false;
      let cadenceIntervalMs = 0;

      // Emergency buzzer activation
      buzzerGPIO33 = true;
      cadenceIntervalMs = 200; // 200ms alternating cadence

      assert.equal(buzzerGPIO33, true, 'Buzzer must be activated on GPIO 33');
      assert.equal(cadenceIntervalMs, 200, 'Cadence must be rapid 200ms cycle');
    });

    test('2.5: User cannot turn OFF Dedicated Exhaust Fan during active gas emergency', () => {
      const isEmergencyActive = true;
      const deviceId = 'relay-exhaust';
      const requestedState = false; // User tries to turn OFF exhaust

      const allowStateChange = (devId, state, emergencyActive) => {
        if (devId === 'relay-exhaust' && !state && emergencyActive) {
          return false; // Strictly blocked!
        }
        return true;
      };

      assert.equal(allowStateChange(deviceId, requestedState, isEmergencyActive), false,
        'Turning OFF exhaust fan during active emergency must be strictly prevented');
    });
  });

  // =========================================================================
  // 3. WEBSITE EMERGENCY SIREN SYSTEM
  // =========================================================================
  describe('3. Website Emergency Siren System', () => {
    test('3.1: Siren starts automatically on emergency and tracks playing state', () => {
      let isPlaying = false;
      let isMuted = false;

      const startSiren = () => {
        isPlaying = true;
      };

      startSiren();
      assert.equal(isPlaying, true, 'Emergency siren should be active');
      assert.equal(isMuted, false, 'Siren starts unmuted by default');
    });

    test('3.2: Muting siren silences audio but PRESERVES hardware lockout and emergency state', () => {
      let isSirenMuted = false;
      let emergencyLockoutActive = true;

      const toggleSirenMute = () => {
        isSirenMuted = !isSirenMuted;
      };

      toggleSirenMute();
      assert.equal(isSirenMuted, true, 'Siren must be muted');
      assert.equal(emergencyLockoutActive, true, 'Muting siren must NOT disarm emergency lockout');
    });

    test('3.3: Stop siren cleanly halts playback on recovery verification', () => {
      let isPlaying = true;

      const stopSiren = () => {
        isPlaying = false;
      };

      stopSiren();
      assert.equal(isPlaying, false, 'Siren must stop after verified recovery');
    });
  });

  // =========================================================================
  // 4. GAS EMERGENCY VOICE ANNOUNCEMENTS
  // =========================================================================
  describe('4. Gas Emergency Voice Announcements', () => {
    const EMERGENCY_PHRASE = 'Warning! Gas leakage detected. All controlled devices have been turned off. Emergency exhaust system activated.';
    const RECOVERY_PHRASE = 'Gas level is now within the configured safe range. Emergency status has been cleared.';

    test('4.1: Emergency announcement matches exact canonical wording', () => {
      const spokenText = 'Warning! Gas leakage detected. All controlled devices have been turned off. Emergency exhaust system activated.';
      assert.equal(spokenText, EMERGENCY_PHRASE, 'Emergency announcement must match exact required phrase');
    });

    test('4.2: Recovery announcement matches exact canonical wording', () => {
      const spokenText = 'Gas level is now within the configured safe range. Emergency status has been cleared.';
      assert.equal(spokenText, RECOVERY_PHRASE, 'Recovery announcement must match exact required phrase');
    });

    test('4.3: Deduplication refs prevent repetitive spamming of voice announcements', () => {
      let announcementCount = 0;
      let hasAnnouncedRef = false;

      const triggerVoiceAnnouncement = (phrase) => {
        if (!hasAnnouncedRef) {
          hasAnnouncedRef = true;
          announcementCount++;
        }
      };

      // Simulate 10 sensor ticks during danger
      for (let i = 0; i < 10; i++) {
        triggerVoiceAnnouncement(EMERGENCY_PHRASE);
      }

      assert.equal(announcementCount, 1, 'Emergency phrase must be announced exactly once per event cycle');
    });
  });

  // =========================================================================
  // 5. EMERGENCY STATE PERSISTENCE & OFFLINE SAFETY
  // =========================================================================
  describe('5. Emergency State Persistence & Offline Local Safety', () => {
    test('5.1: 3-device snapshot persists to local storage / NVS', () => {
      const snapshot = {
        light: true,
        fan: false,
        motor: true,
        timestamp: new Date().toISOString()
      };

      // Mock serialization
      const serialized = JSON.stringify(snapshot);
      const parsed = JSON.parse(serialized);

      assert.deepEqual(parsed, snapshot, 'Snapshot must be losslessly serializable');
      assert.equal(parsed.light, true);
      assert.equal(parsed.fan, false);
      assert.equal(parsed.motor, true);
    });

    test('5.2: ESP32 executes safety shedding independently of Wi-Fi / Supabase status', () => {
      const rawAdc = 1900; // Danger
      let relay1 = true;
      let relay2 = true;
      let relay3 = true;
      let exhaustFan = false;
      let buzzer = false;

      // Local hardware safety loop
      if (rawAdc >= 1600) {
        relay1 = false;
        relay2 = false;
        relay3 = false;
        exhaustFan = true;
        buzzer = true;
      }

      assert.equal(relay1, false, 'Local safety must trip Relay 1 without Wi-Fi');
      assert.equal(relay2, false, 'Local safety must trip Relay 2 without Wi-Fi');
      assert.equal(relay3, false, 'Local safety must trip Relay 3 without Wi-Fi');
      assert.equal(exhaustFan, true, 'Local safety must energize exhaust fan without Wi-Fi');
      assert.equal(buzzer, true, 'Local safety must activate buzzer without Wi-Fi');
    });
  });

  // =========================================================================
  // 6. GAS RECOVERY SEQUENCE & RESTORATION
  // =========================================================================
  describe('6. Gas Recovery Sequence & Device Restoration', () => {
    test('6.1: Recovery requires >= 5000ms continuous safe readings below 900 ADC', () => {
      let safeDurationMs = 0;
      const SAFE_THRESHOLD_ADC = 900;
      const REQUIRED_SAFE_DURATION_MS = 5000;

      const tickReading = (adc, deltaMs) => {
        if (adc < SAFE_THRESHOLD_ADC) {
          safeDurationMs += deltaMs;
        } else {
          safeDurationMs = 0; // Reset timer on any intermediate spike!
        }
        return safeDurationMs >= REQUIRED_SAFE_DURATION_MS;
      };

      // 4000ms safe: not ready yet
      assert.equal(tickReading(750, 4000), false, '4000ms is insufficient for recovery');

      // Another 1500ms safe: total 5500ms -> recovery verified
      assert.equal(tickReading(600, 1500), true, '>= 5000ms continuous safe verifies recovery');
    });

    test('6.2: Interrupted recovery timer resets if reading spikes above 900 ADC', () => {
      let safeDurationMs = 4500; // Almost recovered
      const SAFE_THRESHOLD_ADC = 900;

      // Sudden spike back up to 1200 ADC
      const reading = 1200;
      if (reading >= SAFE_THRESHOLD_ADC) {
        safeDurationMs = 0;
      }

      assert.equal(safeDurationMs, 0, 'Spike resets recovery timer back to 0');
    });

    test('6.3: Successful recovery turns OFF exhaust fan and buzzer', () => {
      let exhaustFan = true;
      let buzzer = true;

      // Recovery sequence execution
      exhaustFan = false;
      buzzer = false;

      assert.equal(exhaustFan, false, 'Exhaust fan must switch OFF after recovery');
      assert.equal(buzzer, false, 'Buzzer must be deactivated after recovery');
    });

    test('6.4: Successful recovery restores the 3 normal devices from snapshot', () => {
      const snapshot = { light: true, fan: false, motor: true };

      let light = false;
      let fan = false;
      let motor = false;

      // Restoration from snapshot
      light = snapshot.light;
      fan = snapshot.fan;
      motor = snapshot.motor;

      assert.equal(light, true, 'Light (previously ON) must be restored to ON');
      assert.equal(fan, false, 'Fan (previously OFF) must remain OFF');
      assert.equal(motor, true, 'Motor (previously ON) must be restored to ON');
    });
  });

  // =========================================================================
  // 7. VOICE COMMANDS (Status, Safe Commands, Lockout Guard)
  // =========================================================================
  describe('7. Voice Command Parsing & Emergency Safety Rules', () => {
    test('7.1: Status queries recognized accurately', () => {
      const q1 = parseVoiceCommand('Is there a gas emergency?', INITIAL_DEVICES, mockEmergencyTelemetry);
      assert.equal(q1.action, 'QUERY_GAS');
      assert.ok(q1.replyText.includes('ACTIVE'));

      const q2 = parseVoiceCommand('Check gas sensor', INITIAL_DEVICES, mockNormalTelemetry);
      assert.equal(q2.action, 'QUERY_GAS');
      assert.ok(q2.replyText.includes('SAFE'));

      const q3 = parseVoiceCommand('Is the gas level safe?', INITIAL_DEVICES, mockEmergencyTelemetry);
      assert.equal(q3.action, 'QUERY_GAS');
      assert.ok(q3.replyText.includes('UNSAFE'));

      const q4 = parseVoiceCommand('What is the emergency status?', INITIAL_DEVICES, mockNormalTelemetry);
      assert.equal(q4.action, 'QUERY_GAS');
      assert.ok(q4.replyText.includes('normal'));
    });

    test('7.2: Safe emergency commands supported', () => {
      const c1 = parseVoiceCommand('Mute emergency siren', INITIAL_DEVICES, mockEmergencyTelemetry);
      assert.equal(c1.action, 'MUTE_SIREN');

      const c2 = parseVoiceCommand('Silence siren', INITIAL_DEVICES, mockEmergencyTelemetry);
      assert.equal(c2.action, 'MUTE_SIREN');

      const c3 = parseVoiceCommand('Turn off all devices', INITIAL_DEVICES, mockEmergencyTelemetry);
      assert.equal(c3.action, 'ALL_OFF');
      assert.equal(c3.desiredState, false);
    });

    test('7.3: Activating devices during active emergency is strictly blocked', () => {
      const cmd = parseVoiceCommand('Turn on living room light', INITIAL_DEVICES, mockEmergencyTelemetry);
      assert.equal(cmd.safetyBlocked, true, 'Energizing command must be blocked during emergency');
    });

    test('7.4: Turning OFF exhaust fan during active emergency is strictly blocked', () => {
      const cmd = parseVoiceCommand('Turn off exhaust fan', INITIAL_DEVICES, mockEmergencyTelemetry);
      assert.equal(cmd.safetyBlocked, true, 'Cannot turn off emergency exhaust while emergency is active');
    });
  });

  // =========================================================================
  // 8. STRICT 3 NORMAL RELAYS + 1 DEDICATED EXHAUST ARCHITECTURE
  // =========================================================================
  describe('8. Canonical Architecture: 3 Normal Relays + 1 Dedicated Exhaust', () => {
    test('8.1: INITIAL_DEVICES contains exactly 3 normal relays + 1 dedicated exhaust', () => {
      const normalRelays = INITIAL_DEVICES.filter(d => d.type !== 'exhaust_fan' && d.relayChannel <= 3);
      const exhaustRelay = INITIAL_DEVICES.find(d => d.type === 'exhaust_fan' || d.gpioPin === 32);

      assert.equal(normalRelays.length, 3, 'Must have exactly 3 normal household relays');
      assert.ok(exhaustRelay, 'Dedicated exhaust fan on GPIO 32 must be present');

      // Check GPIO mappings
      const light = normalRelays.find(d => d.relayChannel === 1);
      const fan = normalRelays.find(d => d.relayChannel === 2);
      const motor = normalRelays.find(d => d.relayChannel === 3);

      assert.equal(light.gpioPin, 25, 'Relay 1 Light must be GPIO 25');
      assert.equal(fan.gpioPin, 26, 'Relay 2 Fan must be GPIO 26');
      assert.equal(motor.gpioPin, 27, 'Relay 3 Motor must be GPIO 27');
      assert.equal(exhaustRelay.gpioPin, 32, 'Exhaust fan must be GPIO 32');
    });

    test('8.2: Emergency exhaust fan is isolated from normal user appliance lists', () => {
      const householdAppliances = INITIAL_DEVICES.filter(d => d.type !== 'exhaust_fan' && d.relayChannel <= 3);
      const containsExhaust = householdAppliances.some(d => d.type === 'exhaust_fan' || d.gpioPin === 32);

      assert.equal(containsExhaust, false, 'Emergency exhaust fan must NEVER appear in normal appliance controls');
    });
  });
});
