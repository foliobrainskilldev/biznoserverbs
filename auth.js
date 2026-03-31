const jwt = require('jsonwebtoken');
const { config } = require('./config');
const prisma = require('./models');
const { handleError } = require('./utils');

const verifyToken = async (req, res, next, requiredRole) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Acesso negado. Nenhum token fornecido.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        
        // Busca o utilizador no PostgreSQL
        const user = await prisma.user.findUnique({
            where: { id: decoded.id }
        });
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'Token inválido. Utilizador não encontrado.' });
        }

        // Removemos os dados sensíveis (o Prisma não tem um .select('-password') direto como o Mongoose)
        delete user.password;
        delete user.verificationCode;
        delete user.passwordResetCode;
        
        if (requiredRole && user.role !== requiredRole) {
             return res.status(403).json({ success: false, message: 'Acesso proibido. Permissões insuficientes.' });
        }
        
        if (user.role === 'user' && !user.isVerified) {
            return res.status(403).json({ success: false, message: 'Conta não verificada. Por favor, confirme o seu e-mail.' });
        }

        req.user = user;
        next();

    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ success: false, message: 'Token expirado. Por favor, faça login novamente.' });
        }
        return handleError(res, error, 'Falha na autenticação do token.', 401);
    }
};

const verifyUserToken = (req, res, next) => {
    verifyToken(req, res, next);
};

const verifyAdminToken = (req, res, next) => {
    verifyToken(req, res, next, 'admin');
};

/**
 * Middleware para verificar se o plano do utilizador está ativo.
 * Bloqueia ações de escrita (POST, PUT, DELETE) se o plano estiver expirado ou pendente.
 */
const checkPlanStatus = (req, res, next) => {
    // Permite que pedidos GET passem sempre, para que o utilizador possa ver os seus dados.
    if (req.method === 'GET') {
        return next();
    }

    const allowedStatus = ['active', 'free'];
    
    if (!allowedStatus.includes(req.user.planStatus)) {
        return res.status(403).json({ 
            success: false, 
            message: 'O seu plano expirou ou está pendente. Por favor, renove o seu plano para desbloquear esta funcionalidade.' 
        });
    }

    next();
};

module.exports = {
    verifyUserToken,
    verifyAdminToken,
    checkPlanStatus,
};