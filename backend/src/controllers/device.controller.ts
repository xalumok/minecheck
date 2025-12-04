import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';

const registerDeviceSchema = z.object({
  boardId: z.string().length(12),
  deviceType: z.enum(['BASE_STATION', 'FIELD_UNIT']),
  name: z.string().optional(),
});

const updateDeviceSchema = z.object({
  name: z.string().optional(),
  status: z.enum(['ONLINE', 'OFFLINE', 'DISCOVERED', 'LOW_BATTERY']).optional(),
});

/**
 * Get all devices in a network
 */
export const getDevices = async (req: AuthRequest, res: Response) => {
  try {
    const { networkId } = req.params;
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Verify access to network
    const network = await prisma.network.findUnique({
      where: { id: networkId },
      include: {
        guests: true,
      },
    });

    if (!network) {
      return res.status(404).json({ error: 'Network not found' });
    }

    const hasAccess =
      req.user.role === 'MEGA_ADMIN' ||
      network.ownerId === req.user.userId ||
      network.guests.some(g => g.userId === req.user!.userId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const devices = await prisma.device.findMany({
      where: { networkId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(devices);
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Register a new device to a network
 */
export const registerDevice = async (req: AuthRequest, res: Response) => {
  try {
    const { networkId } = req.params;
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { boardId, deviceType, name } = registerDeviceSchema.parse(req.body);

    // Verify ownership
    const network = await prisma.network.findUnique({
      where: { id: networkId },
    });

    if (!network) {
      return res.status(404).json({ error: 'Network not found' });
    }

    if (network.ownerId !== req.user.userId && req.user.role !== 'MEGA_ADMIN') {
      return res.status(403).json({ error: 'Only the owner can register devices' });
    }

    // Check if device already exists
    const existingDevice = await prisma.device.findUnique({
      where: { boardId },
    });

    if (existingDevice) {
      return res.status(409).json({ error: 'Device already registered' });
    }

    const device = await prisma.device.create({
      data: {
        boardId,
        deviceType,
        networkId,
        name,
        status: 'OFFLINE',
      },
    });

    res.status(201).json(device);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Register device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update a device
 */
export const updateDevice = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const updateData = updateDeviceSchema.parse(req.body);

    // Verify access
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { network: true },
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const hasAccess =
      req.user.role === 'MEGA_ADMIN' ||
      device.network.ownerId === req.user.userId;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: updateData,
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Update device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get device by ID
 */
export const getDevice = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        network: {
          include: {
            guests: true,
          },
        },
      },
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Verify access
    const hasAccess =
      req.user.role === 'MEGA_ADMIN' ||
      device.network.ownerId === req.user.userId ||
      device.network.guests.some(g => g.userId === req.user!.userId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(device);
  } catch (error) {
    console.error('Get device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
