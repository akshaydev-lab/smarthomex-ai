// ==============================================================================
// SmartHomeX AI - Standalone ESP32 Hardware Diagnostic & Bench Test Tool
// Path: firmware/diagnostics/SmartHomeX_ESP32_Hardware_Diagnostic/SmartHomeX_ESP32_Hardware_Diagnostic.ino
//
// PURPOSE:
// Isolated hardware verification utility for the SmartHomeX 5-Relay System.
// Tests physical wiring, optocoupled relays, DC switching driver, active buzzer,
// MQ-2 gas sensor, DHT11 environmental sensor, and INA219 I2C power monitor.
//
// ZERO CLOUD / ZERO WI-FI DEPENDENCIES:
// Does NOT require Wi-Fi, Supabase, or Arduino IoT Cloud. Operates entirely via
// USB Serial Console at 115200 baud.
//
// HARDWARE PIN MAPPING:
//   - Relay 1: Light (GPIO 25, Active-LOW)
//   - Relay 2: Fan (GPIO 26, Active-LOW)
//   - Relay 3: Motor (GPIO 27, Active-LOW)
//   - Relay 4: Street Light (GPIO 14, Active-LOW)
//   - Relay 5: Exhaust Fan (GPIO 32, Active-LOW DC Switching Driver)
//   - Sensor: DHT11 (GPIO 4)
//   - Sensor: MQ-2 Analog (GPIO 34, ADC1_CH6)
//   - Sensor: INA219 (SDA GPIO 21, SCL GPIO 22, I2C 0x40)
//   - Alert: Active Buzzer (GPIO 33)
//   - Button: Physical Safety Reset Button (GPIO 13, Active-LOW with pull-up)
//
// RELAY LOGIC:
//   ACTIVE-LOW: LOW (0V) = Relay Energized (ON), HIGH (3.3V) = Relay De-energized (OFF)
// ==============================================================================

#include <Arduino.h>
#include <Wire.h>
#include <DHT.h>
#include <Adafruit_INA219.h>

// -----------------------------------------------------------------------------
// GPIO Pin Definitions
// -----------------------------------------------------------------------------
#define PIN_RELAY_LIGHT        25  // Relay 1 (Active-LOW)
#define PIN_RELAY_FAN          26  // Relay 2 (Active-LOW)
#define PIN_RELAY_MOTOR        27  // Relay 3 (Active-LOW)
#define PIN_RELAY_STREET_LIGHT 14  // Relay 4 (Active-LOW, 4-Ch Relay Board Ch 4)
#define PIN_RELAY_EXHAUST      32  // Relay 5 (Active-LOW DC Switching Driver)

#define PIN_BUZZER             33  // Active 5V Buzzer / Siren
#define PIN_RESET_BUTTON       13  // Physical Safety Reset Button
#define PIN_DHT11              4   // DHT11 Data Line
#define PIN_MQ2_ADC            34  // MQ-2 Analog Output (ADC1 Channel 6)
#define PIN_I2C_SDA            21  // INA219 SDA
#define PIN_I2C_SCL            22  // INA219 SCL

#define DHTTYPE                DHT11

// Active-LOW relay logic constants
#define RELAY_ON               LOW
#define RELAY_OFF              HIGH

// -----------------------------------------------------------------------------
// Global Peripheral Objects & State Variables
// -----------------------------------------------------------------------------
DHT dht(PIN_DHT11, DHTTYPE);
Adafruit_INA219 ina219;
bool ina219Detected = false;

bool stateRelay1 = false; // Light
bool stateRelay2 = false; // Fan
bool stateRelay3 = false; // Motor
bool stateRelay4 = false; // Street Light
bool stateRelay5 = false; // Exhaust Fan
bool continuousMonitor = false;

unsigned long lastSensorPollMillis = 0;
const unsigned long SENSOR_POLL_INTERVAL_MS = 2500;

// -----------------------------------------------------------------------------
// Forward Function Declarations
// -----------------------------------------------------------------------------
void printBanner();
void printMenu();
void toggleRelay(int channel);
void setAllRelays(bool on);
void testBuzzerChirp();
void readAllSensors();
void scanI2CBus();
void showStatusSummary();

// =============================================================================
// SETUP - Safe Hardware Initialization Sequence
// =============================================================================
void setup() {
  // CRITICAL SAFE BOOT:
  // Write HIGH to relay pins BEFORE setting pinMode(OUTPUT) to eliminate
  // momentary LOW voltage glitching that energizes active-LOW relay coils.
  digitalWrite(PIN_RELAY_LIGHT, RELAY_OFF);
  digitalWrite(PIN_RELAY_FAN, RELAY_OFF);
  digitalWrite(PIN_RELAY_MOTOR, RELAY_OFF);
  digitalWrite(PIN_RELAY_STREET_LIGHT, RELAY_OFF);
  digitalWrite(PIN_RELAY_EXHAUST, RELAY_OFF);

  pinMode(PIN_RELAY_LIGHT, OUTPUT);
  pinMode(PIN_RELAY_FAN, OUTPUT);
  pinMode(PIN_RELAY_MOTOR, OUTPUT);
  pinMode(PIN_RELAY_STREET_LIGHT, OUTPUT);
  pinMode(PIN_RELAY_EXHAUST, OUTPUT);

  // Initialize Buzzer (Default OFF / LOW)
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);

  // Initialize Reset Button with internal pull-up
  pinMode(PIN_RESET_BUTTON, INPUT_PULLUP);

  // Configure MQ-2 ADC (ADC1 Channel 6)
  analogReadResolution(12); // 12-bit ADC (0 - 4095)
  analogSetAttenuation(ADC_11db); // Full-scale voltage approx 3.3V

  // Initialize USB Serial Console
  Serial.begin(115200);
  delay(500);

  printBanner();

  // Initialize I2C Bus & INA219
  Serial.println(F("[INIT] Initializing I2C bus (SDA: GPIO 21, SCL: GPIO 22)..."));
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

  if (ina219.begin()) {
    ina219Detected = true;
    Serial.println(F("[OK] INA219 Current & Power Monitor detected at 0x40."));
  } else {
    ina219Detected = false;
    Serial.println(F("[WARN] INA219 not detected at standard address 0x40. Running I2C scan..."));
    scanI2CBus();
  }

  // Initialize DHT11 Sensor
  Serial.println(F("[INIT] Initializing DHT11 on GPIO 4..."));
  dht.begin();
  delay(100);
  float testT = dht.readTemperature();
  if (isnan(testT)) {
    Serial.println(F("[WARN] DHT11 returned NaN on boot (check 10k pull-up to 3.3V)."));
  } else {
    Serial.print(F("[OK] DHT11 responding. Boot Temp: "));
    Serial.print(testT, 1);
    Serial.println(F(" °C"));
  }

  // Single brief confirmation chirp on boot
  digitalWrite(PIN_BUZZER, HIGH);
  delay(60);
  digitalWrite(PIN_BUZZER, LOW);

  printMenu();
}

// =============================================================================
// MAIN LOOP - Interactive Serial Command Processor & Monitor
// =============================================================================
void loop() {
  // Check for incoming serial commands
  if (Serial.available() > 0) {
    char cmd = Serial.read();

    // Consume trailing whitespace / newline characters
    while (Serial.available() > 0 && (Serial.peek() == '\r' || Serial.peek() == '\n' || Serial.peek() == ' ')) {
      Serial.read();
    }

    switch (cmd) {
      case '1':
        toggleRelay(1);
        break;
      case '2':
        toggleRelay(2);
        break;
      case '3':
        toggleRelay(3);
        break;
      case '4':
        toggleRelay(4);
        break;
      case '5':
        toggleRelay(5);
        break;
      case '0':
        setAllRelays(false);
        break;
      case 'a':
      case 'A':
        setAllRelays(true);
        break;
      case 'b':
      case 'B':
        testBuzzerChirp();
        break;
      case 'r':
      case 'R':
        readAllSensors();
        break;
      case 'i':
      case 'I':
        scanI2CBus();
        break;
      case 's':
      case 'S':
        showStatusSummary();
        break;
      case 'c':
      case 'C':
        continuousMonitor = !continuousMonitor;
        Serial.print(F("[MONITOR] Continuous telemetry polling: "));
        Serial.println(continuousMonitor ? F("ENABLED (Every 2.5s)") : F("DISABLED"));
        break;
      case 'm':
      case 'M':
      case '?':
      case 'h':
      case 'H':
        printMenu();
        break;
      default:
        // Ignore stray whitespace
        if (cmd != '\r' && cmd != '\n') {
          Serial.print(F("[UNKNOWN] Unrecognized command '"));
          Serial.print(cmd);
          Serial.println(F("'. Press 'm' for menu."));
        }
        break;
    }
  }

  // Handle continuous periodic sensor telemetry if enabled
  if (continuousMonitor) {
    unsigned long currentMillis = millis();
    if (currentMillis - lastSensorPollMillis >= SENSOR_POLL_INTERVAL_MS) {
      lastSensorPollMillis = currentMillis;
      readAllSensors();
    }
  }

  // Check physical Reset Button (GPIO 13)
  if (digitalRead(PIN_RESET_BUTTON) == LOW) {
    Serial.println(F("\n>>> [HARDWARE EVENT] Physical Reset Button on GPIO 13 PRESSED! <<<"));
    digitalWrite(PIN_BUZZER, HIGH);
    delay(100);
    digitalWrite(PIN_BUZZER, LOW);
    // Debounce wait
    while (digitalRead(PIN_RESET_BUTTON) == LOW) {
      delay(20);
    }
    Serial.println(F(">>> [HARDWARE EVENT] Reset Button RELEASED. <<<\n"));
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

void printBanner() {
  Serial.println(F("\n=================================================================="));
  Serial.println(F("       SmartHomeX AI - ESP32 Hardware Diagnostic Bench Tool       "));
  Serial.println(F("=================================================================="));
  Serial.println(F("Firmware Target: ESP32 Dev Module (WROOM-32)"));
  Serial.println(F("Relay Logic: ACTIVE-LOW (LOW = ON / HIGH = OFF)"));
  Serial.println(F("Safe Boot: Relays forced HIGH before pin drive"));
  Serial.println(F("=================================================================="));
}

void printMenu() {
  Serial.println(F("\n----------------- INTERACTIVE BENCH COMMANDS -----------------"));
  Serial.println(F(" [1] Toggle Relay 1: Light        (GPIO 25)"));
  Serial.println(F(" [2] Toggle Relay 2: Fan          (GPIO 26)"));
  Serial.println(F(" [3] Toggle Relay 3: Motor        (GPIO 27)"));
  Serial.println(F(" [4] Toggle Relay 4: Street Light (GPIO 14)"));
  Serial.println(F(" [5] Toggle Relay 5: Exhaust Fan  (GPIO 32 DC Driver)"));
  Serial.println(F(" [0] ALL Relays OFF (Emergency De-energize)"));
  Serial.println(F(" [a] ALL Relays ON  (Bench Stress Test)"));
  Serial.println(F(" [b] Chirp Buzzer   (GPIO 33, 150ms test)"));
  Serial.println(F(" [r] Read All Sensors Once (MQ-2, DHT11, INA219, Button)"));
  Serial.println(F(" [c] Toggle Continuous Sensor Stream (2.5s interval)"));
  Serial.println(F(" [i] Scan I2C Bus   (SDA 21, SCL 22)"));
  Serial.println(F(" [s] Show Relay & Pin Status Summary"));
  Serial.println(F(" [m] Show This Command Menu"));
  Serial.println(F("--------------------------------------------------------------"));
  Serial.print(F("Enter command: "));
}

void toggleRelay(int channel) {
  switch (channel) {
    case 1:
      stateRelay1 = !stateRelay1;
      digitalWrite(PIN_RELAY_LIGHT, stateRelay1 ? RELAY_ON : RELAY_OFF);
      Serial.print(F("[RELAY 1] Light (GPIO 25) -> "));
      Serial.println(stateRelay1 ? F("ON [0V LOW]") : F("OFF [3.3V HIGH]"));
      break;
    case 2:
      stateRelay2 = !stateRelay2;
      digitalWrite(PIN_RELAY_FAN, stateRelay2 ? RELAY_ON : RELAY_OFF);
      Serial.print(F("[RELAY 2] Fan (GPIO 26) -> "));
      Serial.println(stateRelay2 ? F("ON [0V LOW]") : F("OFF [3.3V HIGH]"));
      break;
    case 3:
      stateRelay3 = !stateRelay3;
      digitalWrite(PIN_RELAY_MOTOR, stateRelay3 ? RELAY_ON : RELAY_OFF);
      Serial.print(F("[RELAY 3] Motor (GPIO 27) -> "));
      Serial.println(stateRelay3 ? F("ON [0V LOW]") : F("OFF [3.3V HIGH]"));
      break;
    case 4:
      stateRelay4 = !stateRelay4;
      digitalWrite(PIN_RELAY_STREET_LIGHT, stateRelay4 ? RELAY_ON : RELAY_OFF);
      Serial.print(F("[RELAY 4] Street Light (GPIO 14) -> "));
      Serial.println(stateRelay4 ? F("ON [0V LOW]") : F("OFF [3.3V HIGH]"));
      break;
    case 5:
      stateRelay5 = !stateRelay5;
      digitalWrite(PIN_RELAY_EXHAUST, stateRelay5 ? RELAY_ON : RELAY_OFF);
      Serial.print(F("[RELAY 5] Exhaust Fan (GPIO 32) -> "));
      Serial.println(stateRelay5 ? F("ON [0V LOW]") : F("OFF [3.3V HIGH]"));
      break;
    default:
      Serial.println(F("[ERROR] Invalid relay channel."));
      break;
  }
}

void setAllRelays(bool on) {
  stateRelay1 = on;
  stateRelay2 = on;
  stateRelay3 = on;
  stateRelay4 = on;
  stateRelay5 = on;

  digitalWrite(PIN_RELAY_LIGHT, on ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_RELAY_FAN, on ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_RELAY_MOTOR, on ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_RELAY_STREET_LIGHT, on ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_RELAY_EXHAUST, on ? RELAY_ON : RELAY_OFF);

  Serial.print(F("\n[MASTER] All 5 Relays switched: "));
  Serial.println(on ? F("ALL ENERGIZED (ON)") : F("ALL DE-ENERGIZED (OFF)"));
}

void testBuzzerChirp() {
  Serial.println(F("[BUZZER] Testing active buzzer on GPIO 33 for 150ms..."));
  digitalWrite(PIN_BUZZER, HIGH);
  delay(150);
  digitalWrite(PIN_BUZZER, LOW);
  Serial.println(F("[BUZZER] Chirp complete."));
}

void readAllSensors() {
  Serial.println(F("\n--- SENSOR TELEMETRY SNAPSHOT ---"));

  // 1. MQ-2 Combustible Gas Sensor
  int rawAdc = analogRead(PIN_MQ2_ADC);
  float voltageAdc = (rawAdc / 4095.0f) * 3.3f;
  Serial.print(F(" [MQ-2 Gas (GPIO 34)] ADC Raw: "));
  Serial.print(rawAdc);
  Serial.print(F(" / 4095 ("));
  Serial.print(voltageAdc, 2);
  Serial.print(F(" V) | Status: "));
  if (rawAdc < 45) {
    Serial.println(F("SENSOR FAULT / DISCONNECTED (ADC < 45)"));
  } else if (rawAdc >= 1600) {
    Serial.println(F("CRITICAL DANGER / TRIP (ADC >= 1600)"));
  } else if (rawAdc >= 1100) {
    Serial.println(F("WARNING / ELEVATED (1100 <= ADC < 1600)"));
  } else {
    Serial.println(F("SAFE / NOMINAL (ADC < 1100)"));
  }

  // 2. DHT11 Environmental Sensor
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  Serial.print(F(" [DHT11 (GPIO 4)]    Temperature: "));
  if (isnan(temp)) {
    Serial.print(F("FAIL/NaN"));
  } else {
    Serial.print(temp, 1);
    Serial.print(F(" °C"));
  }
  Serial.print(F(" | Humidity: "));
  if (isnan(hum)) {
    Serial.println(F("FAIL/NaN"));
  } else {
    Serial.print(hum, 1);
    Serial.println(F(" %"));
  }

  // 3. INA219 Power Monitor
  if (ina219Detected) {
    float busVoltage = ina219.getBusVoltage_V();
    float shuntVoltage = ina219.getShuntVoltage_mV();
    float currentMa = ina219.getCurrent_mA();
    float powerMw = ina219.getPower_mW();
    Serial.print(F(" [INA219 (I2C 0x40)] Bus: "));
    Serial.print(busVoltage, 2);
    Serial.print(F(" V | Shunt: "));
    Serial.print(shuntVoltage, 2);
    Serial.print(F(" mV | Current: "));
    Serial.print(currentMa, 1);
    Serial.print(F(" mA | Power: "));
    Serial.print(powerMw, 1);
    Serial.println(F(" mW"));
  } else {
    Serial.println(F(" [INA219 (I2C 0x40)] Device NOT detected on I2C bus."));
  }

  // 4. Physical Reset Button
  int btnState = digitalRead(PIN_RESET_BUTTON);
  Serial.print(F(" [Button (GPIO 13)]   State: "));
  Serial.println(btnState == LOW ? F("PRESSED (LOW)") : F("RELEASED (HIGH)"));

  Serial.println(F("---------------------------------"));
}

void scanI2CBus() {
  Serial.println(F("\n[I2C SCANNER] Scanning address space 0x01 to 0x7F on SDA 21, SCL 22..."));
  byte count = 0;
  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.print(F(" -> Device discovered at address: 0x"));
      if (address < 16) Serial.print(F("0"));
      Serial.print(address, HEX);
      if (address == 0x40) Serial.print(F(" (INA219 Standard)"));
      Serial.println();
      count++;
    }
  }
  if (count == 0) {
    Serial.println(F("[I2C SCANNER] No I2C devices discovered. Check wiring/pull-ups on GPIO 21 & 22."));
  } else {
    Serial.print(F("[I2C SCANNER] Discovered "));
    Serial.print(count);
    Serial.println(F(" device(s) on I2C bus."));
  }
}

void showStatusSummary() {
  Serial.println(F("\n================ RELAY & PIN STATUS SUMMARY ================"));
  Serial.print(F(" Relay 1 (Light):        GPIO 25 | State: "));
  Serial.println(stateRelay1 ? F("ON  [LOW]") : F("OFF [HIGH]"));

  Serial.print(F(" Relay 2 (Fan):          GPIO 26 | State: "));
  Serial.println(stateRelay2 ? F("ON  [LOW]") : F("OFF [HIGH]"));

  Serial.print(F(" Relay 3 (Motor):        GPIO 27 | State: "));
  Serial.println(stateRelay3 ? F("ON  [LOW]") : F("OFF [HIGH]"));

  Serial.print(F(" Relay 4 (Street Light): GPIO 14 | State: "));
  Serial.println(stateRelay4 ? F("ON  [LOW]") : F("OFF [HIGH]"));

  Serial.print(F(" Relay 5 (Exhaust Fan):  GPIO 32 | State: "));
  Serial.println(stateRelay5 ? F("ON  [LOW]") : F("OFF [HIGH]"));

  Serial.print(F(" Active Buzzer:          GPIO 33 | State: "));
  Serial.println(digitalRead(PIN_BUZZER) ? F("ACTIVE") : F("SILENT"));

  Serial.print(F(" Reset Button:           GPIO 13 | State: "));
  Serial.println(digitalRead(PIN_RESET_BUTTON) == LOW ? F("PRESSED") : F("OPEN/IDLE"));

  Serial.print(F(" Free Heap: "));
  Serial.print(ESP.getFreeHeap());
  Serial.println(F(" Bytes"));
  Serial.println(F("============================================================"));
}
