const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const prisma = require('./config/db');
const { config, initializeDefaults } = require('./config/setup');
const { handleError } = require('./utils/helpers');

const app = express();

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: {
        success: false,
        message: 'Muitos pedidos a partir deste IP. Tente novamente mais tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

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

app.use(generalLimiter);
app.use(cors(corsOptions));
app.use(helmet());

app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl.includes('/webhooks/paysuite')) {
            req.rawBody = buf.toString();
        }
    }
}));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: 'A rota solicitada não existe nesta API.'
    });
});

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ 
            success: false, 
            message: 'JSON malformado enviado na requisição.' 
        });
    }
    handleError(res, err, 'Ocorreu um erro interno no servidor (Global Handler).');
});

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