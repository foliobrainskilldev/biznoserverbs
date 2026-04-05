// Ficheiro: src/services/debitoService.js
const { config } = require('../config/setup');

const getHeaders = () => {
    if (!config.debito.token) {
        throw new Error("O Token da Débito API não está configurado no ficheiro .env!");
    }

    return {
        'Authorization': `Bearer ${config.debito.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
};

exports.createPaymentRequest = async (amount, reference, description, method, phone, email, returnUrl) => {
    const baseUrl = config.debito.apiUrl.replace(/\/$/, '');
    
    // Seleciona a carteira correta baseada no método de pagamento
    const walletId = config.debito.wallets[method];
    
    if (!walletId) {
        throw new Error(`Nenhuma carteira configurada no .env para o método: ${method}`);
    }
    
    let endpoint = '';
    let payload = {};

    // Formatar número de telefone para M-Pesa/eMola (exigido pela Débito: 84xxxxxxx ou 85xxxxxxx)
    let msisdn = phone ? phone.replace(/\D/g, '') : '';
    if (msisdn.startsWith('258')) msisdn = msisdn.substring(3);

    if (method === 'credit_card') {
        endpoint = `${baseUrl}/wallets/${walletId}/card-payment`;
        payload = {
            amount: Number(amount),
            reference_description: String(reference).substring(0, 100),
            email: email || null,
            phone: msisdn || null,
            callback_url: returnUrl
        };
    } else if (method === 'mpesa' || method === 'emola') {
        if (!msisdn) throw new Error("Número de telefone é obrigatório para pagamentos móveis.");
        
        endpoint = `${baseUrl}/wallets/${walletId}/c2b/${method}`;
        payload = {
            msisdn: msisdn,
            amount: Number(amount),
            reference_description: String(reference).substring(0, 32), // Débito exige max 32 chars para mobile
            internal_notes: description
        };
    } else {
        throw new Error("Método de pagamento não suportado.");
    }

    try {
        const response = await fetch(endpoint, { 
            method: 'POST', 
            headers: getHeaders(), 
            body: JSON.stringify(payload) 
        });
        
        const data = await response.json();

        if (!response.ok) {
            console.error('[DEBITO_REJEITADO_DETALHES]:', JSON.stringify(data));
            throw new Error(data.message || `Erro da Débito API: HTTP ${response.status}`);
        }

        // Padronizar o retorno para o nosso Controller
        return {
            reference: data.debito_reference || data.transaction_id || reference,
            checkout_url: data.checkout_url || data.payment_url || null, 
            status: data.status
        }; 
    } catch (error) {
        console.error(`[DEBITO_ERROR] Erro ao criar pagamento:`, error.message);
        throw error;
    }
};

exports.getPaymentStatus = async (debitoReference) => {
    const baseUrl = config.debito.apiUrl.replace(/\/$/, '');
    
    // O endpoint de status da Débito não precisa de Wallet ID, apenas da referência
    const endpoint = `${baseUrl}/transactions/${debitoReference}/status`;

    try {
        const response = await fetch(endpoint, { 
            method: 'GET', 
            headers: getHeaders() 
        });
        
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || `Erro da Débito API: HTTP ${response.status}`);
        }

        return data; 
    } catch (error) {
        console.error(`[DEBITO_ERROR] Erro ao verificar pagamento ${debitoReference}:`, error.message);
        throw error;
    }
};