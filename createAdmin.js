// Ficheiro: createAdmin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./models'); // Importa o Prisma Client

const createAdmin = async () => {
    try {
        console.log('A ligar ao PostgreSQL via Prisma...');

        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminEmail || !adminPassword) {
            throw new Error('ADMIN_EMAIL e ADMIN_PASSWORD não estão definidos no ficheiro .env');
        }

        // Verifica se o admin já existe
        const adminExists = await prisma.user.findUnique({ 
            where: { email: adminEmail } 
        });

        if (adminExists) {
            console.log('O utilizador administrador já existe na base de dados.');
            return;
        }

        // Cria o novo admin
        const hashedPassword = await bcrypt.hash(adminPassword, 12);
        
        await prisma.user.create({
            data: {
                email: adminEmail,
                password: hashedPassword,
                role: 'admin',
                isVerified: true,
                storeName: 'admin-panel-manual', // Campo único
                displayName: 'Admin Panel',
                visual: {},
                contacts: {},
                deliverySettings: {}
            }
        });

        console.log('Utilizador administrador criado com sucesso no PostgreSQL!');

    } catch (error) {
        console.error('Erro ao criar o administrador:', error);
    } finally {
        // Fecha a ligação à base de dados
        await prisma.$disconnect();
        console.log('Ligação ao Prisma fechada.');
    }
};

createAdmin();