import json
import time
import threading
import requests
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from config import get_device_config
from mmwave_reader import mmWaveReader

config = get_device_config()
reader = None

def on_sensor_data(points, anomaly):
    payload = {
        "deviceId": config['device_id'],
        "pointCloud": points[:200],
        "anomaly": anomaly
    }

    try:
        resp = requests.post(
            f"{config['app_host']}/api/data",
            json=payload,
            timeout=3
        )
        if resp.status_code == 200:
            print(f"  Sent {len(points)} points" + (f" | ANOMALY: {anomaly['type']}" if anomaly else ""))
        else:
            print(f"  Server responded: {resp.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"  Connection error: {e}")

def start_sensor():
    global reader

    print("=" * 50)
    print("  Elderly Accident Prevention - mmWave Sensor")
    print("=" * 50)
    print(f"  Device ID:   {config['device_id']}")
    print(f"  Sensor Port: {config['sensor_port']}")
    print(f"  Target:      {config['app_host']}")
    print(f"  Threshold:   {config['velocity_threshold']} m/s")
    print("=" * 50)

    reader = mmWaveReader(
        port=config['sensor_port'],
        baud=config['sensor_baud']
    )
    reader.set_threshold(config['velocity_threshold'])

    if not reader.connect():
        print("\n  Could not connect to sensor.")
        print("  Check wiring and port configuration in config.py")
        print(f"  Current port: {config['sensor_port']}")
        print("\n  Retrying in 5 seconds...")
        time.sleep(5)
        start_sensor()
        return

    print("  Sensor connected. Reading data...\n")
    reader.read_loop(callback=on_sensor_data, interval=0.1)

def run_demo():
    import random
    print("=" * 50)
    print("  Elderly Accident Prevention - DEMO MODE")
    print("=" * 50)
    print(f"  Device ID: {config['device_id']}")
    print(f"  Target:    {config['app_host']}")
    print("=" * 50)
    print("  Generating simulated point cloud data...")
    print("  Press Ctrl+C to stop.\n")

    cycle = 0
    while True:
        points = []
        for _ in range(random.randint(10, 30)):
            x = round(random.uniform(-3, 3), 3)
            y = round(random.uniform(-2, 2), 3)
            z = round(random.uniform(0, 2), 3)
            vel = round(random.gauss(0, 0.1), 3)
            points.append({'x': x, 'y': y, 'z': z, 'velocity': vel, 'doppler': 0})

        anomaly = None
        if cycle % 20 == 15:
            for p in points:
                p['velocity'] = round(random.uniform(1.0, 2.5), 3)
            anomaly = {
                'type': 'velocity_spike',
                'message': f'Simulated high velocity: {points[0]["velocity"]:.2f} m/s',
                'velocity': points[0]['velocity'],
                'threshold': config['velocity_threshold']
            }

        payload = {
            "deviceId": config['device_id'],
            "pointCloud": points,
            "anomaly": anomaly
        }

        try:
            resp = requests.post(
                f"{config['app_host']}/api/data",
                json=payload,
                timeout=3
            )
            status = "ANOMALY" if anomaly else "ok"
            print(f"  [{cycle}] {len(points)} points | {status}")
        except requests.exceptions.RequestException as e:
            print(f"  [{cycle}] Connection error: {e}")

        cycle += 1
        time.sleep(0.5)

if __name__ == '__main__':
    print("\n  Choose mode:")
    print("  [1] Real sensor (connects to mmWave hardware)")
    print("  [2] Demo mode (simulated data for testing)")
    print("  [3] Generate QR code for device registration\n")

    choice = input("  Enter choice (1/2/3): ").strip()

    if choice == '1':
        start_sensor()
    elif choice == '2':
        run_demo()
    elif choice == '3':
        from qr_generator import generate_device_qr
        generate_device_qr()
    else:
        print("  Invalid choice. Running demo mode.")
        run_demo()