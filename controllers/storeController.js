const prisma = require('../config/db');
const { handleError } = require('../utils/helpers');

exports.getPublicStoreData = async (req, res) => {
    try {
        const { storeName } = req.params;
        const user = await prisma.user.findFirst({ 
            where: { 
                storeName: { equals: storeName, mode: 'insensitive' },
                isVerified: true,
                planStatus: { in: ['active', 'free'] }
            },
            include: { plan: true }
        });

        if (!user) return res.status(404).json({ success: false, message: 'Loja não encontrada ou indisponível.' });

        const [products, categories] = await Promise.all([
            prisma.product.findMany({ where: { userId: user.id }, include: { category: { select: { name: true } } } }),
            prisma.category.findMany({ where: { userId: user.id } }),
            prisma.visit.create({ data: { userId: user.id } })
        ]);
        
        await prisma.user.update({ where: { id: user.id }, data: { clickCount: { increment: 1 } } });
        
        const { password, verificationCode, passwordResetCode, ...safeUser } = user;

        res.status(200).json({
            success: true,
            store: {
                ...safeUser,
                isFreePlan: user.plan?.name === 'Free'
            },
            products,
            categories,
        });
    } catch (error) {
        handleError(res, error, 'Erro ao carregar dados da loja.');
    }
};

exports.getPublicProductData = async (req, res) => {
    try {
        const { productId } = req.params;
        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: {
                user: { select: { storeName: true, displayName: true, whatsapp: true, contacts: true } },
                category: { select: { name: true } }
            }
        });

        if (!product) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
        
        await prisma.product.update({ where: { id: productId }, data: { viewCount: { increment: 1 } } });

        res.status(200).json({ success: true, product });
    } catch (error) {
        handleError(res, error, 'Erro ao carregar dados do produto.');
    }
};

exports.getPlans = async (req, res) => {
    try {
        const plans = await prisma.plan.findMany({ where: { isVisible: true }, orderBy: { price: 'asc' } });
        res.status(200).json({ success: true, plans });
    } catch (error) {
        handleError(res, error, 'Erro ao carregar os planos.');
    }
};

exports.logInteraction = async (req, res) => {
    try {
        const { storeOwnerId, type, details } = req.body;
        if (!storeOwnerId || !type || !details) return res.status(400).json({ success: false, message: 'Dados insuficientes.' });
        
        await prisma.interaction.create({ data: { userId: storeOwnerId, type, details } });
        res.status(200).json({ success: true, message: 'Interação registada.' });
    } catch (error) {
        res.status(200).json({ success: true, message: 'Interação não registada, mas a prosseguir.' });
    }
};

exports.generateSitemap = async (req, res) => {
    try {
        const mainDomain = 'https://bizno.store'; 
        
        let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        sitemapXml += `    <url><loc>${mainDomain}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n`;
        sitemapXml += `    <url><loc>${mainDomain}/how.html</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;

        const users = await prisma.user.findMany({ 
            where: { role: 'user', isVerified: true, planStatus: { in: ['active', 'free'] } } 
        });
        
        for (const user of users) {
            const storeUrl = `https://${encodeURIComponent(user.storeName)}.bizno.store`;
            
            sitemapXml += `    <url><loc>${storeUrl}</loc><lastmod>${user.updatedAt.toISOString()}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>\n`;

            const products = await prisma.product.findMany({ where: { userId: user.id } });
            for (const product of products) {
                sitemapXml += `    <url><loc>${storeUrl}/produto/${product.id}</loc><lastmod>${product.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>\n`;
            }
        }
        
        sitemapXml += `</urlset>`;
        res.header('Content-Type', 'application/xml');
        res.send(sitemapXml);
    } catch (error) {
        handleError(res, error, 'Erro ao gerar o sitemap.');
    }
};