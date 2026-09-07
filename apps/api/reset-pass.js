process.env.DATABASE_URL = 'mongodb://localhost:27017/mpc_dev';
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  console.log('Users in DB:', JSON.stringify(users));

  const hash = await bcrypt.hash('Admin@1234', 12);

  for (const user of users) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash },
    });
    console.log('Reset password for:', user.email);
  }
  console.log('New password for all users: Admin@1234');
}

main().catch(console.error).finally(() => prisma.$disconnect());
