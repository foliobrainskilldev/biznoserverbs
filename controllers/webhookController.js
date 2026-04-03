// Ficheiro: src/controllers/webhookController.js
const crypto = require('crypto');
const prisma = require('../config/db');
const mailer = require('../services/mailer');
const { config } = require('../config/setup');

exports.handlePaysuiteWebhook = async (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    const secret = config.paysuite.webhookSecret;

    if (!signature || !secret) {
        console.error('[WEBHOOK] Assinatura ou secret ausente no .env.');
        return res.status(400).json({ status: 'error', message: 'Falta de autenticação ou configuração no servidor.' });
    }

    if (!req.rawBody) {
        console.error('[WEBHOOK] Payload rawBody ausente. Middleware do Express não funcionou.');
        return res.status(400).json({ status: 'error', message: 'Payload inválido.' });
    }

    // Validação de Segurança (HMAC SHA256)
    try {
        const calculatedSignature = crypto.createHmac('sha256', secret)
                                          .update(req.rawBody)
                                          .digest('hex');

        // Comparação segura contra ataques de tempo
        const isSignatureValid = crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(calculatedSignature)
        );

        if (!isSignatureValid) {
            console.error('[WEBHOOK] Assinatura inválida! Possível tentativa de fraude.');
            return res.status(403).json({ status: 'error', message: 'Assinatura inválida.' });
        }
    } catch (cryptoError) {
        console.error('[WEBHOOK] Erro ao validar criptografia:', cryptoError.message);
        return res.status(403).json({ status: 'error', message: 'Erro de validação de assinatura.' });
    }

    // Processamento do Evento
    try {
        const parsedData = JSON.parse(req.rawBody);
        const eventName = parsedData.event || '';
        // Proteção: O Gateway pode mandar o nosso ID em "reference" ou em "id"
        const gatewayReference = parsedData.data?.id || parsedData.data?.reference; 

        console.log(`[WEBHOOK] Recebido evento: ${eventName} para a referência: ${gatewayReference}`);

        // Aceita várias terminologias possíveis dos Webhooks do PaySuite
        const successEvents = ['payment.success', 'payment.successful', 'charge.completed', 'success'];
        const failedEvents = ['payment.failed', 'payment.cancelled', 'charge.failed', 'failed'];

        if (successEvents.includes(eventName.toLowerCase())) {
            const payment = await prisma.payment.findFirst({
                where: { 
                    OR: [
                        { gatewayReference: gatewayReference },
                        { gatewayReference: parsedData.data?.reference }
                    ]
                },
                include: { user: true, plan: true }
            });

            // Se o pagamento for encontrado e ainda não estiver aprovado, aprovamos e associamos o plano
            if (payment && payment.status !== 'approved') {
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
                console.log(`[WEBHOOK] Pagamento de ${payment.user.storeName} aprovado com sucesso via Webhook e Status do Utilizador Atualizado!`);
            }
        } 
        else if (failedEvents.includes(eventName.toLowerCase())) {
            const payment = await prisma.payment.findFirst({
                where: { 
                    OR: [
                        { gatewayReference: gatewayReference },
                        { gatewayReference: parsedData.data?.reference }
                    ]
                }
            });

            if (payment && payment.status !== 'rejected') {
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: 'rejected', rejectionReason: parsedData.data?.error || 'Falha ou cancelamento no Gateway.' }
                });
                console.log(`[WEBHOOK] Pagamento rejeitado via Webhook para a referência: ${gatewayReference}`);
            }
        }

        // A API da PaySuite exige que enviemos uma resposta rápida (200 OK) para confirmar a receção
        res.status(200).json({ status: 'success', message: 'Webhook processado com sucesso.' });

    } catch (error) {
        console.error('[WEBHOOK] Erro interno ao processar dados:', error.message);
        res.status(500).json({ status: 'error', message: 'Erro interno no servidor' });
    }
};