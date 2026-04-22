const prisma = require('../config/db');

const generateNumericCode = (length = 6) => {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const calculateDiscountPercentage = (originalPrice, promotionalPrice) => {
    if (!originalPrice || originalPrice <= 0 || promotionalPrice >= originalPrice) {
        return 0;
    }
    return Math.round(((originalPrice - promotionalPrice) / originalPrice) * 100);
};

const handleError = (res, error, message, statusCode = 500) => {
    prisma.systemLog.create({
        data: {
            level: 'error',
            message: message,
            context: error.stack || 'No stack available.',
            meta: { name: error.name, cause: error.message }
        }
    }).catch(() => {});

    return res.status(statusCode).json({
        success: false,
        message: message || 'Ocorreu um erro inesperado no servidor.',
    });
};

const sanitizeStoreNameForURL = (storeName) => {
    if (!storeName) return '';
    return String(storeName)
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9]/g, '');
};

const getPlanExpirationDate = (days = 30) => {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

const getPaginationParams = (req, defaultLimit = 20) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    let limit = parseInt(req.query.limit, 10) || defaultLimit;
    if (limit > 100) limit = 100; 
    const skip = (page - 1) * limit;
    return { skip, take: limit, page, limit };
};

module.exports = {
    generateNumericCode,
    calculateDiscountPercentage,
    handleError,
    sanitizeStoreNameForURL,
    getPlanExpirationDate,
    getPaginationParams
};