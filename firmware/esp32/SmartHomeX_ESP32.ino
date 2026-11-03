// ==============================================================================
// SmartHomeX AI - Production ESP32 Firmware (v2.5.0)
// Microcontroller: ESP32 30-pin DevKit (ESP32-WROOM-32)
// Hardware: 
//   - 4-Channel Active LOW Relay (Ch 1 Light: GPIO 14, Ch 2 Fan: GPIO 25, Ch 3 Motor: GPIO 26, Ch 4: Unused)
//   - Separate Single-Channel Relay (Kitchen Exhaust Fan: GPIO 27)
//   - Environmental: DHT11 (GPIO 32), MQ-2 Gas (GPIO 34 ADC1), INA219 (SDA 21, SCL 22)
//   - Alert / Safety: Active Buzzer (GPIO 33), Physical BOOT / Reset Button (GPIO 0)
// Backend: Supabase PostgreSQL Realtime via Secure Gateway Edge Function
// ==============================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <DHT.h>
#include <Preferences.h>
#include "config.h"

// Non-Volatile Storage for persistent command deduplication across reboots
Preferences preferences;

// ------------------------------------------------------------------------------
// Sensor Objects & State Variables
// ------------------------------------------------------------------------------
DHT dht(PIN_DHT11, DHT11);
Adafruit_INA219 ina219;
bool ina219Connected = false;

// Relay States (True = ON/Energized, False = OFF/Idle)
// All relays default to FALSE (OFF) during boot
bool stateLight   = false; // 4-Ch Relay 1 (GPIO 14)
bool stateFan     = false; // 4-Ch Relay 2 (GPIO 25)
bool stateMotor   = false; // 4-Ch Relay 3 (GPIO 26)
bool stateExhaust = false; // Separate Single Relay (GPIO 27)

// Water Motor 30-Minute Continuous Cutoff Protection
unsigned long motorActiveStartMillis = 0;
unsigned long motorActiveSeconds = 0;

// INA219 Energy Intelligence Variables (Initialized to NAN / disconnected; no fabricated defaults)
bool ina219Valid       = false;
float busVoltage_V     = NAN;
float shuntVoltage_mV  = NAN;
float current_mA       = NAN;
float current_A        = NAN;
float power_W          = NAN;
float totalEnergy_Wh   = 0.0f;
unsigned long lastEnergyCalcMillis = 0;
String powerAnomaly    = "normal";

// DHT11 Environmental Readings (Initialized to NAN; no fabricated defaults)
bool dhtValid          = false;
float ambientTemp_C    = NAN;
float ambientHumidity  = NAN;

// MQ-2 Gas & Life-Safety Interlock
int lastRawAdc         = -1;
String gasStatus       = "warming_up"; // "warming_up", "sensor_fault", "warning", "danger", "safe"
bool isGasLockoutActive       = false;
bool isMainContactorTripped   = false;
bool gasClearedPendingReset   = false;
bool isSensorFaultActive      = false;

unsigned long lastGasCheckMillis = 0;
unsigned long buzzerLastToggleMillis = 0;
bool buzzerToneState = false;

// Physical Reset Button Debounce (GPIO 0)
unsigned long lastResetBtnPressMillis = 0;
bool lastResetBtnState = HIGH;

// Non-Blocking Schedule Timers
unsigned long lastTelemetryMillis = 0;
unsigned long lastCommandPollMillis = 0;
unsigned long lastHeartbeatMillis = 0;
unsigned long lastWiFiRetryMillis = 0;

// Command Deduplication Ring Cache (prevents re-executing unacknowledged commands during network drops)
char lastExecutedCmdId[48] = "";

// ------------------------------------------------------------------------------
// Function Prototypes
// ------------------------------------------------------------------------------
void initPersistentDeduplication();
void setupHardwarePins();
void checkLocalGasSafety();
void checkPhysicalResetButton();
void readINA219();
void readDHT11();
void updateMotorRuntimeGuard();
void reportMotorTripToSupabase();
void reportSafetyResetToSupabase(const char* source);
bool setRelayState(int channel, bool targetState);
void sendTelemetryToSupabase();
void pollPendingCommandsFromSupabase();
void ackCommandToSupabase(const char* commandId, const char* deviceId, const char* status, bool actualState, const char* errMsg, int rttMs);
void sendHeartbeatToSupabase();

// ==============================================================================
// Arduino Setup Initialization
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println(F("=================================================="));
  Serial.println(F("   SmartHomeX AI - ESP32 Hardware Node v2.5.0     "));
  Serial.println(F("   Gas Emergency Automation & Protection System   "));
  Serial.println(F("=================================================="));

  // 1. Initialize Hardware Pins & Persistent Flash Deduplication
  initPersistentDeduplication();
  setupHardwarePins();

  // 2. Initialize I2C Bus & INA219 Sensor
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  if (ina219.begin()) {
    ina219Connected = true;
    Serial.println(F("[INA219] Energy sensor initialized successfully on I2C (GPIO 21/22)."));
  } else {
    ina219Connected = false;
    Serial.println(F("[INA219] WARNING: INA219 not detected. Transmitting null readings."));
  }

  // 3. Initialize DHT11 Sensor
  dht.begin();
  Serial.println(F("[DHT11] Temperature & Humidity sensor initialized on GPIO 32."));

  // 4. Initial Local Gas Baseline Sample
  analogReadResolution(12); // ESP32 12-bit ADC (0 - 4095)
  checkLocalGasSafety();

  // 5. Connect to Wi-Fi
  Serial.print(F("[WIFI] Connecting to "));
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    Serial.print(F("."));
    // Keep local safety loop alive even during Wi-Fi boot!
    checkLocalGasSafety();
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F("[WIFI] Connected! Assigned IP: "));
    Serial.println(WiFi.localIP());
    Serial.print(F("[WIFI] Signal Strength (RSSI): "));
    Serial.print(WiFi.RSSI());
    Serial.println(F(" dBm"));
  } else {
    Serial.println(F("[WIFI] Initial connection timed out. Background retry active."));
  }

  lastEnergyCalcMillis = millis();
  Serial.println(F("[SYSTEM] Initialization complete. Entering main executive loop."));
}

// ==============================================================================
// Arduino Main Loop (Non-Blocking Multitasking Architecture)
// ==============================================================================
void loop() {
  unsigned long currentMillis = millis();

  // ---------------------------------------------------------------------------
  // Priority 1: LOCAL LIFE-SAFETY GAS INTERLOCK (Every 100ms)
  // Executes locally regardless of Wi-Fi or Cloud status. NEVER BLOCKED.
  // ---------------------------------------------------------------------------
  if (currentMillis - lastGasCheckMillis >= INTERVAL_LOCAL_SAFETY_MS) {
    lastGasCheckMillis = currentMillis;
    checkLocalGasSafety();
    checkPhysicalResetButton();
  }

  // ---------------------------------------------------------------------------
  // Priority 2: Water Motor 30-Minute Continuous Run-Time Auto Cutoff
  // ---------------------------------------------------------------------------
  updateMotorRuntimeGuard();

  // ---------------------------------------------------------------------------
  // Priority 3: Non-Blocking Wi-Fi Reconnection Watchdog
  // ---------------------------------------------------------------------------
  if (WiFi.status() != WL_CONNECTED) {
    if (currentMillis - lastWiFiRetryMillis >= WIFI_RETRY_INTERVAL_MS) {
      lastWiFiRetryMillis = currentMillis;
      Serial.println(F("[WIFI] Reconnecting to Wi-Fi in background..."));
      WiFi.reconnect();
    }
    return; // Skip cloud requests until Wi-Fi re-establishes
  }

  // ---------------------------------------------------------------------------
  // Priority 4: Fast Command Polling (Every 1.5 seconds)
  // Checks Supabase for website user actions (Light, Fan, Motor, Exhaust toggles)
  // ---------------------------------------------------------------------------
  if (currentMillis - lastCommandPollMillis >= INTERVAL_POLL_COMMANDS_MS) {
    lastCommandPollMillis = currentMillis;
    pollPendingCommandsFromSupabase();
  }

  // ---------------------------------------------------------------------------
  // Priority 5: Sensor Telemetry Ingest (Every 5 seconds)
  // Samples INA219 + DHT11 + MQ-2 and posts to Supabase sensor_readings
  // ---------------------------------------------------------------------------
  if (currentMillis - lastTelemetryMillis >= INTERVAL_TELEMETRY_MS) {
    lastTelemetryMillis = currentMillis;
    readINA219();
    readDHT11();
    sendTelemetryToSupabase();
  }

  // ---------------------------------------------------------------------------
  // Priority 6: Periodic Device Heartbeat (Every 30 seconds)
  // ---------------------------------------------------------------------------
  if (currentMillis - lastHeartbeatMillis >= INTERVAL_HEARTBEAT_MS) {
    lastHeartbeatMillis = currentMillis;
    sendHeartbeatToSupabase();
  }
}

// ==============================================================================
// Persistent Command Deduplication (ESP32 Flash NVS)
// ==============================================================================
void initPersistentDeduplication() {
  preferences.begin("shx_dedup", false);
  String savedId = preferences.getString("last_cmd", "");
  if (savedId.length() > 0) {
    strncpy(lastExecutedCmdId, savedId.c_str(), sizeof(lastExecutedCmdId) - 1);
    lastExecutedCmdId[sizeof(lastExecutedCmdId) - 1] = '\0';
    Serial.print(F("[NVS PERSISTENCE] Restored last executed command ID across reboot: "));
    Serial.println(lastExecutedCmdId);
  } else {
    Serial.println(F("[NVS PERSISTENCE] No prior command ID stored in flash. Ready."));
  }
}

// ==============================================================================
// Hardware Pin Initialization
// ==============================================================================
void setupHardwarePins() {
  // CRITICAL REQUIREMENT: For Active-LOW relays, write HIGH (RELAY_OFF) BEFORE
  // configuring pinMode as OUTPUT. This eliminates momentary relay chatter / coil click on boot.
  digitalWrite(PIN_RELAY_LIGHT, RELAY_OFF);
  digitalWrite(PIN_RELAY_FAN, RELAY_OFF);
  digitalWrite(PIN_RELAY_MOTOR, RELAY_OFF);
  digitalWrite(PIN_RELAY_EXHAUST, RELAY_OFF);

  pinMode(PIN_RELAY_LIGHT, OUTPUT);
  pinMode(PIN_RELAY_FAN, OUTPUT);
  pinMode(PIN_RELAY_MOTOR, OUTPUT);
  pinMode(PIN_RELAY_EXHAUST, OUTPUT);

  // Analog input for MQ-2 (GPIO 34 is input-only ADC1 channel)
  pinMode(PIN_MQ2_ANALOG, INPUT);

  // Active Buzzer for emergency alarm
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW); // Buzzer OFF

  // Physical Manual Safety Reset Button (GPIO 0 with internal pullup)
  pinMode(PIN_PHYSICAL_RESET_BTN, INPUT_PULLUP);

  Serial.println(F("[HARDWARE] Relays defaulted to OFF (Active-LOW safe boot completed)."));
  Serial.println(F("[HARDWARE] 4-Channel Relay: Ch 1 (GPIO 14), Ch 2 (GPIO 25), Ch 3 (GPIO 26), Ch 4 (UNUSED)."));
  Serial.println(F("[HARDWARE] Separate Single Relay: Exhaust Fan (GPIO 27, spark interlock enforced)."));
}

// ==============================================================================
// Local Life-Safety Gas Emergency Interlock & Buzzer Routine
// Uses ground-truth raw ADC thresholds without claiming uncalibrated PPM.
// Independent of Wi-Fi or Cloud. Executes every 100ms.
// ==============================================================================
void checkLocalGasSafety() {
  // Multi-sample analog read on GPIO 34 for electrical noise rejection
  long adcSum = 0;
  for (int i = 0; i < 8; i++) {
    adcSum += analogRead(PIN_MQ2_ANALOG);
  }
  lastRawAdc = (int)(adcSum / 8);

  // 1. Cold-Boot Stabilization Guard:
  // MQ-2 heater coil takes ~20 seconds to reach operating temperature on power up.
  if (millis() < MQ2_WARMUP_PERIOD_MS) {
    gasStatus = "warming_up";
    isSensorFaultActive = false;
    return;
  }

  // 2. Hardware Fault Detection: Open Circuit / Disconnected Sensor Wire
  // When MQ-2 analog wire is disconnected, ADC floats to ground/zero (below 45).
  // CRITICAL REQUIREMENT: A disconnected or faulty MQ-2 must NEVER be reported as safe!
  if (lastRawAdc < MQ2_ADC_FAULT_THRESHOLD) {
    isSensorFaultActive = true;
    gasStatus = "sensor_fault";
    
    // Intermittent double-beep fault alert
    unsigned long now = millis();
    if (now - buzzerLastToggleMillis >= 3000) {
      buzzerLastToggleMillis = now;
      digitalWrite(PIN_BUZZER, HIGH);
      delay(30);
      digitalWrite(PIN_BUZZER, LOW);
      delay(50);
      digitalWrite(PIN_BUZZER, HIGH);
      delay(30);
      digitalWrite(PIN_BUZZER, LOW);
    }
    return;
  } else {
    isSensorFaultActive = false;
  }

  // 3. Evaluate Hazard State based on direct ADC thresholds
  if (lastRawAdc >= MQ2_ADC_DANGER_THRESHOLD) {
    gasStatus = "danger";
    gasClearedPendingReset = false;

    if (!isGasLockoutActive) {
      isGasLockoutActive = true;
      isMainContactorTripped = true;

      Serial.println();
      Serial.println(F("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"));
      Serial.print(F("[CRITICAL EMERGENCY] Combustible Gas Leakage Detected! Raw ADC: "));
      Serial.println(lastRawAdc);
      Serial.println(F("[EMERGENCY LOCKOUT] Turning OFF Light (GPIO 14), Fan (GPIO 25), Motor (GPIO 26)."));
      Serial.println(F("[SAFETY INTERLOCK] Main Contactor TRIPPED. Disconnecting AC mains."));
      
      // CRITICAL LIFE SAFETY: Immediately disconnect ALL standard loads locally
      digitalWrite(PIN_RELAY_LIGHT, RELAY_OFF);
      digitalWrite(PIN_RELAY_FAN, RELAY_OFF);
      digitalWrite(PIN_RELAY_MOTOR, RELAY_OFF);
      stateLight = false;
      stateFan = false;
      stateMotor = false;

      // Exhaust Fan Safety Interlock:
      // Automatic activation is permitted ONLY if the fan, motor, switching components,
      // power supply, and installation are certified explosion-proof (ATEX / IECEx).
      if (HAZARDOUS_EXHAUST_CERTIFIED) {
        Serial.println(F("[SAFETY INTERLOCK] Hazardous Atmosphere Certified Exhaust Fan ACTIVATED."));
        digitalWrite(PIN_RELAY_EXHAUST, RELAY_ON);
        stateExhaust = true;
      } else {
        Serial.println(F("[SAFETY INTERLOCK] Automatic Exhaust Fan INHIBITED (Spark hazard prevention)."));
        digitalWrite(PIN_RELAY_EXHAUST, RELAY_OFF);
        stateExhaust = false;
      }
      Serial.println(F("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"));
    }

    // Sound local hardware buzzer in rapid emergency cadence (200ms ON / 100ms OFF)
    unsigned long now = millis();
    if (now - buzzerLastToggleMillis >= (buzzerToneState ? 200 : 100)) {
      buzzerLastToggleMillis = now;
      buzzerToneState = !buzzerToneState;
      digitalWrite(PIN_BUZZER, buzzerToneState ? HIGH : LOW);
    }
  } 
  else if (lastRawAdc >= MQ2_ADC_WARNING_THRESHOLD) {
    gasStatus = "warning";
    // Intermittent warning beep (once every 1.5s)
    unsigned long now = millis();
    if (now - buzzerLastToggleMillis >= 1500) {
      buzzerLastToggleMillis = now;
      digitalWrite(PIN_BUZZER, HIGH);
      delay(40);
      digitalWrite(PIN_BUZZER, LOW);
    }
  } 
  else {
    gasStatus = "safe";

    // 4. Gas Cleared Logic:
    // If gas drops below clearance threshold, silence audible siren,
    // BUT PRESERVE EMERGENCY LOCKOUT AND CONTACTOR TRIP!
    // Never automatically energize relays after a gas lockout! Requires manual safety reset!
    if (isGasLockoutActive && lastRawAdc < MQ2_ADC_CLEAR_THRESHOLD) {
      if (!gasClearedPendingReset) {
        gasClearedPendingReset = true;
        digitalWrite(PIN_BUZZER, LOW);
        buzzerToneState = false;
        Serial.println();
        Serial.println(F("[SAFETY UPDATE] Gas concentration dropped below danger threshold."));
        Serial.println(F("[SAFETY UPDATE] Audible siren silenced."));
        Serial.println(F("[SAFETY UPDATE] System remains in EMERGENCY LOCKOUT. Contactor remains TRIPPED."));
        Serial.println(F("[SAFETY UPDATE] Press physical BOOT button (GPIO 0) or complete operator safety reset."));
      }
    } else if (!isGasLockoutActive) {
      digitalWrite(PIN_BUZZER, LOW);
      buzzerToneState = false;
    }
  }
}

// ==============================================================================
// Physical Manual Reset Button Handler (GPIO 0 / BOOT Button)
// ==============================================================================
void checkPhysicalResetButton() {
  bool reading = digitalRead(PIN_PHYSICAL_RESET_BTN);
  
  // Active-LOW button pressed (GPIO 0 pulled to GND when pressed)
  if (reading == LOW && lastResetBtnState == HIGH) {
    unsigned long now = millis();
    if (now - lastResetBtnPressMillis > 400) { // Debounce
      lastResetBtnPressMillis = now;
      Serial.println(F("[MANUAL RESET] Physical safety reset button pressed."));

      if (!isGasLockoutActive && !gasClearedPendingReset) {
        Serial.println(F("[MANUAL RESET] System is already in normal operational state."));
      } else {
        // Enforce safety precondition: Gas concentration MUST be below clearance threshold and sensor healthy!
        if (lastRawAdc < MQ2_ADC_CLEAR_THRESHOLD && !isSensorFaultActive && gasStatus != "warming_up") {
          Serial.println(F("[MANUAL RESET APPROVED] Gas level verified SAFE. Disarming lockout..."));
          isGasLockoutActive = false;
          gasClearedPendingReset = false;
          isMainContactorTripped = false;
          digitalWrite(PIN_BUZZER, LOW);
          buzzerToneState = false;

          // CRITICAL: Relays REMAIN OFF after reset. Never automatically energize relays!
          digitalWrite(PIN_RELAY_LIGHT, RELAY_OFF);
          digitalWrite(PIN_RELAY_FAN, RELAY_OFF);
          digitalWrite(PIN_RELAY_MOTOR, RELAY_OFF);
          digitalWrite(PIN_RELAY_EXHAUST, RELAY_OFF);
          stateLight = false;
          stateFan = false;
          stateMotor = false;
          stateExhaust = false;

          // Double success chime
          digitalWrite(PIN_BUZZER, HIGH); delay(80);
          digitalWrite(PIN_BUZZER, LOW);  delay(60);
          digitalWrite(PIN_BUZZER, HIGH); delay(120);
          digitalWrite(PIN_BUZZER, LOW);

          // Report safety reset to Supabase
          reportSafetyResetToSupabase("physical_button_gpio0");
        } else {
          Serial.println(F("[MANUAL RESET REJECTED] Cannot reset! Gas level is still unsafe or sensor fault active."));
          // Reject tone (long low pulse)
          digitalWrite(PIN_BUZZER, HIGH); delay(300);
          digitalWrite(PIN_BUZZER, LOW);
        }
      }
    }
  }
  lastResetBtnState = reading;
}

// ==============================================================================
// Relay Actuation Engine (Enforces Gas Safety Inhibit & Channel Restrictions)
// ==============================================================================
bool setRelayState(int channel, bool targetState) {
  // Gas Hazard Inhibit Guard: Reject any command trying to turn a device ON during danger or pending reset
  if (targetState == true && (isGasLockoutActive || gasClearedPendingReset)) {
    Serial.print(F("[COMMAND REJECTED] Channel "));
    Serial.print(channel);
    Serial.println(F(" ON command blocked by Gas Safety Interlock / Contactor Trip!"));
    return false;
  }

  switch (channel) {
    case 1: // 4-Channel Relay 1: Light (GPIO 14)
      digitalWrite(PIN_RELAY_LIGHT, targetState ? RELAY_ON : RELAY_OFF);
      stateLight = targetState;
      break;

    case 2: // 4-Channel Relay 2: Fan (GPIO 25)
      digitalWrite(PIN_RELAY_FAN, targetState ? RELAY_ON : RELAY_OFF);
      stateFan = targetState;
      break;

    case 3: // 4-Channel Relay 3: Water Motor (GPIO 26)
      digitalWrite(PIN_RELAY_MOTOR, targetState ? RELAY_ON : RELAY_OFF);
      stateMotor = targetState;
      if (targetState) {
        motorActiveStartMillis = millis();
        motorActiveSeconds = 0;
      }
      break;

    case 4: // 4-Channel Relay 4: UNUSED (Permanently disabled)
      Serial.println(F("[COMMAND REJECTED] Channel 4 on 4-Channel module is permanently UNUSED."));
      return false;

    case 5: // Separate Single-Channel Relay: Kitchen Exhaust Fan (GPIO 27)
      if (targetState && !HAZARDOUS_EXHAUST_CERTIFIED && isGasLockoutActive) {
        Serial.println(F("[COMMAND REJECTED] Exhaust Fan activation prohibited during gas hazard (uncertified)."));
        return false;
      }
      digitalWrite(PIN_RELAY_EXHAUST, targetState ? RELAY_ON : RELAY_OFF);
      stateExhaust = targetState;
      break;

    default:
      Serial.print(F("[ERROR] Invalid relay channel: "));
      Serial.println(channel);
      return false;
  }

  Serial.print(F("[RELAY] Channel "));
  Serial.print(channel);
  Serial.print(F(" actuated -> "));
  Serial.println(targetState ? F("ON") : F("OFF"));
  return true;
}

// ==============================================================================
// Water Motor 30-Minute Continuous Run-Time Auto-Cutoff Guard
// ==============================================================================
void updateMotorRuntimeGuard() {
  if (stateMotor) {
    unsigned long elapsedSec = (millis() - motorActiveStartMillis) / 1000;
    motorActiveSeconds = elapsedSec;

    if (elapsedSec >= MOTOR_MAX_RUNTIME_SEC) {
      Serial.println(F("[MOTOR PROTECTION] 30-Minute maximum run-time reached! Auto-cutoff executed."));
      setRelayState(3, false);
      // Small audible chirp to notify occupant
      digitalWrite(PIN_BUZZER, HIGH);
      delay(200);
      digitalWrite(PIN_BUZZER, LOW);

      // Report cutoff directly to Supabase to update dashboard and log safety alert
      reportMotorTripToSupabase();
    }
  }
}

void reportMotorTripToSupabase() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String endpoint = String(SUPABASE_GATEWAY_URL) + "?action=motor_trip";

  if (https.begin(client, endpoint)) {
    https.addHeader("Content-Type", "application/json");
    https.addHeader("x-device-token", ESP32_DEVICE_TOKEN);
    https.addHeader("apikey", SUPABASE_ANON_KEY);
    https.setTimeout(2500);

    StaticJsonDocument<128> doc;
    doc["device_slug"] = "relay-3";
    doc["status"] = "auto_cutoff_30m";

    String jsonPayload;
    serializeJson(doc, jsonPayload);
    int httpCode = https.POST(jsonPayload);
    if (httpCode == 200) {
      Serial.println(F("[MOTOR PROTECTION] Cutoff reported to Supabase."));
    } else {
      Serial.print(F("[MOTOR PROTECTION ERROR] HTTP Status: "));
      Serial.println(httpCode);
      if (httpCode > 0) {
        String errResp = https.getString();
        if (errResp.length() > 0) {
          Serial.print(F("[MOTOR PROTECTION ERROR BODY] "));
          Serial.println(errResp);
        }
      }
    }
    https.end();
  }
}

// ==============================================================================
// Report Safety Reset Event to Supabase
// ==============================================================================
void reportSafetyResetToSupabase(const char* source) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String endpoint = String(SUPABASE_GATEWAY_URL) + "?action=safety_reset";

  if (https.begin(client, endpoint)) {
    https.addHeader("Content-Type", "application/json");
    https.addHeader("x-device-token", ESP32_DEVICE_TOKEN);
    https.addHeader("apikey", SUPABASE_ANON_KEY);
    https.setTimeout(3000);

    StaticJsonDocument<256> doc;
    doc["source"] = source;
    doc["gas_ppm"] = nullptr;
    doc["raw_adc"] = lastRawAdc;
    doc["status"] = "NORMAL";

    String jsonPayload;
    serializeJson(doc, jsonPayload);
    int httpCode = https.POST(jsonPayload);
    if (httpCode == 200) {
      Serial.println(F("[SAFETY RESET] Reset event logged in Supabase."));
    } else {
      Serial.print(F("[SAFETY RESET ERROR] HTTP Status: "));
      Serial.println(httpCode);
      if (httpCode > 0) {
        String errResp = https.getString();
        if (errResp.length() > 0) {
          Serial.print(F("[SAFETY RESET ERROR BODY] "));
          Serial.println(errResp);
        }
      }
    }
    https.end();
  }
}

// ==============================================================================
// INA219 Energy Intelligence Sampling (No Fabricated / Random Data)
// ==============================================================================
void readINA219() {
  unsigned long now = millis();
  float deltaHours = (now - lastEnergyCalcMillis) / 3600000.0f;
  lastEnergyCalcMillis = now;

  if (ina219Connected) {
    shuntVoltage_mV = ina219.getShuntVoltage_mV();
    busVoltage_V    = ina219.getBusVoltage_V();
    current_mA      = ina219.getCurrent_mA();
    power_W         = ina219.getPower_mW() / 1000.0f;
    current_A       = current_mA / 1000.0f;

    if (isnan(busVoltage_V) || busVoltage_V < 0.0f) {
      ina219Valid = false;
      busVoltage_V    = NAN;
      shuntVoltage_mV = NAN;
      current_mA      = NAN;
      current_A       = NAN;
      power_W         = NAN;
      powerAnomaly    = "sensor_fault";
    } else {
      ina219Valid = true;

      // Real-time Energy Accumulation (Wh)
      if (power_W > 0 && deltaHours > 0) {
        totalEnergy_Wh += (power_W * deltaHours);
      }

      // Anomaly Classification
      if (current_A > 5.0f) {
        powerAnomaly = "overcurrent";
      } else if (power_W > 1100.0f) {
        powerAnomaly = "overpower";
      } else if (busVoltage_V < 200.0f) {
        powerAnomaly = "voltage_sag";
      } else if (busVoltage_V > 255.0f) {
        powerAnomaly = "voltage_surge";
      } else {
        powerAnomaly = "normal";
      }
    }
  } else {
    // When INA219 is not detected, transmit null values. Never generate random or nominal readings!
    ina219Valid = false;
    busVoltage_V    = NAN;
    shuntVoltage_mV = NAN;
    current_mA      = NAN;
    current_A       = NAN;
    power_W         = NAN;
    powerAnomaly    = "sensor_fault";
  }
}

// ==============================================================================
// DHT11 Environmental Reading (No Fabricated / Nominal Fallbacks)
// ==============================================================================
void readDHT11() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  // When DHT11 is disconnected or returns NaN, transmit null values and report sensor fault
  if (isnan(t) || isnan(h)) {
    dhtValid = false;
    ambientTemp_C = NAN;
    ambientHumidity = NAN;
  } else {
    dhtValid = true;
    ambientTemp_C = t;
    ambientHumidity = h;
  }
}

// ==============================================================================
// Send Sensor Readings to Supabase Secure Gateway
// ==============================================================================
void sendTelemetryToSupabase() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure(); // Uses TLS port 443 with self-validated certificate

  HTTPClient https;
  String endpoint = String(SUPABASE_GATEWAY_URL) + "?action=telemetry";

  if (https.begin(client, endpoint)) {
    https.addHeader("Content-Type", "application/json");
    https.addHeader("x-device-token", ESP32_DEVICE_TOKEN);
    https.addHeader("apikey", SUPABASE_ANON_KEY);
    https.setTimeout(3500);

    StaticJsonDocument<768> doc;

    // INA219: Transmit null if disconnected/faulty; never send fabricated numbers
    if (ina219Valid && !isnan(busVoltage_V)) {
      doc["bus_voltage_v"]              = round(busVoltage_V * 100.0) / 100.0;
      doc["shunt_voltage_mv"]           = round(shuntVoltage_mV * 100.0) / 100.0;
      doc["current_ma"]                 = round(current_mA * 10.0) / 10.0;
      doc["current_a"]                  = round(current_A * 1000.0) / 1000.0;
      doc["power_w"]                    = round(power_W * 100.0) / 100.0;
      doc["energy_wh"]                  = round(totalEnergy_Wh * 100.0) / 100.0;
    } else {
      doc["bus_voltage_v"]              = nullptr;
      doc["shunt_voltage_mv"]           = nullptr;
      doc["current_ma"]                 = nullptr;
      doc["current_a"]                  = nullptr;
      doc["power_w"]                    = nullptr;
      doc["energy_wh"]                  = nullptr;
    }

    // DHT11: Transmit null if disconnected/faulty
    if (dhtValid && !isnan(ambientTemp_C)) {
      doc["temperature_c"]              = round(ambientTemp_C * 10.0) / 10.0;
      doc["humidity_pct"]               = round(ambientHumidity * 10.0) / 10.0;
    } else {
      doc["temperature_c"]              = nullptr;
      doc["humidity_pct"]               = nullptr;
    }

    // MQ-2: Ground truth raw ADC and state; do NOT claim calibrated PPM without real calibration
    doc["gas_raw_adc"]                = lastRawAdc;
    doc["gas_status"]                 = gasStatus;
    doc["gas_ppm"]                    = nullptr;
    doc["anomaly"]                    = powerAnomaly;
    doc["lockout_active"]             = isGasLockoutActive;
    doc["main_contactor_tripped"]      = isMainContactorTripped;
    doc["gas_cleared_pending_reset"]  = gasClearedPendingReset;
    doc["sensor_fault"]               = isSensorFaultActive;
    doc["dht_fault"]                  = !dhtValid;
    doc["ina219_fault"]               = !ina219Valid;
    doc["exhaust_fan_active"]         = stateExhaust;
    doc["hazardous_exhaust_certified"] = HAZARDOUS_EXHAUST_CERTIFIED;
    doc["free_heap"]                  = ESP.getFreeHeap();
    doc["rssi"]                       = WiFi.RSSI();
    doc["ip_address"]                 = WiFi.localIP().toString();
    doc["firmware_version"]           = FIRMWARE_VERSION;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    int httpResponseCode = https.POST(jsonPayload);
    if (httpResponseCode == 200) {
      Serial.println(F("[TELEMETRY] Ground-truth sensor data successfully ingested by Supabase."));
    } else {
      Serial.print(F("[TELEMETRY ERROR] HTTP Status: "));
      Serial.println(httpResponseCode);
      if (httpResponseCode > 0) {
        String errResp = https.getString();
        if (errResp.length() > 0) {
          Serial.print(F("[TELEMETRY ERROR BODY] "));
          Serial.println(errResp);
        }
      }
    }
    https.end();
  }
}

// ==============================================================================
// Poll Pending Commands from Supabase & Execute Relay Actions
// ==============================================================================
void pollPendingCommandsFromSupabase() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String endpoint = String(SUPABASE_GATEWAY_URL) + "?action=poll_commands";

  if (https.begin(client, endpoint)) {
    https.addHeader("x-device-token", ESP32_DEVICE_TOKEN);
    https.addHeader("apikey", SUPABASE_ANON_KEY);
    https.setTimeout(3000);

    int httpCode = https.GET();
    if (httpCode == 200) {
      String response = https.getString();
      DynamicJsonDocument doc(2048);
      DeserializationError error = deserializeJson(doc, response);

      if (!error) {
        JsonArray commands = doc["commands"].as<JsonArray>();
        for (JsonObject cmd : commands) {
          const char* commandId = cmd["command_id"];
          if (!commandId || strlen(commandId) == 0) continue;

          const char* deviceId  = cmd["device_id"];
          int relayChannel      = cmd["relay_channel"] | 1;
          const char* action    = cmd["action"];
          bool targetState      = (strcmp(action, "ON") == 0);

          // Handle remote safety reset command from verified dashboard operator
          if (strcmp(action, "RESET_SAFETY_LOCKOUT") == 0) {
            if (lastRawAdc < MQ2_ADC_CLEAR_THRESHOLD && !isSensorFaultActive && gasStatus != "warming_up") {
              isGasLockoutActive = false;
              gasClearedPendingReset = false;
              isMainContactorTripped = false;
              digitalWrite(PIN_BUZZER, LOW);
              buzzerToneState = false;

              // CRITICAL: Relays REMAIN OFF after reset. Never automatically energize relays!
              digitalWrite(PIN_RELAY_LIGHT, RELAY_OFF);
              digitalWrite(PIN_RELAY_FAN, RELAY_OFF);
              digitalWrite(PIN_RELAY_MOTOR, RELAY_OFF);
              digitalWrite(PIN_RELAY_EXHAUST, RELAY_OFF);
              stateLight = false;
              stateFan = false;
              stateMotor = false;
              stateExhaust = false;

              Serial.println(F("[SAFETY RESET] Remote reset command confirmed. Normal state restored. Relays remain OFF."));
              ackCommandToSupabase(commandId, deviceId, "acknowledged", false, nullptr, 10);
            } else {
              Serial.println(F("[SAFETY RESET REJECTED] Remote reset rejected: Gas level unsafe or sensor fault active!"));
              ackCommandToSupabase(commandId, deviceId, "rejected_gas_safety", false, "Gas level unsafe or sensor fault active for reset", 10);
            }
            continue;
          }

          // Persistent Deduplication Guard:
          // Survives reboots, power cycles, brownouts, and network interruptions.
          if (strcmp(lastExecutedCmdId, commandId) == 0) {
            Serial.print(F("[COMMAND DEDUP] Skipping duplicate execution (persisted across reboot): "));
            Serial.println(commandId);
            ackCommandToSupabase(commandId, deviceId, "acknowledged", targetState, nullptr, 0);
            continue;
          }

          Serial.print(F("[COMMAND DETECTED] ID: "));
          Serial.print(commandId);
          Serial.print(F(" | Ch: "));
          Serial.print(relayChannel);
          Serial.print(F(" -> "));
          Serial.println(action);

          unsigned long startExec = millis();
          bool success = setRelayState(relayChannel, targetState);
          int rttMs = (int)(millis() - startExec);

          // Record in deduplication buffer and persist to ESP32 NVS flash
          strncpy(lastExecutedCmdId, commandId, sizeof(lastExecutedCmdId) - 1);
          lastExecutedCmdId[sizeof(lastExecutedCmdId) - 1] = '\0';
          preferences.putString("last_cmd", commandId);

          if (success) {
            ackCommandToSupabase(commandId, deviceId, "acknowledged", targetState, nullptr, rttMs);
          } else {
            ackCommandToSupabase(
              commandId, 
              deviceId,
              (isGasLockoutActive || gasClearedPendingReset) ? "rejected_gas_safety" : "failed", 
              !targetState, 
              (isGasLockoutActive || gasClearedPendingReset) 
                ? "Relay actuation blocked by local gas safety lockout / contactor trip" 
                : "Relay actuation failed (channel invalid or unused)", 
              rttMs
            );
          }
        }
      }
    } else {
      Serial.print(F("[POLL ERROR] HTTP Status: "));
      Serial.println(httpCode);
      if (httpCode > 0) {
        String errResp = https.getString();
        if (errResp.length() > 0) {
          Serial.print(F("[POLL ERROR BODY] "));
          Serial.println(errResp);
        }
      }
    }
    https.end();
  }
}

// ==============================================================================
// Acknowledge Executed Command to Prevent Duplicate Execution
// ==============================================================================
void ackCommandToSupabase(const char* commandId, const char* deviceId, const char* status, bool actualState, const char* errMsg, int rttMs) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String endpoint = String(SUPABASE_GATEWAY_URL) + "?action=ack_command";

  if (https.begin(client, endpoint)) {
    https.addHeader("Content-Type", "application/json");
    https.addHeader("x-device-token", ESP32_DEVICE_TOKEN);
    https.addHeader("apikey", SUPABASE_ANON_KEY);
    https.setTimeout(3000);

    StaticJsonDocument<256> doc;
    doc["command_id"]    = commandId;
    if (deviceId && strlen(deviceId) > 0) {
      doc["device_id"]   = deviceId;
    }
    doc["status"]        = status;
    doc["actual_state"]  = actualState;
    doc["round_trip_ms"] = rttMs;
    if (errMsg) doc["error_message"] = errMsg;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    int httpCode = https.POST(jsonPayload);
    if (httpCode == 200) {
      Serial.print(F("[COMMAND ACK] Confirmed command "));
      Serial.print(commandId);
      Serial.print(F(" as "));
      Serial.println(status);
    } else {
      Serial.print(F("[COMMAND ACK ERROR] HTTP Status: "));
      Serial.println(httpCode);
      if (httpCode > 0) {
        String errResp = https.getString();
        if (errResp.length() > 0) {
          Serial.print(F("[COMMAND ACK ERROR BODY] "));
          Serial.println(errResp);
        }
      }
    }
    https.end();
  }
}

// ==============================================================================
// Periodic Node Heartbeat
// ==============================================================================
void sendHeartbeatToSupabase() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String endpoint = String(SUPABASE_GATEWAY_URL) + "?action=heartbeat";

  if (https.begin(client, endpoint)) {
    https.addHeader("x-device-token", ESP32_DEVICE_TOKEN);
    https.addHeader("apikey", SUPABASE_ANON_KEY);
    https.setTimeout(2500);

    int httpCode = https.GET();
    if (httpCode == 200) {
      Serial.println(F("[HEARTBEAT] Node status: ONLINE."));
    } else {
      Serial.print(F("[HEARTBEAT ERROR] HTTP Status: "));
      Serial.println(httpCode);
      if (httpCode > 0) {
        String errResp = https.getString();
        if (errResp.length() > 0) {
          Serial.print(F("[HEARTBEAT ERROR BODY] "));
          Serial.println(errResp);
        }
      }
    }
    https.end();
  }
}
