const jwt = require('jsonwebtoken');
const { config } = require('../config/setup');
const prisma = require('../config/db');
const { handleError } = require('../utils/helpers');

const verifyToken = async (req, res, next, requiredRole) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Acesso negado. Nenhum token fornecido.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        
        const user = await prisma.user.findUnique({
            where: { id: decoded.id }
        });
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'Token inválido. Utilizador não encontrado.' });
        }

        delete user.password;
        delete user.verificationCode;
        delete user.passwordResetCode;
        
        if (requiredRole && user.role !== requiredRole) {
             return res.status(403).json({ success: false, message: 'Acesso proibido. Permissões insuficientes.' });
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

const verifyUserToken = (req, res, next) => verifyToken(req, res, next);
const verifyAdminToken = (req, res, next) => verifyToken(req, res, next, 'admin');

const checkPlanStatus = (req, res, next) => {
    if (req.method === 'GET') return next();

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