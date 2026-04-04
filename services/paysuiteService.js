// Ficheiro: src/services/paysuiteService.js
const { config } = require('../config/setup');

const getHeaders = () => ({
    'Authorization': `Bearer ${config.paysuite.token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
});

exports.createPaymentRequest = async (amount, reference, description, method, returnUrl) => {
    const endpoint = `${config.paysuite.apiUrl}/payments`;
    
    // Voltamos a enviar o method, pois a PaySuite exige para saber qual formulário renderizar
    const payload = {
        amount: Number(amount),
        reference: reference,
        description: description,
        method: method,
        return_url: returnUrl
    };

    try {
        const response = await fetch(endpoint, { 
            method: 'POST', 
            headers: getHeaders(), 
            body: JSON.stringify(payload) 
        });
        
        const data = await response.json();

        if (!response.ok || data.status === 'error') {
            console.error('[PAYSUITE_REJEITADO_DETALHES]:', JSON.stringify(data));
            throw new Error(data.message || `Erro da PaySuite: HTTP ${response.status}`);
        }

        return data; 
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