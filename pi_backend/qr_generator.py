import json
import subprocess
import sys
import os

def ensure_qrcode():
    try:
        import qrcode
    except ImportError:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'qrcode[pil]'])
        import qrcode

def generate_device_qr():
    config_path = os.path.join(os.path.dirname(__file__), 'device_config.json')
    if not os.path.exists(config_path):
        print("No device config found. Run server.py first.")
        return

    with open(config_path, 'r') as f:
        config = json.load(f)

    qr_data = json.dumps({
        "deviceId": config['device_id'],
        "deviceName": config['device_name'],
        "location": config['location'],
        "appHost": config['app_host']
    })

    ensure_qrcode()
    import qrcode

    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(qr_data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    output_path = os.path.join(os.path.dirname(__file__), 'device_qr.png')
    img.save(output_path)
    print(f"QR code saved to: {output_path}")
    print(f"Scan this QR in the Elderly Accident Prevention app to register the device.")
    print(f"\nDevice ID: {config['device_id']}")
    print(f"Device Name: {config['device_name']}")

if __name__ == '__main__':
    generate_device_qr()