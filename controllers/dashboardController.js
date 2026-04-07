const prisma = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

exports.getDashboardData = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { plan: true }
    });
    if (!user) return res.status(404).json({ success: false, message: 'Utilizador não encontrado.' });

    const [productCount, categoryCount, promotionCount, orderCount, messageCount, totalVisits] = await Promise.all([
        prisma.product.count({ where: { userId } }),
        prisma.category.count({ where: { userId } }),
        prisma.product.count({ where: { userId, promotion: { not: null } } }),
        prisma.interaction.count({ where: { userId, type: 'order' } }),
        prisma.interaction.count({ where: { userId, type: 'message' } }),
        prisma.visit.count({ where: { userId } })
    ]);

    res.status(200).json({
        success: true,
        data: {
            storeName: user.storeName,
            currentPlan: user.plan?.name || 'N/A',
            planExpiresAt: user.planExpiresAt,
            storageUsed: user.storageUsed,
            productCount,
            categoryCount,
            promotionCount,
            totalVisits,
            orderCount,
            messageCount,
        }
    });
}, 'Erro ao carregar dashboard.');

exports.getDashboardChartData = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setUTCHours(0, 0, 0, 0);

    const [orders, visits] = await Promise.all([
        prisma.interaction.findMany({
            where: { userId, type: 'order', createdAt: { gte: sevenDaysAgo, lte: today } }
        }),
        prisma.visit.findMany({
            where: { userId, createdAt: { gte: sevenDaysAgo, lte: today } }
        })
    ]);

    const countByDate = (items) => items.reduce((acc, item) => {
        const dateStr = item.createdAt.toISOString().split('T')[0];
        acc[dateStr] = (acc[dateStr] || 0) + 1;
        return acc;
    }, {});

    const ordersMap = countByDate(orders);
    const visitsMap = countByDate(visits);

    const chartData = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(sevenDaysAgo);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        return {
            date: dateStr,
            orders: ordersMap[dateStr] || 0,
            visits: visitsMap[dateStr] || 0
        };
    });

    res.status(200).json({ success: true, chartData });
}, 'Erro nos gráficos.');

exports.getStatisticsData = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { range, startDate, endDate } = req.query;

    let start, end;
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todaysOrders = await prisma.interaction.count({
        where: { userId, type: 'order', createdAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)), lte: today } }
    });
    const yesterdaysOrders = await prisma.interaction.count({
        where: { userId, type: 'order', createdAt: { gte: new Date(new Date(yesterday).setUTCHours(0, 0, 0, 0)), lte: new Date(new Date(yesterday).setUTCHours(23, 59, 59, 999)) } }
    });

    switch (range) {
        case 'last30days':
            end = new Date(today);
            start = new Date(new Date().setDate(today.getDate() - 29));
            start.setUTCHours(0, 0, 0, 0);
            break;
        case 'thisMonth':
            end = new Date(today);
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            break;
        case 'lastMonth':
            start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
            end.setUTCHours(23, 59, 59, 999);
            break;
        case 'custom':
            if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'Filtro personalizado requer datas.' });
            start = new Date(startDate);
            end = new Date(endDate);
            end.setUTCHours(23, 59, 59, 999);
            break;
        default:
            end = new Date(today);
            start = new Date(new Date().setDate(today.getDate() - 6));
            start.setUTCHours(0, 0, 0, 0);
    }

    const [orders, visits, topProducts] = await Promise.all([
        prisma.interaction.findMany({
            where: { userId, type: 'order', createdAt: { gte: start, lte: end } }
        }),
        prisma.visit.findMany({
            where: { userId, createdAt: { gte: start, lte: end } }
        }),
        prisma.product.findMany({
            where: { userId },
            orderBy: { viewCount: 'desc' },
            take: 5,
            select: { name: true, viewCount: true, images: true }
        })
    ]);

    const ordersMap = orders.reduce((acc, order) => {
        const dateStr = order.createdAt.toISOString().split('T')[0];
        acc[dateStr] = (acc[dateStr] || 0) + 1;
        return acc;
    }, {});

    const visitsMap = visits.reduce((acc, visit) => {
        const dateStr = visit.createdAt.toISOString().split('T')[0];
        acc[dateStr] = (acc[dateStr] || 0) + 1;
        return acc;
    }, {});

    const chartData = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateString = d.toISOString().split('T')[0];
        chartData.push({
            date: dateString,
            orders: ordersMap[dateString] || 0,
            visits: visitsMap[dateString] || 0
        });
    }

    const totalVisitsInRange = chartData.reduce((sum, item) => sum + item.visits, 0);
    const totalOrdersInRange = chartData.reduce((sum, item) => sum + item.orders, 0);
    const conversionRate = totalVisitsInRange > 0 ? ((totalOrdersInRange / totalVisitsInRange) * 100).toFixed(2) : 0;

    res.status(200).json({
        success: true,
        kpis: {
            todaysOrders,
            yesterdaysOrders,
            totalVisits: totalVisitsInRange,
            totalOrders: totalOrdersInRange,
            conversionRate: `${conversionRate}%`
        },
        chartData,
        topProducts
    });
}, 'Erro ao carregar dados de estatísticas.');

// INTEGRAÇÃO: Oculta a META data antes de enviar para o Frontend
exports.getOrders = asyncHandler(async (req, res) => {
    const orders = await prisma.interaction.findMany({
        where: { userId: req.user.id, type: 'order' },
        orderBy: { createdAt: 'desc' }
    });
    
    const formattedOrders = orders.map(order => {
        const parts = order.details.split('\n\n===META===\n');
        let status = 'pending';
        if (parts[1]) {
            try { status = JSON.parse(parts[1]).status; } catch(e){}
        }
        return {
            id: order.id,
            createdAt: order.createdAt,
            details: parts[0], // Esconde o JSON do frontend
            status
        };
    });

    res.status(200).json({ success: true, orders: formattedOrders });
}, 'Erro ao buscar pedidos.');

// INTEGRAÇÃO: Atualiza o status e deduz o estoque usando a META invisível
exports.updateOrderStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    const interaction = await prisma.interaction.findFirst({
        where: { id, userId: req.user.id, type: 'order' }
    });
    
    if (!interaction) return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
    
    const parts = interaction.details.split('\n\n===META===\n');
    const displayDetails = parts[0];
    let meta = { status: 'pending', items: [] };
    
    if (parts[1]) {
        try { meta = JSON.parse(parts[1]); } catch(e){}
    }
    
    if (meta.status === 'sold') {
        return res.status(400).json({ success: false, message: 'Este pedido já foi marcado como vendido e o estoque já foi deduzido.' });
    }
    
    // Se foi marcado como VENDIDO, abate do estoque
    if (status === 'sold') {
        for (const item of meta.items) {
            if (item.id && item.quantity) {
                await prisma.product.updateMany({
                    where: { id: item.id, stock: { gte: item.quantity } },
                    data: { stock: { decrement: item.quantity } }
                });
            }
        }
    }
    
    meta.status = status;
    const newDetails = `${displayDetails}\n\n===META===\n${JSON.stringify(meta)}`;
    
    await prisma.interaction.update({
        where: { id },
        data: { details: newDetails }
    });
    
    res.status(200).json({ success: true, message: 'Status atualizado com sucesso.' });
}, 'Erro ao atualizar pedido.');

exports.getMessages = asyncHandler(async (req, res) => {
    const messages = await prisma.interaction.findMany({
        where: { userId: req.user.id, type: 'message' },
        orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, messages });
}, 'Erro ao buscar mensagens.');