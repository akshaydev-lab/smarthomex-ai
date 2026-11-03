import { Device, SensorTelemetry } from '../types';

export interface CommandParseResult {
  understood: boolean;
  action?: 'TOGGLE_DEVICE' | 'ALL_ON' | 'ALL_OFF' | 'QUERY_TEMP' | 'QUERY_GAS' | 'QUERY_POWER' | 'UNKNOWN';
  targetDeviceId?: string;
  desiredState?: boolean;
  replyText: string;
  details?: string;
}

export function parseVoiceCommand(
  rawTranscript: string,
  devices: Device[],
  telemetry: SensorTelemetry
): CommandParseResult {
  const text = rawTranscript.toLowerCase().trim();

  // Master all on/off
  if (text.includes('turn on all') || text.includes('all on') || text.includes('turn all on') || text.includes('activate all')) {
    return {
      understood: true,
      action: 'ALL_ON',
      replyText: 'Commanding all active relay channels ON.',
      details: 'All devices commanded ON',
    };
  }

  if (text.includes('turn off all') || text.includes('all off') || text.includes('turn all off') || text.includes('shut down all')) {
    return {
      understood: true,
      action: 'ALL_OFF',
      replyText: 'Switching off all active relay channels.',
      details: 'All devices commanded OFF',
    };
  }

  // Query temperature/climate
  if (text.includes('temperature') || text.includes('how hot') || text.includes('weather') || text.includes('humidity')) {
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

  // Query gas/smoke
  if (text.includes('gas') || text.includes('smoke') || text.includes('air quality') || text.includes('leak')) {
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

  // Query power/voltage
  if (text.includes('power') || text.includes('watts') || text.includes('voltage') || text.includes('energy')) {
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

  // Individual device targeting
  // Light
  if (text.includes('light') || text.includes('lamp')) {
    const isTurnOn = text.includes('on') || text.includes('start') || text.includes('activate');
    const isTurnOff = text.includes('off') || text.includes('kill') || text.includes('stop');
    const light = devices.find(d => d.type === 'light');
    if (light && (isTurnOn || isTurnOff)) {
      const state = isTurnOn;
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

  // Fan
  if (text.includes('fan') && !text.includes('exhaust')) {
    const isTurnOn = text.includes('on') || text.includes('start') || text.includes('activate');
    const isTurnOff = text.includes('off') || text.includes('kill') || text.includes('stop');
    const fan = devices.find(d => d.type === 'fan');
    if (fan && (isTurnOn || isTurnOff)) {
      const state = isTurnOn;
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

  // Motor / Pump
  if (text.includes('motor') || text.includes('pump') || text.includes('water')) {
    const isTurnOn = text.includes('on') || text.includes('start') || text.includes('run');
    const isTurnOff = text.includes('off') || text.includes('kill') || text.includes('stop');
    const motor = devices.find(d => d.type === 'motor');
    if (motor && (isTurnOn || isTurnOff)) {
      const state = isTurnOn;
      return {
        understood: true,
        action: 'TOGGLE_DEVICE',
        targetDeviceId: motor.id,
        desiredState: state,
        replyText: `Water Booster Motor turned ${state ? 'ON' : 'OFF'}.`,
        details: `Relay 3 (GPIO ${motor.gpioPin}) -> ${state ? 'Active' : 'Idle'}`,
      };
    }
  }

  // Exhaust Fan
  if (text.includes('exhaust') || text.includes('ventilation') || text.includes('kitchen fan')) {
    const isTurnOn = text.includes('on') || text.includes('start') || text.includes('activate') || text.includes('emergency');
    const isTurnOff = text.includes('off') || text.includes('kill') || text.includes('stop');
    const exhaust = devices.find(d => d.type === 'exhaust_fan');
    if (exhaust && (isTurnOn || isTurnOff)) {
      const state = isTurnOn;
      return {
        understood: true,
        action: 'TOGGLE_DEVICE',
        targetDeviceId: exhaust.id,
        desiredState: state,
        replyText: `Kitchen Exhaust Fan turned ${state ? 'ON' : 'OFF'}.`,
        details: `Relay 5 (GPIO ${exhaust.gpioPin}) -> ${state ? 'Active' : 'Idle'}`,
      };
    }
  }

  return {
    understood: false,
    action: 'UNKNOWN',
    replyText: `I heard "${rawTranscript}", but I'm not sure which IoT control to map this to. Try "Turn on living room light", "Turn off fan", "Emergency exhaust", or "What is the temperature?".`,
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
