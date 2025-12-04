# MineCheck API Documentation

Base URL: `http://localhost:3000/api` (development)

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

---

## Authentication Endpoints

### POST /auth/login
Login to get JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clx123...",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "USER"
  }
}
```

### POST /auth/register
Register a new user (can also be done by MEGA_ADMIN).

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "name": "New User",
  "role": "USER"
}
```

**Response:**
```json
{
  "user": {
    "id": "clx456...",
    "email": "newuser@example.com",
    "name": "New User",
    "role": "USER"
  }
}
```

---

## User Management (MEGA_ADMIN Only)

### GET /users
Get all users.

**Auth Required:** MEGA_ADMIN

**Response:**
```json
[
  {
    "id": "clx123...",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "USER",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### POST /users
Create a new user (MEGA_ADMIN only).

**Auth Required:** MEGA_ADMIN

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "name": "New User",
  "role": "USER"
}
```

### PATCH /users/:userId
Update user details.

**Auth Required:** MEGA_ADMIN

**Request:**
```json
{
  "name": "Updated Name",
  "isActive": false,
  "role": "GUEST"
}
```

### GET /users/me
Get current user information.

**Auth Required:** Any authenticated user

**Response:**
```json
{
  "id": "clx123...",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "USER",
  "isActive": true
}
```

---

## Network Management

### GET /networks
Get all networks accessible by the current user.

**Auth Required:** Yes

**Response:**
```json
[
  {
    "id": "clx789...",
    "name": "New Year Event 2025",
    "description": "Main event network",
    "ownerId": "clx123...",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "owner": {
      "id": "clx123...",
      "name": "John Doe",
      "email": "user@example.com"
    },
    "_count": {
      "devices": 5
    }
  }
]
```

### POST /networks
Create a new network.

**Auth Required:** Yes

**Request:**
```json
{
  "name": "Summer Festival 2025",
  "description": "Optional description"
}
```

### GET /networks/:networkId
Get network details including devices and guests.

**Auth Required:** Yes (must have access to network)

### POST /networks/:networkId/guests
Add a guest user to a network.

**Auth Required:** Network owner or MEGA_ADMIN

**Request:**
```json
{
  "userId": "clx456...",
  "permission": "VIEW_ONLY"
}
```

Permission options: `VIEW_ONLY`, `COMMANDER`

### DELETE /networks/:networkId/guests/:guestId
Remove a guest from a network.

**Auth Required:** Network owner or MEGA_ADMIN

---

## Device Management

### GET /devices/network/:networkId
Get all devices in a network.

**Auth Required:** Yes (must have access to network)

**Response:**
```json
[
  {
    "id": "clxabc...",
    "boardId": "123456789012",
    "deviceType": "BASE_STATION",
    "networkId": "clx789...",
    "status": "ONLINE",
    "name": "Main Gateway",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "batteryVoltage": 4.1,
    "batteryPercent": 95,
    "lastSeen": "2024-01-01T12:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### POST /devices/network/:networkId
Register a new device to a network.

**Auth Required:** Network owner or MEGA_ADMIN

**Request:**
```json
{
  "boardId": "123456789012",
  "deviceType": "BASE_STATION",
  "name": "Main Gateway"
}
```

Device types: `BASE_STATION`, `FIELD_UNIT`

### GET /devices/:deviceId
Get device details.

**Auth Required:** Yes (must have access to device's network)

### PATCH /devices/:deviceId
Update device information.

**Auth Required:** Network owner or MEGA_ADMIN

**Request:**
```json
{
  "name": "Updated Name",
  "status": "OFFLINE"
}
```

---

## Command Management

### POST /commands
Create a new command to send to a device.

**Auth Required:** Yes (COMMANDER or OWNER permission required for IGNITE)

**Request:**
```json
{
  "targetDeviceId": "clxabc...",
  "messageType": "MSG_TYPE_IGNITE",
  "priority": "CRITICAL",
  "payload": {}
}
```

**Message Types:**
- `MSG_TYPE_POSA` - Presence announcement
- `MSG_TYPE_BATT` - Battery voltage request
- `MSG_TYPE_GPS` - GPS coordinates request
- `MSG_TYPE_PING` - Ping request
- `MSG_TYPE_IGNITE` - Ignition command (requires COMMANDER/OWNER)

**Priority Levels:** `CRITICAL`, `HIGH`, `NORMAL`, `LOW`

### GET /commands/network/:networkId
Get recent commands for a network (last 100).

**Auth Required:** Yes (must have access to network)

### GET /commands/telemetry/:deviceId
Get telemetry data for a device.

**Auth Required:** Yes (must have access to device's network)

**Query Parameters:**
- `limit` - Number of records to return (default: 100)

---

## Gateway Endpoints (No Authentication)

These endpoints are used by Base Station hardware (NodeMCU).

### GET /gateway/poll
Poll for pending commands.

**Query Parameters:**
- `boardId` - 12-digit base station ID

**Response (when commands available):**
```json
{
  "commandId": "clxdef...",
  "targetBoardId": "123456789013",
  "messageType": "MSG_TYPE_IGNITE",
  "messageId": "AB12C",
  "payload": {}
}
```

**Response (no commands):** `204 No Content`

### POST /gateway/telemetry
Submit telemetry data from field units.

**Request:**
```json
{
  "boardId": "123456789013",
  "messageType": "MSG_TYPE_GPS",
  "messageId": "AB12C",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "altitude": 10.5,
  "batteryVoltage": 3.8,
  "rssi": -65,
  "snr": 8.5,
  "data": {}
}
```

**Response:**
```json
{
  "success": true,
  "deviceId": "clxabc..."
}
```

**Auto-Discovery:** If the `boardId` doesn't exist, a new device is automatically created and associated with the network of the base station that received the telemetry.

### POST /gateway/ack
Acknowledge command completion.

**Request:**
```json
{
  "commandId": "clxdef...",
  "success": true,
  "responseData": {}
}
```

---

## Status Codes

- `200` - Success
- `201` - Created
- `204` - No Content (used in polling when no commands available)
- `400` - Bad Request (validation error)
- `401` - Unauthorized (no token or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (e.g., user/device already exists)
- `500` - Internal Server Error

## Error Response Format

```json
{
  "error": "Error message",
  "details": [] // Optional validation errors
}
```

## Rate Limiting

- API endpoints: 100 requests per 15 minutes per IP
- Gateway polling: 120 requests per minute per IP (allows ~2 polls/second)

## Device Status Values

- `ONLINE` - Device is active and recently seen
- `OFFLINE` - Device hasn't been seen recently
- `DISCOVERED` - Auto-discovered device, not yet confirmed
- `LOW_BATTERY` - Battery below 20%

## Command Status Values

- `PENDING` - Waiting to be dispatched
- `PROCESSING` - Sent to base station
- `COMPLETED` - Successfully executed
- `FAILED` - Execution failed
- `TIMEOUT` - No response received
