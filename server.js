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
        // Permite ferramentas como Postman e requests server-to-server
        if (!origin) return callback(null, true);

        // Se o ENV estiver definido com '*', permite tudo
        if (config.corsOrigins === '*') {
            return callback(null, true);
        }

        // Validação Estrita via Variável de Ambiente
        const isEnvAllowed = Array.isArray(config.corsOrigins) && config.corsOrigins.includes(origin);

        if (isEnvAllowed) {
            callback(null, true);
        } else {
            console.error(`[CORS BLOQUEADO] Origem não autorizada: ${origin}`);
            callback(new Error('Acesso não permitido pelas políticas de CORS'));
        }
    },
    optionsSuccessStatus: 200,
    credentials: true // Importante para requisições com headers de auth em alguns frontends
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
            console.log(`Configuração CORS ativa restrita ao ENV:`, config.corsOrigins);
        });
    })
    .catch(err => {
        console.error('\n=== ERRO FATAL AO INICIAR O SERVIDOR ===');
        console.error('MENSAGEM DE ERRO:', err.message);
        process.exit(1);
    });