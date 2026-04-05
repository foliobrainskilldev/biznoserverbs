// Ficheiro: src/controllers/webhookController.js
const prisma = require('../config/db');
const mailer = require('../services/mailer');
const debitoService = require('../services/debitoService');

exports.handleDebitoWebhook = async (req, res) => {
    // 1. O GATILHO INSEGURO (Trigger)
    const payload = req.body;
    const debitoReference = payload.debito_reference || payload.transaction_id;

    if (!debitoReference) {
        console.warn('[WEBHOOK] Recebido POST sem referência. Ignorado.');
        return res.status(400).json({ status: 'error', message: 'Referência ausente no payload.' });
    }

    console.log(`[WEBHOOK] Despertador acionado para a referência: ${debitoReference}. A iniciar verificação side-channel...`);

    try {
        // 2. A REQUISIÇÃO DE VERIFICAÇÃO (Side-Channel)
        const debitoStatus = await debitoService.getPaymentStatus(debitoReference);
        
        if (!debitoStatus) {
            return res.status(404).json({ status: 'error', message: 'Transação não encontrada no provedor.' });
        }

        // Extraímos o status REAL vindo da nossa requisição autenticada
        const mainStatus = debitoStatus.status ? String(debitoStatus.status).toUpperCase() : 'PENDING';

        // 3. VALIDAÇÃO DO STATUS E IDEMPOTÊNCIA
        const payment = await prisma.payment.findFirst({
            where: { gatewayReference: String(debitoReference) },
            include: { user: true, plan: true }
        });

        if (!payment) {
            return res.status(200).json({ status: 'success', message: 'Ignorado. Transação não pertence a este sistema.' });
        }

        // Idempotência: Previne ataques de "replay" ou duplicação de créditos
        if (payment.status === 'approved' || payment.status === 'rejected') {
            console.log(`[WEBHOOK] Transação ${debitoReference} já estava processada (${payment.status}).`);
            return res.status(200).json({ status: 'success', message: 'Transação já processada anteriormente.' });
        }

        // 4. COMMIT DE ATUALIZAÇÃO
        if (mainStatus === 'SUCCESS' || mainStatus === 'COMPLETED' || mainStatus === 'PAID') {
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
            console.log(`[WEBHOOK SEGURO] Pagamento confirmado e Plano ativado para ${payment.user.storeName}`);
        
        } 
        else if (mainStatus === 'FAILED' || mainStatus === 'CANCELLED' || mainStatus === 'REJECTED') {
            await prisma.payment.update({
                where: { id: payment.id },
                data: { status: 'rejected', rejectionReason: debitoStatus.message || 'Recusado/Cancelado pela operadora.' }
            });
            console.log(`[WEBHOOK SEGURO] Pagamento rejeitado para ${payment.user.storeName}`);
        }

        res.status(200).json({ status: 'success', message: 'Processado com segurança.' });

    } catch (error) {
        console.error('[WEBHOOK SEGURO] Erro interno durante a verificação:', error.message);
        
        // Informa caso o provedor fique offline no exato momento do Webhook
        if (error.message.includes('ENOTFOUND') || error.message.includes('fetch failed')) {
             console.error('[CRÍTICO] A API da Débito está inacessível ou o URL está mal configurado no servidor.');
        }

        // Retornamos 500 para que a Débito tente enviar o webhook novamente mais tarde
        res.status(500).json({ status: 'error', message: 'Erro interno durante a verificação. Tente de novo.' });
    }
};