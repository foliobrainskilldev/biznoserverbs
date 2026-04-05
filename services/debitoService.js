// Ficheiro: src/services/debitoService.js
const { config } = require('../config/setup');

class DebitoService {
    
    async createPaymentRequest(amount, reference, description, provider, phone, email, returnUrl) {
        const baseUrl = config.debito.apiUrl;
        const walletId = config.debito.wallets[provider];

        if (!walletId) throw new Error(`O ID da carteira não está configurado para: ${provider}`);
        if (!config.debito.token) throw new Error('Token da API Débito não configurado.');

        let endpoint = '';
        let payload = {};

        if (provider === 'mpesa') {
            endpoint = `/api/v1/wallets/${walletId}/c2b/mpesa`;
            payload = { msisdn: phone, amount: parseFloat(amount), reference_description: description.substring(0, 32) };
        } else if (provider === 'emola') {
            endpoint = `/api/v1/wallets/${walletId}/c2b/emola`;
            payload = { msisdn: phone, amount: parseFloat(amount), reference_description: description.substring(0, 32) };
        } else if (provider === 'credit_card') {
            endpoint = `/api/v1/wallets/${walletId}/card-payment`;
            payload = { amount: parseFloat(amount), reference_description: description.substring(0, 100), email: email || '', phone: phone || '', callback_url: returnUrl };
        }

        const url = `${baseUrl}${endpoint}`;
        console.log(`[DÉBITO API INITIATE] POST ${url} | Payload:`, payload);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${config.debito.token}` },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('[DÉBITO API ERROR RESP]', data);
                // Extrai a mensagem real do erro (geralmente dentro de data.errors ou data.message)
                const errorMsg = data.message || (data.errors ? JSON.stringify(data.errors) : 'Erro na operadora.');
                throw new Error(errorMsg);
            }

            return {
                reference: data.debito_reference || reference,
                checkout_url: data.checkout_url || null,
                status: data.status || 'PENDING'
            };

        } catch (error) {
            console.error('[DÉBITO FETCH ERROR]', error.message);
            throw error;
        }
    }

    async getPaymentStatus(debitoReference) {
        const baseUrl = config.debito.apiUrl;
        const url = `${baseUrl}/api/v1/transactions/${debitoReference}/status`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${config.debito.token}` }
            });

            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('[DÉBITO STATUS ERROR]', error.message);
            return null;
        }
    }
}

module.exports = new DebitoService();