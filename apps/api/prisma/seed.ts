import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? '12');

  if (!email || !username || !password) {
    throw new Error('INITIAL_ADMIN_* environment values are required for seeding.');
  }

  const passwordHash = await bcrypt.hash(password, bcryptRounds);

  await prisma.adminUser.upsert({
    where: {
      email,
    },
    update: {
      username,
      passwordHash,
      isActive: true,
    },
    create: {
      email,
      username,
      passwordHash,
    },
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
