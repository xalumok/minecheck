/// <reference types="node" />
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

async function ensureMegaAdmin() {
  const email = process.env.INITIAL_MEGA_ADMIN_EMAIL;
  const password = process.env.INITIAL_MEGA_ADMIN_PASSWORD;
  const name = process.env.INITIAL_MEGA_ADMIN_NAME ?? 'Mega Admin';

  if (!email || !password) {
    throw new Error(
      'INITIAL_MEGA_ADMIN_EMAIL and INITIAL_MEGA_ADMIN_PASSWORD must be set before running the seed.'
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    console.log(`Mega Admin user already exists with email ${email}. Skipping creation.`);
    return;
  }

  const hashedPassword = await hashPassword(password);

  await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      role: 'MEGA_ADMIN',
      isActive: true,
    },
  });

  console.log(`Mega Admin user created with email ${email}.`);
}

async function main() {
  await ensureMegaAdmin();
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
