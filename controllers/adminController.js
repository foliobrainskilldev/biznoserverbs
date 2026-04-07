const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const {
    config
} = require('../config/setup');
const mailer = require('../services/mailer');
const paymentService = require('../services/paymentService');
const asyncHandler = require('../utils/asyncHandler');
const {
    getPaginationParams,
    getPlanExpirationDate
} = require('../utils/helpers');

exports.loginAdmin = asyncHandler(async (req, res) => {
    const {
        email,
        password
    } = req.body;
    const user = await prisma.user.findFirst({
        where: {
            email,
            role: 'admin'
        }
    });
    if (!user) return res.status(401).json({
        success: false,
        message: 'Acesso negado.'
    });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas.'
    });

    const token = jwt.sign({
        id: user.id,
        role: user.role
    }, config.jwtSecret, {
        expiresIn: '1d'
    });
    res.status(200).json({
        success: true,
        token,
        message: 'Login de administrador bem-sucedido.'
    });
}, 'Erro no login de administrador.');

exports.getAdminDashboard = asyncHandler(async (req, res) => {
    const [totalStores, activeStores, freeStores, expiredStores, pendingPayments] = await Promise.all([
        prisma.user.count({
            where: {
                role: 'user'
            }
        }),
        prisma.user.count({
            where: {
                role: 'user',
                planStatus: 'active'
            }
        }),
        prisma.user.count({
            where: {
                role: 'user',
                planStatus: 'free'
            }
        }),
        prisma.user.count({
            where: {
                role: 'user',
                planStatus: 'expired'
            }
        }),
        prisma.payment.count({
            where: {
                status: 'pending'
            }
        })
    ]);

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const allApprovedPayments = await prisma.payment.findMany({
        where: {
            status: 'approved'
        },
        include: {
            plan: true
        }
    });
    const monthlyPayments = allApprovedPayments.filter(p => p.createdAt >= startOfMonth);

    const totalRevenue = allApprovedPayments.reduce((sum, p) => sum + (p.plan?.price || 0), 0);
    const monthlyRevenue = monthlyPayments.reduce((sum, p) => sum + (p.plan?.price || 0), 0);

    res.status(200).json({
        success: true,
        stats: {
            totalStores,
            activeStores,
            freeStores,
            expiredStores,
            pendingPayments,
            monthlyRevenue,
            totalRevenue
        }
    });
}, 'Erro ao carregar dashboard do admin.');

exports.getAllUsers = asyncHandler(async (req, res) => {
    const {
        skip,
        take,
        page,
        limit
    } = getPaginationParams(req, 20);
    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where: {
                role: 'user'
            },
            include: {
                plan: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            skip,
            take
        }),
        prisma.user.count({
            where: {
                role: 'user'
            }
        })
    ]);

    const safeUsers = users.map(u => {
        const {
            password,
            verificationCode,
            passwordResetCode,
            passwordResetExpires,
            ...safeUser
        } = u;
        return safeUser;
    });

    res.status(200).json({
        success: true,
        users: safeUsers,
        meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    });
}, 'Erro ao buscar utilizadores.');

exports.blockUser = asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
        where: {
            id: req.params.id
        },
        data: {
            planStatus: 'expired'
        }
    });
    res.status(200).json({
        success: true,
        message: `Utilizador ${user.storeName} bloqueado.`
    });
}, 'Erro ao bloquear utilizador.');

exports.unblockUser = asyncHandler(async (req, res) => {
    const freePlan = await prisma.plan.findUnique({
        where: {
            name: 'Free'
        }
    });
    const user = await prisma.user.update({
        where: {
            id: req.params.id
        },
        data: {
            planId: freePlan.id,
            planStatus: 'free',
            planExpiresAt: null
        }
    });
    res.status(200).json({
        success: true,
        message: `Utilizador ${user.storeName} movido para o plano Free.`
    });
}, 'Erro ao desbloquear utilizador.');

exports.getPendingPayments = asyncHandler(async (req, res) => {
    const payments = await prisma.payment.findMany({
        where: {
            status: 'pending'
        },
        include: {
            user: {
                select: {
                    storeName: true,
                    email: true
                }
            },
            plan: {
                select: {
                    name: true,
                    price: true
                }
            }
        },
        orderBy: {
            createdAt: 'asc'
        }
    });
    res.status(200).json({
        success: true,
        payments
    });
}, 'Erro ao buscar pagamentos pendentes.');

exports.approvePayment = asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findUnique({
        where: {
            id: req.params.id
        },
        include: {
            plan: true,
            user: true
        }
    });
    if (!payment || payment.status !== 'pending') return res.status(404).json({
        success: false,
        message: 'Pagamento não encontrado ou já processado.'
    });
    if (!payment.planId) return res.status(400).json({
        success: false,
        message: 'Este pagamento não tem um plano associado.'
    });

    await paymentService.approvePaymentAndActivatePlan(payment);
    await prisma.payment.update({
        where: {
            id: payment.id
        },
        data: {
            processedById: req.user.id
        }
    }); // Registo de auditoria

    res.status(200).json({
        success: true,
        message: 'Pagamento aprovado e plano ativado manualmente.'
    });
}, 'Erro ao aprovar pagamento.');

exports.rejectPayment = asyncHandler(async (req, res) => {
    const {
        reason
    } = req.body;
    if (!reason) return res.status(400).json({
        success: false,
        message: 'Motivo obrigatório.'
    });

    const payment = await prisma.payment.findUnique({
        where: {
            id: req.params.id
        },
        include: {
            user: true
        }
    });
    if (!payment || payment.status !== 'pending') return res.status(404).json({
        success: false,
        message: 'Pagamento não encontrado.'
    });

    await paymentService.rejectPayment(payment.id, reason);
    await prisma.payment.update({
        where: {
            id: payment.id
        },
        data: {
            processedById: req.user.id
        }
    });

    const newStatus = (payment.user.planExpiresAt && payment.user.planExpiresAt > new Date()) ? 'active' : 'expired';
    await prisma.user.update({
        where: {
            id: payment.userId
        },
        data: {
            planStatus: newStatus
        }
    });

    await mailer.sendPaymentRejectedEmail(payment.user.email, payment.user.storeName, reason);
    res.status(200).json({
        success: true,
        message: 'Pagamento recusado manualmente.'
    });
}, 'Erro ao recusar pagamento.');

exports.getPaymentHistory = asyncHandler(async (req, res) => {
    const {
        skip,
        take,
        page,
        limit
    } = getPaginationParams(req, 20);
    const [history, total] = await Promise.all([
        prisma.payment.findMany({
            where: {
                status: {
                    in: ['approved', 'rejected']
                }
            },
            include: {
                user: {
                    select: {
                        storeName: true,
                        email: true
                    }
                },
                plan: {
                    select: {
                        name: true,
                        price: true
                    }
                },
                processedBy: {
                    select: {
                        email: true
                    }
                }
            },
            orderBy: {
                updatedAt: 'desc'
            },
            skip,
            take
        }),
        prisma.payment.count({
            where: {
                status: {
                    in: ['approved', 'rejected']
                }
            }
        })
    ]);
    res.status(200).json({
        success: true,
        history,
        meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    });
}, 'Erro ao buscar histórico.');

exports.createPlan = asyncHandler(async (req, res) => {
    const plan = await prisma.plan.create({
        data: req.body
    });
    res.status(201).json({
        success: true,
        message: 'Plano criado',
        plan
    });
}, 'Erro ao criar plano.');

exports.editPlan = asyncHandler(async (req, res) => {
    const plan = await prisma.plan.update({
        where: {
            id: req.params.id
        },
        data: req.body
    });
    res.status(200).json({
        success: true,
        message: 'Plano atualizado',
        plan
    });
}, 'Erro ao editar plano.');

exports.assignPlanToUser = asyncHandler(async (req, res) => {
    const {
        userId,
        planId
    } = req.body;
    if (!userId || !planId) return res.status(400).json({
        success: false,
        message: 'IDs obrigatórios.'
    });

    const plan = await prisma.plan.findUnique({
        where: {
            id: planId
        }
    });
    if (!plan) return res.status(404).json({
        success: false,
        message: 'Plano não encontrado.'
    });

    const newStatus = plan.price === 0 ? 'free' : 'active';
    const expiresAt = plan.price > 0 ? getPlanExpirationDate(30) : null;

    const user = await prisma.user.update({
        where: {
            id: userId
        },
        data: {
            planId: plan.id,
            planStatus: newStatus,
            planExpiresAt: expiresAt
        }
    });
    res.status(200).json({
        success: true,
        message: `Plano atribuído a ${user.storeName}.`
    });
}, 'Erro ao atribuir plano.');

exports.assignCustomPlanToUser = asyncHandler(async (req, res) => {
    const {
        userId,
        planDetails,
        durationInDays
    } = req.body;
    const user = await prisma.user.findUnique({
        where: {
            id: userId
        }
    });
    if (!user) return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado.'
    });

    const customPlan = await prisma.plan.create({
        data: {
            ...planDetails,
            name: `Personalizado - ${user.storeName}`,
            isCustom: true,
            isVisible: false
        }
    });
    const expiresAt = getPlanExpirationDate(parseInt(durationInDays, 10));

    await prisma.user.update({
        where: {
            id: userId
        },
        data: {
            planId: customPlan.id,
            planStatus: 'active',
            planExpiresAt: expiresAt
        }
    });
    res.status(200).json({
        success: true,
        message: `Plano personalizado atribuído.`,
        plan: customPlan
    });
}, 'Erro ao atribuir plano personalizado.');

exports.addBankAccount = asyncHandler(async (req, res) => {
    const account = await prisma.bankAccount.create({
        data: req.body
    });
    res.status(201).json({
        success: true,
        message: 'Conta bancária adicionada.',
        account
    });
}, 'Erro ao adicionar conta bancária.');

exports.getBankAccounts = asyncHandler(async (req, res) => {
    const accounts = await prisma.bankAccount.findMany();
    res.status(200).json({
        success: true,
        accounts
    });
}, 'Erro ao buscar contas.');

exports.deleteBankAccount = asyncHandler(async (req, res) => {
    await prisma.bankAccount.delete({
        where: {
            id: req.params.id
        }
    });
    res.status(200).json({
        success: true,
        message: 'Conta bancária removida.'
    });
}, 'Erro ao remover conta bancária.');

exports.sendGlobalEmail = asyncHandler(async (req, res) => {
    const {
        subject,
        body
    } = req.body;
    if (!subject || !body) return res.status(400).json({
        success: false,
        message: 'Assunto e corpo são obrigatórios.'
    });

    const users = await prisma.user.findMany({
        where: {
            role: 'user',
            isVerified: true
        },
        select: {
            email: true
        }
    });
    if (users.length === 0) return res.status(200).json({
        success: true,
        message: 'Nenhum utilizador verificado.'
    });

    
    for (const user of users) {
        await mailer.sendGlobalAdminMessage(user.email, subject, body);
        await new Promise(resolve => setTimeout(resolve, 150)); // Pausa de 150ms entre cada e-mail
    }

    res.status(200).json({
        success: true,
        message: `Mensagem enviada para ${users.length} utilizadores de forma segura.`
    });
}, 'Erro ao enviar mensagem global.');

exports.getSystemLogs = asyncHandler(async (req, res) => {
    const {
        skip,
        take,
        page,
        limit
    } = getPaginationParams(req, 50);
    const [logs, total] = await Promise.all([
        prisma.systemLog.findMany({
            orderBy: {
                createdAt: 'desc'
            },
            skip,
            take
        }),
        prisma.systemLog.count()
    ]);
    res.status(200).json({
        success: true,
        logs,
        meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    });
}, 'Erro ao buscar logs.');