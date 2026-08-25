# Elderly Accident Prevention System

An intelligent monitoring and emergency response system for elderly individuals, combining mmWave radar sensors with real-time caregiver and moderator dashboards. Designed for deployment in Bangalore, India.

## Overview

The system detects falls and anomalous movements using mmWave radar sensors mounted in monitored areas. Caregivers register through a dedicated app, upload a floor plan, and receive AI-placed sensor recommendations. When an anomaly is detected, a moderator is alerted through a dispatcher dashboard and can deploy healthcare teams. Teams follow real Bangalore road routes to reach patients and transport them to the nearest hospital, with all movement tracked live on a map.

## Architecture

```
ElderlyAccidentPrevention101/
├── user_app/                 # Caregiver / family member Electron app
│   ├── main.js               # Electron main process, session management
│   ├── preload.js            # Context bridge (auth, profile, onboarding)
│   ├── auth-store.js         # Authentication, sessions, password hashing
│   ├── sample-plan.js        # Sample floor plan SVG & AI sensor placement
│   ├── login.html            # Caregiver login / registration
│   ├── onboarding.html       # Home setup wizard (senior info, floor plan, sensors)
│   ├── family-dashboard.html # Family monitoring view
│   ├── dashboard.html        # Moderator map dashboard
│   ├── data/                 # User data store
│   └── package.json
├── moderator_app/            # Standalone moderator dispatcher Electron app
│   ├── main.js               # Electron main process, IPC handlers
│   ├── preload.js            # Context bridge for renderer
│   ├── login.html            # Moderator login page
│   ├── dashboard.html        # Map, alerts, team dispatch, transport tracking
│   ├── data/                 # Account storage
│   └── package.json
├── pi_backend/               # Raspberry Pi Zero 2W sensor backend
│   ├── server.py             # Sensor data collection & transmission
│   ├── mmwave_reader.py      # mmWave radar serial parser & anomaly detection
│   ├── qr_generator.py       # Device registration QR code generator
│   ├── config.py             # Device configuration management
│   └── requirements.txt
└── README.md
```

## Components

### Caregiver App (user_app)

A warm, earth-toned Electron desktop application for family members and caregivers.

**Features:**

- **Login & Registration** — Email/phone-based authentication with scrypt password hashing, session tokens, and remember-me support. Demo account available for quick access.
- **Onboarding Wizard** — Multi-step home setup:
  - Senior profile (name, age, medical conditions, mobility level, language)
  - Emergency contacts and physician details
  - Residence information (building type, floor, lockbox details)
  - Floor plan upload with AI-powered sensor placement analysis
- **Floor Plan Analysis** — Upload a floor plan image and receive AI-generated sensor placement recommendations. The system classifies zones by risk level (critical / high / medium / low) and places mmWave sensors optimally.
- **Family Dashboard** — Monitoring view showing senior status, sensor health, hardware state (mmWave radar, smart lock), and notification preferences.
- **Smart Lock Integration** — Rotating OTP generation for smart lock access with configurable rotation intervals.
- **Moderator Routing** — Automatically routes moderator-role users to the map dashboard.
- **Demo Mode** — Pre-seeded demo account with a complete 2BHK floor plan, 5 placed sensors, and populated senior profile.

**Demo Credentials:**

| Field | Value |
|---|---|
| Email | `rehan.khan@eldercare.app` |
| Password | `rehan@402` |

### Moderator Dashboard (moderator_app)

A dark-themed standalone Electron desktop application for emergency dispatch operators.

**Features:**

- **Map View** — Leaflet map centered on Bangalore with CartoDB dark tiles. Displays sensor devices, healthcare teams, hospitals, and active alerts with distinct markers and a map legend.
- **Alert Management** — Trigger alerts from sensor devices. Each alert shows in a sidebar list with status badges (Active / Transport / Resolved). Alerts can be classified as false or actual threats.
- **Device Communication** — Call the device at the alert location to confirm the situation. Send pre-filled SMS messages to the device owner.
- **Healthcare Team Dispatch** — 8 healthcare teams patrol along real Bangalore roads (OSRM routing). The nearest available team is identified by distance. Deploy a team to an alert and track their movement in real-time.
- **Hospital Transport** — Automatically selects the nearest hospital from 6 real Bangalore hospital locations. Transport is animated along actual road routes with real-time ETA countdown matching the calculated travel time (1 second of animation per 1 minute of ETA).
- **Live Feed** — Timestamped feed messages showing team status, traffic updates, and hospital handoff events during active transports.

**Color Scheme:**

| Element | Color |
|---|---|
| Sensor devices | Purple `#6c5ce7` |
| Active alerts | Coral `#fd79a8` |
| Healthcare teams | Blue `#0984e3` |
| Deployed teams | Gold `#fdcb6e` |
| Hospitals | Orange `#e17055` |
| Success actions | Teal `#00cec9` |

### Pi Backend (Sensor Node)

A Python backend designed to run on a Raspberry Pi Zero 2W connected to a TI mmWave radar sensor (e.g., AWR1642).

**Features:**

- **mmWave Data Parsing** — Reads serial data from the radar sensor, parsing TLV frames into 3D point clouds (x, y, z, velocity, doppler).
- **Anomaly Detection** — Two detection algorithms:
  - *Velocity Spike* — Flags points exceeding a configurable velocity threshold that also deviate significantly from the recent baseline.
  - *Sudden Change* — Detects abrupt shifts in average movement speed by comparing short-term and long-term velocity windows.
- **Data Transmission** — Sends point cloud data and detected anomalies to the moderator dashboard via HTTP POST.
- **Demo Mode** — Generates simulated point cloud data with periodic anomalies for testing without hardware.
- **QR Registration** — Generates a QR code containing device configuration for easy registration through the dashboard.

**Sensor Configuration:**

| Parameter | Default |
|---|---|
| Serial Port | `/dev/ttyUSB0` |
| Baud Rate | 115200 |
| Velocity Threshold | 0.5 m/s |
| Detection Range | 5.0 m |
| Update Rate | 10 Hz |

## Setup

### Prerequisites

- **Node.js** (v18+) and npm
- **Python 3.8+** (for pi_backend)
- **TI mmWave radar sensor** (optional, for real hardware)

### Caregiver App

```bash
cd user_app
npm install
npm start
```

### Moderator Dashboard

```bash
cd moderator_app
npm install
npm start
```

### Pi Backend

```bash
cd pi_backend
pip install -r requirements.txt
python server.py
```

Choose mode when prompted:
1. **Real sensor** — Connects to mmWave hardware over serial
2. **Demo mode** — Simulated data for testing
3. **QR code** — Generate device registration QR code

## Configuration

### Pi Backend

Edit `pi_backend/config.py` or let it auto-generate `device_config.json` on first run. Key settings:

- `app_host` — URL of the moderator dashboard backend (e.g., `http://192.168.1.100:3847`)
- `device_id` — Unique identifier auto-generated as `pi_<hex>`
- `velocity_threshold` — Minimum velocity (m/s) to flag as potential anomaly

### Caregiver App

User data is stored in `user_app/data/auth-db.json`. Legacy accounts from `moderator_app/data/accounts.json` are auto-migrated on first launch via the migration function in `auth-store.js`. Sessions use scrypt password hashing and crypto-based token generation.

### Moderator Dashboard

Accounts are stored in `moderator_app/data/accounts.json`. All registered accounts have the `moderator` role.

## Technologies

- **Electron** — Desktop application framework (both apps)
- **Leaflet** — Interactive map with CartoDB dark tiles
- **OSRM** — Open Source Routing Machine for real road route calculations
- **Node.js crypto** — scrypt password hashing, session tokens, OTP generation
- **Python** — Sensor backend
- **pyserial** — Serial communication with mmWave radar
- **NumPy** — Statistical anomaly detection
- **SVG** — Floor plan rendering and sensor overlay visualization
