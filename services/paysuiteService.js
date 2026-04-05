// Ficheiro: src/services/paysuiteService.js
const { config } = require('../config/setup');

const getHeaders = () => ({
    'Authorization': `Bearer ${config.paysuite.token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
});

exports.createPaymentRequest = async (amount, reference, description, method, returnUrl) => {
    // Garante que não há uma barra "/" duplicada no final do URL configurado no .env
    const baseUrl = config.paysuite.apiUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/payments`;
    
    const payload = {
        amount: Number(amount),
        reference: String(reference).substring(0, 50),
        description: String(description).substring(0, 125),
        method: method,
        return_url: returnUrl
    };

    try {
        const response = await fetch(endpoint, { 
            method: 'POST', 
            headers: getHeaders(), 
            body: JSON.stringify(payload) 
        });
        
        // LÊ COMO TEXTO PRIMEIRO PARA EVITAR O ERRO "Unexpected token '<'"
        const responseText = await response.text();
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('[PAYSUITE_RESPOSTA_HTML_RECEBIDA]:', responseText);
            throw new Error(`URL da API PaySuite incorreta ou Servidor da PaySuite indisponível. HTTP: ${response.status}`);
        }

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
    const baseUrl = config.paysuite.apiUrl.replace(/\/$/, '');
    const endpoint = `${baseUrl}/payments/${paymentId}`;

    try {
        const response = await fetch(endpoint, { 
            method: 'GET', 
            headers: getHeaders() 
        });
        
        const responseText = await response.text();
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('[PAYSUITE_RESPOSTA_HTML_RECEBIDA]:', responseText);
            throw new Error(`URL da API PaySuite incorreta ou Servidor indisponível. HTTP: ${response.status}`);
        }

        if (!response.ok || data.status === 'error') {
            throw new Error(data.message || `Erro da PaySuite: HTTP ${response.status}`);
        }

        return data; 
    } catch (error) {
        console.error(`[PAYSUITE_ERROR] Erro ao verificar pagamento ${paymentId}:`, error.message);
        throw error;
    }
};