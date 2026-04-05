// Ficheiro: src/controllers/settingsController.js
const prisma = require('../config/db');
const { handleError, sanitizeStoreNameForURL } = require('../utils/helpers');
const cloudinary = require('cloudinary').v2;
const { config } = require('../config/setup');
const debitoService = require('../services/debitoService');
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
        res.status(200).json({ success: true, account: { storeName: req.user.storeName, displayName: req.user.displayName, whatsapp: req.user.whatsapp, email: req.user.email } });
    } catch (error) { handleError(res, error, 'Erro ao buscar informações da conta.'); }
};

exports.updateAccountInfo = async (req, res) => {
    try {
        const { storeName, displayName, whatsapp } = req.body;
        if (!storeName || !displayName || !whatsapp) return res.status(400).json({ success: false, message: 'Campos obrigatórios em falta.' });

        const urlFriendlyStoreName = sanitizeStoreNameForURL(storeName);
        if (!urlFriendlyStoreName) return res.status(400).json({ success: false, message: 'Nome da loja inválido.' });

        if (urlFriendlyStoreName !== req.user.storeName) {
            const existingStore = await prisma.user.findFirst({ where: { storeName: urlFriendlyStoreName } });
            if (existingStore) return res.status(409).json({ success: false, message: 'Este URL/Subdomínio já está em uso.' });
        }

        const updatedUser = await prisma.user.update({ where: { id: req.user.id }, data: { storeName: urlFriendlyStoreName, displayName, whatsapp } });
        res.status(200).json({ success: true, message: 'Conta atualizada com sucesso!', account: { storeName: updatedUser.storeName, displayName: updatedUser.displayName, whatsapp: updatedUser.whatsapp, email: updatedUser.email } });
    } catch (error) { handleError(res, error, 'Erro ao atualizar a conta.'); }
};

exports.applyThemePreset = async (req, res) => {
    try {
        const preset = THEME_PRESETS[req.body.presetId];
        if (!preset) return res.status(404).json({ success: false, message: 'Tema não encontrado.' });
        const updatedUser = await prisma.user.update({ where: { id: req.user.id }, data: { visual: { ...(req.user.visual || {}), ...preset } } });
        res.status(200).json({ success: true, message: 'Tema aplicado!', visual: updatedUser.visual });
    } catch (error) { handleError(res, error, 'Erro ao aplicar o tema.'); }
};

const handleImageUpdate = async (userId, visual, file, type) => {
    if (visual[type] && visual[type].public_id) await cloudinary.uploader.destroy(visual[type].public_id);
    const result = await cloudinary.uploader.upload(file.path, { folder: `bizno/${userId}/visual` });
    visual[type] = { url: result.secure_url, public_id: result.public_id };
    return visual;
};

exports.updateCoverImage = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "Imagem não enviada." });
        let visual = await handleImageUpdate(req.user.id, req.user.visual || {}, req.file, 'coverImage');
        await prisma.user.update({ where: { id: req.user.id }, data: { visual } });
        res.status(200).json({ success: true, message: 'Capa atualizada.', url: visual.coverImage.url });
    } catch (error) { handleError(res, error, "Erro ao atualizar capa."); }
};

exports.updateProfileImage = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "Imagem não enviada." });
        let visual = await handleImageUpdate(req.user.id, req.user.visual || {}, req.file, 'profileImage');
        await prisma.user.update({ where: { id: req.user.id }, data: { visual } });
        res.status(200).json({ success: true, message: 'Perfil atualizado.', url: visual.profileImage.url });
    } catch (error) { handleError(res, error, "Erro ao atualizar perfil."); }
};

exports.updateUserAvatar = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "Imagem não enviada." });
        let visual = await handleImageUpdate(req.user.id, req.user.visual || {}, req.file, 'userAvatar');
        await prisma.user.update({ where: { id: req.user.id }, data: { visual } });
        res.status(200).json({ success: true, message: 'Avatar atualizado.', url: visual.userAvatar.url });
    } catch (error) { handleError(res, error, "Erro ao atualizar avatar."); }
};

exports.updateVisualTheme = async (req, res) => {
    try {
        const { corPrimaria, corFundo, corTexto, corCards, storeDescription } = req.body;
        const current = req.user.visual || {};
        const newVisual = {
            ...current,
            corPrimaria: corPrimaria || current.corPrimaria, corFundo: corFundo || current.corFundo,
            corTexto: corTexto || current.corTexto, corCards: corCards || current.corCards,
            storeDescription: storeDescription !== undefined ? storeDescription : current.storeDescription
        };
        const updatedUser = await prisma.user.update({ where: { id: req.user.id }, data: { visual: newVisual } });
        res.status(200).json({ success: true, message: 'Tema atualizado!', visual: updatedUser.visual });
    } catch (error) { handleError(res, error, 'Erro ao atualizar tema.'); }
};

exports.getVisualTheme = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        res.status(200).json({ success: true, visual: user.visual || {} });
    } catch (error) { handleError(res, error, 'Erro ao buscar visual.'); }
};

exports.getMedia = async (req, res) => {
    try {
        const { resources } = await cloudinary.search.expression(`folder:bizno/${req.user.id}`).sort_by('created_at', 'desc').max_results(50).execute();
        res.status(200).json({ success: true, media: resources.map(r => ({ public_id: r.public_id, url: r.secure_url, resource_type: r.resource_type, created_at: r.created_at })) });
    } catch (error) { handleError(res, error, "Erro ao buscar mídias."); }
};

exports.deleteMedia = async (req, res) => {
    try {
        if (!req.params.asset_id.includes(`bizno/${req.user.id}`)) return res.status(403).json({ success: false, message: 'Não autorizado.' });
        await cloudinary.uploader.destroy(req.params.asset_id);
        res.status(200).json({ success: true, message: 'Ficheiro removido.' });
    } catch (error) { handleError(res, error, 'Erro ao remover mídia.'); }
};

exports.getContacts = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        res.status(200).json({ success: true, contacts: user.contacts || {}, deliverySettings: user.deliverySettings || {} });
    } catch (error) { handleError(res, error, 'Erro ao buscar contatos.'); }
};

exports.updateContacts = async (req, res) => {
    try {
        const { showPhone, showEmail, showSocials, customWhatsappMessage, socials, paymentMethods, deliverySettings } = req.body;
        const newContacts = {
            showPhone: !!showPhone, showEmail: !!showEmail, showSocials: !!showSocials, customWhatsappMessage: customWhatsappMessage || '',
            socials: { facebook: socials?.facebook || '', instagram: socials?.instagram || '', tiktok: socials?.tiktok || '' },
            paymentMethods: { mpesa: !!paymentMethods?.mpesa, emola: !!paymentMethods?.emola, transfer: !!paymentMethods?.transfer, onDelivery: !!paymentMethods?.onDelivery }
        };
        let newDelivery = req.user.deliverySettings || {};
        if (deliverySettings) {
            newDelivery = {
                isDeliveryEnabled: !!deliverySettings.isDeliveryEnabled, freeDeliveryThreshold: Number(deliverySettings.freeDeliveryThreshold) || 0,
                provinceShipping: { enabled: !!deliverySettings.provinceShipping?.enabled, cost: Number(deliverySettings.provinceShipping?.cost) || 0 }
            };
        }
        const updatedUser = await prisma.user.update({ where: { id: req.user.id }, data: { contacts: newContacts, deliverySettings: newDelivery } });
        res.status(200).json({ success: true, message: 'Contatos atualizados.', contacts: updatedUser.contacts, deliverySettings: updatedUser.deliverySettings });
    } catch (error) { handleError(res, error, 'Erro ao atualizar contatos.'); }
};

exports.initiatePlanPayment = async (req, res) => {
    const { planId, provider, phone } = req.body; 
    
    if (!planId || !provider) return res.status(400).json({ success: false, message: 'ID do plano e provedor são obrigatórios.' });

    const validProviders = ['mpesa', 'emola', 'credit_card'];
    if (!validProviders.includes(provider.toLowerCase())) return res.status(400).json({ success: false, message: `Método de pagamento inválido.` });
    
    try {
        const plan = await prisma.plan.findUnique({ where: { id: planId } });
        if(!plan) return res.status(404).json({ success: false, message: 'Plano não encontrado.' });
        
        const internalReference = `BIZ${req.user.id.substring(0, 4)}${Date.now()}`.toUpperCase();
        const description = `Plano ${plan.name} - ${req.user.storeName}`;
        const returnUrl = config.urls.paymentReturnUrl || `${config.urls.appUrl}/dash/planos.html`; 

        let paymentPhone = (phone || req.user.whatsapp || '').replace(/\D/g, ''); 
        if (paymentPhone.startsWith('258')) paymentPhone = paymentPhone.substring(3);

        if (provider !== 'credit_card') {
            if (paymentPhone.length !== 9) {
                return res.status(400).json({ success: false, message: 'O número de telemóvel deve ter 9 dígitos (ex: 84XXXXXXX).' });
            }
            // Regras Exatas das Operadoras Moçambicanas
            if (provider === 'mpesa' && !/^(84|85)/.test(paymentPhone)) {
                return res.status(400).json({ success: false, message: 'Para pagar com M-Pesa o número deve começar por 84 ou 85.' });
            }
            if (provider === 'emola' && !/^(86|87)/.test(paymentPhone)) {
                return res.status(400).json({ success: false, message: 'Para pagar com eMola o número deve começar por 86 ou 87.' });
            }
        }

        const debitoResponse = await debitoService.createPaymentRequest(
            plan.price, internalReference, description, provider.toLowerCase(),
            paymentPhone, req.user.email, returnUrl
        );
        
        await prisma.payment.create({
            data: {
                userId: req.user.id, planId: planId, status: 'pending', provider: provider.toLowerCase(),
                gatewayReference: debitoResponse.reference, proof: { internalReference: internalReference }
            }
        });
        
        res.status(200).json({ 
            success: true, 
            message: provider === 'credit_card' ? 'A redirecionar...' : 'Verifique o seu telemóvel para confirmar.',
            checkoutUrl: debitoResponse.checkout_url, reference: debitoResponse.reference, isPush: provider !== 'credit_card'
        });
    } catch (error) {
        console.error('Erro Débito API:', error.message);
        // Retorna o erro exato para aparecer no ecrã e sabermos o que falhou
        return res.status(400).json({ success: false, message: error.message });
    }
};

exports.verifyPaymentStatus = async (req, res) => {
    const { gatewayReference } = req.params;

    try {
        const payment = await prisma.payment.findFirst({ 
            where: { OR: [{ gatewayReference: gatewayReference }, { proof: { path: ['internalReference'], equals: gatewayReference } }] },
            include: { plan: true, user: true } 
        });

        if (!payment) return res.status(404).json({ success: false, message: 'Pagamento não encontrado.' });
        if (payment.userId !== req.user.id) return res.status(403).json({ success: false, message: 'Acesso negado.' });
        
        if (payment.status === 'approved') return res.status(200).json({ success: true, status: 'approved', message: 'Pagamento processado com sucesso.' });

        const debitoStatus = await debitoService.getPaymentStatus(payment.gatewayReference);
        
        let finalStatus = 'pending';
        let apiError = 'Aguardando pagamento ou cancelado.';

        if (debitoStatus) {
            let rawStatus = debitoStatus.status || (debitoStatus.data && debitoStatus.data.status) || 'PENDING';
            const mainStatus = String(rawStatus).toUpperCase();
            
            if (mainStatus === 'SUCCESS' || mainStatus === 'SUCCESSFUL' || mainStatus === 'COMPLETED' || mainStatus === 'PAID' || mainStatus === 'APPROVED') {
                finalStatus = 'approved';
            } else if (mainStatus === 'FAILED' || mainStatus === 'CANCELLED' || mainStatus === 'REJECTED' || mainStatus === 'DECLINED') {
                finalStatus = 'rejected';
                apiError = debitoStatus.message || (debitoStatus.data && debitoStatus.data.message) || 'Recusado pela operadora.';
            }
        }

        if (finalStatus === 'approved') {
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); 
            await prisma.$transaction([
                prisma.user.update({ where: { id: payment.userId }, data: { planId: payment.planId, planStatus: 'active', planExpiresAt: expiresAt } }),
                prisma.payment.update({ where: { id: payment.id }, data: { status: 'approved' } })
            ]);
            await mailer.sendPaymentApprovedEmail(payment.user.email, payment.user.storeName, payment.plan.name);
            return res.status(200).json({ success: true, status: 'approved', message: 'Pagamento concluído e plano ativado!' });
        } else if (finalStatus === 'rejected') {
            await prisma.payment.update({ where: { id: payment.id }, data: { status: 'rejected', rejectionReason: apiError } });
            return res.status(200).json({ success: true, status: 'rejected', message: `Pagamento falhou: ${apiError}` });
        }

        res.status(200).json({ success: true, status: 'pending', message: `A aguardar confirmação da operadora...` });

    } catch (error) { handleError(res, error, 'Erro ao verificar estado.'); }
};

exports.getPaymentHistory = async (req, res) => {
    try {
        const history = await prisma.payment.findMany({ 
            where: { userId: req.user.id }, include: { plan: { select: { name: true, price: true } } }, orderBy: { createdAt: 'desc' }
        });
        res.status(200).json({ success: true, history });
    } catch (error) { handleError(res, error, 'Erro ao buscar histórico.'); }
};

exports.getCurrentPlan = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { plan: true } });
        res.status(200).json({
            success: true,
            plan: {
                name: user.plan?.name || 'N/A', expiresAt: user.planExpiresAt, status: user.planStatus,
                productLimit: user.plan?.productLimit || 0, imageLimitPerProduct: user.plan?.imageLimitPerProduct || 0, storageUsed: user.storageUsed
            }
        });
    } catch (error) { handleError(res, error, 'Erro ao obter plano.'); }
};