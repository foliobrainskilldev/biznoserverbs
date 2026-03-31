const { PrismaClient } = require('@prisma/client');

// Inicializa o Prisma Client
// Isto cria um "singleton" para não esgotarmos as conexões do banco de dados
const prisma = new PrismaClient();

module.exports = prisma;