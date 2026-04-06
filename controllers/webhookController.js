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

    // Validação da Assinatura
    try {
        const calculatedSignature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
        if (signature !== calculatedSignature) {
            return res.status(403).json({
                status: 'error',
                message: 'Assinatura inválida.'
            });
        }
    } catch (cryptoError) {
        return res.status(403).json({
            status: 'error',
            message: 'Erro de validação criptográfica.'
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

    if (!payment) {
        return res.status(200).json({
            status: 'success',
            message: 'Ignorado. Pagamento não pertence a este sistema.'
        });
    }


    if (eventName === 'payment.success') {
        const innerStatus = parsedData.data?.status;
        const transactionStatus = parsedData.data?.transaction?.status;

        if (innerStatus === 'paid' || transactionStatus === 'completed') {
            await paymentService.approvePaymentAndActivatePlan(payment);
        }
    } else if (eventName === 'payment.failed') {
        if (payment.status !== 'rejected') {
            const reason = parsedData.data?.error || 'Saldo insuficiente ou cancelado pelo utilizador.';
            await paymentService.rejectPayment(payment.id, reason);
        }
    }

    res.status(200).json({
        status: 'success',
        message: 'Webhook Processado.'
    });

}, 'Erro ao processar Webhook da PaySuite');