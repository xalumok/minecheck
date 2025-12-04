import { Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { verifyHMAC, isTimestampValid, buildCanonicalMessage } from '../utils/security';

/**
 * Middleware to validate HMAC signatures on gateway requests
 * 
 * Expected headers:
 * - X-Device-Timestamp: ISO 8601 timestamp or Unix timestamp (seconds)
 * - X-Device-Signature: HMAC-SHA256 signature (hex-encoded)
 * 
 * The signature is computed over: boardId|timestamp|method|payload
 * where:
 * - boardId: from query string or request body
 * - timestamp: from X-Device-Timestamp header
 * - method: derived from request path (e.g., "poll", "telemetry", "ack")
 * - payload: JSON stringified request body (for POST requests)
 */
export const validateDeviceSignature = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract timestamp and signature from headers
    const timestamp = req.headers['x-device-timestamp'] as string;
    const signature = req.headers['x-device-signature'] as string;

    if (!timestamp || !signature) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Missing X-Device-Timestamp or X-Device-Signature header'
      });
    }

    // Validate timestamp to prevent replay attacks
    if (!isTimestampValid(timestamp)) {
      return res.status(401).json({ 
        error: 'Invalid timestamp',
        message: 'Message timestamp is too old or invalid. Clock skew allowed: ±60 seconds, max age: 5 minutes'
      });
    }

    // Extract boardId from query or body
    const boardId = (req.query.boardId as string) || req.body?.boardId;

    if (!boardId) {
      return res.status(400).json({ 
        error: 'Missing boardId',
        message: 'boardId must be provided in query string or request body'
      });
    }

    // Fetch device secret from database
    const device = await prisma.device.findUnique({
      where: { boardId },
      select: { id: true, boardId: true, deviceSecret: true, deviceType: true }
    });

    if (!device) {
      return res.status(404).json({ 
        error: 'Device not found',
        message: `No device registered with boardId: ${boardId}`
      });
    }

    if (!device.deviceSecret) {
      return res.status(403).json({ 
        error: 'Device not provisioned',
        message: 'Device secret not configured. Please provision this device first.'
      });
    }

    // Determine method from request path
    const pathParts = req.path.split('/');
    const method = pathParts[pathParts.length - 1]; // e.g., "poll", "telemetry", "ack"

    // Build canonical message for verification
    const payload = req.method === 'POST' ? req.body : undefined;
    const canonicalMessage = buildCanonicalMessage(boardId, timestamp, method, payload);

    // Verify signature
    const isValid = verifyHMAC(device.deviceSecret, canonicalMessage, signature);

    if (!isValid) {
      return res.status(401).json({ 
        error: 'Invalid signature',
        message: 'HMAC signature verification failed. Check device secret and message format.'
      });
    }

    // Attach device info to request for use in controllers
    (req as any).device = device;

    next();
  } catch (error) {
    console.error('Device signature validation error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to validate device signature'
    });
  }
};
