/// <reference types="node" />
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const snapshot = await prisma.network.findFirst({
    where: { name: 'Demo Launch Network' },
    include: { devices: true },
  });

  console.dir(snapshot, { depth: null });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
