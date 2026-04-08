const { config } = require('../config/setup');

const getHeaders = () => {
    if (!config.paysuite.token) {
        throw new Error("O Token da PaySuite (PAYSUITE_API_TOKEN) não está configurado no ficheiro .env!");
    }

    return {
        'Authorization': `Bearer ${config.paysuite.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
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
            throw new Error(`Servidor da PaySuite bloqueou o pedido (HTTP ${response.status}). Verifique o seu PAYSUITE_API_TOKEN no .env.`);
        }

        if (!response.ok || data.status === 'error') {
            throw new Error(data.message || `Erro da PaySuite: HTTP ${response.status}`);
        }

        return data; 
    } catch (error) {
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
            throw new Error(`Servidor da PaySuite bloqueou o pedido (HTTP ${response.status}). Verifique o seu PAYSUITE_API_TOKEN no .env.`);
        }

        if (!response.ok || data.status === 'error') {
            throw new Error(data.message || `Erro da PaySuite: HTTP ${response.status}`);
        }

        return data; 
    } catch (error) {
        throw error;
    }
};