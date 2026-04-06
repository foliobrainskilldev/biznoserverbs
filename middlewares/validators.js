const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const emailLimiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	max: 5,
	message: { success: false, message: 'Muitos pedidos a partir deste IP, tente novamente numa hora.' },
	standardHeaders: true,
	legacyHeaders: false,
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Muitas tentativas de login. Tente novamente em 15 minutos.'}
});

const registerRules = () => [
    body('storeName', 'O nome da loja deve ter pelo menos 3 caracteres').notEmpty().isString().trim().isLength({ min: 3 }),
    body('whatsapp', 'O número de WhatsApp é obrigatório').notEmpty().isString().trim(),
    body('email', 'Inclua um e-mail válido').isEmail().normalizeEmail(),
    body('password', 'A senha deve ter pelo menos 6 caracteres').isLength({ min: 6 })
];

const loginRules = () => [
    body('email', 'Inclua um e-mail válido').isEmail().normalizeEmail(),
    body('password', 'A senha é obrigatória').notEmpty()
];

const emailRules = () => [
    body('email', 'Inclua um e-mail válido').isEmail().normalizeEmail()
];

const resetPasswordRules = () => [
    body('email', 'Inclua um e-mail válido').isEmail().normalizeEmail(),
    body('code', 'O código de verificação é obrigatório').notEmpty().isString().trim(),
    body('newPassword', 'A nova senha deve ter pelo menos 6 caracteres').isLength({ min: 6 })
];

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();
    
    const extractedErrors = errors.array().map(err => ({ [err.path]: err.msg }));

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