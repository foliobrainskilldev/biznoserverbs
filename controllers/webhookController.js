// Ficheiro: src/controllers/webhookController.js
const crypto = require('crypto');
const prisma = require('../config/db');
const mailer = require('../services/mailer');

exports.handlePaysuiteWebhook = async (req, res) => {
    // 1. Extrair a assinatura enviada pelo Gateway e o nosso segredo
    const signature = req.headers['x-webhook-signature'];
    const secret = process.env.PAYSUITE_WEBHOOK_SECRET;

    if (!signature || !secret) {
        console.error('[WEBHOOK] Assinatura ou segredo ausente.');
        return res.status(400).json({ status: 'error', message: 'Falta de autenticação.' });
    }

    // 2. Verificar a segurança (Assinatura HMAC SHA256)
    const payload = req.rawBody; // Guardado pelo nosso server.js
    const calculatedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (signature !== calculatedSignature) {
        console.error('[WEBHOOK] Assinatura inválida! Possível tentativa de fraude.');
        return res.status(403).json({ status: 'error', message: 'Assinatura inválida.' });
    }

    // 3. Processar o Evento de forma segura
    try {
        const parsedData = JSON.parse(payload);
        const eventName = parsedData.event;
        const gatewayReference = parsedData.data.id; // O ID único que a PaySuite nos deu ao criar o pagamento

        if (eventName === 'payment.success') {
            const payment = await prisma.payment.findUnique({
                where: { gatewayReference: gatewayReference },
                include: { user: true, plan: true }
            });

            // Se ainda não estiver aprovado, aprovamos!
            if (payment && payment.status !== 'approved') {
                const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Plano de 30 dias
                
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

                // Envia o e-mail a avisar o lojista
                await mailer.sendPaymentApprovedEmail(payment.user.email, payment.user.storeName, payment.plan.name);
                console.log(`[WEBHOOK] Pagamento de ${payment.user.storeName} aprovado automaticamente!`);
            }
        } 
        else if (eventName === 'payment.failed') {
            const payment = await prisma.payment.findUnique({
                where: { gatewayReference: gatewayReference }
            });

            if (payment && payment.status !== 'rejected') {
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: 'rejected', rejectionReason: parsedData.data.error || 'Falha no Gateway.' }
                });
                console.log(`[WEBHOOK] Pagamento falhou: ${gatewayReference}`);
            }
        }

        // A PaySuite exige que enviemos uma resposta rápida (200 OK)
        res.status(200).json({ status: 'success', message: 'Webhook processado' });

    } catch (error) {
        console.error('[WEBHOOK] Erro interno:', error.message);
        res.status(500).json({ status: 'error', message: 'Erro interno' });
    }
};