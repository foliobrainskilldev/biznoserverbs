const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const prisma = require('./config/db');
const { config, initializeDefaults } = require('./config/setup');
const { handleError } = require('./utils/helpers');

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

// O rawBody apenas para a validação da assinatura da PaySuite
app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl.includes('/webhooks/paysuite')) {
            req.rawBody = buf.toString();
        }
    }
}));
app.use(express.urlencoded({ extended: true }));

// Registar as rotas da API
app.use('/api', routes);


app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: 'A rota solicitada não existe nesta API.'
    });
});

// --- NOVO: Middleware de Tratamento Global de Erros do Express ---
app.use((err, req, res, next) => {
    // 1. Captura erros de JSON malformado do body-parser
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