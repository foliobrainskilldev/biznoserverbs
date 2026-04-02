// Ficheiro: src/services/paysuiteService.js
const { config } = require('../config/setup');

const getHeaders = () => ({
    'Authorization': `Bearer ${config.paysuite.token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
});

exports.createPaymentRequest = async (amount, reference, description, method, returnUrl) => {
    const endpoint = `${config.paysuite.apiUrl}/payments`;
    
    // Pega do ENV sugerido ou faz fallback dinâmico
    const finalReturnUrl = config.urls.paymentReturnUrl || returnUrl;
    const finalCallbackUrl = config.urls.paymentCallbackUrl || `${config.urls.appUrl}/api/webhooks/paysuite`;

    // A doc diz que "amount" deve ser "numeric". 
    // Usamos Number() em vez de toString()
    const payload = {
        amount: Number(amount),
        reference: reference,
        description: description,
        method: method,
        return_url: finalReturnUrl,
        callback_url: finalCallbackUrl // Necessário para notificar o webhook
    };

    try {
        const response = await fetch(endpoint, { 
            method: 'POST', 
            headers: getHeaders(), 
            body: JSON.stringify(payload) 
        });
        
        const data = await response.json();

        // LOG para sabermos EXATAMENTE o que a PaySuite reclamou caso falhe (ex: token inválido, método errado)
        if (!response.ok || data.status === 'error') {
            console.error('[PAYSUITE_REJEITADO_DETALHES]:', JSON.stringify(data));
            throw new Error(data.message || `Erro da PaySuite: HTTP ${response.status}`);
        }

        return data; // Retorna: status, data { id, amount, reference, status, checkout_url }
    } catch (error) {
        console.error(`[PAYSUITE_ERROR] Erro ao criar pagamento:`, error.message);
        throw error;
    }
};

exports.getPaymentStatus = async (paymentId) => {
    const endpoint = `${config.paysuite.apiUrl}/payments/${paymentId}`;

    try {
        const response = await fetch(endpoint, { 
            method: 'GET', 
            headers: getHeaders() 
        });
        
        const data = await response.json();

        if (!response.ok || data.status === 'error') {
            throw new Error(data.message || `Erro da PaySuite: HTTP ${response.status}`);
        }

        return data; 
    } catch (error) {
        console.error(`[PAYSUITE_ERROR] Erro ao verificar pagamento ${paymentId}:`, error.message);
        throw error;
    }
};