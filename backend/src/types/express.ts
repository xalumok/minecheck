import { Request } from 'express';

/**
 * Device information attached to authenticated gateway requests
 */
export interface AuthenticatedDevice {
  id: string;
  boardId: string;
  deviceSecret: string;
  deviceType: 'BASE_STATION' | 'FIELD_UNIT';
}

/**
 * Extended Express Request with authenticated device information
 * Populated by validateDeviceSignature middleware
 */
export interface AuthenticatedRequest extends Request {
  device: AuthenticatedDevice;
}
