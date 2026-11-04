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
#include <time.h>
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

// Continuous Safe Reading Duration Tracking (Guards against single-reading recovery glitches)
unsigned long safeReadingsStartMillis = 0;
bool isRecoveryStable = false;

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
// Note: lastWifiRetryMillis is declared with the Wi-Fi state machine block below.
unsigned long lastLockoutDiagMillis = 0; // 1-second Serial Monitor diagnostics

// HTTPS Connectivity & Health Watchdog Tracking
unsigned long lastHttpsDiagMillis = 0;
int consecutiveHttpFailures = 0;
IPAddress resolvedSupabaseIp;
bool supabaseDnsResolved = false;

// ------------------------------------------------------------------------------
// Serialized Wi-Fi Connection State Machine (Requirements 5, 6, 8)
// States: DISCONNECTED -> CONNECTING -> CONNECTED
// Enforces zero overlapping begin() calls and zero config changes while connecting
// ------------------------------------------------------------------------------
enum WifiState {
  WIFI_STATE_DISCONNECTED,
  WIFI_STATE_CONNECTING,
  WIFI_STATE_CONNECTED
};

WifiState currentWifiState = WIFI_STATE_DISCONNECTED;
unsigned long wifiStateEnteredMillis = 0;
unsigned long lastWifiRetryMillis = 0;
uint32_t wifiReconnectAttempts = 0;
wl_status_t lastReportedWifiStatus = WL_DISCONNECTED;

// Command Deduplication Ring Cache (prevents re-executing unacknowledged commands during network drops)
char lastExecutedCmdId[48] = "";

// ------------------------------------------------------------------------------
// Function Prototypes
// ------------------------------------------------------------------------------
void initPersistentDeduplication();
void setupHardwarePins();
void checkLocalGasSafety();
void checkPhysicalResetButton();
void printLockoutDiagnostics();
const char* wifiStatusToString(wl_status_t status);
void startWifiConnection(const char* reason);
void updateWifiStateMachine();
void configureTlsClient(WiFiClientSecure &client);
bool testSupabaseHttpsConnectivity(bool verbose = true);
void readINA219();
void readDHT11();
void updateMotorRuntimeGuard();
void reportMotorTripToSupabase();
void reportSafetyResetToSupabase(const char* source);
bool setRelayState(int channel, bool targetState);
void sendTelemetryToSupabase();
void pollPendingCommandsFromSupabase();
int ackCommandToSupabase(const char* commandId, const char* deviceId, const char* status, bool actualState, const char* errMsg, int rttMs);
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

  // 5. Connect to Wi-Fi (Serialized State Machine - Requirements 5, 6, 8)
  startWifiConnection("Initial Boot Sequence");

  // Wait for association with a bounded timeout while servicing local safety loop
  unsigned long startAttempt = millis();
  while (currentWifiState == WIFI_STATE_CONNECTING && (millis() - startAttempt < WIFI_CONNECT_TIMEOUT_MS)) {
    delay(250);
    // Keep local safety loop alive even during Wi-Fi boot!
    checkLocalGasSafety();
    updateWifiStateMachine();
  }

  if (currentWifiState == WIFI_STATE_CONNECTED) {
    Serial.println(F("[SYSTEM] Network link established. Running connectivity diagnostics..."));
    testSupabaseHttpsConnectivity(true);
  } else {
    Serial.println(F("[WIFI STATUS] IP=N/A. All relays remain safely OFF. Background state machine will maintain reconnection."));
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
  // Priority 1b: Emergency Lockout Diagnostic Logging (Every 1000ms / 1 second)
  // Non-blocking serial diagnostics at 115200 baud for lockout reset tracing
  // ---------------------------------------------------------------------------
  if (currentMillis - lastLockoutDiagMillis >= 1000) {
    lastLockoutDiagMillis = currentMillis;
    printLockoutDiagnostics();
  }

  // ---------------------------------------------------------------------------
  // Priority 2: Water Motor 30-Minute Continuous Run-Time Auto Cutoff
  // ---------------------------------------------------------------------------
  updateMotorRuntimeGuard();

  // ---------------------------------------------------------------------------
  // Priority 3: Serialized Wi-Fi Connection State Machine (Requirements 5, 6, 8)
  // DISCONNECTED -> CONNECTING -> CONNECTED. Non-blocking, zero overlapping begin()
  // ---------------------------------------------------------------------------
  updateWifiStateMachine();

  if (currentWifiState != WIFI_STATE_CONNECTED || WiFi.status() != WL_CONNECTED) {
    return; // Inhibit cloud network calls until Wi-Fi is fully established
  }

  // ---------------------------------------------------------------------------
  // Priority 3b: Automatic HTTPS Diagnostic Trigger on Consecutive Failures
  // ---------------------------------------------------------------------------
  if (consecutiveHttpFailures >= 3 && (currentMillis - lastHttpsDiagMillis >= 30000)) {
    lastHttpsDiagMillis = currentMillis;
    Serial.println();
    Serial.println(F("[WATCHDOG] Multiple consecutive HTTPS request failures detected. Running diagnostic suite..."));
    testSupabaseHttpsConnectivity(false);
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
// Wi-Fi Status Diagnostic Helper (Requirement 6)
// ==============================================================================
const char* wifiStatusToString(wl_status_t status) {
  switch (status) {
    case WL_NO_SHIELD:       return "WL_NO_SHIELD";
    case WL_IDLE_STATUS:     return "WL_IDLE_STATUS (Connecting...)";
    case WL_NO_SSID_AVAIL:   return "WL_NO_SSID_AVAIL (SSID Not Found)";
    case WL_SCAN_COMPLETED:  return "WL_SCAN_COMPLETED";
    case WL_CONNECTED:       return "WL_CONNECTED";
    case WL_CONNECT_FAILED:  return "WL_CONNECT_FAILED";
    case WL_CONNECTION_LOST: return "WL_CONNECTION_LOST";
    case WL_DISCONNECTED:    return "WL_DISCONNECTED";
    default:                 return "WL_UNKNOWN";
  }
}

// ==============================================================================
// Serialized Wi-Fi Connection State Machine Implementation (Requirements 5, 6, 8)
// Guarantees strictly serialized state transitions:
// DISCONNECTED -> CONNECTING -> CONNECTED
// Enforces zero overlapping begin() calls, zero config modifications during connection,
// and clean timeouts via disconnect(false). Standard DHCP is strictly preserved.
// ==============================================================================
void startWifiConnection(const char* reason) {
  if (currentWifiState == WIFI_STATE_CONNECTING) {
    // Strictly serialized: do not issue overlapping attempts while connecting
    return;
  }

  wifiReconnectAttempts++;
  currentWifiState = WIFI_STATE_CONNECTING;
  wifiStateEnteredMillis = millis();

  Serial.println();
  Serial.print(F("[WIFI] Reconnect Attempt #"));
  Serial.print(wifiReconnectAttempts);
  Serial.print(F(" -> Initiating connection to SSID: '"));
  Serial.print(WIFI_SSID);
  Serial.print(F("' (Reason: "));
  Serial.print(reason);
  Serial.println(F(")"));

  // Only configure Station mode when disconnected prior to begin
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  // Preserves standard DHCP. Never calls WiFi.config() or modifies station config.
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void updateWifiStateMachine() {
  unsigned long currentMillis = millis();
  wl_status_t status = WiFi.status();

  switch (currentWifiState) {
    case WIFI_STATE_DISCONNECTED: {
      if (currentMillis - lastWifiRetryMillis >= WIFI_RETRY_INTERVAL_MS) {
        lastWifiRetryMillis = currentMillis;
        startWifiConnection("Periodic retry interval elapsed");
      }
      break;
    }

    case WIFI_STATE_CONNECTING: {
      if (status == WL_CONNECTED) {
        currentWifiState = WIFI_STATE_CONNECTED;
        wifiStateEnteredMillis = currentMillis;
        lastWifiRetryMillis = currentMillis;

        Serial.println(F("[WIFI STATE] CONNECTING -> CONNECTED"));
        Serial.println(F("[WIFI STATUS] Connected successfully via DHCP!"));
        Serial.print(F("[WIFI STATUS] Assigned IP   : ")); Serial.println(WiFi.localIP());
        Serial.print(F("[WIFI STATUS] Subnet Mask   : ")); Serial.println(WiFi.subnetMask());
        Serial.print(F("[WIFI STATUS] Gateway IP    : ")); Serial.println(WiFi.gatewayIP());
        Serial.print(F("[WIFI STATUS] Primary DNS   : ")); Serial.println(WiFi.dnsIP(0));
        Serial.print(F("[WIFI STATUS] Secondary DNS : ")); Serial.println(WiFi.dnsIP(1));
        Serial.print(F("[WIFI STATUS] RSSI (Signal) : ")); Serial.print(WiFi.RSSI()); Serial.println(F(" dBm"));

        // Initialize SNTP for TLS certificate validation
        configTime(0, 0, "pool.ntp.org", "time.google.com");
      } else if (currentMillis - wifiStateEnteredMillis >= WIFI_CONNECT_TIMEOUT_MS || status == WL_CONNECT_FAILED) {
        Serial.print(F("[WIFI STATE] CONNECTING -> DISCONNECTED (Reason: "));
        if (status == WL_CONNECT_FAILED) {
          Serial.println(F("Association/Authentication failed)"));
        } else {
          Serial.println(F("Connection timeout)"));
        }
        // Cleanly terminate in-flight handshake so ESP-IDF state is not left connecting
        WiFi.disconnect(false);
        currentWifiState = WIFI_STATE_DISCONNECTED;
        wifiStateEnteredMillis = currentMillis;
        lastWifiRetryMillis = currentMillis;
      }
      break;
    }

    case WIFI_STATE_CONNECTED: {
      if (status != WL_CONNECTED) {
        Serial.print(F("[WIFI STATE] CONNECTED -> DISCONNECTED (Reason: Link lost, status: "));
        Serial.print(wifiStatusToString(status));
        Serial.println(F(")"));
        WiFi.disconnect(false);
        currentWifiState = WIFI_STATE_DISCONNECTED;
        wifiStateEnteredMillis = currentMillis;
        lastWifiRetryMillis = currentMillis;
      }
      break;
    }
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
    safeReadingsStartMillis = 0;
    isRecoveryStable = false;
    return;
  }

  // 2. Hardware Fault Detection: Open Circuit / Disconnected Sensor Wire
  // When MQ-2 analog wire is disconnected, ADC floats to ground/zero (below 45).
  // CRITICAL REQUIREMENT: A disconnected or faulty MQ-2 must NEVER be reported as safe!
  if (lastRawAdc < MQ2_ADC_FAULT_THRESHOLD) {
    isSensorFaultActive = true;
    gasStatus = "sensor_fault";
    safeReadingsStartMillis = 0;
    isRecoveryStable = false;
    
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
    safeReadingsStartMillis = 0;
    isRecoveryStable = false;

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
    safeReadingsStartMillis = 0;
    isRecoveryStable = false;

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

    // Track continuous safe readings for recovery stability verification
    if (safeReadingsStartMillis == 0) {
      safeReadingsStartMillis = millis();
    } else if (millis() - safeReadingsStartMillis >= MQ2_RECOVERY_STABLE_PERIOD_MS) {
      isRecoveryStable = true;
    }

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
        // Enforce safety precondition: Gas concentration MUST be below clearance threshold,
        // sensor verified healthy, warm-up complete, and stable baseline maintained for recovery duration!
        if (millis() >= MQ2_WARMUP_PERIOD_MS && !isSensorFaultActive && lastRawAdc >= MQ2_ADC_FAULT_THRESHOLD && lastRawAdc < MQ2_ADC_CLEAR_THRESHOLD && isRecoveryStable) {
          Serial.println(F("[MANUAL RESET APPROVED] Gas level verified SAFE and stable. Disarming lockout..."));
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
          Serial.println(F("[MANUAL RESET REJECTED] Cannot reset: Atmosphere unsafe, sensor fault active, warm-up in progress, or stable recovery duration not met."));
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
// Diagnostic Logging Routine: Local Gas Safety & Lockout State (Every 1 Second)
// Displays ground-truth hardware metrics at 115200 baud for issue tracing.
// ==============================================================================
void printLockoutDiagnostics() {
  unsigned long now = millis();
  unsigned long elapsedSafeRecoveryMs = (safeReadingsStartMillis > 0) ? (now - safeReadingsStartMillis) : 0;
  bool warmupComplete = (now >= MQ2_WARMUP_PERIOD_MS);

  Serial.println();
  Serial.println(F("---------- [ESP32 GAS LOCKOUT DIAGNOSTIC] ----------"));
  Serial.print(F("1. lastRawAdc                   : ")); Serial.println(lastRawAdc);
  Serial.print(F("2. gasStatus                    : ")); Serial.println(gasStatus);
  Serial.print(F("3. isSensorFaultActive          : ")); Serial.println(isSensorFaultActive ? F("TRUE (FAULT)") : F("FALSE (HEALTHY)"));
  Serial.print(F("4. isGasLockoutActive           : ")); Serial.println(isGasLockoutActive ? F("TRUE (LOCKED OUT)") : F("FALSE (NORMAL)"));
  Serial.print(F("5. gasClearedPendingReset       : ")); Serial.println(gasClearedPendingReset ? F("TRUE (AWAITING RESET)") : F("FALSE"));
  Serial.print(F("6. safeReadingsStartMillis      : ")); Serial.println(safeReadingsStartMillis);
  Serial.print(F("7. elapsedSafeRecoveryMs        : ")); Serial.print(elapsedSafeRecoveryMs); Serial.print(F(" ms (Required: ")); Serial.print(MQ2_RECOVERY_STABLE_PERIOD_MS); Serial.println(F(" ms)"));
  Serial.print(F("8. isRecoveryStable             : ")); Serial.println(isRecoveryStable ? F("TRUE (STABLE)") : F("FALSE (UNSTABLE)"));
  Serial.print(F("9. millis() vs Warmup Comparison: ")); Serial.print(now); Serial.print(F(" ms / ")); Serial.print(MQ2_WARMUP_PERIOD_MS); Serial.print(F(" ms (Warmup Complete: ")); Serial.print(warmupComplete ? F("YES") : F("NO")); Serial.println(F(")"));
  Serial.println(F("----------------------------------------------------"));
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
  configureTlsClient(client);

  HTTPClient https;
  String endpoint = String(SUPABASE_GATEWAY_URL) + "?action=motor_trip";

  if (!https.begin(client, endpoint)) {
    Serial.print(F("[MOTOR PROTECTION ERROR] HTTPClient::begin() failed for endpoint: "));
    Serial.println(endpoint);
    return;
  }

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
    Serial.print(httpCode);
    if (httpCode < 0) {
      Serial.print(F(" ("));
      Serial.print(https.errorToString(httpCode));
      Serial.print(F(")"));
    }
    Serial.println();
    if (httpCode < 0) {
      Serial.print(F("[MOTOR PROTECTION DIAGNOSTIC] Outbound TLS failed. Target: "));
      Serial.print(SUPABASE_HOST);
      Serial.print(F(":443 | Free Heap: "));
      Serial.print(ESP.getFreeHeap());
      Serial.println(F(" B"));
    } else {
      String errResp = https.getString();
      if (errResp.length() > 0) {
        Serial.print(F("[MOTOR PROTECTION ERROR BODY] "));
        Serial.println(errResp);
      }
    }
  }
  https.end();
}

// ==============================================================================
// Report Safety Reset Event to Supabase
// ==============================================================================
void reportSafetyResetToSupabase(const char* source) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  configureTlsClient(client);

  HTTPClient https;
  String endpoint = String(SUPABASE_GATEWAY_URL) + "?action=safety_reset";

  if (!https.begin(client, endpoint)) {
    Serial.print(F("[SAFETY RESET ERROR] HTTPClient::begin() failed for endpoint: "));
    Serial.println(endpoint);
    return;
  }

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
    Serial.print(httpCode);
    if (httpCode < 0) {
      Serial.print(F(" ("));
      Serial.print(https.errorToString(httpCode));
      Serial.print(F(")"));
    }
    Serial.println();
    if (httpCode < 0) {
      Serial.print(F("[SAFETY RESET DIAGNOSTIC] Outbound TLS failed. Target: "));
      Serial.print(SUPABASE_HOST);
      Serial.print(F(":443 | Free Heap: "));
      Serial.print(ESP.getFreeHeap());
      Serial.println(F(" B"));
    } else {
      String errResp = https.getString();
      if (errResp.length() > 0) {
        Serial.print(F("[SAFETY RESET ERROR BODY] "));
        Serial.println(errResp);
      }
    }
  }
  https.end();
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
// Secure TLS Client Configuration (Requirement 9)
// ==============================================================================
void configureTlsClient(WiFiClientSecure &client) {
  client.setCACert(SUPABASE_ROOT_CA_CERT);
  client.setHandshakeTimeout(10000); // 10-second TLS handshake budget
}

// ==============================================================================
// Comprehensive Supabase HTTPS, DNS, TCP, and TLS Diagnostics
// ==============================================================================
bool testSupabaseHttpsConnectivity(bool verbose) {
  Serial.println();
  Serial.println(F("=================================================="));
  Serial.println(F("   [SUPABASE HTTPS & NETWORK DIAGNOSTIC SUITE]   "));
  Serial.println(F("=================================================="));

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[DIAGNOSTIC FAILED] Wi-Fi is disconnected. Cannot probe Supabase."));
    Serial.println(F("=================================================="));
    return false;
  }

  // 1. Local Network Configuration Diagnostics
  Serial.println(F("--- 1. Network Interface & IP Configuration ---"));
  Serial.print(F("Local IP Assigned    : ")); Serial.println(WiFi.localIP());
  Serial.print(F("Subnet Mask          : ")); Serial.println(WiFi.subnetMask());
  Serial.print(F("Gateway IP           : ")); Serial.println(WiFi.gatewayIP());
  Serial.print(F("Primary DNS Server   : ")); Serial.println(WiFi.dnsIP(0));
  Serial.print(F("Secondary DNS Server : ")); Serial.println(WiFi.dnsIP(1));
  Serial.print(F("Wi-Fi RSSI (Signal)  : ")); Serial.print(WiFi.RSSI()); Serial.println(F(" dBm"));
  Serial.print(F("Internal Free Heap   : ")); Serial.print(ESP.getFreeHeap()); Serial.println(F(" bytes"));
  Serial.print(F("Max Alloc Heap Block : ")); Serial.print(ESP.getMaxAllocHeap()); Serial.println(F(" bytes"));

  // 2. DNS Resolution Diagnostic for pacejovitiwmoucyzkzy.supabase.co
  Serial.println(F("\n--- 2. DNS Hostname Resolution Diagnostic ---"));
  Serial.print(F("Target Hostname      : ")); Serial.println(SUPABASE_HOST);

  IPAddress resolvedIP;
  unsigned long dnsStart = millis();
  int dnsResult = WiFi.hostByName(SUPABASE_HOST, resolvedIP);
  unsigned long dnsElapsed = millis() - dnsStart;

  if (dnsResult == 1 && resolvedIP != IPAddress(0, 0, 0, 0)) {
    resolvedSupabaseIp = resolvedIP;
    supabaseDnsResolved = true;
    Serial.print(F("[DNS SUCCESS] Host '"));
    Serial.print(SUPABASE_HOST);
    Serial.print(F("' resolved to IP: "));
    Serial.print(resolvedIP);
    Serial.print(F(" (Elapsed: "));
    Serial.print(dnsElapsed);
    Serial.println(F(" ms)"));
  } else {
    supabaseDnsResolved = false;
    Serial.print(F("[DNS FAILURE] Could not resolve host '"));
    Serial.print(SUPABASE_HOST);
    Serial.print(F("'! Return code: "));
    Serial.print(dnsResult);
    Serial.print(F(" (Elapsed: "));
    Serial.print(dnsElapsed);
    Serial.println(F(" ms)"));
    Serial.print(F("[DNS ROOT CAUSE] Current DHCP DNS server ("));
    Serial.print(WiFi.dnsIP(0));
    Serial.println(F(") failed to return an IP address for Supabase."));
    Serial.println(F("[DNS NOTICE] Relying strictly on normal DHCP-provided DNS (Requirement 4)."));
    Serial.println(F("=================================================="));
    return false;
  }

  // 3. Raw TCP Socket Connectivity Test to Port 443
  Serial.println(F("\n--- 3. TCP Port 443 Egress Connectivity Diagnostic ---"));
  Serial.print(F("Connecting raw TCP socket to "));
  Serial.print(resolvedSupabaseIp);
  Serial.print(F(":"));
  Serial.print(SUPABASE_PORT);
  Serial.println(F(" (timeout 4000ms)..."));

  WiFiClient tcpClient;
  tcpClient.setTimeout(4000);
  unsigned long tcpStart = millis();
  bool tcpConnected = tcpClient.connect(resolvedSupabaseIp, SUPABASE_PORT);
  unsigned long tcpElapsed = millis() - tcpStart;

  if (tcpConnected) {
    Serial.print(F("[TCP SUCCESS] Raw TCP socket connection established in "));
    Serial.print(tcpElapsed);
    Serial.println(F(" ms. Egress port 443 is OPEN and reachable through local router/firewall."));
    tcpClient.stop();
  } else {
    Serial.print(F("[TCP FAILURE] Failed to establish raw TCP connection to "));
    Serial.print(resolvedSupabaseIp);
    Serial.print(F(":443 after "));
    Serial.print(tcpElapsed);
    Serial.println(F(" ms."));
    Serial.println(F("[TCP ROOT CAUSE] Network firewall, router egress filter, or captive portal is blocking outbound TCP traffic to port 443."));
    Serial.println(F("=================================================="));
    return false;
  }

  // 4. SNTP Clock & Certificate Validity Pre-Check
  Serial.println(F("\n--- 4. SNTP Clock Synchronization Diagnostic ---"));
  time_t now = time(nullptr);
  Serial.print(F("System Clock Epoch   : ")); Serial.print((unsigned long)now);
  if (now < 1700000000) { // Prior to 2024
    Serial.println(F(" [WARNING: SNTP time not yet synced; clock remains in 1970]"));
    Serial.println(F("[SNTP DIAGNOSTIC] X.509 certificate validation verifies validity dates against the system clock."));
    Serial.println(F("[SNTP DIAGNOSTIC] If local network blocks UDP port 123 (NTP), certificate validation may fail."));
  } else {
    Serial.println(F(" [OK: SNTP synchronized]"));
  }

  // 5. TLS Handshake & Certificate Validation Diagnostic
  Serial.println(F("\n--- 5. TLS Handshake & Certificate Validation Diagnostic ---"));
  Serial.println(F("Certificate Mode     : STRICT (ISRG Root X1 CA validation enforced - Requirement 9)"));
  Serial.print(F("Initiating TLS handshake with "));
  Serial.print(SUPABASE_HOST);
  Serial.println(F(":443..."));

  WiFiClientSecure sslDiagClient;
  configureTlsClient(sslDiagClient);
  sslDiagClient.setTimeout(8000);

  uint32_t heapBeforeHandshake = ESP.getFreeHeap();
  unsigned long tlsStart = millis();
  bool tlsConnected = sslDiagClient.connect(SUPABASE_HOST, SUPABASE_PORT);
  unsigned long tlsElapsed = millis() - tlsStart;
  uint32_t heapAfterHandshake = ESP.getFreeHeap();

  if (tlsConnected) {
    Serial.print(F("[TLS SUCCESS] TLS handshake successfully completed in "));
    Serial.print(tlsElapsed);
    Serial.println(F(" ms!"));
    Serial.print(F("[TLS HEAP CONSUMPTION] Used: "));
    Serial.print((heapBeforeHandshake > heapAfterHandshake) ? (heapBeforeHandshake - heapAfterHandshake) : 0);
    Serial.print(F(" bytes | Remaining Free: "));
    Serial.print(heapAfterHandshake);
    Serial.println(F(" bytes"));
    sslDiagClient.stop();
  } else {
    Serial.print(F("[TLS FAILURE] TLS connection failed after "));
    Serial.print(tlsElapsed);
    Serial.println(F(" ms."));

    char sslErrBuf[256] = {0};
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
    int sslErrCode = sslDiagClient.lastError(sslErrBuf, sizeof(sslErrBuf));
#else
    int sslErrCode = sslDiagClient.lastSSLError(sslErrBuf, sizeof(sslErrBuf));
#endif

    Serial.print(F("[TLS ERROR CODE] Error: "));
    Serial.print(sslErrCode);
    Serial.print(F(" | Description: "));
    Serial.println(sslErrBuf[0] ? sslErrBuf : "Unknown TLS handshake error");
    Serial.print(F("[TLS HEAP DIAGNOSTIC] Free Heap: "));
    Serial.print(heapBeforeHandshake);
    Serial.println(F(" bytes (mbedtls requires ~35KB contiguous free heap for TLS session)"));
    Serial.println(F("=================================================="));
    return false;
  }

  // 6. Endpoint URL Construction & HTTPClient begin() Diagnostic
  Serial.println(F("\n--- 6. Endpoint URL Construction & HTTPClient Initialization ---"));
  String testEndpoint = String(SUPABASE_GATEWAY_URL) + "?action=poll_commands";
  Serial.print(F("Base URL             : ")); Serial.println(SUPABASE_BASE_URL);
  Serial.print(F("Gateway URL          : ")); Serial.println(SUPABASE_GATEWAY_URL);
  Serial.print(F("Test Endpoint URL    : ")); Serial.println(testEndpoint);

  WiFiClientSecure httpTestClient;
  configureTlsClient(httpTestClient);
  HTTPClient testHttps;
  bool beginSuccess = testHttps.begin(httpTestClient, testEndpoint);
  if (beginSuccess) {
    Serial.println(F("[HTTP BEGIN SUCCESS] HTTPClient::begin() successfully parsed endpoint URL and bound TLS client."));
    testHttps.end();
  } else {
    Serial.println(F("[HTTP BEGIN FAILURE] HTTPClient::begin() failed to initialize with test endpoint URL!"));
    Serial.println(F("=================================================="));
    return false;
  }

  Serial.println(F("\n[DIAGNOSTIC COMPLETE] All HTTPS prerequisites passed: DNS, TCP:443, TLS, and HTTPClient initialization verified."));
  Serial.println(F("=================================================="));
  return true;
}

// ==============================================================================
// Send Sensor Readings to Supabase Secure Gateway
// ==============================================================================
void sendTelemetryToSupabase() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  configureTlsClient(client);

  HTTPClient https;
  String endpoint = String(SUPABASE_GATEWAY_URL) + "?action=telemetry";

  if (!https.begin(client, endpoint)) {
    Serial.print(F("[TELEMETRY ERROR] HTTPClient::begin() failed for endpoint: "));
    Serial.println(endpoint);
    return;
  }

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
    doc["recovery_stable"]            = isRecoveryStable;
    doc["warmup_complete"]            = (millis() >= MQ2_WARMUP_PERIOD_MS);
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
      consecutiveHttpFailures = 0;
      Serial.println(F("[TELEMETRY] Ground-truth sensor data successfully ingested by Supabase."));
    } else {
      consecutiveHttpFailures++;
      Serial.print(F("[TELEMETRY ERROR] HTTP Status: "));
      Serial.print(httpResponseCode);
      if (httpResponseCode < 0) {
        Serial.print(F(" ("));
        Serial.print(https.errorToString(httpResponseCode));
        Serial.print(F(")"));
      }
      Serial.println();
      if (httpResponseCode < 0) {
        Serial.print(F("[TELEMETRY DIAGNOSTIC] Outbound TLS failed. Target: "));
        Serial.print(SUPABASE_HOST);
        Serial.print(F(":443 | Free Heap: "));
        Serial.print(ESP.getFreeHeap());
        Serial.println(F(" B"));
      } else {
        String errResp = https.getString();
        if (errResp.length() > 0) {
          Serial.print(F("[TELEMETRY ERROR BODY] "));
          Serial.println(errResp);
        }
      }
    }
    https.end();
}

// ==============================================================================
// Poll Pending Commands from Supabase & Execute Relay Actions
// ==============================================================================
void pollPendingCommandsFromSupabase() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  configureTlsClient(client);

  HTTPClient https;
  String endpoint = String(SUPABASE_GATEWAY_URL) + "?action=poll_commands";

  if (!https.begin(client, endpoint)) {
    Serial.print(F("[POLL ERROR] HTTPClient::begin() failed for endpoint: "));
    Serial.println(endpoint);
    return;
  }

  https.addHeader("x-device-token", ESP32_DEVICE_TOKEN);
  https.addHeader("apikey", SUPABASE_ANON_KEY);
  https.setTimeout(3000);

  int httpCode = https.GET();
  if (httpCode == 200) {
    consecutiveHttpFailures = 0;
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
            unsigned long now = millis();
            unsigned long elapsedSafeRecoveryMs = (safeReadingsStartMillis > 0) ? (now - safeReadingsStartMillis) : 0;
            
            bool vWarmup   = (now >= MQ2_WARMUP_PERIOD_MS);
            bool vFault    = (!isSensorFaultActive && lastRawAdc >= MQ2_ADC_FAULT_THRESHOLD);
            bool vAdcClear = (lastRawAdc < MQ2_ADC_CLEAR_THRESHOLD);
            bool vRecovery = isRecoveryStable;
            bool vFinalDecision = (vWarmup && vFault && vAdcClear && vRecovery);

            Serial.println();
            Serial.println(F("=================================================="));
            Serial.println(F("   [RESET_SAFETY_LOCKOUT VALIDATION AUDIT]"));
            Serial.print(F("   Command ID             : ")); Serial.println(commandId);
            Serial.print(F("   Target Device ID       : ")); Serial.println(deviceId ? deviceId : "N/A");
            Serial.print(F("   Current Raw ADC        : ")); Serial.println(lastRawAdc);
            Serial.print(F("   Elapsed Safe Recovery  : ")); Serial.print(elapsedSafeRecoveryMs); Serial.println(F(" ms"));
            Serial.println(F("   -----------------------------------------------"));
            Serial.print(F("   - Warm-up validation   : ")); 
            Serial.print(vWarmup ? F("PASS") : F("FAIL"));
            Serial.print(F(" (Uptime: ")); Serial.print(now); Serial.print(F(" ms, Required: ")); Serial.print(MQ2_WARMUP_PERIOD_MS); Serial.println(F(" ms)"));

            Serial.print(F("   - Sensor fault valid.  : ")); 
            Serial.print(vFault ? F("PASS") : F("FAIL"));
            Serial.print(F(" (FaultActive: ")); Serial.print(isSensorFaultActive ? F("YES") : F("NO")); Serial.print(F(", ADC: ")); Serial.print(lastRawAdc); Serial.println(F(", Min: 45)"));

            Serial.print(F("   - ADC clearance valid. : ")); 
            Serial.print(vAdcClear ? F("PASS") : F("FAIL"));
            Serial.print(F(" (ADC: ")); Serial.print(lastRawAdc); Serial.print(F(", Clearance Threshold: < ")); Serial.print(MQ2_ADC_CLEAR_THRESHOLD); Serial.println(F(")"));

            Serial.print(F("   - Stable recovery valid: ")); 
            Serial.print(vRecovery ? F("PASS") : F("FAIL"));
            Serial.print(F(" (Stable: ")); Serial.print(isRecoveryStable ? F("YES") : F("NO")); Serial.print(F(", Elapsed: ")); Serial.print(elapsedSafeRecoveryMs); Serial.print(F(" ms, Required: ")); Serial.print(MQ2_RECOVERY_STABLE_PERIOD_MS); Serial.println(F(" ms)"));

            Serial.println(F("   -----------------------------------------------"));
            Serial.print(F("   - Final Reset Decision : "));
            Serial.println(vFinalDecision ? F("APPROVED (DISARMING LOCKOUT)") : F("REJECTED (LOCKOUT PRESERVED)"));
            Serial.println(F("=================================================="));

            if (!vWarmup) {
              Serial.println(F("[SAFETY RESET REJECTED] Warm-up check failed. Sensor heater stabilizing."));
              int ackCode = ackCommandToSupabase(commandId, deviceId, "rejected_gas_safety", false, "RESET_REJECTED_WARMING_UP: MQ-2 sensor warm-up in progress (< 20s)", 10);
              Serial.print(F("[RESET_SAFETY_LOCKOUT ACK] Command ID: ")); Serial.print(commandId);
              Serial.print(F(" | HTTP ACK Response Code: ")); Serial.println(ackCode);
              continue;
            }

            if (!vFault) {
              Serial.println(F("[SAFETY RESET REJECTED] Sensor fault check failed. Disconnected wire or ADC < 45."));
              int ackCode = ackCommandToSupabase(commandId, deviceId, "rejected_gas_safety", false, "RESET_REJECTED_SENSOR_FAULT: MQ-2 sensor disconnected or ADC < 45", 10);
              Serial.print(F("[RESET_SAFETY_LOCKOUT ACK] Command ID: ")); Serial.print(commandId);
              Serial.print(F(" | HTTP ACK Response Code: ")); Serial.println(ackCode);
              continue;
            }

            if (!vAdcClear) {
              Serial.print(F("[SAFETY RESET REJECTED] ADC clearance check failed. Gas level unsafe (ADC: "));
              Serial.print(lastRawAdc);
              Serial.println(F(" >= 900)."));
              int ackCode = ackCommandToSupabase(commandId, deviceId, "rejected_gas_safety", false, "RESET_REJECTED_GAS_UNSAFE: Gas reading at or above clearance threshold (900 ADC)", 10);
              Serial.print(F("[RESET_SAFETY_LOCKOUT ACK] Command ID: ")); Serial.print(commandId);
              Serial.print(F(" | HTTP ACK Response Code: ")); Serial.println(ackCode);
              continue;
            }

            if (!vRecovery) {
              Serial.print(F("[SAFETY RESET REJECTED] Stable recovery duration check failed. Elapsed: "));
              Serial.print(elapsedSafeRecoveryMs);
              Serial.print(F(" ms < Required: "));
              Serial.print(MQ2_RECOVERY_STABLE_PERIOD_MS);
              Serial.println(F(" ms."));
              int ackCode = ackCommandToSupabase(commandId, deviceId, "rejected_gas_safety", false, "RESET_REJECTED_RECOVERY_INSUFFICIENT: Safe baseline not maintained for continuous recovery duration", 10);
              Serial.print(F("[RESET_SAFETY_LOCKOUT ACK] Command ID: ")); Serial.print(commandId);
              Serial.print(F(" | HTTP ACK Response Code: ")); Serial.println(ackCode);
              continue;
            }

            // All hardware safety checks passed: Disarm local lockout and re-arm contactor
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

            Serial.println(F("[SAFETY RESET APPROVED] ESP32 verified safe atmosphere. Lockout disarmed. Contactor re-armed. Relays remain OFF."));
            int ackCode = ackCommandToSupabase(commandId, deviceId, "acknowledged", false, "Lockout cleared by authorized safety reset", 10);
            Serial.print(F("[RESET_SAFETY_LOCKOUT ACK] Command ID: ")); Serial.print(commandId);
            Serial.print(F(" | HTTP ACK Response Code: ")); Serial.println(ackCode);
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
      consecutiveHttpFailures++;
      Serial.print(F("[POLL ERROR] HTTP Status: "));
      Serial.print(httpCode);
      if (httpCode < 0) {
        Serial.print(F(" ("));
        Serial.print(https.errorToString(httpCode));
        Serial.print(F(")"));
      }
      Serial.println();
      if (httpCode < 0) {
        Serial.print(F("[POLL DIAGNOSTIC] Outbound TLS failed. Target: "));
        Serial.print(SUPABASE_HOST);
        Serial.print(F(":443 | Free Heap: "));
        Serial.print(ESP.getFreeHeap());
        Serial.println(F(" B"));
      } else {
        String errResp = https.getString();
        if (errResp.length() > 0) {
          Serial.print(F("[POLL ERROR BODY] "));
          Serial.println(errResp);
        }
      }
    }
    https.end();
}

// ==============================================================================
// Acknowledge Executed Command to Prevent Duplicate Execution
// ==============================================================================
int ackCommandToSupabase(const char* commandId, const char* deviceId, const char* status, bool actualState, const char* errMsg, int rttMs) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[COMMAND ACK] Wi-Fi disconnected. Cannot send ACK."));
    return -1;
  }

  WiFiClientSecure client;
  configureTlsClient(client);

  HTTPClient https;
  String endpoint = String(SUPABASE_GATEWAY_URL) + "?action=ack_command";

  int httpCode = -1;
  if (!https.begin(client, endpoint)) {
    Serial.print(F("[COMMAND ACK ERROR] HTTPClient::begin() failed for endpoint: "));
    Serial.println(endpoint);
    return -1;
  }

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

  httpCode = https.POST(jsonPayload);
  if (httpCode == 200) {
    Serial.print(F("[COMMAND ACK] Confirmed command: "));
    Serial.print(commandId);
    Serial.print(F(" | Status: "));
    Serial.print(status);
    Serial.print(F(" | HTTP ACK Response Code: "));
    Serial.println(httpCode);
  } else {
    Serial.print(F("[COMMAND ACK ERROR] Command: "));
    Serial.print(commandId);
    Serial.print(F(" | HTTP Status: "));
    Serial.print(httpCode);
    if (httpCode < 0) {
      Serial.print(F(" ("));
      Serial.print(https.errorToString(httpCode));
      Serial.print(F(")"));
    }
    Serial.println();
    if (httpCode > 0) {
      String errResp = https.getString();
      if (errResp.length() > 0) {
        Serial.print(F("[COMMAND ACK ERROR BODY] "));
        Serial.println(errResp);
      }
    }
  }
  https.end();
  return httpCode;
}

// ==============================================================================
// Periodic Node Heartbeat
// ==============================================================================
void sendHeartbeatToSupabase() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  configureTlsClient(client);

  HTTPClient https;
  String endpoint = String(SUPABASE_GATEWAY_URL) + "?action=heartbeat";

  if (!https.begin(client, endpoint)) {
    Serial.print(F("[HEARTBEAT ERROR] HTTPClient::begin() failed for endpoint: "));
    Serial.println(endpoint);
    return;
  }

  https.addHeader("x-device-token", ESP32_DEVICE_TOKEN);
  https.addHeader("apikey", SUPABASE_ANON_KEY);
  https.setTimeout(2500);

  int httpCode = https.GET();
  if (httpCode == 200) {
    consecutiveHttpFailures = 0;
    Serial.println(F("[HEARTBEAT] Node status: ONLINE."));
  } else {
    Serial.print(F("[HEARTBEAT ERROR] HTTP Status: "));
    Serial.print(httpCode);
    if (httpCode < 0) {
      Serial.print(F(" ("));
      Serial.print(https.errorToString(httpCode));
      Serial.print(F(")"));
    }
    Serial.println();
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
