const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { config } = require('../config/setup');
const mailer = require('../services/mailer');
const paymentService = require('../services/paymentService');
const asyncHandler = require('../utils/asyncHandler');
const { getPaginationParams, getPlanExpirationDate } = require('../utils/helpers');

exports.loginAdmin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findFirst({ where: { email, role: 'admin' } });
    if (!user) return res.status(401).json({ success: false, message: 'Acesso negado.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });

    const token = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: '1d' });
    res.status(200).json({ success: true, token, message: 'Login de administrador bem-sucedido.' });
});

exports.getAdminDashboard = asyncHandler(async (req, res) => {
    const [totalStores, activeStores, freeStores, expiredStores, pendingPayments] = await Promise.all([
        prisma.user.count({ where: { role: 'user' } }),
        prisma.user.count({ where: { role: 'user', planStatus: 'active' } }),
        prisma.user.count({ where: { role: 'user', planStatus: 'free' } }),
        prisma.user.count({ where: { role: 'user', planStatus: 'expired' } }),
        prisma.payment.count({ where: { status: 'pending' } })
    ]);

    const allApprovedPayments = await prisma.payment.findMany({ 
        where: { status: 'approved' }, 
        include: { plan: true } 
    });

    let totalRevenue = 0;
    let mrr = 0;
    const revenueMap = {};

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

    allApprovedPayments.forEach(p => {
        const amount = p.plan?.price || 0;
        totalRevenue += amount;

        const paymentDate = new Date(p.createdAt);
        const monthString = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;

        if (paymentDate >= sixMonthsAgo) {
            revenueMap[monthString] = (revenueMap[monthString] || 0) + amount;
        }

        const now = new Date();
        if (paymentDate.getMonth() === now.getMonth() && paymentDate.getFullYear() === now.getFullYear()) {
            mrr += amount;
        }
    });

    const revenueOverTime = Object.keys(revenueMap).sort().map(month => ({
        month,
        amount: revenueMap[month]
    }));

    const arpu = activeStores > 0 ? (mrr / activeStores) : 0;

    res.status(200).json({
        success: true,
        stats: { 
            totalStores, activeStores, freeStores, expiredStores, pendingPayments, 
            mrr, arpu, totalRevenue, revenueOverTime 
        }
    });
});

exports.getAllUsers = asyncHandler(async (req, res) => {
    const { skip, take, page, limit } = getPaginationParams(req, 12);
    const search = req.query.search || '';

    const whereClause = { 
        role: 'user',
        storeName: { contains: search, mode: 'insensitive' }
    };

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where: whereClause,
            include: { plan: { select: { name: true } } },
            orderBy: { createdAt: 'desc' }, skip, take
        }),
        prisma.user.count({ where: whereClause })
    ]);

    const safeUsers = users.map(u => {
        const { password, verificationCode, passwordResetCode, passwordResetExpires, ...safeUser } = u;
        return safeUser;
    });

    res.status(200).json({ 
        success: true, 
        users: safeUsers, 
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) } 
    });
});

exports.getUserById = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: { 
            plan: true,
            _count: {
                select: {
                    products: true,
                    categories: true,
                    visits: true,
                    interactions: true
                }
            }
        }
    });

    if (!user) {
        return res.status(404).json({ success: false, message: 'Utilizador não encontrado.' });
    }

    const { password, verificationCode, passwordResetCode, passwordResetExpires, ...safeUser } = user;

    res.status(200).json({
        success: true,
        user: safeUser
    });
});

exports.impersonateUser = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.id }
    });

    if (!user) {
        return res.status(404).json({ success: false, message: 'Utilizador não encontrado.' });
    }

    const impersonationToken = jwt.sign(
        { id: user.id, role: user.role }, 
        config.jwtSecret, 
        { expiresIn: '1h' } 
    );

    let targetAppUrl = 'https://www.bizno.store';
    if (process.env.APP_URL) {
        targetAppUrl = process.env.APP_URL;
    } else if (process.env.FRONTEND_URL) {
        const urls = process.env.FRONTEND_URL.split(',');
        targetAppUrl = urls[0].trim();
    }

    res.status(200).json({
        success: true,
        token: impersonationToken,
        appUrl: targetAppUrl
    });
});

exports.blockUser = asyncHandler(async (req, res) => {
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { planStatus: 'expired' } });
    res.status(200).json({ success: true, message: `Utilizador bloqueado.` });
});

exports.unblockUser = asyncHandler(async (req, res) => {
    const freePlan = await prisma.plan.findUnique({ where: { name: 'Free' } });
    const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { planId: freePlan.id, planStatus: 'free', planExpiresAt: null }
    });
    res.status(200).json({ success: true, message: `Utilizador movido para o plano Free.` });
});

exports.getPendingPayments = asyncHandler(async (req, res) => {
    const payments = await prisma.payment.findMany({
        where: { status: 'pending' },
        include: {
            user: { select: { storeName: true, email: true } },
            plan: { select: { name: true, price: true } }
        },
        orderBy: { createdAt: 'asc' }
    });
    res.status(200).json({ success: true, payments });
});

exports.approvePayment = asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { plan: true, user: true } });
    if (!payment || payment.status !== 'pending') return res.status(404).json({ success: false, message: 'Pagamento não encontrado.' });

    await paymentService.approvePaymentAndActivatePlan(payment);
    await prisma.payment.update({ where: { id: payment.id }, data: { processedById: req.user.id } });

    res.status(200).json({ success: true, message: 'Pagamento aprovado e plano ativado.' });
});

exports.rejectPayment = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Motivo obrigatório.' });

    const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!payment || payment.status !== 'pending') return res.status(404).json({ success: false, message: 'Pagamento não encontrado.' });

    await paymentService.rejectPayment(payment.id, reason);
    await prisma.payment.update({ where: { id: payment.id }, data: { processedById: req.user.id } });

    const newStatus = (payment.user.planExpiresAt && payment.user.planExpiresAt > new Date()) ? 'active' : 'expired';
    await prisma.user.update({ where: { id: payment.userId }, data: { planStatus: newStatus } });

    await mailer.sendPaymentRejectedEmail(payment.user.email, payment.user.storeName, reason);
    res.status(200).json({ success: true, message: 'Pagamento recusado.' });
});

exports.getPaymentHistory = asyncHandler(async (req, res) => {
    const { skip, take, page, limit } = getPaginationParams(req, 20);
    const [history, total] = await Promise.all([
        prisma.payment.findMany({
            where: { status: { in: ['approved', 'rejected'] } },
            include: {
                user: { select: { storeName: true, email: true } },
                plan: { select: { name: true, price: true } },
                processedBy: { select: { email: true } }
            },
            orderBy: { updatedAt: 'desc' }, skip, take
        }),
        prisma.payment.count({ where: { status: { in: ['approved', 'rejected'] } } })
    ]);
    res.status(200).json({ success: true, history, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
});

exports.createPlan = asyncHandler(async (req, res) => {
    const plan = await prisma.plan.create({ data: req.body });
    res.status(201).json({ success: true, message: 'Plano criado', plan });
});

exports.editPlan = asyncHandler(async (req, res) => {
    const plan = await prisma.plan.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json({ success: true, message: 'Plano atualizado', plan });
});

exports.assignPlanToUser = asyncHandler(async (req, res) => {
    const { userId, planId } = req.body;
    if (!userId || !planId) return res.status(400).json({ success: false, message: 'IDs obrigatórios.' });

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return res.status(404).json({ success: false, message: 'Plano não encontrado.' });

    const newStatus = plan.price === 0 ? 'free' : 'active';
    const expiresAt = plan.price > 0 ? getPlanExpirationDate(30) : null;

    const user = await prisma.user.update({
        where: { id: userId },
        data: { planId: plan.id, planStatus: newStatus, planExpiresAt: expiresAt }
    });
    res.status(200).json({ success: true, message: `Plano atribuído.` });
});

exports.assignCustomPlanToUser = asyncHandler(async (req, res) => {
    const { userId, planDetails, durationInDays } = req.body;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    const customPlan = await prisma.plan.create({
        data: { ...planDetails, name: `Personalizado - ${user.storeName}`, isCustom: true, isVisible: false }
    });
    const expiresAt = getPlanExpirationDate(parseInt(durationInDays, 10));

    await prisma.user.update({
        where: { id: userId },
        data: { planId: customPlan.id, planStatus: 'active', planExpiresAt: expiresAt }
    });
    res.status(200).json({ success: true, message: `Plano personalizado atribuído.`, plan: customPlan });
});

exports.addBankAccount = asyncHandler(async (req, res) => {
    const account = await prisma.bankAccount.create({ data: req.body });
    res.status(201).json({ success: true, message: 'Conta bancária adicionada.', account });
});

exports.getBankAccounts = asyncHandler(async (req, res) => {
    const accounts = await prisma.bankAccount.findMany();
    res.status(200).json({ success: true, accounts });
});

exports.deleteBankAccount = asyncHandler(async (req, res) => {
    await prisma.bankAccount.delete({ where: { id: req.params.id } });
    res.status(200).json({ success: true, message: 'Conta bancária removida.' });
});

exports.sendGlobalEmail = asyncHandler(async (req, res) => {
    const { subject, body } = req.body;
    const users = await prisma.user.findMany({
        where: { role: 'user', isVerified: true },
        select: { email: true }
    });

    for (const user of users) {
        await mailer.sendGlobalAdminMessage(user.email, subject, body);
        await new Promise(resolve => setTimeout(resolve, 200)); 
    }

    res.status(200).json({ success: true, message: `Mensagem enviada.` });
});

exports.getSystemLogs = asyncHandler(async (req, res) => {
    const { skip, take, page, limit } = getPaginationParams(req, 50);
    const [logs, total] = await Promise.all([
        prisma.systemLog.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
        prisma.systemLog.count()
    ]);
    res.status(200).json({ success: true, logs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
});