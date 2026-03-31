const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { config, initializeDefaults } = require('./config');
const routes = require('./routes');
const prisma = require('./models'); // Importa a conexão do Prisma

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
console.log('A ligar ao PostgreSQL no Supabase...');

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
        console.error('Falha ao ligar ao PostgreSQL:', err);
        process.exit(1);
    });