# SmartHomeX AI – ESP32 Hardware Integration & Firmware Guide

This document details the complete hardware wiring, Arduino firmware flashing, Supabase Edge Function deployment, and security architecture for the **SmartHomeX AI** 4-channel relay and sensor monitoring node.

---

## 1. Hardware Bill of Materials (BOM)

| Component | Model / Specification | Purpose | Operating Voltage |
| :--- | :--- | :--- | :--- |
| **Microcontroller** | ESP32-WROOM-32 (30-pin DevKit V1) | Central controller, Wi-Fi HTTPS client, local safety engine | 5V via USB (3.3V logic) |
| **4-Channel Relay** | 5V Optocoupled Relay Module (Active LOW) | Controls Light, Fan, Water Motor, and Exhaust Fan | 5V VCC, 3.3V/5V Trigger |
| **Current / Voltage Sensor**| INA219 I2C High-Side Power Monitor | Measures Bus Voltage (V), Current (mA/A), Power (W), Wh | 3.3V - 5V VCC, I2C Bus |
| **Environmental Sensor** | DHT11 Single-Bus Temperature & Humidity | Ambient room temperature (°C) & relative humidity (%) | 3.3V VCC |
| **Combustible Gas Sensor** | MQ-2 Gas & Smoke Analog Detector | Detects combustible LPG, Propane, Methane, Hydrogen | 5V VCC (Heater), 0-3.3V AOUT |
| **Safety Buzzer** | Active 5V / 3.3V Piezo Buzzer | Local hardware audible alarm during gas danger | 3.3V - 5V |

---

## 2. GPIO Pinout & Wiring Connections

> [!IMPORTANT]
> The ESP32 operates at **3.3V logic levels**. GPIO 34 is an **input-only** analog pin on ADC1, which prevents Wi-Fi channel interference that commonly plagues ADC2 pins.

```
+-------------------------------------------------------------------------------+
|                             ESP32 30-PIN DEVKIT                               |
|                                                                               |
|   [GPIO 14] -------------------> Relay Channel 1 IN (Living Room Light)      |
|   [GPIO 25] -------------------> Relay Channel 2 IN (Master Ceiling Fan)     |
|   [GPIO 26] -------------------> Relay Channel 3 IN (Water Booster Motor)    |
|   [GPIO 27] -------------------> Relay Channel 4 IN (Kitchen Exhaust Fan)    |
|   [GPIO 32] -------------------> DHT11 DATA (Include 10k pull-up to 3.3V)    |
|   [GPIO 34] -------------------> MQ-2 Analog AOUT (Combustible Gas PPM)       |
|   [GPIO 21] -------------------> INA219 SDA (I2C Data)                       |
|   [GPIO 22] -------------------> INA219 SCL (I2C Clock)                      |
|   [GPIO 33] -------------------> Buzzer Positive (+) Terminal                |
|                                                                               |
|   [VIN / 5V] ------------------> Relay VCC, MQ-2 VCC                          |
|   [3.3V] ----------------------> DHT11 VCC, INA219 VCC                        |
|   [GND] -----------------------> Common GND (ESP32, Relays, Sensors, Buzzer) |
+-------------------------------------------------------------------------------+
```

### Pin Allocation Table:

| Target Peripheral | ESP32 GPIO | Mode | Signal Characteristics |
| :--- | :---: | :---: | :--- |
| **Relay 1 (Light)** | `GPIO 14` | Output | Active LOW (LOW = Energized, HIGH = Off) |
| **Relay 2 (Fan)** | `GPIO 25` | Output | Active LOW (LOW = Energized, HIGH = Off) |
| **Relay 3 (Water Motor)** | `GPIO 26` | Output | Active LOW (with 30-min auto-cutoff guard) |
| **Relay 4 (Exhaust)** | `GPIO 27` | Output | Active LOW (Life-safety gas lockout protected) |
| **DHT11 Temp & Humidity** | `GPIO 32` | Bi-Dir | 1-Wire protocol, 2-second minimum refresh |
| **MQ-2 Gas Sensor** | `GPIO 34` | Input | 12-bit ADC (ADC1_CH6, 0 - 4095) |
| **INA219 SDA** | `GPIO 21` | I2C Data | Standard ESP32 hardware I2C Data |
| **INA219 SCL** | `GPIO 22` | I2C Clock | Standard ESP32 hardware I2C Clock |
| **Safety Buzzer** | `GPIO 33` | Output | High = Alarm Tone, Low = Silent |

---

## 3. Required Arduino IDE Libraries

Install the following libraries via **Arduino IDE -> Sketch -> Include Library -> Manage Libraries...**:

1. **`ArduinoJson`** by *Benoit Blanchon* (Version `6.21.x` or `7.x`)  
   *Used for lightweight serialization and deserialization of telemetry and command packets.*
2. **`Adafruit INA219`** by *Adafruit* (Version `1.2.x` or higher)  
   *Used for I2C bus current, voltage, and power calculation.*
3. **`DHT sensor library`** by *Adafruit* (Version `1.4.x` or higher)  
   *Used for single-bus DHT11 communication.*
4. **`Adafruit Unified Sensor`** by *Adafruit*  
   *Base sensor dependency required by Adafruit DHT library.*

### Arduino IDE Board Manager:
- **Board Package:** `esp32` by *Espressif Systems* (Version `2.0.14` or `3.0.x`)
- **Selected Board:** `DOIT ESP32 DEVKIT V1` or `ESP32 Dev Module`
- **Upload Speed:** `921600` (or `115200` if cable is noisy)
- **Flash Frequency:** `80 MHz`
- **Partition Scheme:** `Default 4MB with spiffs (1.2MB APP / 1.5MB SPIFFS)`

---

## 4. Supabase Backend Architecture & Edge Function

To ensure maximum security, **the ESP32 never possesses or transmits the Supabase `service_role` key**. 

Instead, communication flows through the dedicated **`esp32-gateway`** Edge Function:

```
[ ESP32 Hardware ]
        │  (HTTPS Port 443 with x-device-token)
        ▼
[ Supabase Edge Function: /functions/v1/esp32-gateway ]
        │  (Internal cloud environment with verified RLS context)
        ▼
[ Supabase PostgreSQL Database ]
  ├── public.devices
  ├── public.sensor_readings
  ├── public.device_commands
  ├── public.device_status
  └── public.alerts
```

### Deploying the Edge Function:

1. Install the Supabase CLI:
   ```bash
   npm install -g supabase
   ```
2. Link your Supabase project:
   ```bash
   supabase link --project-ref pacejovitiwmoucyzkzy
   ```
3. Set the pre-shared device secret in Supabase Secrets:
   ```bash
   supabase secrets set ESP32_DEVICE_TOKEN="smarthomex_esp32_hw_token_sec2026"
   ```
4. Deploy the Edge Function:
   ```bash
   supabase functions deploy esp32-gateway --no-verify-jwt
   ```

*(Note: `--no-verify-jwt` allows the ESP32 to authenticate using the dedicated `x-device-token` header rather than requiring a browser user cookie).*

---

## 5. Life-Safety Gas Emergency Interlock Logic

> [!CAUTION]
> **Explosion & Spark Hazard Prevention:**  
> Ordinary AC mechanical relays produce an electrical contact arc when switching. Likewise, ordinary exhaust fan and motor brushes spark during operation.  
> In an atmosphere containing combustible LPG or methane (detected by MQ-2), **ANY electrical spark can trigger a catastrophic explosion**.

### Firmware Safety Behavior:
1. When `gasPPM >= 350.0 PPM` (Danger threshold):
   - **LOCAL LOCKOUT IS IMMEDIATELY TRIGGERED.**
   - All 4 relays are forced **OFF** (`HIGH` in active-LOW logic).
   - **The exhaust fan and water motor are explicitly kept OFF** to eliminate contact and brush arcing.
   - The hardware buzzer pulses at 200ms ON / 100ms OFF emergency alarm cadence.
   - Any incoming web command to turn ON any device is rejected locally (`rejected_gas_safety`).
   - An alert row is logged in `public.alerts` with `severity = 'danger'` and `evacuation_advised = true`.
2. Lockout only disarms when gas drops below **200 PPM** (hysteresis) continuously.
3. This routine runs locally every 100ms on the ESP32 and executes **even if Wi-Fi or internet connection is lost**.

---

## 6. Verification and Testing Checklist

- [x] **Relay Boot Test:** Ensure relays remain OFF upon ESP32 power up (no clicking).
- [x] **Wi-Fi Reconnection:** Disconnect Wi-Fi router; verify ESP32 continues reading gas sensor and buzzer without freezing, then reconnects automatically.
- [x] **Command Dispatch & ACK:** Toggle Relay 1 on the dashboard; verify the relay energizes within 1.5 seconds and status in `device_commands` changes from `pending` to `acknowledged`.
- [x] **Gas Trip Simulation:** Expose MQ-2 sensor to test gas; verify buzzer activates immediately, relays trip OFF, and dashboard displays safety lockout.
- [x] **INA219 Power Analytics:** Confirm voltage (~230V) and active watts update in real-time on dashboard charts.
