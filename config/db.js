const { PrismaClient } = require('@prisma/client');

// Cria a instância única do Prisma para não esgotar as conexões do banco de dados
const prisma = new PrismaClient();

module.exports = prisma;