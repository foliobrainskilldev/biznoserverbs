const prisma = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

exports.getPublicStoreData = asyncHandler(async (req, res) => {
    const {
        storeName
    } = req.params;
    const user = await prisma.user.findFirst({
        where: {
            storeName: {
                equals: storeName,
                mode: 'insensitive'
            },
            isVerified: true,
            planStatus: {
                in: ['active', 'free']
            }
        },
        include: {
            plan: true
        }
    });

    if (!user) return res.status(404).json({
        success: false,
        message: 'Loja não encontrada ou indisponível.'
    });

    const [products, categories] = await Promise.all([
        prisma.product.findMany({
            where: {
                userId: user.id
            },
            include: {
                category: {
                    select: {
                        name: true
                    }
                }
            }
        }),
        prisma.category.findMany({
            where: {
                userId: user.id
            }
        }),
        prisma.visit.create({
            data: {
                userId: user.id
            }
        })
    ]);


    prisma.user.update({
        where: {
            id: user.id
        },
        data: {
            clickCount: {
                increment: 1
            }
        }
    }).catch(() => {});

    const {
        password,
        verificationCode,
        passwordResetCode,
        ...safeUser
    } = user;

    res.status(200).json({
        success: true,
        store: {
            ...safeUser,
            isFreePlan: user.plan?.name === 'Free'
        },
        products,
        categories,
    });
}, 'Erro ao carregar dados da loja.');


exports.getPublicProductData = asyncHandler(async (req, res) => {
    const {
        productId
    } = req.params;
    const product = await prisma.product.findUnique({
        where: {
            id: productId
        },
        include: {
            user: {
                select: {
                    storeName: true,
                    displayName: true,
                    whatsapp: true,
                    contacts: true
                }
            },
            category: {
                select: {
                    name: true
                }
            }
        }
    });

    if (!product) return res.status(404).json({
        success: false,
        message: 'Produto não encontrado.'
    });


    prisma.product.update({
        where: {
            id: productId
        },
        data: {
            viewCount: {
                increment: 1
            }
        }
    }).catch(() => {});

    res.status(200).json({
        success: true,
        product
    });
}, 'Erro ao carregar dados do produto.');


exports.getPlans = asyncHandler(async (req, res) => {
    const plans = await prisma.plan.findMany({
        where: {
            isVisible: true
        },
        orderBy: {
            price: 'asc'
        }
    });
    res.status(200).json({
        success: true,
        plans
    });
}, 'Erro ao carregar os planos.');


exports.logInteraction = asyncHandler(async (req, res) => {
    const {
        storeOwnerId,
        type,
        details
    } = req.body;
    if (!storeOwnerId || !type || !details) return res.status(400).json({
        success: false,
        message: 'Dados insuficientes.'
    });

    await prisma.interaction.create({
        data: {
            userId: storeOwnerId,
            type,
            details
        }
    });
    res.status(200).json({
        success: true,
        message: 'Interação registada.'
    });
}, 'Interação não registada, mas a prosseguir.');


exports.generateSitemap = asyncHandler(async (req, res) => {
    const mainDomain = 'https://www.bizno.store';
    const lastMod = new Date().toISOString();

    let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    const staticPages = [
        { url: '/', priority: '1.0', changefreq: 'weekly' },
        { url: '/how.html', priority: '0.8', changefreq: 'monthly' },
        { url: '/contacto.html', priority: '0.7', changefreq: 'monthly' },
        { url: '/auth/register.html', priority: '0.9', changefreq: 'monthly' },
        { url: '/termos-e-condicoes.html', priority: '0.5', changefreq: 'yearly' },
        { url: '/politica-de-privacidade.html', priority: '0.5', changefreq: 'yearly' }
    ];

    staticPages.forEach(page => {
        sitemapXml += `    <url><loc>${mainDomain}${page.url}</loc><lastmod>${lastMod}</lastmod><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>\n`;
    });

    const users = await prisma.user.findMany({
        where: {
            role: 'user',
            isVerified: true,
            planStatus: { in: ['active', 'free'] }
        },
        include: { products: true }
    });

    for (const user of users) {
        const storeUrl = `https://${user.storeName}.bizno.store`;
        sitemapXml += `    <url><loc>${storeUrl}/</loc><lastmod>${user.updatedAt.toISOString()}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>\n`;

        for (const product of user.products) {
            sitemapXml += `    <url><loc>${storeUrl}/produto/${product.id}</loc><lastmod>${product.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>\n`;
        }
    }

    sitemapXml += `</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(sitemapXml);
}, 'Erro ao gerar o sitemap dinâmico.');