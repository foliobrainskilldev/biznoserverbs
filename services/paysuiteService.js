// Ficheiro: src/services/paysuiteService.js
const { config } = require('../config/setup');

const getHeaders = () => {
    // 1. Proteção: Verifica logo se o Token existe no .env para não enviar 'Bearer undefined'
    if (!config.paysuite.token) {
        throw new Error("O Token da PaySuite (PAYSUITE_API_TOKEN) não está configurado no ficheiro .env!");
    }

    return {
        'Authorization': `Bearer ${config.paysuite.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // 2. Proteção: Finge ser um navegador/aplicação legítima para não ser bloqueado pela Firewall da PaySuite
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BiznoApp/1.0'
    };
};

exports.createPaymentRequest = async (amount, reference, description, method, returnUrl) => {
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
        
        const responseText = await response.text();
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('[PAYSUITE_RESPOSTA_HTML_RECEBIDA]:', responseText);
            throw new Error(`Servidor da PaySuite bloqueou o pedido (HTTP ${response.status}). Verifique o seu PAYSUITE_API_TOKEN no .env.`);
        }

        if (!response.ok || data.status === 'error') {
            console.error('[PAYSUITE_REJEITADO_DETALHES]:', JSON.stringify(data));
            throw new Error(data.message || `Erro da PaySuite: HTTP ${response.status}`);
        }

        return data; 
    } catch (error) {
        console.error(`[PAYSUITE_ERROR] Erro ao criar pagamento:`, error.message);
        throw error; // Passa o erro exato para o Frontend exibir
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
            throw new Error(`Servidor da PaySuite bloqueou o pedido (HTTP ${response.status}). Verifique o seu PAYSUITE_API_TOKEN no .env.`);
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