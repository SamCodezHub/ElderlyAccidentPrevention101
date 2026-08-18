import serial
import struct
import math
import time
import threading
import numpy as np
from collections import deque

FRAME_HEADER = b'\x01\x02\x03\x04'
TLV_HEADER_SIZE = 8
MMWAVE_MAGIC = 0x11111111

class mmWaveReader:
    def __init__(self, port='/dev/ttyUSB0', baud=115200):
        self.port = port
        self.baud = baud
        self.serial = None
        self.running = False
        self.point_cloud = []
        self.velocity_history = deque(maxlen=100)
        self.velocity_threshold = 0.5
        self.lock = threading.Lock()

    def connect(self):
        try:
            self.serial = serial.Serial(self.port, self.baud, timeout=1)
            time.sleep(0.5)
            self.serial.reset_input_buffer()
            return True
        except serial.SerialException as e:
            print(f"Sensor connection failed: {e}")
            return False

    def disconnect(self):
        self.running = False
        if self.serial and self.serial.is_open:
            self.serial.close()

    def _read_frame(self):
        buffer = bytearray()
        while self.running:
            byte = self.serial.read(1)
            if not byte:
                continue
            buffer.extend(byte)
            if len(buffer) >= 8:
                idx = buffer.find(FRAME_HEADER)
                if idx == 0:
                    if len(buffer) >= 36:
                        header = struct.unpack('<IIIIIIII', buffer[4:36])
                        total_len = header[2] + 36
                        if len(buffer) >= total_len:
                            frame_data = bytes(buffer[:total_len])
                            buffer = buffer[total_len:]
                            return frame_data
                elif idx > 0:
                    buffer = buffer[idx:]
                elif len(buffer) > 10000:
                    buffer.clear()
        return None

    def _parse_tlv(self, tlv_data):
        points = []
        if len(tlv_data) < TLV_HEADER_SIZE:
            return points

        tlv_type = struct.unpack('<I', tlv_data[0:4])[0]
        tlv_len = struct.unpack('<I', tlv_data[4:8])[0]

        if tlv_type == 6:
            num_points = struct.unpack('<I', tlv_data[8:12])[0]
            offset = 12
            for _ in range(num_points):
                if offset + 16 > len(tlv_data):
                    break
                x, y, z, vel = struct.unpack('<ffff', tlv_data[offset:offset+16])
                doppler = struct.unpack('<h', tlv_data[offset+12:offset+14])[0]
                points.append({
                    'x': round(x, 3),
                    'y': round(y, 3),
                    'z': round(z, 3),
                    'velocity': round(vel, 3),
                    'doppler': doppler
                })
                offset += 16

        elif tlv_type == 1:
            num_targets = struct.unpack('<I', tlv_data[8:12])[0]
            offset = 12
            for _ in range(num_targets):
                if offset + 20 > len(tlv_data):
                    break
                tid, x, y, z, vel = struct.unpack('<Iffff', tlv_data[offset:offset+20])
                points.append({
                    'x': round(x, 3),
                    'y': round(y, 3),
                    'z': round(z, 3),
                    'velocity': round(vel, 3),
                    'doppler': 0,
                    'target_id': tid
                })
                offset += 20

        return points

    def _parse_frame(self, frame_data):
        points = []
        if len(frame_data) < 36:
            return points

        offset = 36
        while offset + TLV_HEADER_SIZE <= len(frame_data):
            tlv_type = struct.unpack('<I', frame_data[offset:offset+4])[0]
            tlv_len = struct.unpack('<I', frame_data[offset+4:offset+8])[0]

            if tlv_len < TLV_HEADER_SIZE or offset + tlv_len > len(frame_data):
                break

            tlv_data = frame_data[offset:offset+tlv_len]
            parsed = self._parse_tlv(tlv_data)
            points.extend(parsed)
            offset += tlv_len

        return points

    def _detect_anomaly(self, points):
        if not points:
            return None

        velocities = [abs(p['velocity']) for p in points]
        avg_vel = np.mean(velocities) if velocities else 0
        max_vel = np.max(velocities) if velocities else 0

        self.velocity_history.append(avg_vel)

        if len(self.velocity_history) >= 10:
            recent = list(self.velocity_history)[-10:]
            baseline = np.mean(recent[:-1])
            std = np.std(recent[:-1]) if len(recent) > 1 else 0.1

            if max_vel > self.velocity_threshold and max_vel > baseline + 3 * max(std, 0.05):
                return {
                    'type': 'velocity_spike',
                    'message': f'High velocity detected: {max_vel:.2f} m/s (threshold: {self.velocity_threshold} m/s)',
                    'velocity': round(max_vel, 3),
                    'threshold': self.velocity_threshold
                }

            if len(self.velocity_history) >= 20:
                long_baseline = np.mean(list(self.velocity_history)[-20:-10])
                short_avg = np.mean(list(self.velocity_history)[-5:])
                if abs(short_avg - long_baseline) > 0.3:
                    return {
                        'type': 'sudden_change',
                        'message': f'Sudden movement change: {short_avg:.2f} m/s (was {long_baseline:.2f} m/s)',
                        'velocity': round(short_avg, 3),
                        'threshold': round(long_baseline + 0.3, 3)
                    }

        return None

    def read_loop(self, callback, interval=0.1):
        self.running = True
        while self.running:
            frame = self._read_frame()
            if frame:
                points = self._parse_frame(frame)
                with self.lock:
                    self.point_cloud = points
                anomaly = self._detect_anomaly(points)
                callback(points, anomaly)
            else:
                time.sleep(interval)

    def get_point_cloud(self):
        with self.lock:
            return list(self.point_cloud)

    def set_threshold(self, threshold):
        self.velocity_threshold = threshold