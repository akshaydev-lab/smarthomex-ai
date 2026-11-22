// ==============================================================================
// SmartHomeX AI - Arduino IoT Cloud Configuration & Property Bindings
// Model: ESP32-WROOM-32 (30-pin DevKit)
// Features: 5 Relays + MQ-2 Emergency Interlock + DHT11 + INA219
// ==============================================================================
#ifndef THING_PROPERTIES_H
#define THING_PROPERTIES_H

#include <ArduinoIoTCloud.h>
#include <Arduino_ConnectionHandler.h>

// ------------------------------------------------------------------------------
// Arduino IoT Cloud Device Credentials
// Replace with your credentials from https://app.arduino.cc/
// ------------------------------------------------------------------------------
const char THING_ID[]           = "YOUR_THING_ID";
const char DEVICE_LOGIN_NAME[]  = "YOUR_DEVICE_ID";
const char DEVICE_KEY[]         = "YOUR_SECRET_DEVICE_KEY";
const char CLOUD_SSID[]         = "smarthomex";
const char CLOUD_PASS[]         = "12345678";

// ------------------------------------------------------------------------------
// Cloud Variables Definition
// ------------------------------------------------------------------------------
// 1. Five Relay Controls (Read/Write with On-Change Callbacks)
CloudSwitch light;        // Relay 1: Light (GPIO 25)
CloudSwitch fan;          // Relay 2: Fan (GPIO 26)
CloudSwitch motor;        // Relay 3: Motor (GPIO 27)
CloudSwitch streetLight;  // Relay 4: Street Light (GPIO 14)
CloudSwitch exhaustFan;   // Relay 5: Exhaust Fan (GPIO 32)

// 2. MQ-2 Gas Emergency Monitoring (Read-Only)
int mq2RawADC;            // Raw 12-bit ADC reading (0 - 4095) on GPIO 34
extern String gasStatus;  // Lifecycle state: "warming_up", "sensor_fault", "safe", "warning", "danger"
bool gasEmergency;        // True when ADC >= 1600 (Combustible gas hazard)
bool gasWarmup;           // True during 20-second startup warm-up period
bool gasSensorFault;      // True when ADC < 45 (Disconnected sensor wire / open circuit)
bool emergencyLockout;    // True when safety lockout is latched, inhibiting all energization

// 3. Environmental & Power Telemetry (Read-Only)
typedef CloudElectricPotential CloudVoltage;
typedef CloudElectricCurrent CloudCurrent;

CloudTemperatureSensor temperature; // Ambient temperature from DHT11 (°C)
CloudRelativeHumidity humidity;     // Ambient relative humidity from DHT11 (%)
CloudVoltage busVoltage;            // DC Bus Voltage from INA219 (V)
CloudCurrent currentMa;             // DC Load Current from INA219 (mA)
CloudPower powerW;                  // DC Load Power from INA219 (W)

// ------------------------------------------------------------------------------
// Callback Function Declarations
// ------------------------------------------------------------------------------
void onLightChange();
void onFanChange();
void onMotorChange();
void onStreetLightChange();
void onExhaustFanChange();

// ------------------------------------------------------------------------------
// Property Initialization
// ------------------------------------------------------------------------------
inline void initProperties() {
  ArduinoCloud.setBoardId(DEVICE_LOGIN_NAME);
  ArduinoCloud.setSecretDeviceKey(DEVICE_KEY);
  ArduinoCloud.setThingId(THING_ID);

  // Relay properties (Read/Write with callbacks that enforce safety interlocks)
  ArduinoCloud.addProperty(light, READWRITE, ON_CHANGE, onLightChange);
  ArduinoCloud.addProperty(fan, READWRITE, ON_CHANGE, onFanChange);
  ArduinoCloud.addProperty(motor, READWRITE, ON_CHANGE, onMotorChange);
  ArduinoCloud.addProperty(streetLight, READWRITE, ON_CHANGE, onStreetLightChange);
  ArduinoCloud.addProperty(exhaustFan, READWRITE, ON_CHANGE, onExhaustFanChange);

  // Gas Monitoring properties (Read-Only to dashboard)
  ArduinoCloud.addProperty(mq2RawADC, READ, ON_CHANGE, NULL);
  ArduinoCloud.addProperty(gasStatus, READ, ON_CHANGE, NULL);
  ArduinoCloud.addProperty(gasEmergency, READ, ON_CHANGE, NULL);
  ArduinoCloud.addProperty(gasWarmup, READ, ON_CHANGE, NULL);
  ArduinoCloud.addProperty(gasSensorFault, READ, ON_CHANGE, NULL);
  ArduinoCloud.addProperty(emergencyLockout, READ, ON_CHANGE, NULL);

  // Environmental & Electrical properties (Read-Only to dashboard)
  ArduinoCloud.addProperty(temperature, READ, ON_CHANGE, NULL);
  ArduinoCloud.addProperty(humidity, READ, ON_CHANGE, NULL);
  ArduinoCloud.addProperty(busVoltage, READ, ON_CHANGE, NULL);
  ArduinoCloud.addProperty(currentMa, READ, ON_CHANGE, NULL);
  ArduinoCloud.addProperty(powerW, READ, ON_CHANGE, NULL);
}

inline WiFiConnectionHandler ArduinoIoTPreferredConnection(CLOUD_SSID, CLOUD_PASS);

#endif // THING_PROPERTIES_H
