# SmartHomeX AI – Android Life-Safety Emergency Push Notification System

This native Android module implements the **Gas Leakage Emergency Notification, Siren, and Manual Silence System** for SmartHomeX AI.

---

## 1. Architecture Overview

```
                      [ ESP32 WROOM-32 ]
                 (MQ-2 Gas Sensor on GPIO 34)
                              │
              [Gas Level >= 350 PPM Detected]
                              │
             Autonomous Local Hardware Trip:
             • Relays OFF (GPIO 14, 25, 26)
             • Contactor TRIPPED
             • Local Buzzer SOUNDING (GPIO 33)
             • DC Exhaust Fan LOCKED OUT (GPIO 27)
                              │
                              ▼
        [ Supabase Edge Function: esp32-gateway ]
       (Telemetry Ingest + FCM Push Broadcast Engine)
                              │
                              ▼
            [ Firebase Cloud Messaging (FCM) ]
            (High Priority, Direct Boot Enabled)
                              │
                              ▼
                  [ Android Mobile Device ]
     ┌─────────────────────────────────────────────────┐
     │ 1. GasEmergencyMessagingService                │
     │    • Wakes device screen via WakeLock           │
     │    • Launches EmergencySirenService             │
     │    • Emits Heads-Up Notification (Level Max)    │
     │                                                 │
     │ 2. EmergencySirenService (Foreground Service)  │
     │    • Looping custom acoustic siren audio        │
     │    • Looping vibration pattern: [0, 500, 200...]│
     │                                                 │
     │ 3. EmergencyAlertActivity (Full Screen Red UI) │
     │    • Over-the-lockscreen emergency UI           │
     │    • Displays Home, Timestamp, Sensor PPM       │
     │    • Lists autonomous ESP32 hardware actions    │
     │                                                 │
     │ 4. "SILENCE SIREN" Button & Receiver            │
     │    • Immediately stops audio & vibration        │
     │    • Updates notification to "SIREN SILENCED"   │
     │    • KEEPS emergency active in cloud & web      │
     │    • DOES NOT re-energize any appliances        │
     │    • DOES NOT reset safety lockout              │
     └─────────────────────────────────────────────────┘
```

---

## 2. Directory Structure

```
android/
├── app/
│   ├── build.gradle.kts
│   └── src/
│       └── main/
│           ├── AndroidManifest.xml
│           └── java/com/smarthomex/ai/
│               ├── services/
│               │   ├── GasEmergencyMessagingService.kt
│               │   └── EmergencySirenService.kt
│               ├── receivers/
│               │   └── SirenSilenceReceiver.kt
│               └── ui/
│                   └── EmergencyAlertActivity.kt
└── README.md
```

---

## 3. Setup & Firebase Configuration Steps

### Step 1: Firebase Project Setup
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Create or select your project: `SmartHomeX AI`.
3. Add an Android app with package name: `com.smarthomex.ai`.
4. Download `google-services.json` and place it in `android/app/google-services.json`.

### Step 2: Configure Supabase Gateway FCM Credentials
1. In Firebase Console, go to **Project Settings** > **Cloud Messaging**.
2. Copy the **Server Key** (or create a Service Account for HTTP v1).
3. In your Supabase Project Dashboard, go to **Edge Functions** > **Secrets**.
4. Add the secret:
   ```
   FCM_SERVER_KEY = <your_firebase_server_key>
   ```

### Step 3: Siren Audio Resource
Place your custom emergency siren sound file (MP3 or WAV) in:
```
android/app/src/main/res/raw/emergency_siren.mp3
```
*Note: If no custom MP3 is placed, the service automatically falls back to Android's default system alarm sound.*

---

## 4. Life-Safety Silence Siren Contract

The **"SILENCE SIREN"** button enforces strict safety isolation:
* **Audio & Vibration:** Terminated immediately to protect occupant hearing and reduce panic.
* **Notification Shade:** Stays visible with high-contrast badge `SIREN SILENCED (EMERGENCY STILL ACTIVE)`.
* **Database & Web Alert:** Remains in `CRITICAL` / `SILENCED` state. Contactor remains tripped, and relays remain de-energized.
* **Lockout Reset:** Can **only** be performed once the gas concentration drops below `< 150 PPM` through the physical BOOT button on the ESP32 (GPIO 0) or the authorized operator safety reset button on the web dashboard.

