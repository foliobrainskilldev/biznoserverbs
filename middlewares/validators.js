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
    body('storeName', 'O nome da loja deve ter entre 3 e 50 caracteres').notEmpty().isString().trim().isLength({ min: 3, max: 50 }),
    body('whatsapp', 'O número de WhatsApp é obrigatório e deve ser válido').notEmpty().isString().trim().isLength({ max: 20 }),
    body('email', 'Inclua um e-mail válido com no máximo 100 caracteres').isEmail().normalizeEmail().isLength({ max: 100 }),
    body('password', 'A senha deve ter entre 6 e 100 caracteres').isLength({ min: 6, max: 100 })
];

const loginRules = () => [
    body('email', 'Inclua um e-mail válido').isEmail().normalizeEmail().isLength({ max: 100 }),
    body('password', 'A senha é obrigatória e deve ter um limite razoável').notEmpty().isLength({ max: 100 })
];

const emailRules = () => [
    body('email', 'Inclua um e-mail válido').isEmail().normalizeEmail().isLength({ max: 100 })
];

const resetPasswordRules = () => [
    body('email', 'Inclua um e-mail válido').isEmail().normalizeEmail().isLength({ max: 100 }),
    body('code', 'O código de verificação é obrigatório e deve ter 6 dígitos').notEmpty().isString().trim().isLength({ max: 6 }),
    body('newPassword', 'A nova senha deve ter entre 6 e 100 caracteres').isLength({ min: 6, max: 100 })
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