/// <reference types="node" />
import 'dotenv/config';
import {
  CommandPriority,
  CommandStatus,
  DeviceStatus,
  MessageType,
  PrismaClient,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_USER_EMAIL = 'test@test.com';
const NETWORK_NAME = 'Demo Launch Network';
const BASE_STATION_BOARD_ID = '000000BASE001';
const FIELD_UNIT_BOARD_ID = '000000FIELD001';
const BASE_COORDS = { latitude: 48.915565211, longitude: 37.80919146832517, altitude: 12 };
const FIELD_COORDS = { latitude: 48.91519769213424, longitude: 37.7917650384309, altitude: 15 };

async function getPrerequisites() {
  const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
  if (!user) {
    throw new Error(`Test user ${TEST_USER_EMAIL} not found. Run setupTestNetwork first.`);
  }

  const network = await prisma.network.findFirst({
    where: { name: NETWORK_NAME, ownerId: user.id },
    include: { devices: true },
  });

  if (!network) {
    throw new Error(`Network ${NETWORK_NAME} not found. Run setupTestNetwork first.`);
  }

  const baseStation = network.devices.find((d) => d.boardId === BASE_STATION_BOARD_ID);
  const fieldUnit = network.devices.find((d) => d.boardId === FIELD_UNIT_BOARD_ID);

  if (!baseStation || !fieldUnit) {
    throw new Error('Required devices are missing. Run setupTestNetwork first.');
  }

  return { user, network, baseStation, fieldUnit };
}

async function updateDeviceState(deviceId: string, data: Prisma.DeviceUpdateInput) {
  await prisma.device.update({
    where: { id: deviceId },
    data,
  });
}

async function createTelemetryEntry(params: {
  networkId: string;
  deviceId: string;
  messageType: MessageType;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  batteryVoltage?: number;
  data: Prisma.JsonObject;
}) {
  const { networkId, deviceId, messageType, latitude, longitude, altitude, batteryVoltage, data } = params;

  await prisma.telemetry.create({
    data: {
      networkId,
      deviceId,
      messageType,
      latitude,
      longitude,
      altitude,
      batteryVoltage,
      data,
    },
  });
}

async function queueCommand(params: {
  networkId: string;
  createdBy: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  messageType: MessageType;
  priority: CommandPriority;
  payload: Prisma.JsonObject;
  messageId: string;
}) {
  const { networkId, createdBy, sourceDeviceId, targetDeviceId, messageType, priority, payload, messageId } = params;

  await prisma.command.create({
    data: {
      networkId,
      createdBy,
      sourceDeviceId,
      targetDeviceId,
      messageType,
      priority,
      status: CommandStatus.PENDING,
      payload,
      messageId,
    },
  });
}

async function main() {
  try {
    const { user, network, baseStation, fieldUnit } = await getPrerequisites();

    await updateDeviceState(baseStation.id, {
      status: DeviceStatus.ONLINE,
      lastSeen: new Date(),
      lastPolled: new Date(),
      batteryVoltage: 4.92,
      latitude: BASE_COORDS.latitude,
      longitude: BASE_COORDS.longitude,
      altitude: BASE_COORDS.altitude,
      metadata: {
        signalStrength: -68,
        firmware: '1.0.0',
      },
    });

    await updateDeviceState(fieldUnit.id, {
      status: DeviceStatus.ONLINE,
      lastSeen: new Date(),
      latitude: FIELD_COORDS.latitude,
      longitude: FIELD_COORDS.longitude,
      altitude: FIELD_COORDS.altitude,
      batteryVoltage: 11.8,
      batteryPercent: 82,
      metadata: {
        gpsFix: true,
        sats: 9,
      },
    });

    await createTelemetryEntry({
      networkId: network.id,
      deviceId: baseStation.id,
      messageType: MessageType.MSG_TYPE_POSA,
      data: {
        status: 'Gateway online',
        channel: 1,
      },
    });

    await createTelemetryEntry({
      networkId: network.id,
      deviceId: fieldUnit.id,
      messageType: MessageType.MSG_TYPE_GPS,
      latitude: FIELD_COORDS.latitude,
      longitude: FIELD_COORDS.longitude,
      altitude: FIELD_COORDS.altitude,
      batteryVoltage: 11.8,
      data: {
        lat: FIELD_COORDS.latitude,
        lng: FIELD_COORDS.longitude,
        hdop: 0.8,
      },
    });

    await queueCommand({
      networkId: network.id,
      createdBy: user.id,
      sourceDeviceId: baseStation.id,
      targetDeviceId: fieldUnit.id,
      messageType: MessageType.MSG_TYPE_IGNITE,
      priority: CommandPriority.CRITICAL,
      payload: {
        fuse: 1,
        delayMs: 0,
      },
      messageId: 'IGN01',
    });

    await queueCommand({
      networkId: network.id,
      createdBy: user.id,
      sourceDeviceId: baseStation.id,
      targetDeviceId: fieldUnit.id,
      messageType: MessageType.MSG_TYPE_GPS,
      priority: CommandPriority.NORMAL,
      payload: {
        refresh: true,
      },
      messageId: 'GPS01',
    });

    console.log('Simulated telemetry and queued commands for demo network.');
  } catch (error) {
    console.error('Simulation script failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
