#ifndef SMARTHOMEX_CONFIG_H
#define SMARTHOMEX_CONFIG_H

// ==============================================================================
// SmartHomeX AI - ESP32 Hardware Configuration & Pinout Header
// Target Controller: ESP32 30-pin DevKit (ESP32-WROOM-32)
// Architecture: 4-Channel Active LOW Relay Module + Separate Single Exhaust Relay
// ==============================================================================

// ------------------------------------------------------------------------------
// 1. Wi-Fi Network Credentials
// ------------------------------------------------------------------------------
#define WIFI_SSID                "YOUR_WIFI_SSID"
#define WIFI_PASSWORD            "YOUR_WIFI_PASSWORD"
#define WIFI_CONNECT_TIMEOUT_MS  15000
#define WIFI_RETRY_INTERVAL_MS    5000

// ------------------------------------------------------------------------------
// 2. Supabase Backend Gateway Configuration
// NEVER put service_role keys on this device!
// Communication uses Supabase Edge Function with Device Token.
// ------------------------------------------------------------------------------
#define SUPABASE_BASE_URL        "https://pacejovitiwmoucyzkzy.supabase.co"
#define SUPABASE_GATEWAY_URL     "https://pacejovitiwmoucyzkzy.supabase.co/functions/v1/esp32-gateway"
#define SUPABASE_ANON_KEY        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhY2Vqb3ZpdGl3bW91Y3l6a3p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1MzM0NTUsImV4cCI6MjEwOTEwOTQ1NX0.vZlV1Cw0KBNjqpWhV-lJWJCoK6feMK67vj0SOVINAX0"

// Pre-shared Device Authentication Secret (Must match device_tokens table in Supabase)
#define ESP32_DEVICE_TOKEN       "xgwbB0ySRe9e1AxjKJoGXNkTg88aRql5FRot0raEMI4="

// Node and Firmware Identifiers
#define DEVICE_NODE_ID           "ESP32-WROOM-32-NODE-01"
#define FIRMWARE_VERSION         "v2.5.0-SmartHomeX-Emergency-Pro"

// ------------------------------------------------------------------------------
// 3. Hardware GPIO Pin Mapping (ESP32 30-pin DevKit)
// ------------------------------------------------------------------------------
// 4-Channel Relay Module (Active LOW):
#define PIN_RELAY_LIGHT          14   // Channel 1: Living Room Light
#define PIN_RELAY_FAN            25   // Channel 2: Ceiling Fan
#define PIN_RELAY_MOTOR          26   // Channel 3: Water Booster Motor (Max 30m runtime)
#define PIN_RELAY_CH4_UNUSED     -1   // Channel 4: PERMANENTLY UNUSED (Idle)

// Separate Single-Channel Relay:
#define PIN_RELAY_EXHAUST        27   // Separate Relay: Kitchen DC Exhaust Fan

// Active-LOW relay module convention:
// LOW  = Optocoupler LED on -> Relay energized (Circuit Closed)
// HIGH = Optocoupler LED off -> Relay idle (Circuit Open)
#define RELAY_ACTIVE_LOW         true

#if RELAY_ACTIVE_LOW
  #define RELAY_ON   LOW
  #define RELAY_OFF  HIGH
#else
  #define RELAY_ON   HIGH
  #define RELAY_OFF  LOW
#endif

// Environmental Sensors & Alert Peripherals
#define PIN_DHT11                32   // DHT11 Single-Bus Temperature & Humidity
#define PIN_MQ2_ANALOG           34   // MQ-2 Combustible Gas Analog (ADC1_CH6, Input-Only)
#define PIN_I2C_SDA              21   // INA219 Current/Voltage Sensor I2C Data
#define PIN_I2C_SCL              22   // INA219 Current/Voltage Sensor I2C Clock
#define PIN_BUZZER               33   // Emergency Safety Alert Buzzer (Active 5V Buzzer)
#define PIN_PHYSICAL_RESET_BTN    0   // ESP32 BOOT Button (GPIO 0) / Physical Reset Button

// ------------------------------------------------------------------------------
// 4. Life-Safety Gas Emergency & Interlock Parameters
// ------------------------------------------------------------------------------
// MQ-2 ADC Sampling Parameters (12-bit ADC: 0 - 4095)
#define MQ2_ADC_MAX                  4095.0f
#define MQ2_VREF                        3.3f

// Direct Raw ADC Thresholds (Eliminates fabricated PPM assumptions; ground-truth hardware metrics)
#define MQ2_ADC_FAULT_THRESHOLD          45   // ADC < 45 indicates disconnected/open-circuit sensor wire
#define MQ2_ADC_WARNING_THRESHOLD      1100   // Relative warning threshold (~27% ADC)
#define MQ2_ADC_DANGER_THRESHOLD       1600   // Relative danger threshold (~39% ADC)
#define MQ2_ADC_CLEAR_THRESHOLD         900   // Clearance threshold: Must drop below 900 ADC to permit safety reset
#define MQ2_WARMUP_PERIOD_MS          20000   // 20-second heater stabilization guard on cold boot

// EXHAUST FAN SPARK SAFETY INTERLOCK:
// CRITICAL SAFETY REQUIREMENT:
// Ordinary DC exhaust fans and standard electromechanical relays generate electric sparks
// during contact switching and motor brush commutation, which WILL ignite combustible gas.
// Automatic exhaust fan activation is strictly DISABLED by default.
// It can ONLY be enabled if the complete assembly (fan, motor, switching, enclosure, wiring)
// is certified explosion-proof (ATEX / IECEx / UL Class I, Div 1).
#define HAZARDOUS_EXHAUST_CERTIFIED false

// ------------------------------------------------------------------------------
// 5. Non-Blocking Timing & Polling Intervals (milliseconds)
// ------------------------------------------------------------------------------
#define INTERVAL_LOCAL_SAFETY_MS     100    // Sample gas & evaluate lockout every 100ms
#define INTERVAL_POLL_COMMANDS_MS   1500    // Poll Supabase for pending website commands
#define INTERVAL_TELEMETRY_MS       5000    // Send DHT11 + INA219 + MQ-2 stream
#define INTERVAL_HEARTBEAT_MS      30000    // Update node health / device_status
#define MOTOR_MAX_RUNTIME_SEC       1800    // 30-minute auto-cutoff for water motor

#endif // SMARTHOMEX_CONFIG_H
