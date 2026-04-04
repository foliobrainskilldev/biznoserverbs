// Ficheiro: src/controllers/settingsController.js
const prisma = require('../config/db');
const { handleError, sanitizeStoreNameForURL } = require('../utils/helpers');
const cloudinary = require('cloudinary').v2;
const { config } = require('../config/setup');
const paysuiteService = require('../services/paysuiteService');
const mailer = require('../services/mailer');

cloudinary.config(config.cloudinary);

const THEME_PRESETS = {
    moderno: { corPrimaria: '#1A2E40', corFundo: '#F0F2F5', corTexto: '#333333', corCards: '#FFFFFF' },
    elegante: { corPrimaria: '#403A3A', corFundo: '#FFFFFF', corTexto: '#403A3A', corCards: '#F9F9F9' },
    vibrante: { corPrimaria: '#D9534F', corFundo: '#FFFFFF', corTexto: '#333333', corCards: '#F7F7F7' },
    natureza: { corPrimaria: '#4A6A5C', corFundo: '#F4F4F4', corTexto: '#2F4F4F', corCards: '#FFFFFF' },
    luxo: { corPrimaria: '#0C2340', corFundo: '#FFFFFF', corTexto: '#333333', corCards: '#F8F9FA' }
};

exports.getAccountInfo = async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            account: {
                storeName: req.user.storeName,
                displayName: req.user.displayName,
                whatsapp: req.user.whatsapp,
                email: req.user.email,
            }
        });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar informações da conta.');
    }
};

exports.updateAccountInfo = async (req, res) => {
    try {
        const { storeName, displayName, whatsapp } = req.body;
        if (!storeName || !displayName || !whatsapp) {
            return res.status(400).json({ success: false, message: 'Campos obrigatórios em falta.' });
        }

        const urlFriendlyStoreName = sanitizeStoreNameForURL(storeName);
        if (!urlFriendlyStoreName) {
            return res.status(400).json({ success: false, message: 'Nome da loja inválido.' });
        }

        if (urlFriendlyStoreName !== req.user.storeName) {
            const existingStore = await prisma.user.findFirst({ where: { storeName: urlFriendlyStoreName } });
            if (existingStore) {
                return res.status(409).json({ success: false, message: 'Este URL/Subdomínio já está em uso por outra conta.' });
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: { storeName: urlFriendlyStoreName, displayName, whatsapp }
        });

        res.status(200).json({
            success: true,
            message: 'Conta atualizada com sucesso!',
            account: { 
                storeName: updatedUser.storeName, 
                displayName: updatedUser.displayName, 
                whatsapp: updatedUser.whatsapp, 
                email: updatedUser.email 
            }
        });
    } catch (error) {
        handleError(res, error, 'Erro ao atualizar a conta.');
    }
};

exports.applyThemePreset = async (req, res) => {
    try {
        const { presetId } = req.body;
        const preset = THEME_PRESETS[presetId];
        if (!preset) return res.status(404).json({ success: false, message: 'Tema não encontrado.' });

        const currentVisual = req.user.visual || {};
        const newVisual = { ...currentVisual, ...preset };

        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: { visual: newVisual }
        });

        res.status(200).json({ success: true, message: 'Tema aplicado!', visual: updatedUser.visual });
    } catch (error) {
        handleError(res, error, 'Erro ao aplicar o tema.');
    }
};

const handleImageUpdate = async (userId, visual, file, type) => {
    if (visual[type] && visual[type].public_id) {
        await cloudinary.uploader.destroy(visual[type].public_id);
    }
    const result = await cloudinary.uploader.upload(file.path, { folder: `bizno/${userId}/visual` });
    visual[type] = { url: result.secure_url, public_id: result.public_id };
    return visual;
};

exports.updateCoverImage = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "Imagem não enviada." });
        let visual = req.user.visual || {};
        visual = await handleImageUpdate(req.user.id, visual, req.file, 'coverImage');
        
        await prisma.user.update({ where: { id: req.user.id }, data: { visual } });
        res.status(200).json({ success: true, message: 'Capa atualizada.', url: visual.coverImage.url });
    } catch (error) {
        handleError(res, error, "Erro ao atualizar imagem de capa.");
    }
};

exports.updateProfileImage = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "Imagem não enviada." });
        let visual = req.user.visual || {};
        visual = await handleImageUpdate(req.user.id, visual, req.file, 'profileImage');
        
        await prisma.user.update({ where: { id: req.user.id }, data: { visual } });
        res.status(200).json({ success: true, message: 'Perfil atualizado.', url: visual.profileImage.url });
    } catch (error) {
        handleError(res, error, "Erro ao atualizar imagem de perfil.");
    }
};

exports.updateUserAvatar = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "Imagem não enviada." });
        let visual = req.user.visual || {};
        visual = await handleImageUpdate(req.user.id, visual, req.file, 'userAvatar');
        
        await prisma.user.update({ where: { id: req.user.id }, data: { visual } });
        res.status(200).json({ success: true, message: 'Foto de perfil atualizada.', url: visual.userAvatar.url });
    } catch (error) {
        handleError(res, error, "Erro ao atualizar avatar do utilizador.");
    }
};

exports.updateVisualTheme = async (req, res) => {
    try {
        const { corPrimaria, corFundo, corTexto, corCards, storeDescription } = req.body;
        const currentVisual = req.user.visual || {};
        
        const newVisual = {
            ...currentVisual,
            corPrimaria: corPrimaria || currentVisual.corPrimaria,
            corFundo: corFundo || currentVisual.corFundo,
            corTexto: corTexto || currentVisual.corTexto,
            corCards: corCards || currentVisual.corCards,
            storeDescription: storeDescription !== undefined ? storeDescription : currentVisual.storeDescription
        };

        const updatedUser = await prisma.user.update({ where: { id: req.user.id }, data: { visual: newVisual } });
        res.status(200).json({ success: true, message: 'Tema atualizado!', visual: updatedUser.visual });
    } catch (error) {
        handleError(res, error, 'Erro ao atualizar tema.');
    }
};

exports.getVisualTheme = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        res.status(200).json({ success: true, visual: user.visual || {} });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar dados visuais.');
    }
};

exports.getMedia = async (req, res) => {
    try {
        const { resources } = await cloudinary.search.expression(`folder:bizno/${req.user.id}`).sort_by('created_at', 'desc').max_results(50).execute();
        const media = resources.map(r => ({ public_id: r.public_id, url: r.secure_url, resource_type: r.resource_type, created_at: r.created_at }));
        res.status(200).json({ success: true, media });
    } catch (error) {
        handleError(res, error, "Erro ao buscar mídias.");
    }
};

exports.deleteMedia = async (req, res) => {
    try {
        const { asset_id } = req.params; 
        if (!asset_id.includes(`bizno/${req.user.id}`)) return res.status(403).json({ success: false, message: 'Não autorizado.' });
        
        await cloudinary.uploader.destroy(asset_id);
        res.status(200).json({ success: true, message: 'Ficheiro removido.' });
    } catch (error) {
        handleError(res, error, 'Erro ao remover mídia.');
    }
};

exports.getContacts = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        res.status(200).json({ success: true, contacts: user.contacts || {}, deliverySettings: user.deliverySettings || {} });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar contatos.');
    }
};

exports.updateContacts = async (req, res) => {
    try {
        const { showPhone, showEmail, showSocials, customWhatsappMessage, socials, paymentMethods, deliverySettings } = req.body;
        
        const newContacts = {
            showPhone: showPhone ? true : false,
            showEmail: showEmail ? true : false,
            showSocials: showSocials ? true : false,
            customWhatsappMessage: customWhatsappMessage || '',
            socials: { 
                facebook: (socials && socials.facebook) ? socials.facebook : '', 
                instagram: (socials && socials.instagram) ? socials.instagram : '', 
                tiktok: (socials && socials.tiktok) ? socials.tiktok : '' 
            },
            paymentMethods: { 
                mpesa: (paymentMethods && paymentMethods.mpesa) ? true : false, 
                emola: (paymentMethods && paymentMethods.emola) ? true : false, 
                transfer: (paymentMethods && paymentMethods.transfer) ? true : false, 
                onDelivery: (paymentMethods && paymentMethods.onDelivery) ? true : false 
            }
        };

        let newDelivery = req.user.deliverySettings || {};
        if (deliverySettings) {
            newDelivery = {
                isDeliveryEnabled: deliverySettings.isDeliveryEnabled ? true : false,
                freeDeliveryThreshold: Number(deliverySettings.freeDeliveryThreshold) || 0,
                provinceShipping: { 
                    enabled: (deliverySettings.provinceShipping && deliverySettings.provinceShipping.enabled) ? true : false, 
                    cost: (deliverySettings.provinceShipping && deliverySettings.provinceShipping.cost) ? Number(deliverySettings.provinceShipping.cost) : 0 
                }
            };
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: { contacts: newContacts, deliverySettings: newDelivery }
        });

        res.status(200).json({ success: true, message: 'Contatos atualizados.', contacts: updatedUser.contacts, deliverySettings: updatedUser.deliverySettings });
    } catch (error) {
        handleError(res, error, 'Erro ao atualizar contatos.');
    }
};

exports.initiatePlanPayment = async (req, res) => {
    const { planId } = req.body; // Removemos a dependência do Provider (MPesa, Emola, etc.)
    
    if (!planId) {
        return res.status(400).json({ success: false, message: 'ID do plano é obrigatório.' });
    }
    
    try {
        const plan = await prisma.plan.findUnique({ where: { id: planId } });
        if(!plan) return res.status(404).json({ success: false, message: 'Plano não encontrado.' });
        
        const internalReference = `BIZ${req.user.id.substring(0, 4)}${Date.now()}`.toUpperCase();
        const description = `Plano ${plan.name} - ${req.user.storeName}`;

        const returnUrl = config.urls.paymentReturnUrl || `${config.urls.appUrl}/dash/planos.html`; 

        const paysuiteResponse = await paysuiteService.createPaymentRequest(
            plan.price,
            internalReference,
            description,
            returnUrl // Não passamos método, a PaySuite cuida disso
        );
        
        await prisma.payment.create({
            data: {
                userId: req.user.id,
                planId: planId,
                status: 'pending',
                provider: 'paysuite_checkout', // Nome genérico do provedor
                gatewayReference: paysuiteResponse.data.id,
                proof: {}
            }
        });
        
        res.status(200).json({ 
            success: true, 
            message: 'Redirecionando para o portal de pagamento...',
            checkoutUrl: paysuiteResponse.data.checkout_url,
            reference: paysuiteResponse.data.id
        });
    } catch (error) {
        console.error('Erro PaySuite:', error.message);
        return res.status(400).json({ success: false, message: `Erro PaySuite: ${error.message}` });
    }
};

exports.verifyPaymentStatus = async (req, res) => {
    const { gatewayReference } = req.params;

    try {
        const payment = await prisma.payment.findFirst({ 
            where: { gatewayReference: gatewayReference },
            include: { plan: true, user: true } 
        });

        if (!payment) return res.status(404).json({ success: false, message: 'Pagamento não encontrado no sistema.' });
        if (payment.userId !== req.user.id) return res.status(403).json({ success: false, message: 'Acesso negado.' });
        
        if (payment.status === 'approved') {
            return res.status(200).json({ success: true, status: 'approved', message: 'Pagamento processado com sucesso.' });
        }

        const paysuiteStatus = await paysuiteService.getPaymentStatus(gatewayReference);
        
        let currentStatus = 'pending';
        let psError = 'Cancelado ou rejeitado pela operadora.';

        if (paysuiteStatus.data && paysuiteStatus.data.status) {
            currentStatus = String(paysuiteStatus.data.status).toLowerCase();
        } else if (paysuiteStatus.status) {
            currentStatus = String(paysuiteStatus.status).toLowerCase();
        }

        if (paysuiteStatus.data && paysuiteStatus.data.error) {
            psError = paysuiteStatus.data.error;
        } else if (paysuiteStatus.message) {
            psError = paysuiteStatus.message;
        }

        const successStatuses = ['paid', 'completed', 'successful', 'success', 'approved']; 
        const failedStatuses = ['failed', 'cancelled', 'error', 'declined'];

        if (successStatuses.includes(currentStatus)) {
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); 
            
            await prisma.$transaction([
                prisma.user.update({ 
                    where: { id: payment.userId }, 
                    data: { planId: payment.planId, planStatus: 'active', planExpiresAt: expiresAt } 
                }),
                prisma.payment.update({ 
                    where: { id: payment.id }, 
                    data: { status: 'approved' } 
                })
            ]);

            await mailer.sendPaymentApprovedEmail(payment.user.email, payment.user.storeName, payment.plan.name);
            return res.status(200).json({ success: true, status: 'approved', message: 'Pagamento concluído e plano ativado!' });
        
        } else if (failedStatuses.includes(currentStatus)) {
            await prisma.payment.update({ 
                where: { id: payment.id }, 
                data: { status: 'rejected', rejectionReason: psError } 
            });
            return res.status(200).json({ success: true, status: 'rejected', message: `Rejeitado: ${psError}` });
        }

        res.status(200).json({ 
            success: true, 
            status: 'pending', 
            message: `A aguardar aprovação no telemóvel...` 
        });

    } catch (error) {
        handleError(res, error, 'Erro ao verificar estado do pagamento.');
    }
};

exports.getPaymentHistory = async (req, res) => {
    try {
        const history = await prisma.payment.findMany({ 
            where: { userId: req.user.id },
            include: { plan: { select: { name: true, price: true } } },
            orderBy: { createdAt: 'desc' }
        });

        let statusUpdated = false;
        for (let payment of history) {
            if (payment.status === 'pending') {
                try {
                    const psStatus = await paysuiteService.getPaymentStatus(payment.gatewayReference);
                    
                    let current = 'pending';
                    if (psStatus.data && psStatus.data.status) {
                        current = String(psStatus.data.status).toLowerCase();
                    } else if (psStatus.status) {
                        current = String(psStatus.status).toLowerCase();
                    }

                    const successList = ['paid', 'completed', 'successful', 'success', 'approved'];
                    const failList = ['failed', 'cancelled', 'error', 'declined'];

                    if (successList.includes(current)) {
                        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                        await prisma.$transaction([
                            prisma.user.update({ where: { id: payment.userId }, data: { planId: payment.planId, planStatus: 'active', planExpiresAt: expiresAt } }),
                            prisma.payment.update({ where: { id: payment.id }, data: { status: 'approved' } })
                        ]);
                        payment.status = 'approved';
                        statusUpdated = true;
                        await mailer.sendPaymentApprovedEmail(req.user.email, req.user.storeName, payment.plan.name);
                    } else if (failList.includes(current)) {
                        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'rejected' } });
                        payment.status = 'rejected';
                        statusUpdated = true;
                    }
                } catch (e) {
                    console.error(`Erro na sincronização automática do pagamento ${payment.id}:`, e.message);
                }
            }
        }

        res.status(200).json({ success: true, history, synced: statusUpdated });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar histórico de pagamentos.');
    }
};

exports.getCurrentPlan = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { plan: true } });
        res.status(200).json({
            success: true,
            plan: {
                name: (user.plan && user.plan.name) ? user.plan.name : 'N/A',
                expiresAt: user.planExpiresAt,
                status: user.planStatus,
                productLimit: (user.plan && user.plan.productLimit !== undefined) ? user.plan.productLimit : 0,
                imageLimitPerProduct: (user.plan && user.plan.imageLimitPerProduct !== undefined) ? user.plan.imageLimitPerProduct : 0,
                storageUsed: user.storageUsed
            }
        });
    } catch (error) {
        handleError(res, error, 'Erro ao obter dados do plano.');
    }
};