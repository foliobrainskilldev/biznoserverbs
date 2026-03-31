const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { config, initializeDefaults } = require('./config');
const routes = require('./routes');
const prisma = require('./models');

const app = express();

// --- Middlewares Essenciais ---

let corsOptions;
if (config.frontendURL === '*' || (Array.isArray(config.frontendURL) && config.frontendURL.includes('*'))) {
    corsOptions = {}; 
} else {
    corsOptions = {
      origin: config.frontendURL,
      optionsSuccessStatus: 200
    };
}
app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Rotas da API ---
app.use('/api', routes);

// --- Conexão com a Base de Dados e Inicialização do Servidor ---
console.log('A ligar ao PostgreSQL...');

prisma.$connect()
    .then(async () => {
        console.log('PostgreSQL ligado com sucesso via Prisma.');
        
        // Inicializa dados padrão (Admin e Planos)
        await initializeDefaults();
        
        // Inicia o servidor
        app.listen(config.port, () => {
            console.log(`Servidor Bizno a correr na porta ${config.port}`);
            console.log(`Frontend URLs configuradas para:`, config.frontendURL);
        });
    })
    .catch(err => {
        // Log melhorado para capturar exatamente o motivo do crash no Render
        console.error('\n=== ERRO FATAL AO INICIAR O SERVIDOR ===');
        console.error('Falha ao ligar ao PostgreSQL ou ao inicializar dados padrão.');
        console.error('MENSAGEM DE ERRO:', err.message);
        console.error('STACK TRACE:', err);
        console.error('========================================\n');
        process.exit(1);
    });