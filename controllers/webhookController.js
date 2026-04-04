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
        return res.status(400).json({ status: 'error', message: 'Falta de autenticação no servidor.' });
    }

    // Fallback: se o rawBody não foi criado, transformamos o body novamente em string
    const payloadString = req.rawBody || JSON.stringify(req.body);

    if (!payloadString) {
        console.error('[WEBHOOK] Payload vazio.');
        return res.status(400).json({ status: 'error', message: 'Payload inválido.' });
    }

    // Validação de Segurança (HMAC SHA256) compatível com PaySuite
    try {
        const calculatedSignature = crypto.createHmac('sha256', secret)
                                          .update(payloadString)
                                          .digest('hex');

        if (signature !== calculatedSignature) {
            console.error('[WEBHOOK] Assinatura inválida! Possível tentativa de fraude.');
            return res.status(403).json({ status: 'error', message: 'Assinatura inválida.' });
        }
    } catch (cryptoError) {
        console.error('[WEBHOOK] Erro ao validar criptografia:', cryptoError.message);
        return res.status(403).json({ status: 'error', message: 'Erro de validação.' });
    }

    // Processamento do Evento
    try {
        const parsedData = typeof req.body === 'object' ? req.body : JSON.parse(payloadString);
        const eventName = parsedData.event || '';
        
        // A API envia o ULID e a nossa Referência
        const gatewayId = parsedData.data?.id; 
        const gatewayReference = parsedData.data?.reference; 

        console.log(`[WEBHOOK] Recebido evento: ${eventName} para ID: ${gatewayId}`);

        const successEvents = ['payment.success', 'payment.successful', 'charge.completed', 'success'];
        const failedEvents = ['payment.failed', 'payment.cancelled', 'charge.failed', 'failed'];

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
            console.log(`[WEBHOOK] Pagamento ignorado (não localizado) - Ref: ${gatewayId}`);
            return res.status(200).json({ status: 'success', message: 'Ignorado. Não encontrado.' });
        }

        if (successEvents.includes(eventName.toLowerCase())) {
            // Se o pagamento ainda não estiver aprovado, aprovamos e associamos o plano
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
                console.log(`[WEBHOOK] Plano ativado para ${payment.user.storeName} via Webhook!`);
            }
        } 
        else if (failedEvents.includes(eventName.toLowerCase())) {
            if (payment.status !== 'rejected') {
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: 'rejected', rejectionReason: parsedData.data?.error || 'Recusado/Cancelado no Gateway.' }
                });
                console.log(`[WEBHOOK] Pagamento rejeitado para: ${gatewayId}`);
            }
        }

        // Resposta obrigatória 200 OK para o Gateway parar de reenviar o Webhook
        res.status(200).json({ status: 'success', message: 'Processado com sucesso.' });

    } catch (error) {
        console.error('[WEBHOOK] Erro interno:', error.message);
        res.status(500).json({ status: 'error', message: 'Erro interno.' });
    }
};