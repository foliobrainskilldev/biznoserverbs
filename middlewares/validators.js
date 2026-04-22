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

const orderLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 15,
    message: { success: false, message: 'Muitos pedidos enviados em pouco tempo. Aguarde alguns minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const registerRules = () => [
    body('storeName').notEmpty().isString().trim().isLength({ min: 3, max: 50 }),
    body('whatsapp').notEmpty().isString().trim().isLength({ max: 20 }),
    body('email').isEmail().normalizeEmail().isLength({ max: 100 }),
    body('password').isLength({ min: 6, max: 100 })
];

const loginRules = () => [
    body('email').isEmail().normalizeEmail().isLength({ max: 100 }),
    body('password').notEmpty().isLength({ max: 100 })
];

const emailRules = () => [
    body('email').isEmail().normalizeEmail().isLength({ max: 100 })
];

const resetPasswordRules = () => [
    body('email').isEmail().normalizeEmail().isLength({ max: 100 }),
    body('code').notEmpty().isString().trim().isLength({ max: 6 }),
    body('newPassword').isLength({ min: 6, max: 100 })
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
    orderLimiter,
    registerRules,
    loginRules,
    emailRules,
    resetPasswordRules,
    validate,
};