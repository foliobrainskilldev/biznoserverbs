// Ficheiro: src/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const prisma = require('./config/db');
const { config, initializeDefaults } = require('./config/setup');

const app = express();

const corsOptions = {
    origin: function (origin, callback) {
        // Permite ferramentas como Postman e requests server-to-server que não enviam origin
        if (!origin) return callback(null, true);

        // 1. REGRAS PRINCIPAIS (Vindas do ENV)
        if (config.corsOrigins === '*') {
            return callback(null, true); // Aceita tráfego de qualquer origem
        }

        const isEnvAllowed = Array.isArray(config.corsOrigins) && config.corsOrigins.includes(origin);

        // 2. REGRAS OPCIONAIS / FALLBACKS (Vindas do código)
        const isFallbackAllowed = 
            origin.endsWith('.bizno.store') || 
            origin === 'https://bizno.store' ||
            origin.endsWith('.vercel.app') || 
            origin.includes('localhost');

        // Validação Final
        if (isEnvAllowed || isFallbackAllowed) {
            callback(null, true);
        } else {
            callback(new Error('Acesso não permitido pelas políticas de CORS'));
        }
    },
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(helmet());

// Guardamos o rawBody apenas para a validação da assinatura da PaySuite
app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl.includes('/webhooks/paysuite')) {
            req.rawBody = buf.toString();
        }
    }
}));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

console.log('A ligar ao PostgreSQL...');

prisma.$connect()
    .then(async () => {
        console.log('PostgreSQL ligado com sucesso via Prisma.');
        await initializeDefaults();
        
        app.listen(config.port, () => {
            console.log(`Servidor Bizno a correr na porta ${config.port}`);
            console.log(`Configuração CORS ativa: Principal (${config.corsOrigins}) + Opcionais (*.bizno.store, etc.)`);
        });
    })
    .catch(err => {
        console.error('\n=== ERRO FATAL AO INICIAR O SERVIDOR ===');
        console.error('MENSAGEM DE ERRO:', err.message);
        process.exit(1);
    });