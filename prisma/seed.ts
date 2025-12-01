import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';

async function main() {
    const password = await bcrypt.hash('password', 10);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@example.com' },
        update: {},
        create: {
            email: 'admin@example.com',
            password,
            role: Role.ADMIN,
        },
    });

    const reader = await prisma.user.upsert({
        where: { email: 'reader@example.com' },
        update: {},
        create: {
            email: 'reader@example.com',
            password,
            role: Role.READER,
        },
    });

    console.log({ admin, reader });
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
