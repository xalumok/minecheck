// Shared/value helper types
export type JsonObject = Record<string, unknown>;

// User types
export type UserRole = 'MEGA_ADMIN' | 'USER' | 'GUEST';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Auth types
export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  role?: 'USER' | 'GUEST';
}

// Network types
export type GuestPermission = 'VIEW_ONLY' | 'COMMANDER';

export interface Network {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  owner?: {
    id: string;
    name: string;
    email: string;
  };
  _count?: {
    devices: number;
  };
  guestPermission?: GuestPermission;
}

export interface NetworkGuest {
  id: string;
  networkId: string;
  userId: string;
  permission: GuestPermission;
  user?: User;
}

// Device types
export type DeviceType = 'BASE_STATION' | 'FIELD_UNIT';
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'DISCOVERED' | 'LOW_BATTERY';

export interface Device {
  id: string;
  boardId: string;
  deviceType: DeviceType;
  networkId: string;
  status: DeviceStatus;
  name?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  batteryVoltage?: number;
  batteryPercent?: number;
  lastSeen?: string;
  lastPolled?: string;
  firmwareVersion?: string;
  metadata?: JsonObject;
  createdAt: string;
  updatedAt: string;
}

// Message/Command types
export type MessageType =
  | 'MSG_TYPE_POSA'
  | 'MSG_TYPE_BATT'
  | 'MSG_TYPE_GPS'
  | 'MSG_TYPE_COORD'
  | 'MSG_TYPE_PING'
  | 'MSG_TYPE_PONG'
  | 'MSG_TYPE_SET_R'
  | 'MSG_TYPE_RES_ID'
  | 'MSG_TYPE_MSG'
  | 'MSG_TYPE_IGNITE';

export type CommandStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT';
export type CommandPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

export interface Command {
  id: string;
  networkId: string;
  sourceDeviceId?: string;
  targetDeviceId?: string;
  messageType: MessageType;
  priority: CommandPriority;
  status: CommandStatus;
  payload?: JsonObject;
  messageId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  dispatchedAt?: string;
  completedAt?: string;
  responseData?: JsonObject;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  targetDevice?: Device;
  sourceDevice?: Device;
  creator?: User;
}

export interface Telemetry {
  id: string;
  networkId: string;
  deviceId: string;
  messageType: MessageType;
  messageId?: string;
  data: JsonObject;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  batteryVoltage?: number;
  rssi?: number;
  snr?: number;
  receivedAt: string;
  createdAt: string;
}
