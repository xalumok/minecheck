import apiClient from '../lib/api';
import type {
  AuthResponse,
  LoginCredentials,
  RegisterData,
  User,
  Network,
  Device,
  Command,
  Telemetry,
  MessageType,
  CommandPriority,
  GuestPermission,
} from '../types';

// Auth API
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  register: async (data: RegisterData): Promise<{ user: User }> => {
    const response = await apiClient.post<{ user: User }>('/auth/register', data);
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>('/users/me');
    return response.data;
  },
};

// Users API
export const usersApi = {
  getAll: async (): Promise<User[]> => {
    const response = await apiClient.get<User[]>('/users');
    return response.data;
  },

  create: async (data: RegisterData): Promise<User> => {
    const response = await apiClient.post<User>('/users', data);
    return response.data;
  },

  update: async (userId: string, data: Partial<User>): Promise<User> => {
    const response = await apiClient.patch<User>(`/users/${userId}`, data);
    return response.data;
  },
};

// Networks API
export const networksApi = {
  getAll: async (): Promise<Network[]> => {
    const response = await apiClient.get<Network[]>('/networks');
    return response.data;
  },

  getById: async (networkId: string): Promise<Network> => {
    const response = await apiClient.get<Network>(`/networks/${networkId}`);
    return response.data;
  },

  create: async (data: { name: string; description?: string }): Promise<Network> => {
    const response = await apiClient.post<Network>('/networks', data);
    return response.data;
  },

  addGuest: async (networkId: string, userId: string, permission: GuestPermission) => {
    const response = await apiClient.post(`/networks/${networkId}/guests`, {
      userId,
      permission,
    });
    return response.data;
  },

  removeGuest: async (networkId: string, guestId: string) => {
    await apiClient.delete(`/networks/${networkId}/guests/${guestId}`);
  },
};

// Devices API
export const devicesApi = {
  getByNetwork: async (networkId: string): Promise<Device[]> => {
    const response = await apiClient.get<Device[]>(`/devices/network/${networkId}`);
    return response.data;
  },

  getById: async (deviceId: string): Promise<Device> => {
    const response = await apiClient.get<Device>(`/devices/${deviceId}`);
    return response.data;
  },

  register: async (
    networkId: string,
    data: { boardId: string; deviceType: 'BASE_STATION' | 'FIELD_UNIT'; name?: string }
  ): Promise<Device> => {
    const response = await apiClient.post<Device>(`/devices/network/${networkId}`, data);
    return response.data;
  },

  update: async (deviceId: string, data: Partial<Device>): Promise<Device> => {
    const response = await apiClient.patch<Device>(`/devices/${deviceId}`, data);
    return response.data;
  },
};

// Commands API
export const commandsApi = {
  create: async (data: {
    targetDeviceId: string;
    messageType: MessageType;
    priority?: CommandPriority;
    payload?: Record<string, unknown>;
  }): Promise<Command> => {
    const response = await apiClient.post<Command>('/commands', data);
    return response.data;
  },

  getByNetwork: async (networkId: string): Promise<Command[]> => {
    const response = await apiClient.get<Command[]>(`/commands/network/${networkId}`);
    return response.data;
  },

  getTelemetry: async (deviceId: string, limit?: number): Promise<Telemetry[]> => {
    const response = await apiClient.get<Telemetry[]>(`/commands/telemetry/${deviceId}`, {
      params: { limit },
    });
    return response.data;
  },
};
