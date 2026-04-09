require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./db');

const rawFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const corsOrigins = rawFrontendUrl.trim() === '*' 
    ? '*' 
    : rawFrontendUrl.split(',').map(u => u.trim());

const config = {
    port: process.env.PORT || 3000,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM || 'Bizno <geral@bizno.store>',
    cloudinary: {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    },
    corsOrigins: corsOrigins,
    paysuite: {
        apiUrl: process.env.PAYSUITE_API_BASE_URL || 'https://paysuite.tech/api/v1',
        token: process.env.PAYSUITE_API_TOKEN,
        webhookSecret: process.env.PAYSUITE_WEBHOOK_SECRET
    },
    urls: {
        appUrl: process.env.APP_URL,
        paymentReturnUrl: process.env.PAYMENT_RETURN_URL,
        paymentCallbackUrl: process.env.PAYMENT_CALLBACK_URL
    }
};

const initializeDefaults = async () => {
    try {
        if (config.adminEmail && config.adminPassword) {
            const adminExists = await prisma.user.findUnique({
                where: { email: config.adminEmail }
            });

            if (!adminExists) {
                const hashedPassword = await bcrypt.hash(config.adminPassword, 12);
                await prisma.user.create({
                    data: {
                        email: config.adminEmail,
                        password: hashedPassword,
                        role: 'admin',
                        isVerified: true,
                        storeName: 'admin-panel', 
                        displayName: 'Admin Panel',
                        visual: {},
                        contacts: {},
                        deliverySettings: {}
                    }
                });
            }
        }

        const planCount = await prisma.plan.count();
        if (planCount === 0) {
            const defaultPlans = [
                { name: 'Free', price: 0, productLimit: 5, imageLimitPerProduct: 1, videoLimit: 0, categoriesLimit: -1, hasColorCustomization: false, hasPromotions: true, hasFeaturedProducts: false, hasSupport: 'faqs', isVisible: true },
                { name: 'Starter', price: 290, productLimit: 70, imageLimitPerProduct: 3, videoLimit: 0, categoriesLimit: -1, hasColorCustomization: true, hasPromotions: true, hasFeaturedProducts: false, hasSupport: 'basic', isVisible: true },
                { name: 'Business', price: 890, productLimit: 200, imageLimitPerProduct: 10, videoLimit: 30, categoriesLimit: -1, hasColorCustomization: true, hasPromotions: true, hasFeaturedProducts: true, hasSupport: 'priority', hasPromotionTimer: true, isVisible: true },
                { name: 'Personalizado', price: 0, productLimit: -1, imageLimitPerProduct: -1, videoLimit: -1, categoriesLimit: -1, hasColorCustomization: true, hasPromotions: true, hasFeaturedProducts: true, hasSupport: 'dedicated', hasPromotionTimer: true, isCustom: true, isVisible: true }
            ];
            await prisma.plan.createMany({ data: defaultPlans });
        }
    } catch (error) {
        throw error;
    }
};

module.exports = {
    config,
    initializeDefaults,
};