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

### Device Identification

Base stations are identified by a **12-digit `boardId`** (e.g., `"123456789012"`).

- No JWT tokens required for gateway endpoints
- `boardId` is sent as a query parameter or in request body
- Must be exactly 12 characters (ASCII digits)
- Base station must be pre-registered in the database before first use

### Registration Process

**Manual Registration (via Web UI):**
1. Network owner logs into web app
2. Navigates to device management
3. Adds new base station with `boardId`
4. Device is registered with status `OFFLINE`
5. First poll from base station changes status to `ONLINE`

**Database Schema:**
```sql
INSERT INTO "Device" (
  id, 
  boardId, 
  deviceType, 
  networkId, 
  status
) VALUES (
  'cuid...', 
  '123456789012', 
  'BASE_STATION', 
  'network-id', 
  'OFFLINE'
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

**Request Example:**
```http
GET /api/gateway/poll?boardId=123456789012 HTTP/1.1
Host: api.minecheck.com
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
| 404    | Base station not registered in database    |
| 429    | Rate limit exceeded (>120 polls/minute)    |
| 500    | Server error                               |

**NodeMCU Implementation:**
```cpp
String pollForCommands() {
  HTTPClient http;
  String url = "http://api.minecheck.com/api/gateway/poll?boardId=" + BOARD_ID;
  
  http.begin(url);
  int httpCode = http.GET();
  
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    http.end();
    return payload; // Parse JSON and execute command
  } else if (httpCode == HTTP_CODE_NO_CONTENT) {
    http.end();
    return ""; // No commands pending
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
  http.begin("http://api.minecheck.com/api/gateway/telemetry");
  http.addHeader("Content-Type", "application/json");
  
  String json = "{";
  json += "\"boardId\":\"987654321098\",";
  json += "\"messageType\":\"MSG_TYPE_GPS\",";
  json += "\"latitude\":48.915565,";
  json += "\"longitude\":37.809191,";
  json += "\"altitude\":245.5,";
  json += "\"batteryVoltage\":3.87,";
  json += "\"rssi\":-85";
  json += "}";
  
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
- [ ] Secure boot is enabled (if security is critical)

---

## Appendix: Complete NodeMCU Example

```cpp
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>
#include <LoRa.h>
#include <Ticker.h>

// Configuration
#define BOARD_ID "123456789012"
#define WIFI_SSID "YourSSID"
#define WIFI_PASSWORD "YourPassword"
#define API_URL "http://api.minecheck.com"
#define POLL_INTERVAL 2000 // 2 seconds

// LoRa pins (NodeMCU)
#define LORA_CS    15
#define LORA_RST   16
#define LORA_DIO0  4

WiFiClient wifiClient;
Ticker pollTicker;
bool shouldPoll = false;

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
  
  // Initialize LoRa
  LoRa.setPins(LORA_CS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(433E6)) {
    Serial.println("LoRa init failed!");
    while (1);
  }
  Serial.println("LoRa initialized");
  
  // Start polling timer
  pollTicker.attach_ms(POLL_INTERVAL, []() { shouldPoll = true; });
}

void loop() {
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

void pollForCommands() {
  HTTPClient http;
  String url = String(API_URL) + "/api/gateway/poll?boardId=" + BOARD_ID;
  
  http.begin(wifiClient, url);
  int httpCode = http.GET();
  
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    http.end();
    processCommand(payload);
  } else if (httpCode == HTTP_CODE_NO_CONTENT) {
    // No commands pending
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
  
  Serial.println("Command received: " + messageType + " for " + targetBoardId);
  
  // Send via LoRa
  LoRa.beginPacket();
  LoRa.print("ID:" + targetBoardId + "|CMD:" + messageType);
  LoRa.endPacket();
  
  // Wait for ACK (simplified - production should have timeout)
  delay(5000);
  
  // ACK to server (assuming success for demo)
  acknowledgeCommand(commandId, true);
}

void acknowledgeCommand(String commandId, bool success) {
  HTTPClient http;
  String url = String(API_URL) + "/api/gateway/ack";
  
  http.begin(wifiClient, url);
  http.addHeader("Content-Type", "application/json");
  
  String json = "{\"commandId\":\"" + commandId + "\",\"success\":" + (success ? "true" : "false") + "}";
  int httpCode = http.POST(json);
  
  Serial.printf("ACK sent: %d\n", httpCode);
  http.end();
}

void checkLoRaMessages() {
  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    String message = "";
    while (LoRa.available()) {
      message += (char)LoRa.read();
    }
    
    Serial.println("LoRa RX: " + message);
    
    // Parse and forward to server
    // Format: "ID:987654321098|TYPE:GPS|LAT:48.915|LON:37.809|BAT:3.87"
    
    HTTPClient http;
    String url = String(API_URL) + "/api/gateway/telemetry";
    
    http.begin(wifiClient, url);
    http.addHeader("Content-Type", "application/json");
    
    // Simplified - production should parse message properly
    String json = "{\"boardId\":\"987654321098\",\"messageType\":\"MSG_TYPE_GPS\"}";
    http.POST(json);
    http.end();
  }
}
```

---

## Support

For questions or issues:

- **GitHub Issues:** [minecheck/issues](https://github.com/yourusername/minecheck/issues)
- **Email:** support@minecheck.com
- **Documentation:** [docs.minecheck.com](https://docs.minecheck.com)

**Version:** 1.0  
**Last Updated:** 2025-01-15
