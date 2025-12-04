# NodeMCU Base Station Integration Guide

This document describes how to integrate NodeMCU (ESP8266) base stations with the MineCheck backend API. The base station acts as a gateway between the LoRa mesh network (field units) and the web application.

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Authentication](#authentication)
4. [Polling Workflow](#polling-workflow)
5. [API Endpoints](#api-endpoints)
6. [Data Structures](#data-structures)
7. [Example Workflows](#example-workflows)
8. [Error Handling](#error-handling)
9. [Best Practices](#best-practices)

---

## Overview

The NodeMCU base station performs three core functions:

1. **Polling** - Regularly checks the server for pending commands to execute
2. **Telemetry Relay** - Forwards LoRa messages from field units to the server
3. **Command Acknowledgment** - Confirms successful/failed command execution

**Key Characteristics:**
- No authentication required for gateway endpoints (device identified by `boardId`)
- Rate limit: 120 requests per minute (2 per second) on `/api/gateway/*` endpoints
- Stateless design - base station doesn't need to maintain session state
- Auto-discovery of field units - new devices automatically registered when they send telemetry

---

## System Architecture

```
┌─────────────────┐
│   Web UI        │
│  (React App)    │
└────────┬────────┘
         │ HTTPS
         │
┌────────▼────────┐
│  REST API       │
│  (Node/Express) │
│  PostgreSQL DB  │
└────────┬────────┘
         │ HTTP
         │ (Gateway Endpoints)
         │
┌────────▼────────┐
│  NodeMCU        │
│  Base Station   │
│  (ESP8266)      │
└────────┬────────┘
         │ LoRa (433/868/915 MHz)
         │
┌────────▼────────┐
│  Field Units    │
│  (ATmega-8)     │
└─────────────────┘
```

---

## Authentication

### Security Overview

**All gateway API requests must be authenticated using HMAC-SHA256 signatures.** This prevents unauthorized devices from:
- Spamming the network with fake telemetry
- Retrieving commands meant for legitimate devices
- Injecting malicious commands into the system

### Device Identification & Secrets

Each device is identified by:
1. **12-digit `boardId`** (e.g., `"123456789012"`) - Public identifier
2. **Device Secret** (64-character hex string) - Private cryptographic key

The device secret is:
- Generated server-side during device provisioning
- Stored securely in the device firmware (never transmitted)
- Used to create HMAC signatures for all API requests
- Cannot be recovered if lost (device must be re-provisioned)

### HMAC Signature Protocol

Every gateway request must include two HTTP headers:

#### Required Headers

| Header | Format | Description |
|--------|--------|-------------|
| `X-Device-Timestamp` | ISO 8601 or Unix timestamp | Current time when request was created |
| `X-Device-Signature` | 64-char hex string | HMAC-SHA256 signature of the canonical message |

#### Canonical Message Format

The signature is computed over a canonical message string:
```
boardId|timestamp|method|payload
```

Where:
- `boardId`: 12-digit device identifier
- `timestamp`: Value from `X-Device-Timestamp` header
- `method`: API method name (`"poll"`, `"telemetry"`, or `"ack"`)
- `payload`: JSON stringified request body (for POST requests), omitted for GET requests

#### Example Signature Calculation (NodeMCU/C++)

```cpp
#include <Crypto.h>
#include <SHA256.h>

// Your device credentials (provisioned once)
const char* BOARD_ID = "123456789012";
const char* DEVICE_SECRET = "a1b2c3d4e5f6..."; // 64 hex chars

String computeHMAC(String message) {
  // Convert hex secret to bytes
  uint8_t secretBytes[32];
  hexStringToBytes(DEVICE_SECRET, secretBytes, 32);
  
  // Compute HMAC-SHA256
  SHA256 sha256;
  uint8_t hmac[32];
  sha256.resetHMAC(secretBytes, 32);
  sha256.update((uint8_t*)message.c_str(), message.length());
  sha256.finalizeHMAC(secretBytes, 32, hmac, 32);
  
  // Convert to hex string
  return bytesToHexString(hmac, 32);
}

String signRequest(String method, String payload = "") {
  // Get current timestamp (Unix seconds)
  unsigned long timestamp = getUnixTime(); // NTP sync required
  
  // Build canonical message
  String canonical = String(BOARD_ID) + "|" + String(timestamp) + "|" + method;
  if (payload.length() > 0) {
    canonical += "|" + payload;
  }
  
  // Compute signature
  return computeHMAC(canonical);
}
```

#### Anti-Replay Protection

To prevent replay attacks:
- Timestamps must be within **±60 seconds** of server time (accounts for clock skew)
- Messages older than **5 minutes** are rejected
- **NTP synchronization required** on all NodeMCU devices

### Device Provisioning Process

**Step 1: Register Device (via Web UI)**
1. Network owner logs into web app
2. Navigates to device management
3. Adds new base station with `boardId`
4. Device is created with status `OFFLINE` (no secret yet)

**Step 2: Provision Secret (Server-Side)**
```bash
cd backend
npm run security:provision
```
This generates secrets for all devices and outputs:
```json
[
  {
    "boardId": "123456789012",
    "secret": "a1b2c3d4e5f6789..." 
  }
]
```

**Step 3: Program Device**
1. Copy the secret for your device
2. Flash firmware with `DEVICE_SECRET` constant set
3. **Securely delete** the secrets file
4. Device can now authenticate with the API

**Database Schema:**
```sql
INSERT INTO "Device" (
  id, 
  boardId, 
  deviceType, 
  networkId, 
  status,
  deviceSecret
) VALUES (
  'cuid...', 
  '123456789012', 
  'BASE_STATION', 
  'network-id', 
  'OFFLINE',
  'a1b2c3d4e5f6789...' -- 64 hex chars
);
```

---

## Polling Workflow

### High-Level Flow

```
┌─────────────┐
│ NodeMCU     │
│ Boot/Wake   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│ Connect to WiFi         │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Poll for commands       │
│ GET /api/gateway/poll   │
│ ?boardId=123456789012   │
└──────┬──────────────────┘
       │
       ├─── 204 No Content ───────┐
       │                          │
       ├─── 200 OK ───────────┐   │
       │   (command JSON)      │   │
       │                       │   │
       ▼                       ▼   ▼
┌─────────────────┐   ┌────────────────┐
│ Transmit via    │   │ Wait for next  │
│ LoRa to target  │   │ poll interval  │
└──────┬──────────┘   └────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Receive ACK/NACK from   │
│ field unit (or timeout) │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ POST /api/gateway/ack   │
│ {commandId, success}    │
└─────────────────────────┘
```

### Polling Frequency

**Recommended:** 1-5 seconds per poll

- Faster polling = lower command latency, but higher power/bandwidth usage
- Server allows 120 polls/minute (2/sec max)
- For battery-powered operation: 10-30 second intervals acceptable
- Critical safety applications: 1-2 second intervals

### Status Updates

Every successful poll updates the base station's:
- `lastPolled` timestamp (current time)
- `lastSeen` timestamp (current time)
- `status` (set to `ONLINE`)

If base station doesn't poll for >60 seconds, consider it offline (frontend logic).

---

## API Endpoints

### 1. Poll for Commands

**Endpoint:** `GET /api/gateway/poll`

**Description:** Check if there are pending commands for this base station's network.

**Query Parameters:**
| Parameter | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| `boardId` | string | ✅       | 12-digit base station identifier     |

**Required Headers:**
| Header | Type   | Required | Description                          |
|--------|--------|----------|--------------------------------------|
| `X-Device-Timestamp` | string/number | ✅ | Unix timestamp (seconds) or ISO 8601 |
| `X-Device-Signature` | string | ✅ | HMAC-SHA256 signature (64 hex chars) |

**Request Example:**
```http
GET /api/gateway/poll?boardId=123456789012 HTTP/1.1
Host: api.minecheck.com
X-Device-Timestamp: 1702915234
X-Device-Signature: a7f3b2c1d4e5f6789012345678901234567890abcdef1234567890abcdef1234
```

**Signature Calculation:**
```cpp
// Canonical message: boardId|timestamp|method
String canonical = "123456789012|1702915234|poll";
String signature = computeHMAC(DEVICE_SECRET, canonical);
// Result: a7f3b2c1d4e5f6789012345678901234567890abcdef1234567890abcdef1234
```

**Success Response (Command Available):**

**HTTP 200 OK**
```json
{
  "commandId": "clx1a2b3c4d5e6f7g8h9",
  "targetBoardId": "987654321098",
  "messageType": "MSG_TYPE_IGNITE",
  "messageId": "A7F3K",
  "payload": {
    "channel": 1,
    "duration": 500
  }
}
```

**Success Response (No Commands):**

**HTTP 204 No Content**
```
(Empty response body)
```

**Error Responses:**

| Status | Meaning                                    |
|--------|--------------------------------------------|
| 400    | Invalid `boardId` format                   |
| 401    | Missing/invalid signature or timestamp     |
| 403    | Device not provisioned (no secret)         |
| 404    | Base station not registered in database    |
| 429    | Rate limit exceeded (>120 polls/minute)    |
| 500    | Server error                               |

**NodeMCU Implementation:**
```cpp
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Crypto.h>
#include <SHA256.h>
#include <NTPClient.h>

WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org");

String pollForCommands() {
  HTTPClient http;
  WiFiClient client;
  
  // Get current timestamp
  unsigned long timestamp = timeClient.getEpochTime();
  
  // Build canonical message: boardId|timestamp|method
  String canonical = String(BOARD_ID) + "|" + String(timestamp) + "|poll";
  
  // Compute signature
  String signature = computeHMAC(DEVICE_SECRET, canonical);
  
  // Make request with authentication headers
  String url = "http://api.minecheck.com/api/gateway/poll?boardId=" + String(BOARD_ID);
  
  http.begin(client, url);
  http.addHeader("X-Device-Timestamp", String(timestamp));
  http.addHeader("X-Device-Signature", signature);
  
  int httpCode = http.GET();
  
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    http.end();
    return payload; // Parse JSON and execute command
  } else if (httpCode == HTTP_CODE_NO_CONTENT) {
    http.end();
    return ""; // No commands pending
  } else if (httpCode == 401 || httpCode == 403) {
    Serial.printf("Authentication error: %d - Check device secret\n", httpCode);
    http.end();
    return "";
  } else {
    Serial.printf("Poll error: %d\n", httpCode);
    http.end();
    return "";
  }
}
```

---

### 2. Submit Telemetry

**Endpoint:** `POST /api/gateway/telemetry`

**Description:** Forward LoRa telemetry data from field units to the server.

**Required Headers:**
| Header | Type   | Required | Description                          |
|--------|--------|----------|--------------------------------------|
| `X-Device-Timestamp` | string/number | ✅ | Unix timestamp (seconds) or ISO 8601 |
| `X-Device-Signature` | string | ✅ | HMAC-SHA256 signature (64 hex chars) |
| `Content-Type` | string | ✅ | Must be `application/json` |

**Request Body:**
```json
{
  "boardId": "987654321098",
  "messageType": "MSG_TYPE_GPS",
  "messageId": "B2K9X",
  "latitude": 48.915565,
  "longitude": 37.809191,
  "altitude": 245.5,
  "batteryVoltage": 3.87,
  "rssi": -85,
  "snr": 7.5,
  "data": {
    "satellites": 8,
    "hdop": 1.2
  }
}
```

**Field Descriptions:**

| Field            | Type   | Required | Description                                           |
|------------------|--------|----------|-------------------------------------------------------|
| `boardId`        | string | ✅       | 12-digit ID of the **field unit** (not base station)  |
| `messageType`    | enum   | ✅       | See [Message Types](#message-types)                   |
| `messageId`      | string | ❌       | 5-character identifier from firmware                  |
| `latitude`       | number | ❌       | GPS latitude (decimal degrees)                        |
| `longitude`      | number | ❌       | GPS longitude (decimal degrees)                       |
| `altitude`       | number | ❌       | GPS altitude (meters)                                 |
| `batteryVoltage` | number | ❌       | Battery voltage (volts)                               |
| `rssi`           | number | ❌       | Received Signal Strength Indicator (dBm)              |
| `snr`            | number | ❌       | Signal-to-Noise Ratio (dB)                            |
| `data`           | object | ❌       | Additional telemetry data (flexible JSON)             |

**Response:**

**HTTP 201 Created**
```json
{
  "success": true,
  "deviceId": "clx9z8y7x6w5v4u3t2s1"
}
```

**Auto-Discovery:**
- If `boardId` doesn't exist in database, a new field unit is automatically created
- Status set to `DISCOVERED`
- Associated with the base station's network
- Coordinates and battery data are stored

**Battery Percentage Calculation:**
- Min voltage: 3.0V (0%)
- Max voltage: 4.2V (100%)
- Formula: `((voltage - 3.0) / 1.2) * 100`
- If battery < 20%, status changes to `LOW_BATTERY`

**NodeMCU Implementation:**
```cpp
void forwardTelemetry(String loraMessage) {
  // Parse LoRa message (example format: "ID:987654321098|TYPE:GPS|LAT:48.915|LON:37.809|ALT:245|BAT:3.87|RSSI:-85")
  
  HTTPClient http;
  WiFiClient client;
  
  // Build JSON payload
  String json = "{";
  json += "\"boardId\":\"987654321098\",";
  json += "\"messageType\":\"MSG_TYPE_GPS\",";
  json += "\"latitude\":48.915565,";
  json += "\"longitude\":37.809191,";
  json += "\"altitude\":245.5,";
  json += "\"batteryVoltage\":3.87,";
  json += "\"rssi\":-85";
  json += "}";
  
  // Get current timestamp
  unsigned long timestamp = timeClient.getEpochTime();
  
  // Build canonical message: boardId|timestamp|method|payload
  // NOTE: boardId here is the BASE STATION's ID (sender), not the field unit
  String canonical = String(BOARD_ID) + "|" + String(timestamp) + "|telemetry|" + json;
  
  // Compute signature
  String signature = computeHMAC(DEVICE_SECRET, canonical);
  
  // Make authenticated request
  http.begin(client, "http://api.minecheck.com/api/gateway/telemetry");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Timestamp", String(timestamp));
  http.addHeader("X-Device-Signature", signature);
  
  int httpCode = http.POST(json);
  
  if (httpCode == HTTP_CODE_CREATED) {
    Serial.println("Telemetry sent successfully");
  } else {
    Serial.printf("Telemetry error: %d\n", httpCode);
  }
  
  http.end();
}
```

---

### 3. Acknowledge Command

**Endpoint:** `POST /api/gateway/ack`

**Description:** Confirm whether a command was successfully executed by the field unit.

**Request Body:**
```json
{
  "commandId": "clx1a2b3c4d5e6f7g8h9",
  "success": true,
  "responseData": {
    "actualDuration": 487,
    "timestamp": "2025-01-15T12:34:56Z"
  }
}
```

**Field Descriptions:**

| Field          | Type    | Required | Description                              |
|----------------|---------|----------|------------------------------------------|
| `commandId`    | string  | ✅       | ID from poll response                    |
| `success`      | boolean | ✅       | `true` if executed, `false` if failed    |
| `responseData` | object  | ❌       | Additional response info from field unit |

**Response:**

**HTTP 200 OK**
```json
{
  "success": true
}
```

**Command Status Transitions:**
- `PENDING` → `PROCESSING` (when polled)
- `PROCESSING` → `COMPLETED` (when ack with `success: true`)
- `PROCESSING` → `FAILED` (when ack with `success: false`)

**Timeout Handling:**
- If no ACK received within reasonable timeframe (e.g., 30 seconds), consider command failed
- Server doesn't auto-timeout - NodeMCU should send `success: false` if field unit doesn't respond

**NodeMCU Implementation:**
```cpp
void acknowledgeCommand(String commandId, bool success) {
  HTTPClient http;
  http.begin("http://api.minecheck.com/api/gateway/ack");
  http.addHeader("Content-Type", "application/json");
  
  String json = "{";
  json += "\"commandId\":\"" + commandId + "\",";
  json += "\"success\":" + String(success ? "true" : "false");
  json += "}";
  
  int httpCode = http.POST(json);
  
  if (httpCode == HTTP_CODE_OK) {
    Serial.println("ACK sent successfully");
  } else {
    Serial.printf("ACK error: %d\n", httpCode);
  }
  
  http.end();
}
```

---

## Data Structures

### Message Types

These enums define the types of LoRa messages in the system:

```typescript
enum MessageType {
  MSG_TYPE_POSA   // Presence announcement (field unit broadcasts its existence)
  MSG_TYPE_BATT   // Battery voltage request/response
  MSG_TYPE_GPS    // GPS coordinates request/response
  MSG_TYPE_COORD  // Coordinate data update
  MSG_TYPE_PING   // Ping request (check if alive)
  MSG_TYPE_PONG   // Pong response (I'm alive)
  MSG_TYPE_SET_R  // Set relay state (alternative ignition command)
  MSG_TYPE_RES_ID // Response with device ID
  MSG_TYPE_MSG    // Generic message
  MSG_TYPE_IGNITE // Firework ignition command (CRITICAL priority)
}
```

**Usage Examples:**

- **Field Unit Boot:** Send `MSG_TYPE_POSA` to announce presence
- **Diagnostics:** Web UI sends `MSG_TYPE_PING`, field unit responds with `MSG_TYPE_PONG`
- **Battery Check:** Web UI sends `MSG_TYPE_BATT` request, field unit responds with voltage
- **GPS Update:** Field unit sends `MSG_TYPE_GPS` with coordinates
- **Ignition:** Web UI sends `MSG_TYPE_IGNITE` with channel/duration payload

### Device Types

```typescript
enum DeviceType {
  BASE_STATION  // NodeMCU/ESP8266 gateway (polls for commands)
  FIELD_UNIT    // ATmega-8 firework launcher (receives LoRa commands)
}
```

### Device Status

```typescript
enum DeviceStatus {
  ONLINE       // Device recently communicated (last seen < 60s)
  OFFLINE      // No communication for extended period
  DISCOVERED   // Auto-discovered but not yet confirmed/configured
  LOW_BATTERY  // Battery < 20% (field units only)
}
```

### Command Priority

Commands are dispatched in priority order:

```typescript
enum CommandPriority {
  CRITICAL  // IGNITE commands (highest priority)
  HIGH      // Safety-related commands
  NORMAL    // Diagnostic commands (BATT, GPS, PING)
  LOW       // Maintenance commands
}
```

**Polling Logic:**
- Poll endpoint returns **ONE command per request**
- Priority order: `CRITICAL → HIGH → NORMAL → LOW`
- Within same priority: oldest first (FIFO)

---

## Example Workflows

### Workflow 1: Base Station Boot Sequence

```cpp
void setup() {
  Serial.begin(115200);
  
  // 1. Connect to WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
  
  // 2. Initialize LoRa
  LoRa.begin(433E6); // 433 MHz
  LoRa.setSpreadingFactor(7);
  LoRa.setSignalBandwidth(125E3);
  
  // 3. Test server connectivity
  HTTPClient http;
  http.begin("http://api.minecheck.com/health");
  int httpCode = http.GET();
  if (httpCode == 200) {
    Serial.println("Server reachable");
  }
  http.end();
  
  // 4. Start polling timer (every 2 seconds)
  ticker.attach(2.0, pollTimerCallback);
}
```

---

### Workflow 2: Ignition Command Execution

```
User Action (Web UI):
  → User clicks "Ignite Channel 3" button

Backend Processing:
  1. Verify user has OWNER or COMMANDER permission
  2. Find online base station in network
  3. Create command with priority=CRITICAL, type=MSG_TYPE_IGNITE
  4. Store in database with status=PENDING

Base Station Polling:
  5. NodeMCU polls GET /api/gateway/poll?boardId=123456789012
  6. Server responds with:
     {
       "commandId": "cmd_abc123",
       "targetBoardId": "987654321098",
       "messageType": "MSG_TYPE_IGNITE",
       "messageId": "X4R2P",
       "payload": {"channel": 3, "duration": 500}
     }
  7. Server updates command status=PROCESSING, dispatchedAt=now

LoRa Transmission:
  8. NodeMCU formats LoRa packet:
     "ID:987654321098|CMD:IGNITE|CH:3|DUR:500|MID:X4R2P"
  9. Transmit via LoRa at 433 MHz
  10. Wait for ACK from field unit (timeout: 10 seconds)

Field Unit Execution:
  11. Field unit receives packet
  12. Validates message ID and target ID
  13. Activates relay on channel 3 for 500ms
  14. Sends LoRa ACK: "ACK:X4R2P|SUCCESS:1"

Base Station ACK to Server:
  15. NodeMCU receives LoRa ACK
  16. POST /api/gateway/ack with:
      {"commandId": "cmd_abc123", "success": true}
  17. Server updates command status=COMPLETED, completedAt=now

Web UI Update:
  18. Frontend polls GET /api/commands/network/{networkId}
  19. Displays "✓ Ignite Channel 3 - Completed"
```

**Timing:**
- User click → Server processing: <100ms
- Command in queue → Polled by base station: 0-5 seconds (depends on poll interval)
- LoRa transmission + execution + ACK: 1-3 seconds
- **Total latency: 1-8 seconds**

---

### Workflow 3: Auto-Discovery of Field Unit

```
Field Unit Boot:
  1. Field unit powers on
  2. GPS gets fix: lat=48.915, lon=37.809
  3. Broadcasts LoRa message:
     "ID:999888777666|TYPE:POSA|LAT:48.915|LON:37.809|BAT:4.1"

Base Station Relay:
  4. NodeMCU receives LoRa broadcast
  5. POST /api/gateway/telemetry with:
     {
       "boardId": "999888777666",
       "messageType": "MSG_TYPE_POSA",
       "latitude": 48.915,
       "longitude": 37.809,
       "batteryVoltage": 4.1
     }

Server Auto-Discovery:
  6. Server checks if boardId=999888777666 exists
  7. Not found → Create new device:
     - deviceType: FIELD_UNIT
     - status: DISCOVERED
     - networkId: (same as base station)
  8. Response: {"success": true, "deviceId": "clx_new_device"}

Web UI Notification:
  9. Dashboard shows new device with "DISCOVERED" badge
  10. Network owner can rename/confirm device
```

---

### Workflow 4: Battery Monitoring

```cpp
void loop() {
  // Check for incoming LoRa messages
  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    String message = "";
    while (LoRa.available()) {
      message += (char)LoRa.read();
    }
    
    // Parse: "ID:987654321098|TYPE:BATT|VOLTAGE:3.45|RSSI:-78"
    String boardId = extractField(message, "ID");
    String type = extractField(message, "TYPE");
    float voltage = extractField(message, "VOLTAGE").toFloat();
    int rssi = LoRa.packetRssi();
    int snr = LoRa.packetSnr();
    
    // Forward to server
    HTTPClient http;
    http.begin("http://api.minecheck.com/api/gateway/telemetry");
    http.addHeader("Content-Type", "application/json");
    
    String json = "{";
    json += "\"boardId\":\"" + boardId + "\",";
    json += "\"messageType\":\"MSG_TYPE_BATT\",";
    json += "\"batteryVoltage\":" + String(voltage) + ",";
    json += "\"rssi\":" + String(rssi) + ",";
    json += "\"snr\":" + String(snr);
    json += "}";
    
    http.POST(json);
    http.end();
  }
  
  delay(10);
}
```

**Server-side battery logic:**
- If voltage < 3.0V → 0%
- If voltage > 4.2V → 100%
- If percentage < 20% → Status changes to `LOW_BATTERY`
- Web UI shows red battery icon

---

## Error Handling

### Common Error Scenarios

#### 1. Base Station Not Registered

**Symptom:** `404 Not Found` on poll

**Solution:**
```cpp
if (httpCode == 404) {
  Serial.println("ERROR: Base station not registered");
  Serial.println("Please register boardId in web UI first");
  // Flash LED or send alert
  // Retry after 60 seconds
  delay(60000);
}
```

#### 2. WiFi Connection Lost

**Symptom:** HTTP request timeout or connection refused

**Solution:**
```cpp
void checkWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected, reconnecting...");
    WiFi.reconnect();
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
      delay(500);
      attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("WiFi reconnected");
    } else {
      Serial.println("WiFi reconnection failed");
      ESP.restart(); // Reboot as last resort
    }
  }
}
```

#### 3. Rate Limit Exceeded

**Symptom:** `429 Too Many Requests`

**Solution:**
```cpp
if (httpCode == 429) {
  Serial.println("Rate limit exceeded, slowing down polls");
  pollInterval = 5000; // Increase from 2s to 5s
}
```

#### 4. LoRa Transmission Failure

**Symptom:** No ACK from field unit after sending command

**Solution:**
```cpp
bool sendCommandViaLoRa(String targetBoardId, String messageType, String payload) {
  String loraPacket = "ID:" + targetBoardId + "|CMD:" + messageType + "|" + payload;
  
  // Send command
  LoRa.beginPacket();
  LoRa.print(loraPacket);
  LoRa.endPacket();
  
  // Wait for ACK (timeout: 10 seconds)
  unsigned long startTime = millis();
  while (millis() - startTime < 10000) {
    int packetSize = LoRa.parsePacket();
    if (packetSize) {
      String response = "";
      while (LoRa.available()) {
        response += (char)LoRa.read();
      }
      
      if (response.indexOf("ACK") >= 0) {
        return true; // Success
      }
    }
    delay(100);
  }
  
  return false; // Timeout - no ACK received
}
```

#### 5. Malformed JSON Response

**Symptom:** JSON parsing error

**Solution:**
```cpp
#include <ArduinoJson.h>

void parseCommandResponse(String json) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, json);
  
  if (error) {
    Serial.print("JSON parse error: ");
    Serial.println(error.c_str());
    Serial.println("Raw response: " + json);
    return;
  }
  
  String commandId = doc["commandId"];
  String targetBoardId = doc["targetBoardId"];
  String messageType = doc["messageType"];
  
  // ... process command
}
```

---

## Best Practices

### 1. Polling Strategy

✅ **Do:**
- Use consistent poll intervals (1-5 seconds recommended)
- Check WiFi status before each poll
- Handle 204 No Content gracefully (no commands pending)
- Implement exponential backoff on repeated errors

❌ **Don't:**
- Poll faster than 500ms (unnecessary server load)
- Skip error handling on network failures
- Ignore rate limit responses

### 2. Power Management

For battery-powered base stations:

```cpp
void deepSleepCycle() {
  // 1. Poll for commands
  String command = pollForCommands();
  
  // 2. If command received, execute
  if (command.length() > 0) {
    executeCommand(command);
  }
  
  // 3. Check for LoRa telemetry (10 second window)
  unsigned long startTime = millis();
  while (millis() - startTime < 10000) {
    checkLoRaMessages();
    delay(100);
  }
  
  // 4. Deep sleep for 20 seconds
  ESP.deepSleep(20e6); // 20 seconds in microseconds
  
  // Device wakes up and restarts loop
}
```

### 3. Message Buffering

Handle bursts of telemetry:

```cpp
#define MAX_BUFFER_SIZE 10
String telemetryBuffer[MAX_BUFFER_SIZE];
int bufferIndex = 0;

void bufferTelemetry(String message) {
  if (bufferIndex < MAX_BUFFER_SIZE) {
    telemetryBuffer[bufferIndex++] = message;
  }
}

void flushTelemetryBuffer() {
  for (int i = 0; i < bufferIndex; i++) {
    forwardTelemetry(telemetryBuffer[i]);
    delay(100); // Avoid rate limiting
  }
  bufferIndex = 0;
}
```

### 4. Watchdog Timer

Prevent hangs:

```cpp
#include <Ticker.h>

Ticker watchdog;

void watchdogReset() {
  ESP.restart();
}

void setup() {
  // Reset after 60 seconds of no activity
  watchdog.attach(60, watchdogReset);
}

void loop() {
  // Perform operations
  pollForCommands();
  checkLoRaMessages();
  
  // Pet the watchdog
  watchdog.detach();
  watchdog.attach(60, watchdogReset);
}
```

### 5. Logging and Debugging

Implement structured logging:

```cpp
enum LogLevel { DEBUG, INFO, WARN, ERROR };

void log(LogLevel level, String message) {
  String prefix;
  switch (level) {
    case DEBUG: prefix = "[DEBUG]"; break;
    case INFO:  prefix = "[INFO] "; break;
    case WARN:  prefix = "[WARN] "; break;
    case ERROR: prefix = "[ERROR]"; break;
  }
  
  Serial.print(prefix);
  Serial.print(" ");
  Serial.print(millis());
  Serial.print("ms - ");
  Serial.println(message);
}

// Usage:
log(INFO, "Polling server...");
log(ERROR, "WiFi connection failed");
```

### 6. Command Retries

For critical commands:

```cpp
bool executeCommandWithRetry(String commandId, String targetBoardId, String messageType, String payload) {
  int maxRetries = 3;
  int retryCount = 0;
  
  while (retryCount < maxRetries) {
    bool success = sendCommandViaLoRa(targetBoardId, messageType, payload);
    
    if (success) {
      acknowledgeCommand(commandId, true);
      return true;
    }
    
    retryCount++;
    log(WARN, "Command retry " + String(retryCount) + "/" + String(maxRetries));
    delay(2000); // Wait 2 seconds before retry
  }
  
  // All retries failed
  acknowledgeCommand(commandId, false);
  return false;
}
```

### 7. Health Monitoring

Periodic health checks:

```cpp
void sendHealthStatus() {
  // Send telemetry for the base station itself
  HTTPClient http;
  http.begin("http://api.minecheck.com/api/gateway/telemetry");
  http.addHeader("Content-Type", "application/json");
  
  String json = "{";
  json += "\"boardId\":\"" + String(BOARD_ID) + "\",";
  json += "\"messageType\":\"MSG_TYPE_PONG\","; // Heartbeat
  json += "\"data\":{";
  json += "\"freeHeap\":" + String(ESP.getFreeHeap()) + ",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"uptime\":" + String(millis());
  json += "}";
  json += "}";
  
  http.POST(json);
  http.end();
}
```

---

## Production Checklist

Before deploying to production:

- [ ] Base station is registered in database with correct `boardId`
- [ ] Device secret has been provisioned and securely stored in firmware
- [ ] Device secret backup is stored securely offline (not in version control)
- [ ] NTP time synchronization is configured and working
- [ ] HMAC signature implementation is tested and verified
- [ ] WiFi credentials are securely stored (not hardcoded)
- [ ] Server URL is configurable (dev/prod environments)
- [ ] LoRa frequency matches regulatory requirements (433/868/915 MHz)
- [ ] Watchdog timer is enabled
- [ ] Error logging is comprehensive
- [ ] Rate limiting is respected
- [ ] Command ACKs are always sent (success or failure)
- [ ] Power consumption is optimized for battery operation (if applicable)
- [ ] Firmware version is logged and sent to server
- [ ] OTA (Over-The-Air) update mechanism is implemented
- [ ] Secure boot is enabled (ESP8266 flash encryption recommended)
- [ ] Device secret is stored in protected flash memory region

---

## Appendix: Complete NodeMCU Example with Security

### Full Implementation with HMAC Authentication

```cpp
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>
#include <LoRa.h>
#include <Ticker.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <Crypto.h>
#include <SHA256.h>

// Configuration
#define BOARD_ID "123456789012"
#define DEVICE_SECRET "0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff" // EXAMPLE - Use real secret from provisioning
#define WIFI_SSID "YourSSID"
#define WIFI_PASSWORD "YourPassword"
#define API_URL "http://api.minecheck.com"
#define POLL_INTERVAL 2000 // 2 seconds

// LoRa pins (NodeMCU)
#define LORA_CS    15
#define LORA_RST   16
#define LORA_DIO0  4

// Global objects
WiFiClient wifiClient;
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000); // Update every 60s
Ticker pollTicker;
bool shouldPoll = false;

//=============================================================================
// SECURITY FUNCTIONS
//=============================================================================

// Convert hex string to byte array
void hexStringToBytes(const char* hexStr, uint8_t* bytes, size_t len) {
  for (size_t i = 0; i < len; i++) {
    sscanf(hexStr + 2*i, "%2hhx", &bytes[i]);
  }
}

// Convert byte array to hex string
String bytesToHexString(const uint8_t* bytes, size_t len) {
  String result = "";
  for (size_t i = 0; i < len; i++) {
    if (bytes[i] < 16) result += "0";
    result += String(bytes[i], HEX);
  }
  return result;
}

// Compute HMAC-SHA256 signature
String computeHMAC(const char* secret, const String& message) {
  // Convert hex secret to bytes
  uint8_t secretBytes[32];
  hexStringToBytes(secret, secretBytes, 32);
  
  // Compute HMAC-SHA256
  SHA256 sha256;
  uint8_t hmac[32];
  
  sha256.resetHMAC(secretBytes, 32);
  sha256.update((uint8_t*)message.c_str(), message.length());
  sha256.finalizeHMAC(secretBytes, 32, hmac, 32);
  
  return bytesToHexString(hmac, 32);
}

// Build canonical message for signing
String buildCanonicalMessage(const String& method, const String& payload = "") {
  unsigned long timestamp = timeClient.getEpochTime();
  
  String canonical = String(BOARD_ID) + "|" + String(timestamp) + "|" + method;
  
  if (payload.length() > 0) {
    canonical += "|" + payload;
  }
  
  return canonical;
}

//=============================================================================
// SETUP & LOOP
//=============================================================================

void setup() {
  Serial.begin(115200);
  Serial.println("\n\nMineCheck Base Station Starting...");
  
  // Connect WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected: " + WiFi.localIP().toString());
  
  // Initialize NTP client
  timeClient.begin();
  timeClient.update();
  Serial.println("NTP synchronized: " + timeClient.getFormattedTime());
  
  // Initialize LoRa
  LoRa.setPins(LORA_CS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(433E6)) {
    Serial.println("LoRa init failed!");
    while (1);
  }
  Serial.println("LoRa initialized");
  
  // Start polling timer
  pollTicker.attach_ms(POLL_INTERVAL, []() { shouldPoll = true; });
  
  Serial.println("=== READY ===");
}

void loop() {
  // Update NTP time
  timeClient.update();
  
  // Check WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost, reconnecting...");
    WiFi.reconnect();
    delay(5000);
    return;
  }
  
  // Poll server for commands
  if (shouldPoll) {
    shouldPoll = false;
    pollForCommands();
  }
  
  // Check for incoming LoRa telemetry
  checkLoRaMessages();
  
  delay(10);
}

//=============================================================================
// API FUNCTIONS
//=============================================================================

void pollForCommands() {
  HTTPClient http;
  
  // Build request URL
  String url = String(API_URL) + "/api/gateway/poll?boardId=" + String(BOARD_ID);
  
  // Build canonical message and compute signature
  unsigned long timestamp = timeClient.getEpochTime();
  String canonical = String(BOARD_ID) + "|" + String(timestamp) + "|poll";
  String signature = computeHMAC(DEVICE_SECRET, canonical);
  
  // Make authenticated request
  http.begin(wifiClient, url);
  http.addHeader("X-Device-Timestamp", String(timestamp));
  http.addHeader("X-Device-Signature", signature);
  
  int httpCode = http.GET();
  
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    http.end();
    processCommand(payload);
  } else if (httpCode == HTTP_CODE_NO_CONTENT) {
    // No commands pending - this is normal
    http.end();
  } else if (httpCode == 401 || httpCode == 403) {
    Serial.printf("❌ Authentication error: %d\n", httpCode);
    Serial.println("   Check DEVICE_SECRET and NTP sync");
    http.end();
  } else {
    Serial.printf("Poll error: %d\n", httpCode);
    http.end();
  }
}

void processCommand(String jsonStr) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, jsonStr);
  
  if (error) {
    Serial.println("JSON parse error");
    return;
  }
  
  String commandId = doc["commandId"];
  String targetBoardId = doc["targetBoardId"];
  String messageType = doc["messageType"];
  
  Serial.println("📥 Command: " + messageType + " for " + targetBoardId);
  
  // Send via LoRa
  LoRa.beginPacket();
  LoRa.print("ID:" + targetBoardId + "|CMD:" + messageType);
  LoRa.endPacket();
  
  // Wait for ACK (simplified - production should have proper timeout)
  delay(5000);
  
  // ACK to server
  acknowledgeCommand(commandId, true);
}

void acknowledgeCommand(String commandId, bool success) {
  HTTPClient http;
  
  // Build JSON payload
  String json = "{\"commandId\":\"" + commandId + "\",\"success\":" + (success ? "true" : "false") + "}";
  
  // Build canonical message and compute signature
  unsigned long timestamp = timeClient.getEpochTime();
  String canonical = String(BOARD_ID) + "|" + String(timestamp) + "|ack|" + json;
  String signature = computeHMAC(DEVICE_SECRET, canonical);
  
  // Make authenticated request
  String url = String(API_URL) + "/api/gateway/ack";
  http.begin(wifiClient, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Timestamp", String(timestamp));
  http.addHeader("X-Device-Signature", signature);
  
  int httpCode = http.POST(json);
  
  if (httpCode == HTTP_CODE_OK) {
    Serial.println("✅ ACK sent");
  } else {
    Serial.printf("ACK error: %d\n", httpCode);
  }
  
  http.end();
}

void checkLoRaMessages() {
  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    String message = "";
    while (LoRa.available()) {
      message += (char)LoRa.read();
    }
    
    Serial.println("📻 LoRa RX: " + message);
    
    // Parse and forward to server
    // Format: "ID:987654321098|TYPE:GPS|LAT:48.915|LON:37.809|BAT:3.87"
    
    // Build JSON payload (simplified - parse from message in production)
    String json = "{\"boardId\":\"987654321098\",\"messageType\":\"MSG_TYPE_GPS\"}";
    
    // Build canonical message and compute signature
    unsigned long timestamp = timeClient.getEpochTime();
    String canonical = String(BOARD_ID) + "|" + String(timestamp) + "|telemetry|" + json;
    String signature = computeHMAC(DEVICE_SECRET, canonical);
    
    // Make authenticated request
    HTTPClient http;
    String url = String(API_URL) + "/api/gateway/telemetry";
    http.begin(wifiClient, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Timestamp", String(timestamp));
    http.addHeader("X-Device-Signature", signature);
    
    int httpCode = http.POST(json);
    
    if (httpCode == HTTP_CODE_CREATED) {
      Serial.println("✅ Telemetry forwarded");
    } else {
      Serial.printf("Telemetry error: %d\n", httpCode);
    }
    
    http.end();
  }
}
```

### Required Arduino Libraries

Install these libraries via Arduino Library Manager:

- **ESP8266WiFi** (built-in with ESP8266 board package)
- **ESP8266HTTPClient** (built-in)
- **ArduinoJson** by Benoit Blanchon (v6.x)
- **LoRa** by Sandeep Mistry
- **NTPClient** by Fabrice Weinberg
- **Crypto** by Rhys Weatherley (for HMAC-SHA256)

### Security Notes

1. **Never commit DEVICE_SECRET to version control**
2. Store secrets in a separate config file (not included in git)
3. Use ESP8266 flash encryption in production
4. Implement secure OTA updates to rotate secrets if compromised
5. Monitor for authentication failures - could indicate attack attempts

---

## Support

For questions or issues:

- **GitHub Issues:** [minecheck/issues](https://github.com/xalumok/minecheck/issues)
- **Email:** support@minecheck.com
- **Documentation:** [docs.minecheck.com](https://docs.minecheck.com)

**Version:** 2.0 (with HMAC security)
**Last Updated:** 2025-12-04
