const prisma = require('../config/db');
const mailer = require('./mailer');
const paysuiteService = require('./paysuiteService');
const {
    getPlanExpirationDate
} = require('../utils/helpers');

exports.approvePaymentAndActivatePlan = async (payment) => {
    if (payment.status === 'approved') return payment;
    const expiresAt = getPlanExpirationDate(30);

    await prisma.$transaction([
        prisma.user.update({
            where: {
                id: payment.userId
            },
            data: {
                planId: payment.planId,
                planStatus: 'active',
                planExpiresAt: expiresAt
            }
        }),
        prisma.payment.update({
            where: {
                id: payment.id
            },
            data: {
                status: 'approved'
            }
        })
    ]);

    await mailer.sendPaymentApprovedEmail(payment.user.email, payment.user.storeName, payment.plan.name);
    return {
        status: 'approved'
    };
};

exports.rejectPayment = async (paymentId, reason = 'Saldo insuficiente ou cancelado.') => {
    await prisma.payment.update({
        where: {
            id: paymentId
        },
        data: {
            status: 'rejected',
            rejectionReason: reason
        }
    });
    return {
        status: 'rejected',
        reason
    };
};

exports.syncPaymentStatusWithGateway = async (payment) => {
    if (payment.status !== 'pending') return payment.status;

    try {
        const psStatus = await paysuiteService.getPaymentStatus(payment.gatewayReference);
        const pData = psStatus.data;
        if (!pData) return 'pending';

        const mStatus = String(pData.status || '').toLowerCase();
        let isPaid = (mStatus === 'paid' || mStatus === 'completed');
        let isFailed = (mStatus === 'failed' || mStatus === 'cancelled' || mStatus === 'declined');
        let errorMessage = pData.error || 'Falha no processamento.';

        if (pData.transaction?.status) {
            const txStatus = String(pData.transaction.status).toLowerCase();
            if (txStatus === 'completed') isPaid = true;
            if (txStatus === 'failed') {
                isFailed = true;
                errorMessage = pData.transaction.error || errorMessage;
            }
        }

        if (isPaid) {
            await this.approvePaymentAndActivatePlan(payment);
            return 'approved';
        } else if (isFailed) {
            await this.rejectPayment(payment.id, errorMessage);
            return 'rejected';
        }

        return 'pending';
    } catch {
        return 'pending';
    }
};