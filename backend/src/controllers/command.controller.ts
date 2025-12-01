import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';

const createCommandSchema = z.object({
  targetDeviceId: z.string(),
  messageType: z.enum([
    'MSG_TYPE_POSA',
    'MSG_TYPE_BATT',
    'MSG_TYPE_GPS',
    'MSG_TYPE_COORD',
    'MSG_TYPE_PING',
    'MSG_TYPE_PONG',
    'MSG_TYPE_SET_R',
    'MSG_TYPE_RES_ID',
    'MSG_TYPE_MSG',
    'MSG_TYPE_IGNITE',
  ]),
  priority: z.enum(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']).optional(),
  payload: z.record(z.any()).optional(),
});

/**
 * Create a new command
 */
export const createCommand = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { targetDeviceId, messageType, priority, payload } = createCommandSchema.parse(req.body);

    // Get target device and verify access
    const targetDevice = await prisma.device.findUnique({
      where: { id: targetDeviceId },
      include: {
        network: {
          include: {
            guests: true,
          },
        },
      },
    });

    if (!targetDevice) {
      return res.status(404).json({ error: 'Target device not found' });
    }

    // Check permissions
    const isOwner = targetDevice.network.ownerId === req.user.userId;
    const guestAccess = targetDevice.network.guests.find(g => g.userId === req.user.userId);
    const isCommander = guestAccess?.permission === 'COMMANDER';

    // IGNITE commands require OWNER or COMMANDER permission
    if (messageType === 'MSG_TYPE_IGNITE' || messageType === 'MSG_TYPE_SET_R') {
      if (!isOwner && !isCommander && req.user.role !== 'MEGA_ADMIN') {
        return res.status(403).json({ error: 'Insufficient permissions for IGNITE command' });
      }
    } else {
      // Other commands require at least VIEW_ONLY access
      if (!isOwner && !guestAccess && req.user.role !== 'MEGA_ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Find a base station in the same network to send the command
    const baseStation = await prisma.device.findFirst({
      where: {
        networkId: targetDevice.networkId,
        deviceType: 'BASE_STATION',
        status: 'ONLINE',
      },
    });

    if (!baseStation) {
      return res.status(400).json({ error: 'No online base station available in this network' });
    }

    // Determine priority
    let commandPriority = priority || 'NORMAL';
    if (messageType === 'MSG_TYPE_IGNITE' || messageType === 'MSG_TYPE_SET_R') {
      commandPriority = 'CRITICAL';
    }

    // Generate a 5-character message ID
    const messageId = Math.random().toString(36).substring(2, 7).toUpperCase();

    const command = await prisma.command.create({
      data: {
        networkId: targetDevice.networkId,
        sourceDeviceId: baseStation.id,
        targetDeviceId,
        messageType,
        priority: commandPriority,
        payload,
        messageId,
        createdBy: req.user.userId,
      },
      include: {
        targetDevice: true,
        sourceDevice: true,
      },
    });

    res.status(201).json(command);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Create command error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get commands for a network
 */
export const getCommands = async (req: AuthRequest, res: Response) => {
  try {
    const { networkId } = req.params;
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Verify access
    const network = await prisma.network.findUnique({
      where: { id: networkId },
      include: { guests: true },
    });

    if (!network) {
      return res.status(404).json({ error: 'Network not found' });
    }

    const hasAccess =
      req.user.role === 'MEGA_ADMIN' ||
      network.ownerId === req.user.userId ||
      network.guests.some(g => g.userId === req.user.userId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const commands = await prisma.command.findMany({
      where: { networkId },
      include: {
        targetDevice: true,
        sourceDevice: true,
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit to last 100 commands
    });

    res.json(commands);
  } catch (error) {
    console.error('Get commands error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get telemetry for a device
 */
export const getTelemetry = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { limit = '100' } = req.query;

    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Verify access
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        network: {
          include: { guests: true },
        },
      },
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const hasAccess =
      req.user.role === 'MEGA_ADMIN' ||
      device.network.ownerId === req.user.userId ||
      device.network.guests.some(g => g.userId === req.user.userId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const telemetry = await prisma.telemetry.findMany({
      where: { deviceId },
      orderBy: { receivedAt: 'desc' },
      take: parseInt(limit as string),
    });

    res.json(telemetry);
  } catch (error) {
    console.error('Get telemetry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
