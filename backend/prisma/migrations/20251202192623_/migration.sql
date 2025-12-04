-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MEGA_ADMIN', 'USER', 'GUEST');

-- CreateEnum
CREATE TYPE "GuestPermission" AS ENUM ('VIEW_ONLY', 'COMMANDER');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('BASE_STATION', 'FIELD_UNIT');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'DISCOVERED', 'LOW_BATTERY');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('MSG_TYPE_POSA', 'MSG_TYPE_BATT', 'MSG_TYPE_GPS', 'MSG_TYPE_COORD', 'MSG_TYPE_PING', 'MSG_TYPE_PONG', 'MSG_TYPE_SET_R', 'MSG_TYPE_RES_ID', 'MSG_TYPE_MSG', 'MSG_TYPE_IGNITE');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "CommandPriority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Network" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Network_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkGuest" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "GuestPermission" NOT NULL DEFAULT 'VIEW_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkGuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "deviceType" "DeviceType" NOT NULL,
    "networkId" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'DISCOVERED',
    "name" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "batteryVoltage" DOUBLE PRECISION,
    "batteryPercent" INTEGER,
    "lastSeen" TIMESTAMP(3),
    "lastPolled" TIMESTAMP(3),
    "firmwareVersion" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Command" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "sourceDeviceId" TEXT,
    "targetDeviceId" TEXT,
    "messageType" "MessageType" NOT NULL,
    "priority" "CommandPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "CommandStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "messageId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "responseData" JSONB,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "Command_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Telemetry" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "messageType" "MessageType" NOT NULL,
    "messageId" TEXT,
    "data" JSONB NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "batteryVoltage" DOUBLE PRECISION,
    "rssi" INTEGER,
    "snr" DOUBLE PRECISION,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Network_ownerId_idx" ON "Network"("ownerId");

-- CreateIndex
CREATE INDEX "Network_isActive_idx" ON "Network"("isActive");

-- CreateIndex
CREATE INDEX "NetworkGuest_userId_idx" ON "NetworkGuest"("userId");

-- CreateIndex
CREATE INDEX "NetworkGuest_networkId_idx" ON "NetworkGuest"("networkId");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkGuest_networkId_userId_key" ON "NetworkGuest"("networkId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_boardId_key" ON "Device"("boardId");

-- CreateIndex
CREATE INDEX "Device_boardId_idx" ON "Device"("boardId");

-- CreateIndex
CREATE INDEX "Device_networkId_idx" ON "Device"("networkId");

-- CreateIndex
CREATE INDEX "Device_deviceType_idx" ON "Device"("deviceType");

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");

-- CreateIndex
CREATE INDEX "Device_lastSeen_idx" ON "Device"("lastSeen");

-- CreateIndex
CREATE INDEX "Command_networkId_idx" ON "Command"("networkId");

-- CreateIndex
CREATE INDEX "Command_status_idx" ON "Command"("status");

-- CreateIndex
CREATE INDEX "Command_priority_createdAt_idx" ON "Command"("priority", "createdAt");

-- CreateIndex
CREATE INDEX "Command_sourceDeviceId_idx" ON "Command"("sourceDeviceId");

-- CreateIndex
CREATE INDEX "Command_targetDeviceId_idx" ON "Command"("targetDeviceId");

-- CreateIndex
CREATE INDEX "Command_createdAt_idx" ON "Command"("createdAt");

-- CreateIndex
CREATE INDEX "Telemetry_networkId_idx" ON "Telemetry"("networkId");

-- CreateIndex
CREATE INDEX "Telemetry_deviceId_idx" ON "Telemetry"("deviceId");

-- CreateIndex
CREATE INDEX "Telemetry_messageType_idx" ON "Telemetry"("messageType");

-- CreateIndex
CREATE INDEX "Telemetry_receivedAt_idx" ON "Telemetry"("receivedAt");

-- CreateIndex
CREATE INDEX "Telemetry_createdAt_idx" ON "Telemetry"("createdAt");

-- AddForeignKey
ALTER TABLE "Network" ADD CONSTRAINT "Network_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkGuest" ADD CONSTRAINT "NetworkGuest_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkGuest" ADD CONSTRAINT "NetworkGuest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_sourceDeviceId_fkey" FOREIGN KEY ("sourceDeviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_targetDeviceId_fkey" FOREIGN KEY ("targetDeviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Telemetry" ADD CONSTRAINT "Telemetry_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Telemetry" ADD CONSTRAINT "Telemetry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
