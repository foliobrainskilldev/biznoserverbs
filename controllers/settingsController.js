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

cloudinary.config(config.cloudinary);

const THEME_PRESETS = {
    moderno: {
        corPrimaria: '#1A2E40',
        corFundo: '#F0F2F5',
        corTexto: '#333333',
        corCards: '#FFFFFF'
    },
    elegante: {
        corPrimaria: '#403A3A',
        corFundo: '#FFFFFF',
        corTexto: '#403A3A',
        corCards: '#F9F9F9'
    },
    vibrante: {
        corPrimaria: '#D9534F',
        corFundo: '#FFFFFF',
        corTexto: '#333333',
        corCards: '#F7F7F7'
    },
    natureza: {
        corPrimaria: '#4A6A5C',
        corFundo: '#F4F4F4',
        corTexto: '#2F4F4F',
        corCards: '#FFFFFF'
    },
    luxo: {
        corPrimaria: '#0C2340',
        corFundo: '#FFFFFF',
        corTexto: '#333333',
        corCards: '#F8F9FA'
    }
};

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
}, 'Erro ao buscar informações da conta.');

exports.updateAccountInfo = asyncHandler(async (req, res) => {
    const {
        storeName,
        displayName,
        whatsapp
    } = req.body;

    if (!storeName || !displayName || !whatsapp) return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios em falta.'
    });

    const urlFriendlyStoreName = sanitizeStoreNameForURL(String(storeName).substring(0, 50));
    if (!urlFriendlyStoreName) return res.status(400).json({
        success: false,
        message: 'Nome da loja inválido.'
    });

    const safeDisplayName = String(displayName).substring(0, 50);
    const safeWhatsapp = String(whatsapp).substring(0, 20);

    if (urlFriendlyStoreName !== req.user.storeName) {
        const existingStore = await prisma.user.findFirst({
            where: {
                storeName: urlFriendlyStoreName
            }
        });
        if (existingStore) return res.status(409).json({
            success: false,
            message: 'Este URL/Subdomínio já está em uso por outra conta.'
        });
    }

    const updatedUser = await prisma.user.update({
        where: {
            id: req.user.id
        },
        data: {
            storeName: urlFriendlyStoreName,
            displayName: safeDisplayName,
            whatsapp: safeWhatsapp
        }
    });
    res.status(200).json({
        success: true,
        message: 'Conta atualizada com sucesso!',
        account: updatedUser
    });
}, 'Erro ao atualizar a conta.');

exports.applyThemePreset = asyncHandler(async (req, res) => {
    const preset = THEME_PRESETS[req.body.presetId];
    if (!preset) return res.status(404).json({
        success: false,
        message: 'Tema não encontrado.'
    });

    const updatedUser = await prisma.user.update({
        where: {
            id: req.user.id
        },
        data: {
            visual: {
                ...req.user.visual,
                ...preset
            }
        }
    });
    res.status(200).json({
        success: true,
        message: 'Tema aplicado!',
        visual: updatedUser.visual
    });
}, 'Erro ao aplicar o tema.');

const handleImageUpdate = async (userId, visual, file, type) => {
    if (visual[type] && visual[type].public_id) await cloudinary.uploader.destroy(visual[type].public_id);
    const result = await cloudinary.uploader.upload(file.path, {
        folder: `bizno/${userId}/visual`
    });
    visual[type] = {
        url: result.secure_url,
        public_id: result.public_id
    };
    return visual;
};

exports.updateCoverImage = asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({
        success: false,
        message: "Imagem não enviada."
    });
    const visual = await handleImageUpdate(req.user.id, req.user.visual || {}, req.file, 'coverImage');
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
        message: 'Capa atualizada.',
        url: visual.coverImage.url
    });
}, 'Erro ao atualizar imagem de capa.');

exports.updateProfileImage = asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({
        success: false,
        message: "Imagem não enviada."
    });
    const visual = await handleImageUpdate(req.user.id, req.user.visual || {}, req.file, 'profileImage');
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
        message: 'Perfil atualizado.',
        url: visual.profileImage.url
    });
}, 'Erro ao atualizar imagem de perfil.');

exports.updateUserAvatar = asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({
        success: false,
        message: "Imagem não enviada."
    });
    const visual = await handleImageUpdate(req.user.id, req.user.visual || {}, req.file, 'userAvatar');
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
        message: 'Foto de perfil atualizada.',
        url: visual.userAvatar.url
    });
}, 'Erro ao atualizar avatar.');

exports.updateVisualTheme = asyncHandler(async (req, res) => {
    const {
        corPrimaria,
        corFundo,
        corTexto,
        corCards,
        storeDescription
    } = req.body;
    const currentVisual = req.user.visual || {};

    let cleanDescription = storeDescription !== undefined ? storeDescription : currentVisual.storeDescription;
    if (cleanDescription && String(cleanDescription).length > 150) {
        cleanDescription = String(cleanDescription).substring(0, 150);
    }

    const newVisual = {
        ...currentVisual,
        corPrimaria: corPrimaria || currentVisual.corPrimaria,
        corFundo: corFundo || currentVisual.corFundo,
        corTexto: corTexto || currentVisual.corTexto,
        corCards: corCards || currentVisual.corCards,
        storeDescription: cleanDescription
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
}, 'Erro ao atualizar tema.');

exports.getVisualTheme = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: {
            id: req.user.id
        }
    });
    res.status(200).json({
        success: true,
        visual: user.visual || {}
    });
}, 'Erro ao buscar dados visuais.');

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
}, 'Erro ao buscar mídias.');

exports.deleteMedia = asyncHandler(async (req, res) => {
    if (!req.params.asset_id.includes(`bizno/${req.user.id}`)) return res.status(403).json({
        success: false,
        message: 'Não autorizado.'
    });
    await cloudinary.uploader.destroy(req.params.asset_id);
    res.status(200).json({
        success: true,
        message: 'Ficheiro removido.'
    });
}, 'Erro ao remover mídia.');

exports.getContacts = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: {
            id: req.user.id
        }
    });
    res.status(200).json({
        success: true,
        contacts: user.contacts || {},
        deliverySettings: user.deliverySettings || {}
    });
}, 'Erro ao buscar contatos.');

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

    const newContacts = {
        showPhone: !!showPhone,
        showEmail: !!showEmail,
        showSocials: !!showSocials,
        customWhatsappMessage: customWhatsappMessage ? String(customWhatsappMessage).substring(0, 200) : '',
        socials: {
            facebook: socials?.facebook ? String(socials.facebook).substring(0, 200) : '',
            instagram: socials?.instagram ? String(socials.instagram).substring(0, 200) : '',
            tiktok: socials?.tiktok ? String(socials.tiktok).substring(0, 200) : ''
        },
        paymentMethods: {
            mpesa: !!paymentMethods?.mpesa,
            emola: !!paymentMethods?.emola,
            transfer: !!paymentMethods?.transfer,
            onDelivery: !!paymentMethods?.onDelivery
        }
    };

    let newDelivery = req.user.deliverySettings || {};
    if (deliverySettings) {
        newDelivery = {
            isDeliveryEnabled: !!deliverySettings.isDeliveryEnabled,
            freeDeliveryThreshold: Number(deliverySettings.freeDeliveryThreshold) || 0,
            provinceShipping: {
                enabled: !!deliverySettings.provinceShipping?.enabled,
                cost: Number(deliverySettings.provinceShipping?.cost) || 0
            }
        };
    }

    const updatedUser = await prisma.user.update({
        where: {
            id: req.user.id
        },
        data: {
            contacts: newContacts,
            deliverySettings: newDelivery
        }
    });
    res.status(200).json({
        success: true,
        message: 'Contatos atualizados.',
        contacts: updatedUser.contacts,
        deliverySettings: updatedUser.deliverySettings
    });
}, 'Erro ao atualizar contatos.');

exports.initiatePlanPayment = asyncHandler(async (req, res) => {
    const {
        planId,
        provider
    } = req.body;
    if (!planId || !provider || !['mpesa', 'emola', 'credit_card'].includes(provider.toLowerCase())) {
        return res.status(400).json({
            success: false,
            message: 'ID do plano ou provedor inválido.'
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
    const baseReturnUrl = config.urls.paymentReturnUrl || `${config.urls.appUrl}/pages/dashboard/payment-success.html`;
    const separator = baseReturnUrl.includes('?') ? '&' : '?';
    const returnUrl = `${baseReturnUrl}${separator}reference=${internalReference}`;

    const paysuiteResponse = await paysuiteService.createPaymentRequest(plan.price, internalReference, `Plano ${plan.name} - ${req.user.storeName}`, provider.toLowerCase(), returnUrl);

    await prisma.payment.create({
        data: {
            userId: req.user.id,
            planId: planId,
            status: 'pending',
            provider: provider.toLowerCase(),
            gatewayReference: paysuiteResponse.data.id,
            proof: {
                internalReference: internalReference
            }
        }
    });

    res.status(200).json({
        success: true,
        message: 'A redirecionar...',
        checkoutUrl: paysuiteResponse.data.checkout_url,
        reference: paysuiteResponse.data.id
    });
}, 'Erro ao iniciar pagamento via PaySuite.');

exports.verifyPaymentStatus = asyncHandler(async (req, res) => {
    const {
        gatewayReference
    } = req.params;
    const payment = await prisma.payment.findFirst({
        where: {
            OR: [{
                    gatewayReference
                },
                {
                    proof: {
                        path: ['internalReference'],
                        equals: gatewayReference
                    }
                }
            ]
        },
        include: {
            plan: true,
            user: true
        }
    });

    if (!payment) return res.status(404).json({
        success: false,
        message: 'Pagamento não encontrado no sistema.'
    });
    if (payment.userId !== req.user.id) return res.status(403).json({
        success: false,
        message: 'Acesso negado.'
    });

    if (payment.status === 'approved') return res.status(200).json({
        success: true,
        status: 'approved',
        message: 'Pagamento processado com sucesso.'
    });

    const finalStatus = await paymentService.syncPaymentStatusWithGateway(payment);

    if (finalStatus === 'approved') return res.status(200).json({
        success: true,
        status: 'approved',
        message: 'Pagamento concluído e plano ativado!'
    });
    if (finalStatus === 'rejected') return res.status(200).json({
        success: true,
        status: 'rejected',
        message: `O pagamento falhou ou foi recusado.`
    });

    res.status(200).json({
        success: true,
        status: 'pending',
        message: `Aguardando a confirmação da operadora...`
    });
}, 'Erro ao verificar estado do pagamento.');

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

    let statusUpdated = false;

    await Promise.all(history.map(async (payment) => {
        if (payment.status === 'pending') {
            const newStatus = await paymentService.syncPaymentStatusWithGateway(payment);
            if (newStatus !== 'pending') {
                payment.status = newStatus;
                statusUpdated = true;
            }
        }
    }));

    res.status(200).json({
        success: true,
        history,
        synced: statusUpdated
    });
}, 'Erro ao buscar histórico.');

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
            storageUsed: user.storageUsed
        }
    });
}, 'Erro ao obter dados do plano.');