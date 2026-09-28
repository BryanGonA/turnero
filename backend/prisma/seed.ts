import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminIdNumber = 'admin'; // You can change the admin ID/username here
  const rawPassword = 'adminpassword'; // Change the initial password here

  console.log(`Checking if admin user (${adminIdNumber}) exists...`);
  
  const existingAdmin = await prisma.user.findUnique({
    where: { id_number: adminIdNumber },
  });

  if (existingAdmin) {
    console.log('Admin user already exists.');
    return;
  }

  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  const admin = await prisma.user.create({
    data: {
      name: 'System Admin',
      id_number: adminIdNumber,
      password: hashedPassword,
      role: Role.ADMIN,
    },
  });

  console.log(`✅ Admin user created successfully:
  Name: ${admin.name}
  ID Number: ${admin.id_number}
  Password: ${rawPassword}
  Role: ${admin.role}`);
}

main()
  .catch((e) => {
    console.error('Error creating admin user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
