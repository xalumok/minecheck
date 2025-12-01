import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';

const pollSchema = z.object({
  boardId: z.string().length(12), // 12-digit base station ID
});

const telemetrySchema = z.object({
  boardId: z.string().length(12), // Source device ID
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
  ]),
  messageId: z.string().length(5).optional(),
  data: z.record(z.any()).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  altitude: z.number().optional(),
  batteryVoltage: z.number().optional(),
  rssi: z.number().optional(),
  snr: z.number().optional(),
});

/**
 * Polling endpoint for Base Stations
 * GET /api/gateway/poll?boardId=123456789012
 */
export const poll = async (req: Request, res: Response) => {
  try {
    const { boardId } = pollSchema.parse(req.query);

    // Find the base station
    const baseStation = await prisma.device.findFirst({
      where: {
        boardId,
        deviceType: 'BASE_STATION',
      },
      include: {
        network: true,
      },
    });

    if (!baseStation) {
      return res.status(404).json({ error: 'Base station not registered' });
    }

    // Update last polled timestamp and status
    await prisma.device.update({
      where: { id: baseStation.id },
      data: {
        lastPolled: new Date(),
        lastSeen: new Date(),
        status: 'ONLINE',
      },
    });

    // Find pending commands for this network
    // Priority: CRITICAL > HIGH > NORMAL > LOW
    // Send only ONE command per poll to prevent LoRa congestion
    const pendingCommand = await prisma.command.findFirst({
      where: {
        networkId: baseStation.networkId,
        status: 'PENDING',
        OR: [
          { sourceDeviceId: baseStation.id },
          { sourceDeviceId: null }, // Broadcast commands
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
      include: {
        targetDevice: true,
      },
    });

    if (!pendingCommand) {
      // No commands pending - return 204 No Content to save bandwidth
      return res.status(204).send();
    }

    // Mark command as processing
    await prisma.command.update({
      where: { id: pendingCommand.id },
      data: {
        status: 'PROCESSING',
        dispatchedAt: new Date(),
      },
    });

    // Return command to base station
    res.json({
      commandId: pendingCommand.id,
      targetBoardId: pendingCommand.targetDevice?.boardId,
      messageType: pendingCommand.messageType,
      messageId: pendingCommand.messageId,
      payload: pendingCommand.payload,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Poll error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Telemetry endpoint for Base Stations to POST received LoRa data
 * POST /api/gateway/telemetry
 */
export const receiveTelemetry = async (req: Request, res: Response) => {
  try {
    const telemetryData = telemetrySchema.parse(req.body);

    // Find the device by boardId
    let device = await prisma.device.findUnique({
      where: { boardId: telemetryData.boardId },
      include: { network: true },
    });

    // Auto-discovery: If device doesn't exist, create it
    if (!device) {
      // Find a base station in any network to associate this new field unit
      // In production, you might want to associate it with the base station that received the signal
      const anyBaseStation = await prisma.device.findFirst({
        where: { deviceType: 'BASE_STATION' },
        include: { network: true },
      });

      if (!anyBaseStation) {
        return res.status(400).json({ error: 'No base station available for auto-discovery' });
      }

      device = await prisma.device.create({
        data: {
          boardId: telemetryData.boardId,
          deviceType: 'FIELD_UNIT',
          networkId: anyBaseStation.networkId,
          status: 'DISCOVERED',
          latitude: telemetryData.latitude,
          longitude: telemetryData.longitude,
          altitude: telemetryData.altitude,
          batteryVoltage: telemetryData.batteryVoltage,
          lastSeen: new Date(),
        },
        include: { network: true },
      });
    } else {
      // Update existing device
      const updateData: any = {
        lastSeen: new Date(),
        status: 'ONLINE',
      };

      if (telemetryData.latitude !== undefined) updateData.latitude = telemetryData.latitude;
      if (telemetryData.longitude !== undefined) updateData.longitude = telemetryData.longitude;
      if (telemetryData.altitude !== undefined) updateData.altitude = telemetryData.altitude;
      if (telemetryData.batteryVoltage !== undefined) {
        updateData.batteryVoltage = telemetryData.batteryVoltage;
        // Simple battery percentage calculation (assuming 3.0V min, 4.2V max for Li-ion)
        const minVoltage = 3.0;
        const maxVoltage = 4.2;
        const percentage = Math.round(
          ((telemetryData.batteryVoltage - minVoltage) / (maxVoltage - minVoltage)) * 100
        );
        updateData.batteryPercent = Math.max(0, Math.min(100, percentage));

        // Update status if battery is low
        if (updateData.batteryPercent < 20) {
          updateData.status = 'LOW_BATTERY';
        }
      }

      await prisma.device.update({
        where: { id: device.id },
        data: updateData,
      });
    }

    // Store telemetry data
    await prisma.telemetry.create({
      data: {
        networkId: device.networkId,
        deviceId: device.id,
        messageType: telemetryData.messageType,
        messageId: telemetryData.messageId,
        data: telemetryData.data || {},
        latitude: telemetryData.latitude,
        longitude: telemetryData.longitude,
        altitude: telemetryData.altitude,
        batteryVoltage: telemetryData.batteryVoltage,
        rssi: telemetryData.rssi,
        snr: telemetryData.snr,
        receivedAt: new Date(),
      },
    });

    res.status(201).json({ success: true, deviceId: device.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Telemetry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Acknowledge command completion
 * POST /api/gateway/ack
 */
export const acknowledgeCommand = async (req: Request, res: Response) => {
  try {
    const { commandId, success, responseData } = req.body;

    const command = await prisma.command.findUnique({
      where: { id: commandId },
    });

    if (!command) {
      return res.status(404).json({ error: 'Command not found' });
    }

    await prisma.command.update({
      where: { id: commandId },
      data: {
        status: success ? 'COMPLETED' : 'FAILED',
        completedAt: new Date(),
        responseData: responseData || {},
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Acknowledge error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
