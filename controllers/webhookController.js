const crypto = require('crypto');
const prisma = require('../config/db');
const mailer = require('../services/mailer');
const { config } = require('../config/setup');

exports.handlePaysuiteWebhook = async (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    const secret = config.paysuite.webhookSecret;

    if (!signature || !secret) {
        return res.status(400).json({ status: 'error', message: 'Falta de autenticação no servidor.' });
    }

    const payloadString = req.rawBody || JSON.stringify(req.body);

    if (!payloadString) {
        return res.status(400).json({ status: 'error', message: 'Payload inválido.' });
    }

    try {
        const calculatedSignature = crypto.createHmac('sha256', secret)
                                          .update(payloadString)
                                          .digest('hex');

        if (signature !== calculatedSignature) {
            return res.status(403).json({ status: 'error', message: 'Assinatura inválida.' });
        }
    } catch (cryptoError) {
        return res.status(403).json({ status: 'error', message: 'Erro de validação.' });
    }

    try {
        const parsedData = typeof req.body === 'object' ? req.body : JSON.parse(payloadString);
        
        const eventName = parsedData.event; 
        const gatewayId = parsedData.data?.id; 
        const gatewayReference = parsedData.data?.reference; 

        const payment = await prisma.payment.findFirst({
            where: { 
                OR: [
                    { gatewayReference: gatewayId },
                    { gatewayReference: gatewayReference }
                ]
            },
            include: { user: true, plan: true }
        });

        if (!payment) {
            return res.status(200).json({ status: 'success', message: 'Ignorado. Pagamento não pertence a este sistema.' });
        }

        if (eventName === 'payment.success') {
            const innerStatus = parsedData.data?.status;
            const transactionStatus = parsedData.data?.transaction?.status;

            if (innerStatus === 'paid' || transactionStatus === 'completed') {
                if (payment.status !== 'approved') {
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
                }
            }
        } 
        else if (eventName === 'payment.failed') {
            if (payment.status !== 'rejected') {
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: 'rejected', rejectionReason: parsedData.data?.error || 'Recusado ou sem saldo.' }
                });
            }
        }

        res.status(200).json({ status: 'success', message: 'Processado.' });

    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Erro interno.' });
    }
};