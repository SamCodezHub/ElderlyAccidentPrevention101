import uuid
import json
import os

CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'device_config.json')

def get_device_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    device_id = f"pi_{uuid.uuid4().hex[:12]}"
    config = {
        "device_id": device_id,
        "device_name": "mmWave Sensor",
        "location": "Monitored Area",
        "app_host": "http://YOUR_PC_IP:3847",
        "sensor_port": "/dev/ttyUSB0",
        "sensor_baud": 115200,
        "velocity_threshold": 0.5,
        "detection_range_m": 5.0,
        "update_rate_hz": 10
    }
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)
    return config