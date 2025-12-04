import crypto from 'crypto';

/**
 * Generate a random device secret (32 bytes = 256 bits)
 * Returns hex-encoded string
 */
export function generateDeviceSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Compute HMAC-SHA256 signature for a message
 * @param secret - Device secret (hex-encoded)
 * @param message - Message to sign (typically: boardId|timestamp|payload)
 * @returns Hex-encoded signature
 */
export function computeHMAC(secret: string, message: string): string {
  const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'hex'));
  hmac.update(message);
  return hmac.digest('hex');
}

/**
 * Verify HMAC signature
 * @param secret - Device secret (hex-encoded)
 * @param message - Original message
 * @param signature - Signature to verify (hex-encoded)
 * @returns true if signature is valid
 */
export function verifyHMAC(secret: string, message: string, signature: string): boolean {
  const expected = computeHMAC(secret, message);
  
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch {
    // If lengths don't match, timingSafeEqual throws an error
    return false;
  }
}

/**
 * Validate timestamp to prevent replay attacks
 * @param timestamp - ISO 8601 timestamp string or Unix timestamp (seconds)
 * @param maxAgeSeconds - Maximum age of message in seconds (default: 300 = 5 minutes)
 * @returns true if timestamp is recent enough
 */
export function isTimestampValid(timestamp: string | number, maxAgeSeconds: number = 300): boolean {
  try {
    const messageTime = typeof timestamp === 'number' 
      ? timestamp * 1000  // Convert Unix timestamp to milliseconds
      : new Date(timestamp).getTime();
    
    if (isNaN(messageTime)) {
      return false;
    }
    
    const now = Date.now();
    const age = (now - messageTime) / 1000; // Age in seconds
    
    // Allow messages from up to maxAgeSeconds ago, and up to 60 seconds in the future
    // (to account for clock skew)
    return age >= -60 && age <= maxAgeSeconds;
  } catch {
    return false;
  }
}

/**
 * Build canonical message for HMAC signing
 * Format: boardId|timestamp|method|payload
 * @param boardId - Device board ID
 * @param timestamp - Message timestamp
 * @param method - API method (e.g., "poll", "telemetry", "ack")
 * @param payload - Optional JSON payload (will be stringified if object)
 * @returns Canonical message string
 */
export function buildCanonicalMessage(
  boardId: string,
  timestamp: string | number,
  method: string,
  payload?: any
): string {
  const parts = [boardId, String(timestamp), method];
  
  if (payload !== undefined && payload !== null) {
    const payloadStr = typeof payload === 'string' 
      ? payload 
      : JSON.stringify(payload);
    parts.push(payloadStr);
  }
  
  return parts.join('|');
}
