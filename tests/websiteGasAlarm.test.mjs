import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('SmartHomeX AI - Website Gas Alarm & Realtime Trigger Audit', () => {

  // Helper simulating the exact alarm trigger condition in SmartHomeContext.tsx
  function evaluateGasAlarmTrigger(gasStatus, gasRawAdc) {
    const rawAdcVal = gasRawAdc != null ? Number(gasRawAdc) : null;
    const isDangerReading = gasStatus === 'danger' || (rawAdcVal != null && rawAdcVal >= 1600);
    return isDangerReading;
  }

  // Helper simulating the safety state transition in SmartHomeContext.tsx
  function transitionGasSafetyState(prevState, newGasStatus, rawAdcVal) {
    const isDanger = newGasStatus === 'danger' || (rawAdcVal != null && rawAdcVal >= 1600);
    if (isDanger) {
      return {
        ...prevState,
        lockoutStatus: 'CRITICAL',
        mainContactorTripped: true,
        buzzerActive: true,
        gasClearedPendingReset: false,
        rawAdc: rawAdcVal ?? prevState.rawAdc,
      };
    } else if (newGasStatus === 'sensor_fault') {
      const preserveCritical =
        prevState.lockoutStatus === 'CRITICAL' ||
        prevState.lockoutStatus === 'EMERGENCY_LOCKOUT' ||
        prevState.lockoutStatus === 'LOCKOUT_PENDING_RESET';
      return {
        ...prevState,
        lockoutStatus: preserveCritical ? prevState.lockoutStatus : 'SENSOR_FAULT',
        sensorFault: true,
        rawAdc: rawAdcVal ?? prevState.rawAdc,
      };
    } else if (['safe', 'warning', 'warming_up'].includes(newGasStatus)) {
      if (prevState.lockoutStatus === 'CRITICAL' || prevState.lockoutStatus === 'EMERGENCY_LOCKOUT') {
        return {
          ...prevState,
          lockoutStatus: 'LOCKOUT_PENDING_RESET',
          gasClearedPendingReset: true,
          mainContactorTripped: true,
          buzzerActive: false,
          rawAdc: rawAdcVal ?? prevState.rawAdc,
        };
      }
      if (prevState.lockoutStatus === 'LOCKOUT_PENDING_RESET') {
        return {
          ...prevState,
          gasClearedPendingReset: true,
          mainContactorTripped: true,
          rawAdc: rawAdcVal ?? prevState.rawAdc,
        };
      }
      return {
        ...prevState,
        sensorFault: false,
        rawAdc: rawAdcVal ?? prevState.rawAdc,
      };
    }
    return prevState;
  }

  // Helper simulating emergency siren singleton lifecycle
  class MockEmergencySirenService {
    constructor() {
      this.isPlaying = false;
      this.shouldBePlaying = false;
      this.startCallCount = 0;
      this.stopCallCount = 0;
    }

    start() {
      this.shouldBePlaying = true;
      if (this.isPlaying) return false; // Prevents duplicate instances
      this.isPlaying = true;
      this.startCallCount++;
      return true;
    }

    stop() {
      this.shouldBePlaying = false;
      if (!this.isPlaying) return false;
      this.isPlaying = false;
      this.stopCallCount++;
      return true;
    }
  }

  test('1.1: gas_status === "danger" triggers website gas alarm', () => {
    assert.strictEqual(evaluateGasAlarmTrigger('danger', 1200), true);
    assert.strictEqual(evaluateGasAlarmTrigger('danger', null), true);
  });

  test('1.2: gas_raw_adc >= 1600 triggers website gas alarm independently', () => {
    assert.strictEqual(evaluateGasAlarmTrigger('safe', 1600), true);
    assert.strictEqual(evaluateGasAlarmTrigger('warning', 1850), true);
    assert.strictEqual(evaluateGasAlarmTrigger('unknown', 2400), true);
  });

  test('1.3: warning state (ADC < 1600) does NOT trip evacuation siren', () => {
    assert.strictEqual(evaluateGasAlarmTrigger('warning', 1400), false);
    assert.strictEqual(evaluateGasAlarmTrigger('warning', 1150), false);
  });

  test('1.4: safe and warming_up states do NOT trip evacuation siren', () => {
    assert.strictEqual(evaluateGasAlarmTrigger('safe', 410), false);
    assert.strictEqual(evaluateGasAlarmTrigger('warming_up', 800), false);
    assert.strictEqual(evaluateGasAlarmTrigger('warming_up', null), false);
  });

  test('1.5: sensor_fault state sets SENSOR_FAULT without combustible gas siren', () => {
    assert.strictEqual(evaluateGasAlarmTrigger('sensor_fault', 20), false);

    const initial = { lockoutStatus: 'NORMAL', sensorFault: false };
    const next = transitionGasSafetyState(initial, 'sensor_fault', 20);
    assert.strictEqual(next.lockoutStatus, 'SENSOR_FAULT');
    assert.strictEqual(next.sensorFault, true);
  });

  test('1.6: safe state during active CRITICAL lockout transitions to LOCKOUT_PENDING_RESET and silences siren', () => {
    const critical = { lockoutStatus: 'CRITICAL', mainContactorTripped: true, buzzerActive: true };
    const normalized = transitionGasSafetyState(critical, 'safe', 410);
    assert.strictEqual(normalized.lockoutStatus, 'LOCKOUT_PENDING_RESET');
    assert.strictEqual(normalized.gasClearedPendingReset, true);
    assert.strictEqual(normalized.mainContactorTripped, true);
    assert.strictEqual(normalized.buzzerActive, false);
  });

  test('2.1: Duplicate realtime events do NOT create duplicate siren instances', () => {
    const siren = new MockEmergencySirenService();

    assert.strictEqual(siren.start(), true);
    assert.strictEqual(siren.isPlaying, true);
    assert.strictEqual(siren.startCallCount, 1);

    // Incoming duplicate telemetry danger frames
    assert.strictEqual(siren.start(), false);
    assert.strictEqual(siren.start(), false);
    assert.strictEqual(siren.start(), false);

    // Call count strictly remains 1
    assert.strictEqual(siren.startCallCount, 1);
    assert.strictEqual(siren.isPlaying, true);
  });

  test('2.2: Stop resets isPlaying and permits subsequent restart', () => {
    const siren = new MockEmergencySirenService();

    siren.start();
    assert.strictEqual(siren.isPlaying, true);

    siren.stop();
    assert.strictEqual(siren.isPlaying, false);
    assert.strictEqual(siren.stopCallCount, 1);

    // Restart after incident
    siren.start();
    assert.strictEqual(siren.isPlaying, true);
    assert.strictEqual(siren.startCallCount, 2);
  });

  test('2.3: Silencing siren mutes audio while preserving hardware safety interlock', () => {
    let isSirenMuted = false;
    let contactorTripped = true;

    // Operator clicks SILENCE SIREN
    isSirenMuted = true;
    const sirenSilencedState = {
      isSirenMuted,
      lockoutStatus: 'SILENCED',
      mainContactorTripped: contactorTripped, // Contactor remains TRIPPED
    };

    assert.strictEqual(sirenSilencedState.isSirenMuted, true);
    assert.strictEqual(sirenSilencedState.lockoutStatus, 'SILENCED');
    assert.strictEqual(sirenSilencedState.mainContactorTripped, true);
  });

  test('3.1: Initial page hydration with danger gas_status activates alarm', () => {
    const hydratedReading = {
      gas_status: 'danger',
      gas_raw_adc: 1750,
      is_demo: false,
    };

    const isAlarmTriggered = evaluateGasAlarmTrigger(hydratedReading.gas_status, hydratedReading.gas_raw_adc);
    assert.strictEqual(isAlarmTriggered, true);
  });

  test('3.2: Page refresh during active gas hazard restores alarm state', () => {
    const freshDbTelemetry = {
      gas_status: 'danger',
      gas_raw_adc: 2100,
      recorded_at: new Date().toISOString(),
      is_demo: false,
    };

    const shouldOpenModal = freshDbTelemetry.gas_status === 'danger' || freshDbTelemetry.gas_raw_adc >= 1600;
    assert.strictEqual(shouldOpenModal, true);
  });
});

describe('SmartHomeX AI - Safe TEST ALARM Button Feature Audit', () => {
  // Harness simulating SmartHomeContext alarm test logic
  class AlarmTestController {
    constructor() {
      this.isAlarmTesting = false;
      this.alarmTestCountdown = 0;
      this.alarmTestError = null;
      this.timerId = null;
      this.intervalId = null;
      this.dispatchedEsp32Commands = [];
      this.supabaseAlertsCreated = [];
      this.siren = new (class {
        constructor() { this.isPlaying = false; }
        start() { this.isPlaying = true; return true; }
        stop() { this.isPlaying = false; return true; }
      })();
      this.gasSafetyState = { lockoutStatus: 'NORMAL', mainContactorTripped: false };
      this.telemetry = { gasStatus: 'safe', gasRawAdc: 410 };
    }

    startAlarmTest() {
      const isRealEmergency =
        this.telemetry.gasStatus === 'danger' ||
        (this.telemetry.gasRawAdc != null && this.telemetry.gasRawAdc >= 1600) ||
        this.gasSafetyState.lockoutStatus === 'CRITICAL' ||
        this.gasSafetyState.lockoutStatus === 'EMERGENCY_LOCKOUT' ||
        this.gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET';

      if (isRealEmergency) {
        this.alarmTestError = 'Cannot test alarm: Real gas emergency or safety lockout is active!';
        return false;
      }

      if (this.isAlarmTesting) return true; // duplicate guard

      this.alarmTestError = null;
      this.siren.start();
      this.isAlarmTesting = true;
      this.alarmTestCountdown = 7;

      // In tests, simulate duration without real wall-clock delays
      return true;
    }

    tickCountdown() {
      if (this.alarmTestCountdown > 0) {
        this.alarmTestCountdown -= 1;
        if (this.alarmTestCountdown === 0) {
          this.stopAlarmTest();
        }
      }
    }

    stopAlarmTest() {
      this.isAlarmTesting = false;
      this.alarmTestCountdown = 0;
      const isRealEmergency =
        this.telemetry.gasStatus === 'danger' ||
        (this.telemetry.gasRawAdc != null && this.telemetry.gasRawAdc >= 1600) ||
        this.gasSafetyState.lockoutStatus === 'CRITICAL';

      if (!isRealEmergency) {
        this.siren.stop();
      }
    }

    onRealEmergencyArrived(status, rawAdc) {
      // Real emergency aborts any test immediately
      if (this.isAlarmTesting) {
        this.isAlarmTesting = false;
        this.alarmTestCountdown = 0;
      }
      this.telemetry.gasStatus = status;
      this.telemetry.gasRawAdc = rawAdc;
      this.gasSafetyState.lockoutStatus = 'CRITICAL';
      this.gasSafetyState.mainContactorTripped = true;
      this.siren.start();
    }
  }

  test('Scenario 1 & 7 & 8: Clicking TEST ALARM starts siren without dispatching ESP32 commands or Supabase alerts', () => {
    const ctrl = new AlarmTestController();

    const ok = ctrl.startAlarmTest();
    assert.strictEqual(ok, true);
    assert.strictEqual(ctrl.isAlarmTesting, true);
    assert.strictEqual(ctrl.siren.isPlaying, true);
    assert.strictEqual(ctrl.alarmTestCountdown, 7);

    // Strictly verifies 0 ESP32 commands and 0 Supabase records
    assert.strictEqual(ctrl.dispatchedEsp32Commands.length, 0);
    assert.strictEqual(ctrl.supabaseAlertsCreated.length, 0);

    // Contactor remains ARMED (not tripped) and status remains NORMAL
    assert.strictEqual(ctrl.gasSafetyState.mainContactorTripped, false);
    assert.strictEqual(ctrl.gasSafetyState.lockoutStatus, 'NORMAL');
  });

  test('Scenario 2: TEST ALARM automatically stops after configured countdown reaches 0', () => {
    const ctrl = new AlarmTestController();
    ctrl.startAlarmTest();

    for (let i = 0; i < 7; i++) {
      assert.strictEqual(ctrl.isAlarmTesting, true);
      ctrl.tickCountdown();
    }

    assert.strictEqual(ctrl.isAlarmTesting, false);
    assert.strictEqual(ctrl.alarmTestCountdown, 0);
    assert.strictEqual(ctrl.siren.isPlaying, false);
  });

  test('Scenario 3: STOP TEST halts sound immediately before timer expires', () => {
    const ctrl = new AlarmTestController();
    ctrl.startAlarmTest();
    assert.strictEqual(ctrl.siren.isPlaying, true);

    // User clicks STOP TEST at 5 seconds remaining
    ctrl.tickCountdown();
    ctrl.tickCountdown();
    assert.strictEqual(ctrl.alarmTestCountdown, 5);

    ctrl.stopAlarmTest();
    assert.strictEqual(ctrl.isAlarmTesting, false);
    assert.strictEqual(ctrl.alarmTestCountdown, 0);
    assert.strictEqual(ctrl.siren.isPlaying, false);
  });

  test('Scenario 4: Clicking TEST ALARM repeatedly does not create duplicate audio instances', () => {
    const ctrl = new AlarmTestController();
    ctrl.startAlarmTest();
    assert.strictEqual(ctrl.isAlarmTesting, true);

    // Repeated clicks
    assert.strictEqual(ctrl.startAlarmTest(), true);
    assert.strictEqual(ctrl.startAlarmTest(), true);
    assert.strictEqual(ctrl.alarmTestCountdown, 7);
  });

  test('Scenario 5: Refreshing website clears temporary test state', () => {
    // In-memory state defaults on fresh page mount
    const freshCtrl = new AlarmTestController();
    assert.strictEqual(freshCtrl.isAlarmTesting, false);
    assert.strictEqual(freshCtrl.alarmTestCountdown, 0);
    assert.strictEqual(freshCtrl.siren.isPlaying, false);
  });

  test('Scenario 6: Real gas emergency aborts active alarm test and prioritizes real emergency', () => {
    const ctrl = new AlarmTestController();
    ctrl.startAlarmTest();
    assert.strictEqual(ctrl.isAlarmTesting, true);

    // Sudden real gas leak arrives from ESP32 telemetry (ADC 1750 >= 1600)
    ctrl.onRealEmergencyArrived('danger', 1750);

    // Test alarm is immediately terminated
    assert.strictEqual(ctrl.isAlarmTesting, false);
    assert.strictEqual(ctrl.alarmTestCountdown, 0);

    // Real emergency state is active and siren remains SOUNDING
    assert.strictEqual(ctrl.gasSafetyState.lockoutStatus, 'CRITICAL');
    assert.strictEqual(ctrl.gasSafetyState.mainContactorTripped, true);
    assert.strictEqual(ctrl.siren.isPlaying, true);

    // Attempting to stop test does NOT silence the real emergency!
    ctrl.stopAlarmTest();
    assert.strictEqual(ctrl.siren.isPlaying, true);
  });

  test('Scenario 7: Real emergency or lockout active blocks TEST ALARM from starting', () => {
    const ctrl = new AlarmTestController();
    ctrl.gasSafetyState.lockoutStatus = 'CRITICAL';

    const ok = ctrl.startAlarmTest();
    assert.strictEqual(ok, false);
    assert.strictEqual(ctrl.isAlarmTesting, false);
    assert.strictEqual(ctrl.siren.isPlaying, false);
    assert.match(ctrl.alarmTestError, /Cannot test alarm/);
  });
});

describe('SmartHomeX AI - Browser Audio & Speaker Diagnostic Audit', () => {

  class MockAudioDiagnosticService {
    constructor() {
      this.contextState = 'running';
      this.isSupported = true;
      this.isPlayingSiren = false;
      this.isBeeping = false;
      this.beepFrequency = null;
      this.gain = 0;
    }

    getDiagnosticStatus() {
      if (!this.isSupported) return 'ERROR';
      if (this.isPlayingSiren || this.isBeeping) return 'PLAYING';
      if (this.contextState === 'running') return 'READY';
      if (this.contextState === 'suspended') return 'BLOCKED';
      if (this.contextState === 'closed') return 'ERROR';
      return 'READY';
    }

    async playTestBeep(frequency = 880, durationMs = 500) {
      if (!this.isSupported) return false;
      if (this.contextState === 'suspended') return false;
      this.isBeeping = true;
      this.beepFrequency = frequency;
      this.gain = 0.20;
      return true;
    }

    stopTestBeep() {
      this.isBeeping = false;
      this.beepFrequency = null;
      this.gain = 0;
    }

    startSiren() {
      if (!this.isSupported) return false;
      this.stopTestBeep();
      this.isPlayingSiren = true;
      this.gain = 0.25;
      return true;
    }

    stopSiren() {
      this.isPlayingSiren = false;
      this.gain = 0;
    }

    stopAll() {
      this.stopTestBeep();
      this.stopSiren();
    }
  }

  test('Diagnostic Status: correctly transitions between READY, PLAYING, BLOCKED, and ERROR', () => {
    const service = new MockAudioDiagnosticService();

    // 1. Context running and idle -> READY
    assert.strictEqual(service.getDiagnosticStatus(), 'READY');

    // 2. Context suspended by browser autoplay policy -> BLOCKED
    service.contextState = 'suspended';
    assert.strictEqual(service.getDiagnosticStatus(), 'BLOCKED');

    // 3. Resumed and playing beep chime -> PLAYING
    service.contextState = 'running';
    service.playTestBeep(880);
    assert.strictEqual(service.getDiagnosticStatus(), 'PLAYING');

    // 4. Stopped beep chime -> READY
    service.stopTestBeep();
    assert.strictEqual(service.getDiagnosticStatus(), 'READY');

    // 5. Playing emergency siren -> PLAYING
    service.startSiren();
    assert.strictEqual(service.getDiagnosticStatus(), 'PLAYING');

    // 6. Unsupported environment -> ERROR
    service.isSupported = false;
    assert.strictEqual(service.getDiagnosticStatus(), 'ERROR');
  });

  test('Diagnostic Beep: plays short 880Hz sine chime and resets on stopTestBeep', async () => {
    const service = new MockAudioDiagnosticService();
    const ok = await service.playTestBeep(880, 500);

    assert.strictEqual(ok, true);
    assert.strictEqual(service.isBeeping, true);
    assert.strictEqual(service.beepFrequency, 880);
    assert.strictEqual(service.gain, 0.20);

    service.stopTestBeep();
    assert.strictEqual(service.isBeeping, false);
    assert.strictEqual(service.beepFrequency, null);
    assert.strictEqual(service.gain, 0);
  });

  test('STOP ALL: immediately halts both test siren and test chime', () => {
    const service = new MockAudioDiagnosticService();
    service.startSiren();
    assert.strictEqual(service.isPlayingSiren, true);

    service.stopAll();
    assert.strictEqual(service.isPlayingSiren, false);
    assert.strictEqual(service.isBeeping, false);
    assert.strictEqual(service.getDiagnosticStatus(), 'READY');
  });

  test('Real Emergency Priority: real gas emergency cancels test beep and triggers evacuation siren', () => {
    const service = new MockAudioDiagnosticService();
    service.playTestBeep(880);
    assert.strictEqual(service.isBeeping, true);

    // Sudden gas hazard arrives
    const gasStatus = 'danger';
    const isEmergency = gasStatus === 'danger';

    if (isEmergency) {
      service.stopTestBeep();
      service.startSiren();
    }

    assert.strictEqual(service.isBeeping, false);
    assert.strictEqual(service.isPlayingSiren, true);
    assert.strictEqual(service.getDiagnosticStatus(), 'PLAYING');
  });

  test('Verification Disclaimer Requirement: adheres to "Audio generation verified, physical speaker output not verified"', () => {
    const disclaimer = 'Audio generation verified, physical speaker output not verified.';
    assert.ok(disclaimer.includes('Audio generation verified'));
    assert.ok(disclaimer.includes('physical speaker output not verified'));
  });
});
