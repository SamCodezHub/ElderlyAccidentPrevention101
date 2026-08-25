# Elderly Accident Prevention System

An intelligent monitoring and emergency response system for elderly individuals, combining mmWave radar sensors with a real-time dispatcher dashboard. Designed for deployment in Bangalore, India.

## Overview

The system detects falls and anomalous movements using mmWave radar sensors mounted in monitored areas. When an anomaly is detected, a moderator is alerted through a desktop dashboard and can dispatch the nearest healthcare team to the patient's location. The team transports the patient to the nearest hospital, with all movement tracked in real-time on a map using actual road routing.

## Architecture

```
ElderlyAccidentPrevention101/
├── moderator_app/          # Electron desktop application
│   ├── main.js             # Electron main process, IPC handlers
│   ├── preload.js          # Context bridge for renderer
│   ├── login.html          # Moderator login page
│   ├── dashboard.html      # Main dashboard (map, alerts, teams)
│   ├── data/               # Account storage
│   └── package.json
├── pi_backend/             # Raspberry Pi Zero 2W sensor backend
│   ├── server.py           # Sensor data collection & transmission
│   ├── mmwave_reader.py    # mmWave radar serial parser & anomaly detection
│   ├── qr_generator.py     # Device registration QR code generator
│   ├── config.py           # Device configuration management
│   └── requirements.txt
└── README.md
```

## Components

### Moderator Dashboard (Electron App)

A dark-themed desktop application for emergency dispatch operators.

**Features:**

- **Map View** — Leaflet map centered on Bangalore with CartoDB dark tiles. Displays sensor devices, healthcare teams, hospitals, and active alerts with distinct markers and a map legend.
- **Alert Management** — Trigger alerts from sensor devices. Each alert shows in a sidebar list with status badges (Active / Transport / Resolved). Alerts can be classified as false or actual threats.
- **Device Communication** — Call the device at the alert location to confirm the situation. Send pre-filled SMS messages to the device owner.
- **Healthcare Team Dispatch** — 8 healthcare teams patrol along real Bangalore roads (OSRM routing). The nearest available team is identified by distance. Deploy a team to an alert and track their movement in real-time.
- **Hospital Transport** — Automatically selects the nearest hospital from 6 real Bangalore hospital locations. Transport is animated along actual road routes with real-time ETA countdown matching the calculated travel time.
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

### Dashboard

The dashboard operates as a standalone Electron app. Accounts are stored in `moderator_app/data/accounts.json`. All registered accounts have the `moderator` role.

## Technologies

- **Electron** — Desktop application framework
- **Leaflet** — Interactive map with CartoDB dark tiles
- **OSRM** — Open Source Routing Machine for real road route calculations
- **Python** — Sensor backend
- **pyserial** — Serial communication with mmWave radar
- **NumPy** — Statistical anomaly detection
