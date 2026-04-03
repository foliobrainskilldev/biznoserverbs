// Ficheiro: src/controllers/adminController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { handleError } = require('../utils/helpers');
const { config } = require('../config/setup');
const mailer = require('../services/mailer');

exports.loginAdmin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.user.findFirst({ where: { email, role: 'admin' } });
        if (!user) return res.status(401).json({ success: false, message: 'Acesso negado.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });

        const token = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: '1d' });
        res.status(200).json({ success: true, token, message: 'Login de administrador bem-sucedido.' });
    } catch (error) {
        handleError(res, error, 'Erro no login de administrador.');
    }
};

exports.getAdminDashboard = async (req, res) => {
    try {
        const [totalStores, activeStores, freeStores, expiredStores, pendingPayments] = await Promise.all([
            prisma.user.count({ where: { role: 'user' } }),
            prisma.user.count({ where: { role: 'user', planStatus: 'active' } }),
            prisma.user.count({ where: { role: 'user', planStatus: 'free' } }),
            prisma.user.count({ where: { role: 'user', planStatus: 'expired' } }),
            prisma.payment.count({ where: { status: 'pending' } })
        ]);

        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

        const allApprovedPayments = await prisma.payment.findMany({ where: { status: 'approved' }, include: { plan: true } });
        const monthlyPayments = allApprovedPayments.filter(p => p.createdAt >= startOfMonth);

        const totalRevenue = allApprovedPayments.reduce((sum, p) => sum + (p.plan?.price || 0), 0);
        const monthlyRevenue = monthlyPayments.reduce((sum, p) => sum + (p.plan?.price || 0), 0);
        
        res.status(200).json({
            success: true,
            stats: { totalStores, activeStores, freeStores, expiredStores, pendingPayments, monthlyRevenue, totalRevenue }
        });
    } catch (error) {
        handleError(res, error, 'Erro ao carregar dashboard do admin.');
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({ 
            where: { role: 'user' },
            include: { plan: { select: { name: true } } },
            orderBy: { createdAt: 'desc' }
        });
        
        const safeUsers = users.map(u => {
            const { password, verificationCode, passwordResetCode, passwordResetExpires, ...safeUser } = u;
            return safeUser;
        });
            
        res.status(200).json({ success: true, users: safeUsers });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar utilizadores.');
    }
};

exports.blockUser = async (req, res) => {
    try {
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { planStatus: 'expired' }
        });
        res.status(200).json({ success: true, message: `Utilizador ${user.storeName} bloqueado.` });
    } catch (error) {
        handleError(res, error, 'Erro ao bloquear utilizador.');
    }
};

exports.unblockUser = async (req, res) => {
    try {
        const freePlan = await prisma.plan.findUnique({ where: { name: 'Free' } });
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { planId: freePlan.id, planStatus: 'free', planExpiresAt: null }
        });
        res.status(200).json({ success: true, message: `Utilizador ${user.storeName} movido para o plano Free.` });
    } catch (error) {
        handleError(res, error, 'Erro ao desbloquear utilizador.');
    }
};

exports.getPendingPayments = async (req, res) => {
    try {
        const payments = await prisma.payment.findMany({ 
            where: { status: 'pending' },
            include: { user: { select: { storeName: true, email: true } }, plan: { select: { name: true, price: true } } },
            orderBy: { createdAt: 'asc' }
        });
        res.status(200).json({ success: true, payments });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar pagamentos pendentes.');
    }
};

exports.approvePayment = async (req, res) => {
    try {
        const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { plan: true, user: true } });
        if (!payment || payment.status !== 'pending') return res.status(404).json({ success: false, message: 'Pagamento não encontrado ou já processado.' });
        if (!payment.planId) return res.status(400).json({ success: false, message: 'Este pagamento não tem um plano associado.' });

        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); 
        
        await prisma.$transaction([
            prisma.user.update({ 
                where: { id: payment.userId }, 
                data: { planId: payment.planId, planStatus: 'active', planExpiresAt: expiresAt } 
            }),
            prisma.payment.update({ 
                where: { id: payment.id }, 
                data: { status: 'approved', processedById: req.user.id } 
            })
        ]);
        
        await mailer.sendPaymentApprovedEmail(payment.user.email, payment.user.storeName, payment.plan.name);
        res.status(200).json({ success: true, message: 'Pagamento aprovado e plano ativado manualmente.' });
    } catch (error) {
        handleError(res, error, 'Erro ao aprovar pagamento.');
    }
};

exports.rejectPayment = async (req, res) => {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Motivo obrigatório.' });

    try {
        const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { user: true } });
        if (!payment || payment.status !== 'pending') return res.status(404).json({ success: false, message: 'Pagamento não encontrado.' });

        const newStatus = (payment.user.planExpiresAt && payment.user.planExpiresAt > new Date()) ? 'active' : 'expired';
        
        await prisma.$transaction([
            prisma.payment.update({ where: { id: payment.id }, data: { status: 'rejected', rejectionReason: reason, processedById: req.user.id } }),
            prisma.user.update({ where: { id: payment.userId }, data: { planStatus: newStatus } })
        ]);

        await mailer.sendPaymentRejectedEmail(payment.user.email, payment.user.storeName, reason);
        res.status(200).json({ success: true, message: 'Pagamento recusado manualmente.' });
    } catch (error) {
        handleError(res, error, 'Erro ao recusar pagamento.');
    }
};

exports.getPaymentHistory = async (req, res) => {
    try {
        const history = await prisma.payment.findMany({ 
            where: { status: { in: ['approved', 'rejected'] } },
            include: { user: { select: { storeName: true, email: true } }, plan: { select: { name: true, price: true } }, processedBy: { select: { email: true } } },
            orderBy: { updatedAt: 'desc' }
        });
        res.status(200).json({ success: true, history });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar histórico.');
    }
};

exports.createPlan = async (req, res) => {
    try {
        const plan = await prisma.plan.create({ data: req.body });
        res.status(201).json({ success: true, message: 'Plano criado', plan });
    } catch(error) {
        handleError(res, error, 'Erro ao criar plano.');
    }
};

exports.editPlan = async (req, res) => {
    try {
        const plan = await prisma.plan.update({ where: { id: req.params.id }, data: req.body });
        res.status(200).json({ success: true, message: 'Plano atualizado', plan });
    } catch (error) {
        handleError(res, error, 'Erro ao editar plano.');
    }
};

exports.assignPlanToUser = async (req, res) => {
    const { userId, planId } = req.body;
    if (!userId || !planId) return res.status(400).json({ success: false, message: 'IDs obrigatórios.' });

    try {
        const plan = await prisma.plan.findUnique({ where: { id: planId } });
        if (!plan) return res.status(404).json({ success: false, message: 'Plano não encontrado.' });

        const newStatus = plan.price === 0 ? 'free' : 'active';
        const expiresAt = plan.price > 0 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;

        const user = await prisma.user.update({
            where: { id: userId },
            data: { planId: plan.id, planStatus: newStatus, planExpiresAt: expiresAt }
        });
        
        res.status(200).json({ success: true, message: `Plano atribuído a ${user.storeName}.` });
    } catch (error) {
        handleError(res, error, 'Erro ao atribuir plano.');
    }
};

exports.assignCustomPlanToUser = async (req, res) => {
    const { userId, planDetails, durationInDays } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ success: false, message: 'Utilizador não encontrado.' });

        const customPlan = await prisma.plan.create({
            data: { ...planDetails, name: `Personalizado - ${user.storeName}`, isCustom: true, isVisible: false }
        });

        await prisma.user.update({
            where: { id: userId },
            data: { planId: customPlan.id, planStatus: 'active', planExpiresAt: new Date(Date.now() + parseInt(durationInDays) * 24 * 60 * 60 * 1000) }
        });

        res.status(200).json({ success: true, message: `Plano personalizado atribuído.`, plan: customPlan });
    } catch (error) {
        handleError(res, error, 'Erro ao atribuir plano personalizado.');
    }
};

exports.addBankAccount = async (req, res) => {
    try {
        const account = await prisma.bankAccount.create({ data: req.body });
        res.status(201).json({ success: true, message: 'Conta bancária adicionada.', account });
    } catch (error) {
        handleError(res, error, 'Erro ao adicionar conta bancária.');
    }
};

exports.getBankAccounts = async (req, res) => {
    try {
        const accounts = await prisma.bankAccount.findMany();
        res.status(200).json({ success: true, accounts });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar contas.');
    }
};

exports.deleteBankAccount = async (req, res) => {
    try {
        await prisma.bankAccount.delete({ where: { id: req.params.id } });
        res.status(200).json({ success: true, message: 'Conta bancária removida.' });
    } catch (error) {
        handleError(res, error, 'Erro ao remover conta bancária.');
    }
};

exports.sendGlobalEmail = async (req, res) => {
    const { subject, body } = req.body;
    if (!subject || !body) return res.status(400).json({ success: false, message: 'Assunto e corpo são obrigatórios.' });
    
    try {
        const users = await prisma.user.findMany({ where: { role: 'user', isVerified: true }, select: { email: true } });
        if (users.length === 0) return res.status(200).json({ success: true, message: 'Nenhum utilizador verificado.' });
        
        const emailPromises = users.map(user => mailer.sendGlobalAdminMessage(user.email, subject, body));
        await Promise.all(emailPromises);

        res.status(200).json({ success: true, message: `Mensagem enviada para ${users.length} utilizadores.` });
    } catch (error) {
        handleError(res, error, 'Erro ao enviar mensagem global.');
    }
};

exports.getSystemLogs = async (req, res) => {
    try {
        const logs = await prisma.systemLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
        res.status(200).json({ success: true, logs });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar logs.');
    }
};