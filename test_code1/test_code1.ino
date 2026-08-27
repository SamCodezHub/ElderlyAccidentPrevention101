#include <DFRobot_C4001.h>

#define RXD2 18
#define TXD2 17

DFRobot_C4001_UART radar(&Serial2, 9600, RXD2, TXD2);

// System State Machine
enum FallState { IDLE, IMPACT_DETECTED, IMMOBILE_VERIFY, ALERT };
FallState currentState = IDLE;

// Thresholds & Windows
const float SPEED_IMPACT_THRES = 0.7;    // Radial speed spike (m/s)
const float RANGE_DELTA_THRES = 0.45;    // Rapid distance shift (m)
const uint16_t ENERGY_IMPACT_THRES = 20; // Signal energy threshold
const uint32_t IMMOBILE_HOLD_TIME = 3000;// Required immobility duration (ms)

// Tracking Variables
float impactDistance = 0.0;
float prevDistance = 0.0;
uint32_t stateTimer = 0;

void setup() {
  Serial.begin(115200);
  delay(2500);

  Serial2.begin(9600, SERIAL_8N1, RXD2, TXD2);
  
  while (!radar.begin()) {
    Serial.println("[ERROR] C4001 Not Responding!");
    delay(1000);
  }

  radar.setSensorMode(eSpeedMode);
  radar.setDetectionRange(30, 500, 500);
  Serial.println("[SYSTEM ONLINE] Advanced Fall Detection Machine Active.");
}

void loop() {
  uint8_t targetCount = radar.getTargetNumber();

  if (targetCount > 0) {
    float speed = radar.getTargetSpeed();
    float distance = radar.getTargetRange();
    uint16_t energy = radar.getTargetEnergy();
    float deltaR = abs(distance - prevDistance);

    switch (currentState) {
      case IDLE:
        // Trigger condition: Speed surge OR sudden range shift AND significant radar cross-section energy
        if ((speed >= SPEED_IMPACT_THRES || deltaR >= RANGE_DELTA_THRES) && energy >= ENERGY_IMPACT_THRES) {
          currentState = IMPACT_DETECTED;
          impactDistance = distance;
          stateTimer = millis();
          Serial.println("--> IMPACT DETECTED! Verifying floor immobility...");
        }
        break;

      case IMPACT_DETECTED:
        // Transition to immobility check immediately after impact pulse settles
        if (speed < 0.2) {
          currentState = IMMOBILE_VERIFY;
          stateTimer = millis();
        } else if (millis() - stateTimer > 1000) {
          // Sustained movement after impact = False Alarm
          currentState = IDLE;
          Serial.println("--> Cancelled: Sustained motion after trigger.");
        }
        break;

      case IMMOBILE_VERIFY:
        // Reject if person shifts location significantly (walking/recovering)
        if (abs(distance - impactDistance) > 0.25 || speed > 0.25) {
          currentState = IDLE;
          Serial.println("--> Cancelled: Target moved from impact zone.");
        } 
        // Confirm fall if target remains at impact location with near-zero motion for 3 seconds
        else if (millis() - stateTimer >= IMMOBILE_HOLD_TIME) {
          currentState = ALERT;
        }
        break;

      case ALERT:
        // System stays in ALERT until target leaves or recovers motion
        if (speed > 0.35 || abs(distance - impactDistance) > 0.4) {
          currentState = IDLE;
          Serial.println("--> ALERT CLEARED: Target recovered.");
        }
        break;
    }

    prevDistance = distance;

    // Data Telemetry for Visualizer
    Serial.print("Depth_m:"); Serial.print(distance); Serial.print(",");
    Serial.print("Speed_mps:"); Serial.print(speed); Serial.print(",");
    Serial.print("State:"); Serial.print(currentState); Serial.print(",");
    Serial.print("Fall_Alert:"); Serial.println(currentState == ALERT ? 5 : 0);

  } else {
    // Reset machine state when area clears
    currentState = IDLE;
  }

  delay(120); // ~8Hz sampling loop
}