import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const devices = await prisma.device.findMany({
    select: {
      id: true,
      boardId: true,
      name: true,
      deviceType: true,
      latitude: true,
      longitude: true,
      altitude: true,
      status: true,
      networkId: true,
    },
  });

  console.log('📊 All devices in database:');
  console.log(JSON.stringify(devices, null, 2));
  console.log(`\n✅ Found ${devices.length} device(s)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
