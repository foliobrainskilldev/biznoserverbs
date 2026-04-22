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
            isVerified: true
        },
        include: {
            plan: true
        }
    });

    if (!user) return res.status(404).json({
        success: false,
        message: 'Loja não encontrada.'
    });

    if (user.planExpiresAt && new Date(user.planExpiresAt) < new Date()) {
        if (user.planStatus !== 'expired') {
            await prisma.user.update({
                where: {
                    id: user.id
                },
                data: {
                    planStatus: 'expired'
                }
            });
        }
        return res.status(404).json({
            success: false,
            message: 'Loja indisponível temporariamente.'
        });
    }

    if (user.planStatus !== 'active' && user.planStatus !== 'free') {
        return res.status(404).json({
            success: false,
            message: 'Loja indisponível temporariamente.'
        });
    }

    let [products, categories, activeCoupons] = await Promise.all([
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
        prisma.coupon.findMany({
            where: {
                userId: user.id,
                isActive: true,
                OR: [{
                    validUntil: null
                }, {
                    validUntil: {
                        gte: new Date()
                    }
                }]
            },
            select: {
                code: true,
                discountPercentage: true,
                discountFixed: true
            }
        }),
        prisma.visit.create({
            data: {
                userId: user.id
            }
        })
    ]);

    if (user.planStatus === 'free' || user.plan?.name === 'Free') {
        products = products.slice(0, 5).map(p => ({
            ...p,
            images: p.images?.length > 1 ? [p.images[0]] : p.images
        }));
    }

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
        email,
        verificationExpires,
        passwordResetExpires,
        ...safeUser
    } = user;

    res.status(200).json({
        success: true,
        store: {
            ...safeUser,
            isFreePlan: user.planStatus === 'free' || user.plan?.name === 'Free'
        },
        products,
        categories,
        coupons: activeCoupons
    });
});

exports.getPublicProductData = asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
        where: {
            id: req.params.productId
        },
        include: {
            user: {
                select: {
                    storeName: true,
                    displayName: true,
                    whatsapp: true,
                    contacts: true,
                    planStatus: true,
                    planExpiresAt: true,
                    plan: true,
                    visual: true
                }
            },
            category: {
                select: {
                    name: true
                }
            }
        }
    });

    if (!product || (product.user.planExpiresAt && new Date(product.user.planExpiresAt) < new Date()) || (product.user.planStatus !== 'active' && product.user.planStatus !== 'free')) {
        return res.status(404).json({
            success: false,
            message: 'Produto indisponível.'
        });
    }

    if (product.user.planStatus === 'free' || product.user.plan?.name === 'Free') {
        if (product.images?.length > 1) product.images = [product.images[0]];
    }

    prisma.product.update({
        where: {
            id: product.id
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
});

exports.getCrossSellProducts = asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
        where: {
            id: req.params.productId
        },
        select: {
            categoryId: true,
            userId: true
        }
    });
    if (!product) return res.status(404).json({
        success: false,
        message: 'Produto não encontrado.'
    });

    let related = await prisma.product.findMany({
        where: {
            userId: product.userId,
            categoryId: product.categoryId,
            id: {
                not: product.id
            }
        },
        take: 4
    });
    if (related.length < 4) {
        const more = await prisma.product.findMany({
            where: {
                userId: product.userId,
                id: {
                    not: product.id
                },
                categoryId: {
                    not: product.categoryId
                }
            },
            take: 4 - related.length
        });
        related = related.concat(more);
    }
    res.status(200).json({
        success: true,
        products: related
    });
});

exports.validateCoupon = asyncHandler(async (req, res) => {
    const {
        storeName,
        code
    } = req.params;
    const user = await prisma.user.findFirst({
        where: {
            storeName: {
                equals: storeName,
                mode: 'insensitive'
            }
        }
    });
    if (!user) return res.status(404).json({
        success: false,
        message: 'Loja não encontrada.'
    });

    const coupon = await prisma.coupon.findFirst({
        where: {
            userId: user.id,
            code: {
                equals: code,
                mode: 'insensitive'
            },
            isActive: true,
            OR: [{
                validUntil: null
            }, {
                validUntil: {
                    gte: new Date()
                }
            }]
        }
    });
    if (!coupon || (coupon.maxUses && coupon.currentUses >= coupon.maxUses)) {
        return res.status(400).json({
            success: false,
            message: 'Cupom inválido ou esgotado.'
        });
    }
    res.status(200).json({
        success: true,
        coupon
    });
});

exports.logAbandonedCart = asyncHandler(async (req, res) => {
    const {
        storeOwnerId,
        customerName,
        customerPhone,
        items
    } = req.body;
    if (!storeOwnerId || !items) return res.status(400).json({
        success: false,
        message: 'Dados incompletos.'
    });

    let totalValue = 0;
    for (const item of items) {
        const product = await prisma.product.findUnique({
            where: {
                id: item.id
            }
        });
        if (!product) continue;

        let itemPrice = parseFloat(product.price);
        if (item.addons && product.addons) {
            const selectedAddons = item.addons.split(',').map(a => a.trim());
            const dbAddons = typeof product.addons === 'string' ? JSON.parse(product.addons) : product.addons;
            for (const sAddon of selectedAddons) {
                const matchedAddon = dbAddons.find(dbA => dbA.name === sAddon);
                if (matchedAddon) itemPrice += parseFloat(matchedAddon.price);
            }
        }
        totalValue += (itemPrice * parseInt(item.quantity));
    }

    let customer = null;
    if (customerPhone) {
        customer = await prisma.customer.findFirst({
            where: {
                userId: storeOwnerId,
                phone: customerPhone
            }
        });
        if (!customer) customer = await prisma.customer.create({
            data: {
                userId: storeOwnerId,
                name: customerName || 'Visitante',
                phone: customerPhone
            }
        });
    }

    await prisma.abandonedCart.create({
        data: {
            userId: storeOwnerId,
            customerId: customer?.id || null,
            items,
            totalValue: parseFloat(totalValue) || 0
        }
    });
    res.status(200).json({
        success: true
    });
});

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
});

exports.logInteraction = asyncHandler(async (req, res) => {
    const {
        storeOwnerId,
        type,
        customerName,
        customerPhone,
        customerAddress,
        customerDetails,
        paymentMethod,
        items,
        couponCode
    } = req.body;
    let details = req.body.details || '';

    if (!storeOwnerId || !type) return res.status(400).json({
        success: false,
        message: 'Dados insuficientes.'
    });

    let whatsappMessage = '';
    let finalDetails = details;

    if (type === 'order') {
        if (!items || !items.length) return res.status(400).json({
            success: false,
            message: 'Carrinho vazio.'
        });
        const store = await prisma.user.findUnique({
            where: {
                id: storeOwnerId
            },
            include: {
                deliverySettings: true
            }
        });
        if (!store) return res.status(404).json({
            success: false,
            message: 'Loja não encontrada.'
        });

        let subtotal = 0;
        const orderItemsFormatted = [];

        for (const item of items) {
            const product = await prisma.product.findUnique({
                where: {
                    id: item.id
                }
            });
            if (!product) continue;

            let itemPrice = parseFloat(product.price);

            if (item.addons && product.addons) {
                const selectedAddons = item.addons.split(',').map(a => a.trim());
                const dbAddons = typeof product.addons === 'string' ? JSON.parse(product.addons) : product.addons;
                for (const sAddon of selectedAddons) {
                    const matchedAddon = dbAddons.find(dbA => dbA.name === sAddon);
                    if (matchedAddon) itemPrice += parseFloat(matchedAddon.price);
                }
            }

            subtotal += (itemPrice * parseInt(item.quantity));
            const extrasText = [item.variants, item.addons].filter(Boolean).join(' | ');
            orderItemsFormatted.push(`${item.quantity}x ${product.name} ${extrasText ? `(${extrasText})` : ''} - ${(itemPrice * item.quantity).toFixed(2)} MZN`);
        }

        let discount = 0;
        if (couponCode) {
            const coupon = await prisma.coupon.findFirst({
                where: {
                    code: couponCode,
                    userId: storeOwnerId,
                    isActive: true,
                    OR: [{
                        validUntil: null
                    }, {
                        validUntil: {
                            gte: new Date()
                        }
                    }]
                }
            });
            if (coupon && (!coupon.maxUses || coupon.currentUses < coupon.maxUses)) {
                discount = coupon.discountPercentage ? subtotal * (coupon.discountPercentage / 100) : coupon.discountFixed;
                if (discount > subtotal) discount = subtotal;
                await prisma.coupon.update({
                    where: {
                        id: coupon.id
                    },
                    data: {
                        currentUses: {
                            increment: 1
                        }
                    }
                });
            }
        }

        const total = subtotal - discount;
        const isDel = store.deliverySettings?.isDeliveryEnabled;

        let totalsText = discount > 0 ?
            `*Subtotal: ${subtotal.toFixed(2)} MZN*\n*Desconto: -${discount.toFixed(2)} MZN*\n*Total a Pagar: ${total.toFixed(2)} MZN*` :
            `*Total: ${total.toFixed(2)} MZN*`;

        whatsappMessage = `Olá, ${store.displayName || 'Loja'}! Gostaria de fazer a seguinte *${isDel ? "PEDIDO DE COMPRA" : "RESERVA"}*:\n-----------------------------\n${orderItemsFormatted.join('\n')}\n-----------------------------\n${totalsText}\n\n*Dados do Cliente:*\nNome: ${customerName}\nContacto: ${customerPhone}\n${isDel ? `Endereço: ${customerAddress}` : '(Para combinar o levantamento)'}\n${customerDetails ? `*Detalhes:*\n${customerDetails}\n` : ''}*Pagamento:* ${paymentMethod}\nObrigado!`;

        const meta = {
            status: 'pending',
            items: items.map(i => ({
                id: i.id,
                quantity: i.quantity,
                variants: i.variants,
                addons: i.addons
            })),
            total: total,
            coupon: couponCode || null
        };

        finalDetails = `${whatsappMessage}\n\n===META===\n${JSON.stringify(meta)}`;

        if (customerPhone) {
            let customer = await prisma.customer.findFirst({
                where: {
                    userId: storeOwnerId,
                    phone: customerPhone
                }
            });
            if (!customer) {
                await prisma.customer.create({
                    data: {
                        userId: storeOwnerId,
                        name: customerName || 'Cliente',
                        phone: customerPhone,
                        totalPurchases: 1
                    }
                });
            } else {
                await prisma.customer.update({
                    where: {
                        id: customer.id
                    },
                    data: {
                        totalPurchases: {
                            increment: 1
                        }
                    }
                });
            }
        }
    }

    await prisma.interaction.create({
        data: {
            userId: storeOwnerId,
            type: String(type).substring(0, 50),
            details: finalDetails.substring(0, 5000)
        }
    });

    res.status(200).json({
        success: true,
        message: 'Registado.',
        whatsappMessage
    });
});

exports.generateSitemap = asyncHandler(async (req, res) => {
    const mainDomain = 'https://www.bizno.store';
    const lastMod = new Date().toISOString();
    let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    ['/', '/how.html', '/contacto.html', '/auth/register.html'].forEach(url => {
        sitemapXml += `    <url><loc>${mainDomain}${url}</loc><lastmod>${lastMod}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
    });

    const users = await prisma.user.findMany({
        where: {
            role: 'user',
            isVerified: true,
            planStatus: {
                in: ['active', 'free']
            }
        },
        include: {
            products: {
                select: {
                    id: true,
                    updatedAt: true
                }
            }
        }
    });

    users.forEach(user => {
        const storeUrl = `https://${user.storeName}.bizno.store`;
        sitemapXml += `    <url><loc>${storeUrl}/</loc><lastmod>${user.updatedAt.toISOString()}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>\n`;
        user.products.forEach(product => {
            sitemapXml += `    <url><loc>${storeUrl}/produto/${product.id}</loc><lastmod>${product.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>\n`;
        });
    });

    sitemapXml += `</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(sitemapXml);
});