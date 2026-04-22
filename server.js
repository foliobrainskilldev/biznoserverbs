const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const prisma = require('./config/db');
const { config, initializeDefaults } = require('./config/setup');
const { handleError } = require('./utils/helpers');

const app = express();

app.set('trust proxy', 1);

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
        if (config.corsOrigins === '*') return callback(null, true);

        const isMainAllowed = config.corsOrigins.includes(origin);
        const isSubdomain = origin.endsWith(config.baseDomain);

        if (isMainAllowed || isSubdomain) {
            callback(null, true);
        } else {
            callback(new Error('Acesso não permitido pelas políticas de CORS'));
        }
    },
    optionsSuccessStatus: 200,
    credentials: true
};

app.use(generalLimiter);
app.use(cors(corsOptions));
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
        if (req.originalUrl.includes('/webhooks/paysuite')) {
            req.rawBody = buf.toString();
        }
    }
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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

prisma.$connect()
    .then(async () => {
        await initializeDefaults();
        app.listen(config.port);
    })
    .catch(err => {
        process.exit(1);
    });