const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

// --- RATE LIMITERS ---

// Limita as solicitações de envio de e-mail (recuperação de senha, reenvio de verificação)
const emailLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hora
	max: 5, // Limita cada IP a 5 solicitações por hora
	message: { success: false, message: 'Muitos pedidos de e-mail a partir deste IP, por favor, tente novamente após uma hora.' },
	standardHeaders: true, // Retorna a informação do limite nos headers `RateLimit-*`
	legacyHeaders: false, // Desabilita os headers `X-RateLimit-*`
});

// Limita as tentativas de login para prevenir ataques de força bruta
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    message: { success: false, message: 'Muitas tentativas de login. Por favor, tente novamente em 15 minutos.'}
});


// --- REGRAS DE VALIDAÇÃO (express-validator) ---

const registerRules = () => [
    body('storeName', 'O nome da loja é obrigatório e deve ter pelo menos 3 caracteres').notEmpty().isString().trim().isLength({ min: 3 }),
    body('whatsapp', 'O número de WhatsApp é obrigatório').notEmpty().isString().trim(),
    body('email', 'Por favor, inclua um e-mail válido').isEmail().normalizeEmail(),
    body('password', 'A senha deve ter pelo menos 6 caracteres').isLength({ min: 6 })
];

const loginRules = () => [
    body('email', 'Por favor, inclua um e-mail válido').isEmail().normalizeEmail(),
    body('password', 'A senha é obrigatória').notEmpty()
];

const emailRules = () => [
    body('email', 'Por favor, inclua um e-mail válido').isEmail().normalizeEmail()
];

const resetPasswordRules = () => [
    body('email', 'Por favor, inclua um e-mail válido').isEmail().normalizeEmail(),
    body('code', 'O código de verificação é obrigatório').notEmpty().isString().trim(),
    body('newPassword', 'A nova senha deve ter pelo menos 6 caracteres').isLength({ min: 6 })
];


// --- MIDDLEWARE DE VALIDAÇÃO ---

// Função que verifica se houve erros de validação
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return next();
    }
    const extractedErrors = [];
    errors.array().map(err => extractedErrors.push({ [err.path]: err.msg }));

    return res.status(422).json({
        success: false,
        message: 'Erro de validação nos dados enviados.',
        errors: extractedErrors,
    });
};

module.exports = {
    emailLimiter,
    loginLimiter,
    registerRules,
    loginRules,
    emailRules,
    resetPasswordRules,
    validate,
};