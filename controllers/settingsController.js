const prisma = require('../config/db');
const cloudinary = require('cloudinary').v2;
const {
    config
} = require('../config/setup');
const paysuiteService = require('../services/paysuiteService');
const paymentService = require('../services/paymentService');
const asyncHandler = require('../utils/asyncHandler');
const {
    sanitizeStoreNameForURL
} = require('../utils/helpers');
const fs = require('fs');

cloudinary.config(config.cloudinary);

exports.getAccountInfo = asyncHandler(async (req, res) => {
    res.status(200).json({
        success: true,
        account: {
            storeName: req.user.storeName,
            displayName: req.user.displayName,
            whatsapp: req.user.whatsapp,
            email: req.user.email
        }
    });
});

exports.updateAccountInfo = asyncHandler(async (req, res) => {
    const {
        storeName,
        displayName,
        whatsapp
    } = req.body;
    if (!storeName || !displayName || !whatsapp) {
        return res.status(400).json({
            success: false,
            message: 'Campos obrigatórios em falta.'
        });
    }

    const urlFriendlyStoreName = sanitizeStoreNameForURL(String(storeName).substring(0, 50));
    if (!urlFriendlyStoreName) return res.status(400).json({
        success: false,
        message: 'Nome inválido.'
    });

    if (urlFriendlyStoreName !== req.user.storeName) {
        const existingStore = await prisma.user.findFirst({
            where: {
                storeName: urlFriendlyStoreName
            }
        });
        if (existingStore) return res.status(409).json({
            success: false,
            message: 'Subdomínio em uso.'
        });
    }

    const updatedUser = await prisma.user.update({
        where: {
            id: req.user.id
        },
        data: {
            storeName: urlFriendlyStoreName,
            displayName: String(displayName).substring(0, 50),
            whatsapp: String(whatsapp).substring(0, 20)
        }
    });
    res.status(200).json({
        success: true,
        message: 'Conta atualizada com sucesso!',
        account: updatedUser
    });
});

exports.applyThemePreset = asyncHandler(async (req, res) => {
    const updatedUser = await prisma.user.update({
        where: {
            id: req.user.id
        },
        data: {
            visual: {
                ...req.user.visual,
                ...req.body.presetData
            }
        }
    });
    res.status(200).json({
        success: true,
        message: 'Tema aplicado!',
        visual: updatedUser.visual
    });
});

const handleImageUpdate = async (userId, visual, file, type) => {
    if (visual[type]?.public_id) await cloudinary.uploader.destroy(visual[type].public_id);
    const result = await cloudinary.uploader.upload(file.path, {
        folder: `bizno/${userId}/visual`,
        format: "webp",
        quality: "auto:good",
        width: 800,
        crop: "limit"
    });
    fs.unlink(file.path, () => {});

    visual[type] = {
        url: result.secure_url,
        public_id: result.public_id
    };
    return visual;
};

const updateMediaHelper = (type) => asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({
        success: false,
        message: "Imagem não enviada."
    });
    const visual = await handleImageUpdate(req.user.id, req.user.visual || {}, req.file, type);
    await prisma.user.update({
        where: {
            id: req.user.id
        },
        data: {
            visual
        }
    });
    res.status(200).json({
        success: true,
        message: 'Media atualizada.',
        url: visual[type].url
    });
});

exports.updateCoverImage = updateMediaHelper('coverImage');
exports.updateProfileImage = updateMediaHelper('profileImage');
exports.updateFavicon = updateMediaHelper('favicon');
exports.updateUserAvatar = updateMediaHelper('userAvatar');

exports.updateVisualTheme = asyncHandler(async (req, res) => {
    const {
        corPrimaria,
        corFundo,
        corTexto,
        corCards,
        storeDescription,
        fbPixel,
        googleAnalytics
    } = req.body;
    const currentVisual = req.user.visual || {};

    const newVisual = {
        ...currentVisual,
        corPrimaria: corPrimaria || currentVisual.corPrimaria,
        corFundo: corFundo || currentVisual.corFundo,
        corTexto: corTexto || currentVisual.corTexto,
        corCards: corCards || currentVisual.corCards,
        storeDescription: storeDescription !== undefined ? String(storeDescription).substring(0, 160) : currentVisual.storeDescription,
        fbPixel: fbPixel !== undefined ? String(fbPixel).substring(0, 50) : currentVisual.fbPixel,
        googleAnalytics: googleAnalytics !== undefined ? String(googleAnalytics).substring(0, 50) : currentVisual.googleAnalytics
    };

    const updatedUser = await prisma.user.update({
        where: {
            id: req.user.id
        },
        data: {
            visual: newVisual
        }
    });
    res.status(200).json({
        success: true,
        message: 'Tema atualizado!',
        visual: updatedUser.visual
    });
});

exports.getVisualTheme = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: {
            id: req.user.id
        },
        select: {
            visual: true
        }
    });
    res.status(200).json({
        success: true,
        visual: user.visual || {}
    });
});

exports.createCoupon = asyncHandler(async (req, res) => {
    const {
        code,
        discountPercentage,
        discountFixed,
        maxUses,
        validUntil
    } = req.body;
    if (!code) return res.status(400).json({
        success: false,
        message: 'Código obrigatório.'
    });

    const coupon = await prisma.coupon.create({
        data: {
            userId: req.user.id,
            code: String(code).toUpperCase().trim(),
            discountPercentage: discountPercentage ? parseFloat(discountPercentage) : null,
            discountFixed: discountFixed ? parseFloat(discountFixed) : null,
            maxUses: maxUses ? parseInt(maxUses, 10) : null,
            validUntil: validUntil ? new Date(validUntil) : null
        }
    });
    res.status(201).json({
        success: true,
        message: 'Cupom criado.',
        coupon
    });
});

exports.getCoupons = asyncHandler(async (req, res) => {
    const coupons = await prisma.coupon.findMany({
        where: {
            userId: req.user.id
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
    res.status(200).json({
        success: true,
        coupons
    });
});

exports.deleteCoupon = asyncHandler(async (req, res) => {
    await prisma.coupon.delete({
        where: {
            id: req.params.id
        }
    });
    res.status(200).json({
        success: true,
        message: 'Cupom removido.'
    });
});

exports.getMedia = asyncHandler(async (req, res) => {
    const {
        resources
    } = await cloudinary.search.expression(`folder:bizno/${req.user.id}`).sort_by('created_at', 'desc').max_results(50).execute();
    const media = resources.map(r => ({
        public_id: r.public_id,
        url: r.secure_url,
        resource_type: r.resource_type,
        created_at: r.created_at
    }));
    res.status(200).json({
        success: true,
        media
    });
});

exports.deleteMedia = asyncHandler(async (req, res) => {
    if (!req.params.asset_id.includes(`bizno/${req.user.id}`)) {
        return res.status(403).json({
            success: false,
            message: 'Não autorizado.'
        });
    }
    await cloudinary.uploader.destroy(req.params.asset_id);
    res.status(200).json({
        success: true,
        message: 'Removido.'
    });
});

exports.getContacts = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: {
            id: req.user.id
        },
        select: {
            contacts: true,
            deliverySettings: true
        }
    });
    res.status(200).json({
        success: true,
        contacts: user.contacts || {},
        deliverySettings: user.deliverySettings || {}
    });
});

exports.updateContacts = asyncHandler(async (req, res) => {
    const {
        showPhone,
        showEmail,
        showSocials,
        customWhatsappMessage,
        socials,
        paymentMethods,
        deliverySettings
    } = req.body;

    const updatedUser = await prisma.user.update({
        where: {
            id: req.user.id
        },
        data: {
            contacts: {
                showPhone: !!showPhone,
                showEmail: !!showEmail,
                showSocials: !!showSocials,
                customWhatsappMessage: customWhatsappMessage ? String(customWhatsappMessage).substring(0, 200) : '',
                socials: {
                    facebook: socials?.facebook || '',
                    instagram: socials?.instagram || '',
                    tiktok: socials?.tiktok || ''
                },
                paymentMethods: {
                    mpesa: !!paymentMethods?.mpesa,
                    emola: !!paymentMethods?.emola,
                    transfer: !!paymentMethods?.transfer,
                    onDelivery: !!paymentMethods?.onDelivery
                }
            },
            deliverySettings: {
                isDeliveryEnabled: !!deliverySettings?.isDeliveryEnabled,
                freeDeliveryThreshold: Number(deliverySettings?.freeDeliveryThreshold) || 0,
                provinceShipping: {
                    enabled: !!deliverySettings?.provinceShipping?.enabled,
                    cost: Number(deliverySettings?.provinceShipping?.cost) || 0
                }
            }
        }
    });
    res.status(200).json({
        success: true,
        message: 'Contatos atualizados.',
        contacts: updatedUser.contacts,
        deliverySettings: updatedUser.deliverySettings
    });
});

exports.initiatePlanPayment = asyncHandler(async (req, res) => {
    const {
        planId,
        provider
    } = req.body;
    if (!planId || !provider || !['mpesa', 'emola', 'credit_card'].includes(provider.toLowerCase())) {
        return res.status(400).json({
            success: false,
            message: 'Plano ou provedor inválido.'
        });
    }

    const plan = await prisma.plan.findUnique({
        where: {
            id: planId
        }
    });
    if (!plan) return res.status(404).json({
        success: false,
        message: 'Plano não encontrado.'
    });

    const internalReference = `BIZ${req.user.id.substring(0, 4)}${Date.now()}`.toUpperCase();
    const returnUrl = `${config.urls.paymentReturnUrl || `${config.urls.appUrl}/pages/dashboard/payment-success.html`}?reference=${internalReference}`;

    const paysuiteResponse = await paysuiteService.createPaymentRequest(plan.price, internalReference, `Plano ${plan.name} - ${req.user.storeName}`, provider.toLowerCase(), returnUrl);

    await prisma.payment.create({
        data: {
            userId: req.user.id,
            planId,
            status: 'pending',
            provider: provider.toLowerCase(),
            gatewayReference: paysuiteResponse.data.id,
            proof: {
                internalReference
            }
        }
    });

    res.status(200).json({
        success: true,
        message: 'Redirecionando...',
        checkoutUrl: paysuiteResponse.data.checkout_url,
        reference: paysuiteResponse.data.id
    });
});

exports.verifyPaymentStatus = asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findFirst({
        where: {
            OR: [{
                gatewayReference: req.params.gatewayReference
            }, {
                proof: {
                    path: ['internalReference'],
                    equals: req.params.gatewayReference
                }
            }]
        },
        include: {
            plan: true,
            user: true
        }
    });

    if (!payment) return res.status(404).json({
        success: false,
        message: 'Pagamento não encontrado.'
    });
    if (payment.userId !== req.user.id) return res.status(403).json({
        success: false,
        message: 'Acesso negado.'
    });
    if (payment.status === 'approved') return res.status(200).json({
        success: true,
        status: 'approved',
        message: 'Aprovado.'
    });

    const finalStatus = await paymentService.syncPaymentStatusWithGateway(payment);
    res.status(200).json({
        success: true,
        status: finalStatus,
        message: finalStatus === 'approved' ? 'Plano ativado!' : 'Aguardando...'
    });
});

exports.getPaymentHistory = asyncHandler(async (req, res) => {
    const history = await prisma.payment.findMany({
        where: {
            userId: req.user.id
        },
        include: {
            plan: {
                select: {
                    name: true,
                    price: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    let synced = false;
    await Promise.all(history.map(async (payment) => {
        if (payment.status === 'pending') {
            const newStatus = await paymentService.syncPaymentStatusWithGateway(payment);
            if (newStatus !== 'pending') {
                payment.status = newStatus;
                synced = true;
            }
        }
    }));
    res.status(200).json({
        success: true,
        history,
        synced
    });
});

exports.getCurrentPlan = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: {
            id: req.user.id
        },
        include: {
            plan: true
        }
    });
    res.status(200).json({
        success: true,
        plan: {
            name: user.plan?.name || 'N/A',
            expiresAt: user.planExpiresAt,
            status: user.planStatus,
            productLimit: user.plan?.productLimit || 0,
            imageLimitPerProduct: user.plan?.imageLimitPerProduct || 0,
            videoLimit: user.plan?.videoLimit || 0,
            storageUsed: user.storageUsed
        }
    });
});

exports.downgradeToFree = asyncHandler(async (req, res) => {
    const freePlan = await prisma.plan.findUnique({
        where: {
            name: 'Free'
        }
    });
    await prisma.user.update({
        where: {
            id: req.user.id
        },
        data: {
            planId: freePlan.id,
            planStatus: 'free',
            planExpiresAt: null
        }
    });
    res.status(200).json({
        success: true,
        message: 'Rebaixado para o Plano Grátis.'
    });
});