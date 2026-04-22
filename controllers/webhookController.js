const crypto = require('crypto');
const prisma = require('../config/db');
const {
    config
} = require('../config/setup');
const asyncHandler = require('../utils/asyncHandler');
const paymentService = require('../services/paymentService');

exports.handlePaysuiteWebhook = asyncHandler(async (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    const secret = config.paysuite.webhookSecret;

    if (!signature || !secret) {
        return res.status(400).json({
            status: 'error',
            message: 'Falta de autenticação no servidor.'
        });
    }

    const payloadString = req.rawBody || JSON.stringify(req.body);
    if (!payloadString) {
        return res.status(400).json({
            status: 'error',
            message: 'Payload inválido.'
        });
    }

    try {
        const calculatedSignature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
        if (signature !== calculatedSignature) return res.status(403).json({
            status: 'error',
            message: 'Assinatura inválida.'
        });
    } catch {
        return res.status(403).json({
            status: 'error',
            message: 'Erro criptográfico.'
        });
    }

    const parsedData = typeof req.body === 'object' ? req.body : JSON.parse(payloadString);
    const eventName = parsedData.event;
    const gatewayId = parsedData.data?.id;
    const gatewayReference = parsedData.data?.reference;

    const payment = await prisma.payment.findFirst({
        where: {
            OR: [{
                gatewayReference: gatewayId
            }, {
                gatewayReference: gatewayReference
            }]
        },
        include: {
            user: true,
            plan: true
        }
    });

    if (!payment) return res.status(200).json({
        status: 'success',
        message: 'Ignorado.'
    });

    if (eventName === 'payment.success') {
        if (parsedData.data?.status === 'paid' || parsedData.data?.transaction?.status === 'completed') {
            await paymentService.approvePaymentAndActivatePlan(payment);
        }
    } else if (eventName === 'payment.failed') {
        if (payment.status !== 'rejected') {
            await paymentService.rejectPayment(payment.id, parsedData.data?.error || 'Saldo insuficiente ou cancelado.');
        }
    }

    res.status(200).json({
        status: 'success',
        message: 'Webhook Processado.'
    });
});