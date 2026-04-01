// Ficheiro: src/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const prisma = require('./config/db');
const { config, initializeDefaults } = require('./config/setup');

const app = express();

// Configuração CORS para permitir subdomínios (*.bizno.store)
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (
            origin.endsWith('.bizno.store') || 
            origin === 'https://bizno.store' ||
            origin.endsWith('.vercel.app') || 
            origin.includes('localhost')
        ) {
            callback(null, true);
        } else {
            callback(new Error('Não permitido pelo CORS'));
        }
    },
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Todas as rotas agora passarão pelo index de rotas
app.use('/api', routes);

console.log('A ligar ao PostgreSQL...');

prisma.$connect()
    .then(async () => {
        console.log('PostgreSQL ligado com sucesso via Prisma.');
        await initializeDefaults();
        
        app.listen(config.port, () => {
            console.log(`Servidor Bizno a correr na porta ${config.port}`);
            console.log(`CORS configurado para subdomínios *.bizno.store e Vercel.`);
        });
    })
    .catch(err => {
        console.error('\n=== ERRO FATAL AO INICIAR O SERVIDOR ===');
        console.error('MENSAGEM DE ERRO:', err.message);
        process.exit(1);
    });