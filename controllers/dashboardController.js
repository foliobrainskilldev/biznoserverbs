const prisma = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

exports.getDashboardData = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
        where: {
            id: userId
        },
        include: {
            plan: true
        }
    });
    if (!user) return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado.'
    });

    const [productCount, categoryCount, promotionCount, orderCount, messageCount, totalVisits, customerCount, abandonedCartsCount] = await Promise.all([
        prisma.product.count({
            where: {
                userId
            }
        }),
        prisma.category.count({
            where: {
                userId
            }
        }),
        prisma.product.count({
            where: {
                userId,
                promotion: {
                    not: null
                }
            }
        }),
        prisma.interaction.count({
            where: {
                userId,
                type: 'order'
            }
        }),
        prisma.interaction.count({
            where: {
                userId,
                type: 'message'
            }
        }),
        prisma.visit.count({
            where: {
                userId
            }
        }),
        prisma.customer.count({
            where: {
                userId
            }
        }),
        prisma.abandonedCart.count({
            where: {
                userId
            }
        })
    ]);

    res.status(200).json({
        success: true,
        data: {
            storeName: user.storeName,
            currentPlan: user.plan?.name || 'N/A',
            planExpiresAt: user.planExpiresAt,
            productCount,
            categoryCount,
            promotionCount,
            totalVisits,
            orderCount,
            messageCount,
            customerCount,
            abandonedCartsCount
        }
    });
});

exports.getDashboardChartData = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [orders, visits] = await Promise.all([
        prisma.interaction.findMany({
            where: {
                userId,
                type: 'order',
                createdAt: {
                    gte: sevenDaysAgo,
                    lte: today
                }
            }
        }),
        prisma.visit.findMany({
            where: {
                userId,
                createdAt: {
                    gte: sevenDaysAgo,
                    lte: today
                }
            }
        })
    ]);

    const countByDate = (items) => items.reduce((acc, item) => {
        const dateStr = item.createdAt.toISOString().split('T')[0];
        acc[dateStr] = (acc[dateStr] || 0) + 1;
        return acc;
    }, {});

    const ordersMap = countByDate(orders);
    const visitsMap = countByDate(visits);

    const chartData = Array.from({
        length: 7
    }, (_, i) => {
        const d = new Date(sevenDaysAgo);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        return {
            date: dateStr,
            orders: ordersMap[dateStr] || 0,
            visits: visitsMap[dateStr] || 0
        };
    });

    res.status(200).json({
        success: true,
        chartData
    });
});

exports.getStatisticsData = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const {
        range,
        startDate,
        endDate
    } = req.query;

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let start, end = new Date(today);

    switch (range) {
        case 'last30days':
            start = new Date(today);
            start.setDate(start.getDate() - 29);
            start.setHours(0, 0, 0, 0);
            break;
        case 'thisMonth':
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            break;
        case 'custom':
            if (!startDate || !endDate) return res.status(400).json({
                success: false,
                message: 'Datas necessárias.'
            });
            start = new Date(startDate);
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            break;
        default:
            start = new Date(today);
            start.setDate(start.getDate() - 6);
            start.setHours(0, 0, 0, 0);
    }

    const [orders, visits, topProducts] = await Promise.all([
        prisma.interaction.findMany({
            where: {
                userId,
                type: 'order',
                createdAt: {
                    gte: start,
                    lte: end
                }
            }
        }),
        prisma.visit.findMany({
            where: {
                userId,
                createdAt: {
                    gte: start,
                    lte: end
                }
            }
        }),
        prisma.product.findMany({
            where: {
                userId
            },
            orderBy: {
                viewCount: 'desc'
            },
            take: 5,
            select: {
                name: true,
                viewCount: true,
                images: true
            }
        })
    ]);

    const countByDate = (items) => items.reduce((acc, item) => {
        const dateStr = item.createdAt.toISOString().split('T')[0];
        acc[dateStr] = (acc[dateStr] || 0) + 1;
        return acc;
    }, {});

    const ordersMap = countByDate(orders);
    const visitsMap = countByDate(visits);

    const chartData = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateString = d.toISOString().split('T')[0];
        chartData.push({
            date: dateString,
            orders: ordersMap[dateString] || 0,
            visits: visitsMap[dateString] || 0
        });
    }

    const totalVisitsInRange = visits.length;
    const totalOrdersInRange = orders.length;
    const conversionRate = totalVisitsInRange > 0 ? ((totalOrdersInRange / totalVisitsInRange) * 100).toFixed(2) : 0;

    res.status(200).json({
        success: true,
        kpis: {
            totalVisits: totalVisitsInRange,
            totalOrders: totalOrdersInRange,
            conversionRate: `${conversionRate}%`
        },
        chartData,
        topProducts
    });
});

exports.getOrders = asyncHandler(async (req, res) => {
    const orders = await prisma.interaction.findMany({
        where: {
            userId: req.user.id,
            type: 'order'
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    const formattedOrders = orders.map(order => {
        const parts = order.details.split('\n\n===META===\n');
        let status = 'pending';
        try {
            if (parts[1]) status = JSON.parse(parts[1]).status;
        } catch {}

        return {
            id: order.id,
            createdAt: order.createdAt,
            details: parts[0],
            status
        };
    });
    res.status(200).json({
        success: true,
        orders: formattedOrders
    });
});

exports.updateOrderStatus = asyncHandler(async (req, res) => {
    const {
        id
    } = req.params;
    const {
        status
    } = req.body;

    if (!['pending', 'sold', 'cancelled'].includes(status)) {
        return res.status(400).json({
            success: false,
            message: 'Status inválido.'
        });
    }

    const interaction = await prisma.interaction.findFirst({
        where: {
            id,
            userId: req.user.id,
            type: 'order'
        }
    });
    if (!interaction) return res.status(404).json({
        success: false,
        message: 'Pedido não encontrado.'
    });

    const parts = interaction.details.split('\n\n===META===\n');
    let meta = {
        status: 'pending',
        items: [],
        coupon: null
    };
    try {
        if (parts[1]) meta = JSON.parse(parts[1]);
    } catch {}

    if (meta.status === 'sold') return res.status(400).json({
        success: false,
        message: 'Pedido já finalizado.'
    });

    if (status === 'sold') {
        await Promise.all(meta.items.map(item => {
            if (item.id && item.quantity) {
                return prisma.product.updateMany({
                    where: {
                        id: item.id,
                        stock: {
                            gte: item.quantity
                        }
                    },
                    data: {
                        stock: {
                            decrement: item.quantity
                        }
                    }
                });
            }
        }));
    }

    meta.status = status;
    await prisma.interaction.update({
        where: {
            id
        },
        data: {
            details: `${parts[0]}\n\n===META===\n${JSON.stringify(meta)}`
        }
    });

    res.status(200).json({
        success: true,
        message: 'Status atualizado.'
    });
});

exports.getMessages = asyncHandler(async (req, res) => {
    const messages = await prisma.interaction.findMany({
        where: {
            userId: req.user.id,
            type: 'message'
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
    res.status(200).json({
        success: true,
        messages
    });
});

exports.getCustomers = asyncHandler(async (req, res) => {
    const customers = await prisma.customer.findMany({
        where: {
            userId: req.user.id
        },
        orderBy: {
            totalPurchases: 'desc'
        }
    });
    res.status(200).json({
        success: true,
        customers
    });
});

exports.getAbandonedCarts = asyncHandler(async (req, res) => {
    const abandonedCarts = await prisma.abandonedCart.findMany({
        where: {
            userId: req.user.id
        },
        include: {
            customer: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
    res.status(200).json({
        success: true,
        abandonedCarts
    });
});