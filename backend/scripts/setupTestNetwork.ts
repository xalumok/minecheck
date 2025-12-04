/// <reference types="node" />
import 'dotenv/config';
import { PrismaClient, DeviceStatus, DeviceType, UserRole } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

const TEST_USER_EMAIL = 'test@test.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'TestPassword123!';
const TEST_USER_NAME = 'Field Operator';
const NETWORK_NAME = 'Demo Launch Network';
const NETWORK_DESCRIPTION = 'Simulated network used for QA and demonstrations.';
const BASE_STATION_BOARD_ID = '000000BASE001';
const FIELD_UNIT_BOARD_ID = '000000FIELD001';
const BASE_COORDS = { latitude: 40.7132, longitude: -74.0059, altitude: 12 };
const FIELD_COORDS = { latitude: 40.7128, longitude: -74.006, altitude: 15 };

async function ensureTestUser() {
  const existingUser = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });

  if (existingUser) {
    console.log(`Test user already exists: ${TEST_USER_EMAIL}`);
    return existingUser;
  }

  const passwordHash = await hashPassword(TEST_USER_PASSWORD);

  const user = await prisma.user.create({
    data: {
      email: TEST_USER_EMAIL,
      password: passwordHash,
      name: TEST_USER_NAME,
      role: UserRole.USER,
      isActive: true,
    },
  });

  console.log(`Created test user ${TEST_USER_EMAIL} with password ${TEST_USER_PASSWORD}`);
  return user;
}

async function ensureNetwork(ownerId: string) {
  const existing = await prisma.network.findFirst({
    where: {
      name: NETWORK_NAME,
      ownerId,
    },
  });

  if (existing) {
    console.log(`Network already exists: ${NETWORK_NAME}`);
    return existing;
  }

  const network = await prisma.network.create({
    data: {
      name: NETWORK_NAME,
      description: NETWORK_DESCRIPTION,
      ownerId,
      isActive: true,
    },
  });

  console.log(`Created network ${NETWORK_NAME}`);
  return network;
}

async function upsertDevice(params: {
  networkId: string;
  boardId: string;
  deviceType: DeviceType;
  name: string;
  metadata: Prisma.InputJsonValue;
  coordinates?: { latitude: number; longitude: number; altitude?: number };
  batteryVoltage?: number;
  batteryPercent?: number;
}) {
  const { networkId, boardId, deviceType, name, metadata, coordinates, batteryVoltage, batteryPercent } = params;

  const device = await prisma.device.upsert({
    where: { boardId },
    update: {
      networkId,
      name,
      deviceType,
      status: DeviceStatus.ONLINE,
      metadata,
      ...(coordinates && {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        altitude: coordinates.altitude ?? null,
      }),
      ...(batteryVoltage !== undefined && { batteryVoltage }),
      ...(batteryPercent !== undefined && { batteryPercent }),
    },
    create: {
      boardId,
      deviceType,
      networkId,
      status: DeviceStatus.DISCOVERED,
      name,
      metadata,
      ...(coordinates && {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        altitude: coordinates.altitude ?? null,
      }),
      ...(batteryVoltage !== undefined && { batteryVoltage }),
      ...(batteryPercent !== undefined && { batteryPercent }),
    },
  });

  console.log(`Ensured device ${name} (${deviceType}) with boardId ${boardId}`);
  return device;
}

async function main() {
  try {
    const user = await ensureTestUser();
    const network = await ensureNetwork(user.id);

    const baseStation = await upsertDevice({
      networkId: network.id,
      boardId: BASE_STATION_BOARD_ID,
      deviceType: DeviceType.BASE_STATION,
      name: 'Demo Base Station',
      metadata: {
        hardware: 'NodeMCU/ESP8266',
        location: 'HQ Staging Area',
      },
      coordinates: BASE_COORDS,
      batteryVoltage: 4.95,
    });

    const fieldUnit = await upsertDevice({
      networkId: network.id,
      boardId: FIELD_UNIT_BOARD_ID,
      deviceType: DeviceType.FIELD_UNIT,
      name: 'Demo Field Unit',
      metadata: {
        hardware: 'ATmega-8',
        payload: 'Cake #1',
      },
      coordinates: FIELD_COORDS,
      batteryVoltage: 11.8,
      batteryPercent: 82,
    });

    console.log('\nSetup summary:');
    console.log(`- User: ${user.email}`);
    console.log(`- Network: ${network.name}`);
    console.log(`- Base Station: ${baseStation.boardId}`);
    console.log(`- Field Unit: ${fieldUnit.boardId}`);
  } catch (error) {
    console.error('Setup script failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
