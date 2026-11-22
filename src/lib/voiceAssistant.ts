import type { Device, SensorTelemetry } from '../types/index.ts';

export interface CommandParseResult {
  understood: boolean;
  action?: 'TOGGLE_DEVICE' | 'ALL_ON' | 'ALL_OFF' | 'QUERY_TEMP' | 'QUERY_GAS' | 'QUERY_POWER' | 'MUTE_SIREN' | 'UNKNOWN';
  targetDeviceId?: string;
  desiredState?: boolean;
  safetyBlocked?: boolean;
  replyText: string;
  details?: string;
}

export function parseVoiceCommand(
  rawTranscript: string,
  devices: Device[],
  telemetry: SensorTelemetry
): CommandParseResult {
  const text = rawTranscript.toLowerCase().trim();

  // Safety condition detection: Real combustible gas danger or active lockout
  const isLockoutActive = 
    telemetry.gasStatus === 'danger' || 
    (telemetry.gasRawAdc != null && telemetry.gasRawAdc >= 1600);

  // Multilingual state intent tokens (English, Hindi, Marathi)
  const onWords = ['on', 'start', 'activate', 'run', 'chalu', 'jalao', 'lawa', 'petawa', 'khol', 'shuru', 'lagao'];
  const offWords = ['off', 'kill', 'stop', 'band', 'bujhao', 'rok', 'hatao'];

  const hasTurnOff = offWords.some(w => text.includes(w));
  const hasTurnOn = onWords.some(w => text.includes(w));

  // -------------------------------------------------------------------------
  // 0. Priority Life-Safety Status & Siren Commands
  // -------------------------------------------------------------------------
  // Emergency Status Query: "Is there a gas emergency?" / "What is the emergency status?"
  if (
    text.includes('is there a gas emergency') ||
    text.includes('is gas emergency active') ||
    text.includes('what is the emergency status') ||
    text.includes('emergency status') ||
    text.includes('gas emergency')
  ) {
    if (isLockoutActive) {
      return {
        understood: true,
        action: 'QUERY_GAS',
        replyText: 'Warning! Gas emergency is currently ACTIVE. Safety lockout is engaged and dedicated exhaust ventilation is running.',
        details: 'Emergency Status: ACTIVE GAS EMERGENCY (Lockout Engaged)',
      };
    }
    return {
      understood: true,
      action: 'QUERY_GAS',
      replyText: 'System status is normal. No gas emergency is detected. All safety systems are operating within configured parameters.',
      details: 'Emergency Status: NORMAL (No Emergency)',
    };
  }

  // Check Gas Sensor / Is gas level safe: "Check gas sensor." / "Is the gas level safe?"
  if (
    text.includes('check gas sensor') ||
    text.includes('is the gas level safe') ||
    text.includes('is gas safe') ||
    text.includes('check gas level') ||
    text.includes('check gas')
  ) {
    if (telemetry.gasStatus === 'danger' || (telemetry.gasRawAdc != null && telemetry.gasRawAdc >= 1600)) {
      return {
        understood: true,
        action: 'QUERY_GAS',
        replyText: `Alert! The MQ-2 gas sensor reports dangerous combustible gas levels (ADC ${telemetry.gasRawAdc ?? 'High'}). Atmosphere is UNSAFE.`,
        details: `MQ-2 Sensor: UNSAFE (ADC ${telemetry.gasRawAdc ?? '--'})`,
      };
    }
    const adcText = telemetry.gasRawAdc != null ? ` (ADC ${telemetry.gasRawAdc})` : '';
    return {
      understood: true,
      action: 'QUERY_GAS',
      replyText: `The gas sensor level is currently SAFE${adcText}. Combustible gas concentration is well below the danger threshold.`,
      details: `MQ-2 Sensor: SAFE${adcText}`,
    };
  }

  // Mute Emergency Siren: "Mute emergency siren." / "Mute siren." / "Silence siren."
  if (
    text.includes('mute emergency siren') ||
    text.includes('mute siren') ||
    text.includes('silence siren') ||
    text.includes('stop siren')
  ) {
    return {
      understood: true,
      action: 'MUTE_SIREN',
      replyText: 'Emergency siren has been muted. Note that physical safety lockout and exhaust ventilation remain active.',
      details: 'Website Siren Muted (Safety Lockout Maintained)',
    };
  }

  // Prevent voice commands from bypassing or clearing confirmed emergency without safety verification
  if (
    text.includes('clear emergency') ||
    text.includes('bypass emergency') ||
    text.includes('reset emergency') ||
    text.includes('dismiss emergency') ||
    text.includes('cancel emergency')
  ) {
    if (isLockoutActive) {
      return {
        understood: true,
        action: 'UNKNOWN',
        safetyBlocked: true,
        replyText: 'Safety Interlock: Emergency status cannot be cleared by voice command while combustible gas is detected or before safe verification.',
        details: 'Clear Emergency blocked: Safety Verification Required',
      };
    }
  }

  // -------------------------------------------------------------------------
  // 1. Master Control: All Devices ON / ALL OFF
  // -------------------------------------------------------------------------
  if (
    text.includes('turn on all') || 
    text.includes('all on') || 
    text.includes('turn all on') || 
    text.includes('activate all') ||
    text.includes('sab chalu') || 
    text.includes('sab on') ||
    text.includes('sarva chalu') ||
    text.includes('sagla chalu')
  ) {
    if (isLockoutActive) {
      return {
        understood: true,
        action: 'ALL_ON',
        desiredState: true,
        safetyBlocked: true,
        replyText: 'Safety Alert: Master relay activation is strictly blocked during gas emergency lockout.',
        details: 'Master ON blocked by Gas Safety Interlock',
      };
    }
    return {
      understood: true,
      action: 'ALL_ON',
      desiredState: true,
      replyText: 'Commanding all active 3 normal user-controlled relays ON.',
      details: 'All 3 normal relays commanded ON',
    };
  }

  if (
    text.includes('turn off all') || 
    text.includes('all off') || 
    text.includes('turn all off') || 
    text.includes('shut down all') ||
    text.includes('sab band') ||
    text.includes('sab off') ||
    text.includes('sarva band') ||
    text.includes('sagla band')
  ) {
    return {
      understood: true,
      action: 'ALL_OFF',
      desiredState: false,
      replyText: 'Switching off all normal controlled devices.',
      details: 'All 3 normal relays commanded OFF',
    };
  }

  // -------------------------------------------------------------------------
  // 2. Telemetry Queries: Temperature, Gas, Power (Multilingual)
  // -------------------------------------------------------------------------
  // Query temperature / climate
  if (
    text.includes('temperature') || 
    text.includes('how hot') || 
    text.includes('weather') || 
    text.includes('humidity') ||
    text.includes('tapman') ||
    text.includes('tapanman') ||
    text.includes('garmi')
  ) {
    if (telemetry.temperature == null) {
      return {
        understood: true,
        action: 'QUERY_TEMP',
        replyText: 'Ambient temperature readings are currently unavailable from the DHT11 sensor.',
        details: 'DHT11 Telemetry: Disconnected',
      };
    }
    const humString = telemetry.humidity != null ? ` with ${telemetry.humidity}% relative humidity` : '';
    return {
      understood: true,
      action: 'QUERY_TEMP',
      replyText: `The current ambient temperature is ${telemetry.temperature}°C${humString} according to the DHT11 sensor.`,
      details: `DHT11 Telemetry: ${telemetry.temperature}°C, ${telemetry.humidity ?? '--'}%`,
    };
  }

  // Query gas / air quality
  if (
    text.includes('gas') || 
    text.includes('smoke') || 
    text.includes('air quality') || 
    text.includes('leak') ||
    text.includes('hawa')
  ) {
    if (telemetry.gasPpm == null && telemetry.gasRawAdc == null) {
      return {
        understood: true,
        action: 'QUERY_GAS',
        replyText: 'Combustible gas telemetry is currently offline or stabilizing.',
        details: 'MQ-2 Telemetry: Disconnected',
      };
    }
    const reading = telemetry.gasPpm != null ? `${telemetry.gasPpm} PPM` : `Raw ADC ${telemetry.gasRawAdc}`;
    const statusNote = telemetry.gasStatus === 'safe' ? 'within safe limits' : 'elevated, monitor closely';
    return {
      understood: true,
      action: 'QUERY_GAS',
      replyText: `The MQ-2 sensor reports ${reading} of combustible gas and smoke, which is ${statusNote}.`,
      details: `MQ-2 Telemetry: ${reading} (${telemetry.gasStatus.toUpperCase()})`,
    };
  }

  // Query power / electrical load
  if (
    text.includes('power') || 
    text.includes('watts') || 
    text.includes('voltage') || 
    text.includes('energy') ||
    text.includes('bijli') ||
    text.includes('load') ||
    text.includes('current')
  ) {
    if (telemetry.power == null) {
      return {
        understood: true,
        action: 'QUERY_POWER',
        replyText: 'Power and electrical telemetry readings are currently unavailable from the INA219 monitor.',
        details: 'INA219: Disconnected',
      };
    }
    const vText = telemetry.voltage != null ? ` at ${telemetry.voltage} Volts` : '';
    const cText = telemetry.current != null ? ` with ${telemetry.current} Amps` : '';
    return {
      understood: true,
      action: 'QUERY_POWER',
      replyText: `Current real-time load is ${telemetry.power} Watts${vText}${cText} through the INA219 monitor.`,
      details: `INA219: ${telemetry.power}W @ ${telemetry.voltage ?? '--'}V, ${telemetry.current ?? '--'}A`,
    };
  }

  // -------------------------------------------------------------------------
  // 3. Individual Relay Control (5 Channels)
  // Check Street Light & Exhaust BEFORE general Light & Fan to prevent intent clash
  // -------------------------------------------------------------------------

  // Channel 4: Street Light (GPIO 14)
  if (
    text.includes('street light') || 
    text.includes('street-light') || 
    text.includes('street') || 
    text.includes('outdoor light') ||
    text.includes('road light') ||
    text.includes('bahar ki light') ||
    text.includes('baherchi light')
  ) {
    const streetLight = devices.find(d => d.relayChannel === 4 || d.id === 'relay-4' || d.deviceSlug === 'street-light');
    if (streetLight && (hasTurnOn || hasTurnOff)) {
      const state = hasTurnOff ? false : true;
      if (state && isLockoutActive) {
        return {
          understood: true,
          action: 'TOGGLE_DEVICE',
          targetDeviceId: streetLight.id,
          desiredState: true,
          safetyBlocked: true,
          replyText: 'Safety Alert: Street Light activation is prohibited during combustible gas emergency.',
          details: 'Street Light blocked by Gas Safety Interlock',
        };
      }
      return {
        understood: true,
        action: 'TOGGLE_DEVICE',
        targetDeviceId: streetLight.id,
        desiredState: state,
        replyText: `Street Light turned ${state ? 'ON' : 'OFF'}.`,
        details: `Relay 4 (GPIO ${streetLight.gpioPin}) -> ${state ? 'Active' : 'Idle'}`,
      };
    }
  }

  // Channel 5: Dedicated Emergency Exhaust Fan (GPIO 32)
  if (
    text.includes('exhaust') || 
    text.includes('ventilation') || 
    text.includes('kitchen fan') ||
    text.includes('chimney')
  ) {
    const exhaust = devices.find(d => d.relayChannel === 5 || d.type === 'exhaust_fan' || d.id === 'relay-exhaust');
    if (exhaust && (hasTurnOn || hasTurnOff || text.includes('emergency'))) {
      const state = hasTurnOff ? false : true;
      if (!state && isLockoutActive) {
        return {
          understood: true,
          action: 'TOGGLE_DEVICE',
          targetDeviceId: exhaust.id,
          desiredState: false,
          safetyBlocked: true,
          replyText: 'Safety Alert: Dedicated emergency exhaust must remain active during gas emergency. Deactivation is blocked until gas levels return to safe range.',
          details: 'Exhaust Fan OFF blocked by Active Gas Emergency Interlock',
        };
      }
      return {
        understood: true,
        action: 'TOGGLE_DEVICE',
        targetDeviceId: exhaust.id,
        desiredState: state,
        replyText: `Dedicated Emergency Exhaust Fan turned ${state ? 'ON' : 'OFF'}.`,
        details: `Emergency Exhaust Fan (GPIO ${exhaust.gpioPin}) -> ${state ? 'VENTILATING' : 'STANDBY'}`,
      };
    }
  }

  // Channel 3: Water Booster Motor / Pump (GPIO 27)
  if (
    text.includes('motor') || 
    text.includes('pump') || 
    text.includes('water') ||
    text.includes('pani') ||
    text.includes('panyachi')
  ) {
    const motor = devices.find(d => d.relayChannel === 3 || d.type === 'motor' || d.id === 'relay-3');
    if (motor && (hasTurnOn || hasTurnOff)) {
      const state = hasTurnOff ? false : true;
      if (state && isLockoutActive) {
        return {
          understood: true,
          action: 'TOGGLE_DEVICE',
          targetDeviceId: motor.id,
          desiredState: true,
          safetyBlocked: true,
          replyText: 'Safety Alert: Water Motor cannot be turned ON during combustible gas emergency lockout.',
          details: 'Water Motor blocked by Gas Safety Interlock',
        };
      }
      return {
        understood: true,
        action: 'TOGGLE_DEVICE',
        targetDeviceId: motor.id,
        desiredState: state,
        replyText: `Water Booster Motor turned ${state ? 'ON (30-min auto-cutoff active)' : 'OFF'}.`,
        details: `Relay 3 (GPIO ${motor.gpioPin}) -> ${state ? 'Active (30-min timer)' : 'Idle'}`,
      };
    }
  }

  // Channel 2: Ceiling Fan (GPIO 26)
  if (
    (text.includes('fan') || text.includes('pankha')) && 
    !text.includes('exhaust')
  ) {
    const fan = devices.find(d => d.relayChannel === 2 || d.type === 'fan' || d.id === 'relay-2');
    if (fan && (hasTurnOn || hasTurnOff)) {
      const state = hasTurnOff ? false : true;
      if (state && isLockoutActive) {
        return {
          understood: true,
          action: 'TOGGLE_DEVICE',
          targetDeviceId: fan.id,
          desiredState: true,
          safetyBlocked: true,
          replyText: 'Safety Alert: Master Ceiling Fan cannot be turned ON during gas emergency.',
          details: 'Ceiling Fan blocked by Gas Safety Interlock',
        };
      }
      return {
        understood: true,
        action: 'TOGGLE_DEVICE',
        targetDeviceId: fan.id,
        desiredState: state,
        replyText: `Master Ceiling Fan turned ${state ? 'ON' : 'OFF'}.`,
        details: `Relay 2 (GPIO ${fan.gpioPin}) -> ${state ? 'Active' : 'Idle'}`,
      };
    }
  }

  // Channel 1: Living Room Light (GPIO 25)
  if (
    text.includes('light') || 
    text.includes('lamp') || 
    text.includes('batti') || 
    text.includes('roshni') ||
    text.includes('diva')
  ) {
    const light = devices.find(d => d.relayChannel === 1 || d.type === 'light' || d.id === 'relay-1');
    if (light && (hasTurnOn || hasTurnOff)) {
      const state = hasTurnOff ? false : true;
      if (state && isLockoutActive) {
        return {
          understood: true,
          action: 'TOGGLE_DEVICE',
          targetDeviceId: light.id,
          desiredState: true,
          safetyBlocked: true,
          replyText: 'Safety Alert: Living Room Light cannot be turned ON during combustible gas emergency lockout.',
          details: 'Light blocked by Gas Safety Interlock',
        };
      }
      return {
        understood: true,
        action: 'TOGGLE_DEVICE',
        targetDeviceId: light.id,
        desiredState: state,
        replyText: `Living Room Light turned ${state ? 'ON' : 'OFF'}.`,
        details: `Relay 1 (GPIO ${light.gpioPin}) -> ${state ? 'Active' : 'Idle'}`,
      };
    }
  }

  return {
    understood: false,
    action: 'UNKNOWN',
    replyText: `I heard "${rawTranscript}", but I'm not sure which IoT control to map this to. Try "Turn on living room light", "Turn off fan", "Start motor", "Turn on street light", "Emergency exhaust", or "What is the temperature?".`,
    details: 'Unrecognized intent',
  };
}

export function speakText(text: string, enabled: boolean = true): Promise<void> {
  return new Promise((resolve) => {
    if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 0.9;
      
      // Select an English voice if available
      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
      if (naturalVoice) {
        utterance.voice = naturalVoice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}
