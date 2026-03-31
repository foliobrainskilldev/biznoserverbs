const { Resend } = require('resend');
const { config } = require('./config');

// Inicializa o Resend com a tua chave API
const resend = new Resend(config.resendApiKey);

const createEmailTemplate = (subject, title, bodyContent, button) => {
    const biznoBlue = '#0C2340';
    const biznoGold = '#D4AF37';
    const biznoWhite = '#FFFFFF';
    const backgroundColor = '#f4f4f4';

    let buttonHtml = '';
    if (button && button.url && button.text) {
        buttonHtml = `
            <a href="${button.url}" style="background-color: ${biznoGold}; color: ${biznoBlue}; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-top: 20px;">
                ${button.text}
            </a>
        `;
    }

    return `
        <!DOCTYPE html>
        <html lang="pt">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${subject}</title>
            <style>
                body { font-family: 'Nunito', sans-serif; }
            </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: ${backgroundColor};">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                    <td style="padding: 20px 0;">
                        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="border-collapse: collapse; background-color: ${biznoWhite}; border-radius: 8px; overflow: hidden;">
                            <tr>
                                <td align="center" style="padding: 30px 20px; background-color: ${biznoBlue}; color: ${biznoWhite};">
                                    <h1 style="margin: 0; font-size: 28px; color: ${biznoGold};">Bizno</h1>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 30px 40px;">
                                    <h2 style="color: ${biznoBlue}; margin-top: 0;">${title}</h2>
                                    ${bodyContent}
                                    ${buttonHtml ? `<p style="text-align: center;">${buttonHtml}</p>` : ''}
                                </td>
                            </tr>
                            <tr>
                                <td style="background-color: #eeeeee; padding: 20px 30px; text-align: center;">
                                    <p style="margin: 0; color: #555555; font-size: 12px;">
                                        © ${new Date().getFullYear()} Bizno. Todos os direitos reservados.<br>
                                        Se você não solicitou este e-mail, por favor, ignore-o.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `;
};

// ====== NOVA FUNÇÃO DE ENVIO COM RESEND ======
const sendEmail = async (to, subject, html) => {
    try {
        const { data, error } = await resend.emails.send({
            from: config.emailFrom,
            to,
            subject,
            html,
        });

        if (error) {
            console.error(`Erro da API do Resend ao enviar para ${to}:`, error);
        } else {
            console.log(`E-mail enviado com sucesso para ${to}. ID: ${data.id}`);
        }
    } catch (error) {
        console.error(`Erro interno ao tentar enviar e-mail para ${to}:`, error);
    }
};

const sendVerificationEmail = async (to, storeName, code) => {
    const subject = 'Confirme a sua conta Bizno';
    const title = `Bem-vindo à Bizno, ${storeName}!`;
    const body = `<p>O seu catálogo online está quase pronto! Use o código abaixo para verificar o seu e-mail e ativar a sua conta:</p>
                  <p style="font-size: 24px; font-weight: bold; color: #0C2340; text-align: center; letter-spacing: 5px; margin: 20px 0;">${code}</p>
                  <p>Este código expira em 10 minutos. Se não se cadastrou na Bizno, pode ignorar este e-mail.</p>`;
    const html = createEmailTemplate(subject, title, body);
    await sendEmail(to, subject, html);
};

const sendPasswordResetEmail = async (to, code) => {
    const subject = 'Redefinição de Senha - Bizno';
    const title = 'Pedido de Redefinição de Senha';
    const body = `<p>Recebemos um pedido para redefinir a sua senha. Use o código abaixo para criar uma nova senha:</p>
                  <p style="font-size: 24px; font-weight: bold; color: #0C2340; text-align: center; letter-spacing: 5px; margin: 20px 0;">${code}</p>
                  <p>Se não foi você que fez este pedido, por favor, ignore este e-mail.</p>`;
    const html = createEmailTemplate(subject, title, body);
    await sendEmail(to, subject, html);
};

const sendPaymentApprovedEmail = async (to, storeName, planName) => {
    const subject = `Pagamento Aprovado! Seu Plano ${planName} está Ativo`;
    const title = 'Pagamento Confirmado!';
    const body = `<p>Olá, ${storeName},</p>
                  <p>O seu pagamento foi aprovado com sucesso! O seu plano <strong>${planName}</strong> já está ativo e todas as funcionalidades estão disponíveis para você.</p>
                  <p>Aproveite ao máximo a sua jornada com a Bizno!</p>`;
    const button = { text: 'Acessar o Dashboard', url: `${config.frontendURL}/dash/dashboard.html` };
    const html = createEmailTemplate(subject, title, body, button);
    await sendEmail(to, subject, html);
};

const sendPaymentRejectedEmail = async (to, storeName, reason) => {
    const subject = 'Problema no Pagamento - Bizno';
    const title = 'Pagamento Recusado';
    const body = `<p>Olá, ${storeName},</p>
                  <p>Infelizmente, o seu comprovativo de pagamento foi recusado. O motivo fornecido pelo administrador foi:</p>
                  <p style="padding: 10px; background-color: #f9e3e3; border-left: 4px solid #d9534f; color: #d9534f;"><strong>${reason || 'Não especificado.'}</strong></p>
                  <p>Por favor, envie um novo comprovativo ou entre em contato com o nosso suporte.</p>`;
    const button = { text: 'Ver Planos e Enviar Comprovativo', url: `${config.frontendURL}/pay/planos.html` };
    const html = createEmailTemplate(subject, title, body, button);
    await sendEmail(to, subject, html);
};

const sendPlanExpiryWarning = async (to, storeName, planName) => {
    const subject = 'Aviso: O seu plano Bizno está prestes a expirar';
    const title = `O seu Plano ${planName} Expirará em Breve!`;
    const body = `<p>Olá, ${storeName},</p>
                  <p>Este é um lembrete de que o seu plano <strong>${planName}</strong> expira em <strong>3 dias</strong>. Para evitar a interrupção dos seus serviços e manter o seu catálogo online, recomendamos que faça a renovação.</p>`;
    const button = { text: 'Renovar Agora', url: `${config.frontendURL}/pay/planos.html` };
    const html = createEmailTemplate(subject, title, body, button);
    await sendEmail(to, subject, html);
};

const sendPlanExpiredEmail = async (to, storeName, planName) => {
    const subject = `O seu Plano ${planName} Expirou`;
    const title = 'Plano Expirado';
    const body = `<p>Olá, ${storeName},</p>
                  <p>Informamos que o seu plano <strong>${planName}</strong> expirou. O seu acesso ao painel de gerenciamento foi temporariamente bloqueado.</p>
                  <p>Para reativar a sua conta e o seu catálogo, por favor, renove o seu plano.</p>`;
    const button = { text: 'Renovar Plano', url: `${config.frontendURL}/pay/planos.html` };
    const html = createEmailTemplate(subject, title, body, button);
    await sendEmail(to, subject, html);
};

const sendAccountDeactivatedEmail = async (to, storeName) => {
    const subject = 'Conta Desativada - Bizno';
    const title = 'A sua conta foi desativada';
    const body = `<p>Olá, ${storeName},</p>
                  <p>O seu plano expirou há mais de 24 horas e não foi renovado. Como resultado, a sua conta e o seu catálogo online foram desativados para o público.</p>
                  <p>Seus dados ainda estão salvos. Para reativar tudo, basta fazer um novo pagamento.</p>`;
    const button = { text: 'Reativar Conta', url: `${config.frontendURL}/pay/planos.html` };
    const html = createEmailTemplate(subject, title, body, button);
    await sendEmail(to, subject, html);
};

const sendGlobalAdminMessage = async (to, messageSubject, messageBody) => {
    const subject = messageSubject;
    const title = messageSubject;
    const body = `<p>Esta é uma mensagem importante da equipe Bizno:</p>
                  <div style="padding: 15px; background-color: #e7f3fe; border-left: 4px solid #2196F3; margin-top: 15px;">${messageBody}</div>`;
    const html = createEmailTemplate(subject, title, body);
    await sendEmail(to, subject, html);
};

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendPaymentApprovedEmail,
    sendPaymentRejectedEmail,
    sendPlanExpiryWarning,
    sendPlanExpiredEmail,
    sendAccountDeactivatedEmail,
    sendGlobalAdminMessage,
};