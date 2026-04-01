// Ficheiro: src/services/mailer.js
const { Resend } = require('resend');
const { config } = require('../config/setup');

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
            <style>body { font-family: 'Nunito', sans-serif; }</style>
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
                                        © ${new Date().getFullYear()} Bizno. Todos os direitos reservados.
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

const sendEmail = async (to, subject, html) => {
    try {
        const { data, error } = await resend.emails.send({
            from: config.emailFrom,
            to,
            subject,
            html,
        });
        if (error) console.error(`Erro Resend para ${to}:`, error);
        else console.log(`E-mail enviado para ${to}. ID: ${data.id}`);
    } catch (error) {
        console.error(`Erro interno e-mail para ${to}:`, error);
    }
};

const sendVerificationEmail = async (to, storeName, code) => {
    const html = createEmailTemplate(
        'Confirme a sua conta Bizno',
        `Bem-vindo à Bizno, ${storeName}!`,
        `<p>O seu catálogo online está quase pronto! Use o código abaixo para ativar a sua conta:</p>
         <p style="font-size: 24px; font-weight: bold; color: #0C2340; text-align: center; letter-spacing: 5px; margin: 20px 0;">${code}</p>`
    );
    await sendEmail(to, 'Confirme a sua conta Bizno', html);
};

const sendPasswordResetEmail = async (to, code) => {
    const html = createEmailTemplate(
        'Redefinição de Senha - Bizno',
        'Pedido de Redefinição de Senha',
        `<p>Use o código abaixo para criar uma nova senha:</p>
         <p style="font-size: 24px; font-weight: bold; color: #0C2340; text-align: center; letter-spacing: 5px; margin: 20px 0;">${code}</p>`
    );
    await sendEmail(to, 'Redefinição de Senha - Bizno', html);
};

const sendPaymentApprovedEmail = async (to, storeName, planName) => {
    const html = createEmailTemplate(
        `Pagamento Aprovado! Seu Plano ${planName} está Ativo`,
        'Pagamento Confirmado!',
        `<p>O seu pagamento foi aprovado! O seu plano <strong>${planName}</strong> já está ativo.</p>`,
        { text: 'Acessar Dashboard', url: `${config.frontendURL}/dash/dashboard.html` }
    );
    await sendEmail(to, `Pagamento Aprovado! Seu Plano ${planName} está Ativo`, html);
};

const sendPaymentRejectedEmail = async (to, storeName, reason) => {
    const html = createEmailTemplate(
        'Problema no Pagamento - Bizno',
        'Pagamento Recusado',
        `<p>O seu comprovativo foi recusado pelo motivo:</p>
         <p style="padding: 10px; background-color: #f9e3e3; border-left: 4px solid #d9534f; color: #d9534f;"><strong>${reason || 'Não especificado.'}</strong></p>`,
        { text: 'Enviar Novo Comprovativo', url: `${config.frontendURL}/pay/planos.html` }
    );
    await sendEmail(to, 'Problema no Pagamento - Bizno', html);
};

const sendGlobalAdminMessage = async (to, messageSubject, messageBody) => {
    const html = createEmailTemplate(
        messageSubject,
        messageSubject,
        `<p>Mensagem importante da equipe Bizno:</p>
         <div style="padding: 15px; background-color: #e7f3fe; border-left: 4px solid #2196F3; margin-top: 15px;">${messageBody}</div>`
    );
    await sendEmail(to, messageSubject, html);
};

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendPaymentApprovedEmail,
    sendPaymentRejectedEmail,
    sendGlobalAdminMessage,
};