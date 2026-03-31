const initializeDefaults = async () => {
    try {
        if (!config.adminEmail || !config.adminPassword) {
            console.warn('AVISO: ADMIN_EMAIL ou ADMIN_PASSWORD não estão definidos nas Variáveis de Ambiente. A criação do Admin será ignorada.');
        } else {
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
                console.log('Conta de administrador padrão criada com sucesso no PostgreSQL.');
            }
        }

        const planCount = await prisma.plan.count();
        if (planCount === 0) {
            const defaultPlans = [
                {
                    name: 'Free', price: 0, productLimit: 5, imageLimitPerProduct: 1, videoLimit: 0, categoriesLimit: -1,
                    hasColorCustomization: true, hasPromotions: true, hasFeaturedProducts: true, hasSupport: 'faqs', isVisible: true,
                },
                {
                    name: 'Starter', price: 500, productLimit: 50, imageLimitPerProduct: 3, videoLimit: 0, categoriesLimit: -1,
                    hasColorCustomization: true, hasPromotions: true, hasFeaturedProducts: false, hasSupport: 'basic', isVisible: true,
                },
                {
                    name: 'Business', price: 1200, productLimit: 200, imageLimitPerProduct: 10, videoLimit: 30, categoriesLimit: -1,
                    hasColorCustomization: true, hasPromotions: true, hasFeaturedProducts: true, hasSupport: 'priority', hasPromotionTimer: true, isVisible: true,
                },
                 {
                    name: 'Personalizado', price: 0, productLimit: -1, imageLimitPerProduct: -1, videoLimit: -1, categoriesLimit: -1,
                    hasColorCustomization: true, hasPromotions: true, hasFeaturedProducts: true, hasSupport: 'dedicated', hasPromotionTimer: true, isCustom: true, isVisible: true,
                }
            ];

            await prisma.plan.createMany({ data: defaultPlans });
            console.log('Planos padrão criados com sucesso no PostgreSQL.');
        }

    } catch (error) {
        console.error('\n=== ERRO NO INITIALIZE DEFAULTS ===');
        console.error('Erro ao inicializar o Admin ou Planos:', error.message);
        console.error('Dica: Verifique se as variáveis de ambiente estão corretas e se as tabelas do banco de dados existem.');
        console.error('===================================\n');
        throw error; // Lança o erro para ser capturado no server.js
    }
};

module.exports = {
    config,
    initializeDefaults,
};