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
        if (!origin) return callback(null, true);

        if (config.corsOrigins === '*') {
            return callback(null, true);
        }

        const isEnvAllowed = Array.isArray(config.corsOrigins) && config.corsOrigins.includes(origin);

        if (isEnvAllowed) {
            callback(null, true);
        } else {
            console.error(`[CORS BLOQUEADO] Origem não autorizada: ${origin}`);
            callback(new Error('Acesso não permitido pelas políticas de CORS'));
        }
    },
    optionsSuccessStatus: 200,
    credentials: true 
};

app.use(cors(corsOptions));
app.use(helmet());

// Guardamos o rawBody apenas para a validação da assinatura da Débito API
app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl.includes('/webhooks/debito')) {
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
            console.log(`Configuração CORS ativa restrita ao ENV:`, config.corsOrigins);
        });
    })
    .catch(err => {
        console.error('\n=== ERRO FATAL AO INICIAR O SERVIDOR ===');
        console.error('MENSAGEM DE ERRO:', err.message);
        process.exit(1);
    });