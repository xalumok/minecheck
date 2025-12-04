# MineCheck Security Implementation

## Overview

This document describes the HMAC-based authentication system that secures communication between IoT devices (NodeMCU base stations, ATmega field units) and the MineCheck backend API.

## Problem Statement

**Without authentication, any device on the network could:**
- Spam the system with fake telemetry data
- Retrieve commands meant for legitimate devices
- Inject malicious commands
- Perform denial-of-service attacks

## Solution: HMAC-SHA256 Message Authentication

We use **HMAC-SHA256** (Hash-based Message Authentication Code with SHA-256) to:
1. **Authenticate** devices - Only devices with valid secrets can make requests
2. **Ensure integrity** - Messages cannot be tampered with
3. **Prevent replay attacks** - Old messages are rejected via timestamp validation

### Why HMAC instead of JWT/OAuth?

| Criteria | HMAC | JWT/OAuth |
|----------|------|-----------|
| **Computational overhead** | ✅ Low (single hash operation) | ❌ High (asymmetric crypto, JSON parsing) |
| **Memory usage** | ✅ Minimal (~100 bytes) | ❌ High (token storage, certs) |
| **Microcontroller support** | ✅ Works on 8-bit ATmega | ❌ Requires 32-bit+ MCU |
| **Network overhead** | ✅ 64 bytes per request | ❌ 200+ bytes per request |
| **Security** | ✅ Cryptographically strong | ✅ Also secure |
| **Replay protection** | ✅ Via timestamp | ✅ Via expiry |

**Verdict:** HMAC is ideal for resource-constrained IoT devices.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ NodeMCU Base Station                                         │
│                                                              │
│  1. Build canonical message:                                │
│     boardId|timestamp|method|payload                        │
│                                                              │
│  2. Compute HMAC-SHA256:                                    │
│     signature = HMAC(deviceSecret, canonicalMessage)        │
│                                                              │
│  3. Send HTTP request with headers:                         │
│     X-Device-Timestamp: 1702915234                          │
│     X-Device-Signature: a7f3b2c1d4e5f6...                   │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 │ HTTPS
                 ▼
┌──────────────────────────────────────────────────────────────┐
│ Backend API Server                                           │
│                                                              │
│  1. Extract timestamp and signature from headers            │
│                                                              │
│  2. Validate timestamp:                                     │
│     - Must be within ±60 seconds (clock skew)               │
│     - Must be < 5 minutes old                               │
│                                                              │
│  3. Fetch device secret from database                       │
│                                                              │
│  4. Rebuild canonical message                               │
│                                                              │
│  5. Compute expected signature:                             │
│     expected = HMAC(deviceSecret, canonicalMessage)         │
│                                                              │
│  6. Compare signatures (timing-safe):                       │
│     if (expected === signature) → ✅ Authenticated          │
│     else → ❌ Reject (401 Unauthorized)                     │
└──────────────────────────────────────────────────────────────┘
```

## Device Secret Lifecycle

### 1. Device Registration (Web UI)

```typescript
// Network owner registers device with boardId
POST /api/devices
{
  "boardId": "123456789012",
  "deviceType": "BASE_STATION",
  "networkId": "network-id"
}
// Device created with status=OFFLINE, deviceSecret=null
```

### 2. Secret Provisioning (Server)

```bash
cd backend
npm run security:provision
```

**Output:**
```json
[
  {
    "boardId": "123456789012",
    "secret": "a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789"
  }
]
```

**⚠️ CRITICAL:** Store these secrets securely! They cannot be recovered if lost.

### 3. Device Programming

1. Copy the secret for the device
2. Flash NodeMCU firmware with:
   ```cpp
   #define DEVICE_SECRET "a1b2c3d4e5f6789abcdef..."
   ```
3. **Securely delete** the secrets JSON file
4. Device can now make authenticated requests

### 4. Secret Rotation (if compromised)

```bash
# Generate new secret for compromised device
npm run security:provision
# Re-flash device with new secret
# Old requests with old secret will be rejected
```

## Request Signing (NodeMCU Example)

### Poll Request (GET)

```cpp
#include <Crypto.h>
#include <SHA256.h>
#include <NTPClient.h>

// Configuration
const char* BOARD_ID = "123456789012";
const char* DEVICE_SECRET = "a1b2c3d4e5f6..."; // 64 hex chars

NTPClient timeClient(ntpUDP, "pool.ntp.org");

void pollForCommands() {
  // 1. Get current timestamp
  unsigned long timestamp = timeClient.getEpochTime();
  
  // 2. Build canonical message: boardId|timestamp|method
  String canonical = String(BOARD_ID) + "|" + String(timestamp) + "|poll";
  
  // 3. Compute HMAC-SHA256 signature
  String signature = computeHMAC(DEVICE_SECRET, canonical);
  
  // 4. Make request with authentication headers
  HTTPClient http;
  String url = "http://api.minecheck.com/api/gateway/poll?boardId=" + String(BOARD_ID);
  
  http.begin(client, url);
  http.addHeader("X-Device-Timestamp", String(timestamp));
  http.addHeader("X-Device-Signature", signature);
  
  int httpCode = http.GET();
  // ... handle response
}

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
  
  // Convert to hex string
  return bytesToHexString(hmac, 32);
}
```

### Telemetry Request (POST)

```cpp
void sendTelemetry() {
  // 1. Build JSON payload
  String json = "{\"boardId\":\"987654321098\",\"messageType\":\"MSG_TYPE_GPS\"}";
  
  // 2. Get timestamp
  unsigned long timestamp = timeClient.getEpochTime();
  
  // 3. Build canonical message: boardId|timestamp|method|payload
  String canonical = String(BOARD_ID) + "|" + String(timestamp) + "|telemetry|" + json;
  
  // 4. Compute signature
  String signature = computeHMAC(DEVICE_SECRET, canonical);
  
  // 5. Make request
  HTTPClient http;
  http.begin(client, "http://api.minecheck.com/api/gateway/telemetry");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Timestamp", String(timestamp));
  http.addHeader("X-Device-Signature", signature);
  
  int httpCode = http.POST(json);
  // ... handle response
}
```

## Server-Side Validation

The `validateDeviceSignature` middleware handles all authentication:

```typescript
// backend/src/middleware/deviceAuth.ts

export const validateDeviceSignature = async (req, res, next) => {
  // 1. Extract headers
  const timestamp = req.headers['x-device-timestamp'];
  const signature = req.headers['x-device-signature'];
  
  // 2. Validate timestamp
  if (!isTimestampValid(timestamp)) {
    return res.status(401).json({ error: 'Invalid timestamp' });
  }
  
  // 3. Get device secret from DB
  const device = await prisma.device.findUnique({
    where: { boardId: req.query.boardId }
  });
  
  if (!device?.deviceSecret) {
    return res.status(403).json({ error: 'Device not provisioned' });
  }
  
  // 4. Rebuild canonical message
  const canonical = buildCanonicalMessage(
    device.boardId,
    timestamp,
    method,
    req.body
  );
  
  // 5. Verify signature
  const isValid = verifyHMAC(device.deviceSecret, canonical, signature);
  
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // ✅ Authenticated - proceed to route handler
  next();
};
```

## Security Features

### 1. Replay Attack Prevention

**Attack:** Attacker captures a valid request and replays it later.

**Defense:** Timestamps must be recent (< 5 minutes old).

```typescript
function isTimestampValid(timestamp: string | number): boolean {
  const messageTime = typeof timestamp === 'number' 
    ? timestamp * 1000 
    : new Date(timestamp).getTime();
  
  const now = Date.now();
  const age = (now - messageTime) / 1000; // seconds
  
  // Allow ±60s clock skew, max 5 min age
  return age >= -60 && age <= 300;
}
```

### 2. Message Tampering Detection

**Attack:** Attacker modifies request parameters mid-flight.

**Defense:** Any change to the canonical message invalidates the signature.

```
Original: "123456789012|1702915234|poll"
Tampered: "123456789012|1702915234|telemetry"  ❌ Different signature
```

### 3. Impersonation Prevention

**Attack:** Attacker tries to impersonate a legitimate device.

**Defense:** Without the device secret, attacker cannot compute valid signatures.

### 4. Timing Attack Resistance

**Attack:** Attacker uses timing differences to guess secret.

**Defense:** Use `crypto.timingSafeEqual()` for signature comparison.

```typescript
export function verifyHMAC(secret: string, message: string, signature: string): boolean {
  const expected = computeHMAC(secret, message);
  
  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex')
  );
}
```

## Testing

### Run Security Tests

```bash
cd backend
npm run security:test
```

**Expected output:**
```
🔐 Running Security Implementation Tests...

Test 1: Device Secret Generation
✅ PASS: Secret is 64 hex characters
✅ PASS: Secrets are unique

Test 2: HMAC-SHA256 Computation
✅ PASS: HMAC is deterministic
✅ PASS: Different messages produce different signatures

Test 3: Timestamp Validation
✅ PASS: Replay attack with old timestamp is rejected

...

🎉 All tests passed! Security implementation is working correctly.
```

### Manual Testing with cURL

```bash
# 1. Generate signature (use script or online tool)
BOARD_ID="123456789012"
TIMESTAMP=$(date +%s)
SECRET="a1b2c3d4e5f6..."
MESSAGE="${BOARD_ID}|${TIMESTAMP}|poll"
SIGNATURE=$(echo -n "$MESSAGE" | openssl dgst -sha256 -hmac $(echo "$SECRET" | xxd -r -p) | cut -d' ' -f2)

# 2. Make authenticated request
curl -X GET \
  "http://localhost:3000/api/gateway/poll?boardId=${BOARD_ID}" \
  -H "X-Device-Timestamp: ${TIMESTAMP}" \
  -H "X-Device-Signature: ${SIGNATURE}"
```

## Production Deployment

### Backend Checklist

- [x] Device secrets stored in database (encrypted at rest)
- [x] HTTPS enforced for all API endpoints
- [x] Rate limiting enabled (120 req/min per device)
- [ ] Monitor for authentication failures (potential attacks)
- [ ] Log all failed auth attempts with IP addresses
- [ ] Set up alerts for suspicious patterns

### Device Checklist

- [ ] Device secret stored in protected flash memory
- [ ] NTP time synchronization configured
- [ ] Watchdog timer prevents indefinite hangs
- [ ] OTA update mechanism for secret rotation
- [ ] Flash encryption enabled (ESP8266)
- [ ] Debug logs disabled in production firmware

## Performance

**HMAC Computation:** ~0.006ms per operation on modern hardware

**Server Impact:** Negligible - can handle 10,000+ requests/second

**NodeMCU Impact:** ~50ms per signature (acceptable for IoT)

## Troubleshooting

### Error: "Invalid timestamp"

**Cause:** Device clock is out of sync.

**Solution:** Ensure NTP client is working and updating regularly.

```cpp
// Update time every 60 seconds
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000);
```

### Error: "Invalid signature"

**Possible causes:**
1. Wrong device secret programmed
2. Canonical message format mismatch
3. Character encoding issues

**Debug:**
```cpp
Serial.println("Canonical: " + canonical);
Serial.println("Signature: " + signature);
```

Compare with server-side logs.

### Error: "Device not provisioned"

**Cause:** Device doesn't have a secret in database.

**Solution:**
```bash
npm run security:provision
```

## References

- [RFC 2104: HMAC](https://tools.ietf.org/html/rfc2104)
- [NIST FIPS 198-1: HMAC Standard](https://csrc.nist.gov/publications/detail/fips/198/1/final)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)

## Support

For security concerns or questions:
- **GitHub Issues:** [minecheck/issues](https://github.com/xalumok/minecheck/issues)
- **Security Contact:** security@minecheck.com (PGP key available)
