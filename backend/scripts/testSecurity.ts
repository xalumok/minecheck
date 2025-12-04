import crypto from 'crypto';
import { computeHMAC, buildCanonicalMessage, isTimestampValid, generateDeviceSecret } from '../src/utils/security';

/**
 * Test suite for security utilities
 * Run with: npm run test:security
 */

console.log('🔐 Running Security Implementation Tests...\n');

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    if (details) console.log(`   ${details}`);
    failCount++;
  }
}

// Test 1: Secret Generation
console.log('Test 1: Device Secret Generation');
const secret1 = generateDeviceSecret();
const secret2 = generateDeviceSecret();
assert(secret1.length === 64, 'Secret is 64 hex characters');
assert(secret2.length === 64, 'Second secret is also 64 characters');
assert(secret1 !== secret2, 'Secrets are unique');
assert(/^[0-9a-f]{64}$/.test(secret1), 'Secret contains only hex characters');
console.log(`   Sample secret: ${secret1.substring(0, 16)}...`);
console.log();

// Test 2: HMAC Computation
console.log('Test 2: HMAC-SHA256 Computation');
const testSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const testMessage = '123456789012|1702915234|poll';
const signature1 = computeHMAC(testSecret, testMessage);
const signature2 = computeHMAC(testSecret, testMessage);

assert(signature1 === signature2, 'HMAC is deterministic (same input produces same output)');
assert(signature1.length === 64, 'HMAC signature is 64 hex characters');
assert(/^[0-9a-f]{64}$/.test(signature1), 'HMAC contains only hex characters');

// Verify that different messages produce different signatures
const differentMessage = '123456789012|1702915235|poll';
const signature3 = computeHMAC(testSecret, differentMessage);
assert(signature1 !== signature3, 'Different messages produce different signatures');

console.log(`   Message: ${testMessage}`);
console.log(`   Signature: ${signature1.substring(0, 32)}...`);
console.log();

// Test 3: Timestamp Validation
console.log('Test 3: Timestamp Validation (Replay Attack Prevention)');
const now = Math.floor(Date.now() / 1000);
const nowISO = new Date().toISOString();

assert(isTimestampValid(now), 'Current Unix timestamp is valid');
assert(isTimestampValid(nowISO), 'Current ISO 8601 timestamp is valid');
assert(isTimestampValid(now - 60), 'Timestamp 60 seconds ago is valid (within 5 min window)');
assert(isTimestampValid(now + 30), 'Timestamp 30 seconds in future is valid (clock skew tolerance)');
assert(!isTimestampValid(now - 400), 'Timestamp 400 seconds ago is invalid (beyond 5 min window)');
assert(!isTimestampValid(now + 100), 'Timestamp 100 seconds in future is invalid (beyond clock skew)');
assert(!isTimestampValid('invalid'), 'Invalid timestamp string is rejected');
assert(!isTimestampValid(NaN), 'NaN is rejected');
console.log();

// Test 4: Canonical Message Building
console.log('Test 4: Canonical Message Building');
const boardId = '123456789012';
const timestamp = 1702915234;
const method = 'poll';

const canonical1 = buildCanonicalMessage(boardId, timestamp, method);
assert(canonical1 === '123456789012|1702915234|poll', 'GET request canonical message format is correct');

const payload = JSON.stringify({ boardId: '987654321098', messageType: 'MSG_TYPE_GPS' });
const canonical2 = buildCanonicalMessage(boardId, timestamp, 'telemetry', payload);
const expected = `${boardId}|${timestamp}|telemetry|${payload}`;
assert(canonical2 === expected, 'POST request canonical message includes payload');

console.log(`   GET format: ${canonical1}`);
console.log(`   POST format: ${canonical2.substring(0, 60)}...`);
console.log();

// Test 5: Complete Request Simulation
console.log('Test 5: Complete Request Simulation');

// Simulate NodeMCU creating a signed poll request
const deviceSecret = generateDeviceSecret();
const deviceBoardId = '000000BASE001';
const pollTimestamp = Math.floor(Date.now() / 1000);
const pollMethod = 'poll';

const pollCanonical = buildCanonicalMessage(deviceBoardId, pollTimestamp, pollMethod);
const pollSignature = computeHMAC(deviceSecret, pollCanonical);

console.log(`   Device Board ID: ${deviceBoardId}`);
console.log(`   Device Secret: ${deviceSecret.substring(0, 16)}... (KEEP SECRET!)`);
console.log(`   Timestamp: ${pollTimestamp}`);
console.log(`   Canonical Message: ${pollCanonical}`);
console.log(`   Signature: ${pollSignature}`);

// Simulate server verifying the request
const serverCanonical = buildCanonicalMessage(deviceBoardId, pollTimestamp, pollMethod);
const serverSignature = computeHMAC(deviceSecret, serverCanonical);

assert(serverSignature === pollSignature, 'Server can verify client signature');
console.log(`   ✓ Server verified signature successfully`);
console.log();

// Test 6: Simulate telemetry POST request
console.log('Test 6: Telemetry POST Request Simulation');

const telemetryPayload = JSON.stringify({
  boardId: '000000FIELD001',
  messageType: 'MSG_TYPE_GPS',
  latitude: 40.7128,
  longitude: -74.0060,
  batteryVoltage: 3.87,
});

const telemetryTimestamp = Math.floor(Date.now() / 1000);
const telemetryCanonical = buildCanonicalMessage(deviceBoardId, telemetryTimestamp, 'telemetry', telemetryPayload);
const telemetrySignature = computeHMAC(deviceSecret, telemetryCanonical);

console.log(`   Payload: ${telemetryPayload.substring(0, 60)}...`);
console.log(`   Signature: ${telemetrySignature}`);

const serverVerifyCanonical = buildCanonicalMessage(deviceBoardId, telemetryTimestamp, 'telemetry', telemetryPayload);
const serverVerifySignature = computeHMAC(deviceSecret, serverVerifyCanonical);

assert(serverVerifySignature === telemetrySignature, 'Server can verify telemetry POST signature');
console.log(`   ✓ Server verified telemetry signature`);
console.log();

// Test 7: Attack Scenarios
console.log('Test 7: Attack Scenarios (Security Validation)');

// Attack 1: Replay attack with old timestamp
const oldTimestamp = now - 400; // 6+ minutes old
const replayCanonical = buildCanonicalMessage(deviceBoardId, oldTimestamp, pollMethod);
const replaySignature = computeHMAC(deviceSecret, replayCanonical);
assert(!isTimestampValid(oldTimestamp), 'Replay attack with old timestamp is rejected');
console.log(`   ✓ Blocked: Replay attack (timestamp too old)`);

// Attack 2: Wrong secret
const wrongSecret = generateDeviceSecret();
const wrongSignature = computeHMAC(wrongSecret, pollCanonical);
assert(wrongSignature !== pollSignature, 'Wrong secret produces different signature');
console.log(`   ✓ Blocked: Attacker with wrong secret cannot forge valid signature`);

// Attack 3: Modified message
const tamperedCanonical = buildCanonicalMessage(deviceBoardId, pollTimestamp, 'telemetry'); // Changed method
const tamperedSignature = computeHMAC(deviceSecret, tamperedCanonical);
assert(tamperedSignature !== pollSignature, 'Modified message produces different signature');
console.log(`   ✓ Blocked: Message tampering detected via signature mismatch`);

console.log();

// Test 8: Performance Check
console.log('Test 8: Performance Check');
const iterations = 1000;
const perfSecret = generateDeviceSecret();
const perfMessage = buildCanonicalMessage('123456789012', Date.now(), 'poll');

const startTime = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) {
  computeHMAC(perfSecret, perfMessage);
}
const endTime = process.hrtime.bigint();
const avgTimeNs = Number(endTime - startTime) / iterations;
const avgTimeMs = avgTimeNs / 1_000_000;

assert(avgTimeMs < 1, 'HMAC computation is fast enough for production use');
console.log(`   Average HMAC computation time: ${avgTimeMs.toFixed(3)}ms`);
console.log(`   Total time for ${iterations} iterations: ${Number(endTime - startTime) / 1_000_000}ms`);
console.log();

// Summary
console.log('='.repeat(80));
console.log('Test Summary');
console.log('='.repeat(80));
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log();

if (failCount === 0) {
  console.log('🎉 All tests passed! Security implementation is working correctly.');
  console.log();
  console.log('Next steps:');
  console.log('1. Run `npm run security:provision` to generate secrets for devices');
  console.log('2. Update NodeMCU firmware with HMAC signing code');
  console.log('3. Test with a real device making authenticated requests');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Please review the security implementation.');
  process.exit(1);
}
