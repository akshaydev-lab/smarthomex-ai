# SmartHomeX AI – Intelligent Home Automation & IoT Platform

SmartHomeX AI is a modern, responsive, commercial-grade Smart Home Automation Web Dashboard engineered for high-fidelity IoT monitoring and control. Built with **React.js**, **Vite**, **Tailwind CSS**, and **Recharts**, it delivers real-time telemetry for **ESP32** 4-channel relay actuation, environmental sensors (**DHT11**, **MQ-2**), and power monitoring (**INA219**), integrated with the **HomeX AI Voice Assistant**.

---

## 🚀 Key Highlights & Features

### 1. 4-Channel Relay Control System (ESP32 Ready)
- **Living Room Light** (Relay Ch 1 • GPIO 16 • 45W)
- **Master Ceiling Fan** (Relay Ch 2 • GPIO 17 • 75W • Animated Spin)
- **Water Booster Motor** (Relay Ch 3 • GPIO 18 • 750W • Dry-run cutoff)
- **Kitchen Exhaust Fan** (Relay Ch 4 • GPIO 19 • 60W • Autonomous gas link)
- **Master Controls**: "All Devices ON" (with inductive surge warnings) and "All Devices OFF".

### 2. Live Environmental & Power Telemetry
- **DHT11**: Temperature (°C) and Relative Humidity (%)
- **MQ-2**: Combustible Gas & Smoke Concentration (PPM) with safety zones (Normal, Warning, Danger)
- **INA219**: Bus Voltage (V), Shunt Current (A), Instantaneous Load (Watts), Cumulative Energy (kWh)
- **Active Piezo Siren**: GPIO 23 high-decibel alarm status

### 3. HomeX AI Voice Assistant
- Powered by the browser **Web Speech API** (`SpeechRecognition` & `SpeechSynthesis`)
- Hands-free natural speech commands (e.g. *"Turn on living room light"*, *"What is the temperature?"*, *"Emergency exhaust"*, *"Turn on all devices"*)
- Real-time command preview, vocal audio response feedback, and execution log.
- Text input fallback with one-click command prompt suggestions.

### 4. Interactive Recharts Visualizations
- 24-Hour Ambient Temperature Trend (°C)
- Relative Humidity History (%)
- Dual-Axis INA219 Voltage & Current Telemetry (V / A)
- Toggleable Daily & Weekly Energy Consumption with tariff cost estimates ($/kWh).

### 5. Automated Rule Engine & Life-Safety Architecture
- **Autonomous ESP32 Safety Mandate**: Gas leak and smoke evacuation rules execute directly in hardware interrupt routines on the ESP32. **Emergency cut-off never relies on internet or web connectivity.**
- Comfort rules (Ambient Temp > 28°C turns on Fan)
- Eco-night energy management rules.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | React.js 19 + Vite |
| **Styling & Design System** | Tailwind CSS (Dark Glassmorphism, Neon Cyan & Teal accents) |
| **Icons** | Lucide React |
| **Data Visualization** | Recharts |
| **Speech Engine** | Web Speech API (Recognition + Synthesis) |
| **Hardware Controller** | ESP32-WROOM-32 (Dual Core 240MHz) |
| **Relay Module** | 4-Channel 5V Optocoupler Isolated Relay |
| **Sensors** | DHT11 (Climate), MQ-2 (Gas/Smoke), INA219 (I2C Power) |
| **Backend (Phase 2)** | Supabase (PostgreSQL, Auth, RLS) |
| **Hosting** | Vercel / Netlify |

---

## 🔌 ESP32 Hardware Pinout Reference

```
+-------------------------------------------------------+
|                 ESP32-WROOM-32 GPIO MAP                |
+-------------------------------------------------------+
|  GPIO 16  -->  Relay Channel 1 (Living Room Light)   |
|  GPIO 17  -->  Relay Channel 2 (Master Ceiling Fan)   |
|  GPIO 18  -->  Relay Channel 3 (Water Booster Motor)  |
|  GPIO 19  -->  Relay Channel 4 (Kitchen Exhaust Fan)  |
|  GPIO 04  -->  DHT11 Temperature & Humidity Data     |
|  GPIO 34  -->  MQ-2 Analog Gas & Smoke (ADC1 Ch 6)   |
|  GPIO 21  -->  INA219 I2C Data (SDA)                 |
|  GPIO 22  -->  INA219 I2C Clock (SCL)                |
|  GPIO 23  -->  Piezo Buzzer (PWM / Active Siren)      |
+-------------------------------------------------------+
```

---

## 💻 Installation & Local Development

### Prerequisites
- Node.js (v18.0.0 or higher)
- npm (v9.0.0 or higher)

### Setup Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/smarthomex-ai.git
   cd smarthomex-ai
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```

4. **Open in browser:**
   Navigate to `http://localhost:5173` (or port specified by Vite).

5. **Build for production:**
   ```bash
   npm run build
   ```

---

## 🌐 Deployment to Vercel

### Option 1: Via Vercel CLI
```bash
npm install -g vercel
vercel
```

### Option 2: Via GitHub / Vercel Web Dashboard
1. Push this repository to GitHub.
2. Sign in to [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import your repository.
4. Framework preset will automatically detect **Vite**.
5. Click **"Deploy"**.

---

## 🔮 Phase 2 Roadmap: Backend & Hardware Integration

1. **Supabase PostgreSQL & Auth:**
   - Add `.env` file with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - Setup Row Level Security (RLS) tables for `devices`, `sensor_telemetry`, and `system_alerts`.
2. **ESP32 Firmware Bridge:**
   - Flash ESP32 with MQTT client firmware (connecting to topics defined in `esp32Service.ts`).
   - Implement local fail-safe FreeRTOS task on Core 0 for immediate MQ-2 threshold trip.
