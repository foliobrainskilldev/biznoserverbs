// Ficheiro: src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const mailer = require('../services/mailer');
const { handleError, generateNumericCode, sanitizeStoreNameForURL } = require('../utils/helpers');
const { config } = require('../config/setup');

exports.registerUser = async (req, res) => {
    const { storeName, whatsapp, email, password } = req.body;

    if (!storeName || !whatsapp || !email || !password) {
        return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios.' });
    }

    try {
        let urlFriendlyStoreName = sanitizeStoreNameForURL(storeName);
        if (!urlFriendlyStoreName) return res.status(400).json({ success: false, message: 'Nome da loja inválido.' });

        let existingUser = await prisma.user.findFirst({ where: { storeName: urlFriendlyStoreName } });
        
        while (existingUser) {
            const randomNumber = Math.floor(100 + Math.random() * 900);
            urlFriendlyStoreName = `${sanitizeStoreNameForURL(storeName)}${randomNumber}`;
            existingUser = await prisma.user.findFirst({ where: { storeName: urlFriendlyStoreName } });
        }
        
        const existingEmail = await prisma.user.findUnique({ where: { email } });
        if (existingEmail) return res.status(409).json({ success: false, message: 'E-mail já registado.' });
        
        let sanitizedWhatsapp = whatsapp.replace(/\s+/g, '').replace('+', '');
        if (!sanitizedWhatsapp.startsWith('258')) sanitizedWhatsapp = `258${sanitizedWhatsapp}`;
        if (sanitizedWhatsapp.startsWith('258258')) sanitizedWhatsapp = sanitizedWhatsapp.substring(3);
        
        const hashedPassword = await bcrypt.hash(password, 12);
        const verificationCode = generateNumericCode().toString();
        const verificationExpires = new Date(Date.now() + 10 * 60 * 1000);

        const freePlan = await prisma.plan.findUnique({ where: { name: 'Free' } });
        
        const newUser = await prisma.user.create({
            data: {
                storeName: urlFriendlyStoreName,
                displayName: storeName,
                whatsapp: sanitizedWhatsapp,
                email,
                password: hashedPassword,
                verificationCode,
                verificationExpires,
                planId: freePlan.id,
                planStatus: 'free',
                visual: {},
                contacts: {},
                deliverySettings: {}
            }
        });

        await mailer.sendVerificationEmail(email, storeName, verificationCode);
        res.status(201).json({ success: true, message: 'Conta criada! Código enviado por e-mail.' });
    } catch (error) {
        handleError(res, error, 'Erro ao registrar utilizador.');
    }
};

exports.loginUser = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.role === 'admin') return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });
        
        const token = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
        
        res.status(200).json({ success: true, message: 'Login bem-sucedido!', token, isVerified: user.isVerified });
    } catch (error) {
        handleError(res, error, 'Erro ao fazer login.');
    }
};

exports.verifyEmail = async (req, res) => {
    const { email, code } = req.body;
    try {
        const user = await prisma.user.findFirst({
            where: { email, verificationCode: code, verificationExpires: { gt: new Date() } }
        });

        if (!user) return res.status(400).json({ success: false, message: 'Código inválido ou expirado.' });

        await prisma.user.update({
            where: { id: user.id },
            data: { isVerified: true, verificationCode: null, verificationExpires: null }
        });
        
        const token = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
        res.status(200).json({ success: true, message: 'E-mail verificado com sucesso!', token });
    } catch (error) {
        handleError(res, error, 'Erro ao verificar e-mail.');
    }
};

exports.resendVerificationCode = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ success: false, message: 'Utilizador não encontrado.' });
        if (user.isVerified) return res.status(400).json({ success: false, message: 'Esta conta já foi verificada.' });

        const code = generateNumericCode().toString();
        await prisma.user.update({
            where: { id: user.id },
            data: { verificationCode: code, verificationExpires: new Date(Date.now() + 10 * 60 * 1000) }
        });
        
        await mailer.sendVerificationEmail(user.email, user.displayName, code);
        res.status(200).json({ success: true, message: 'Novo código enviado.' });
    } catch (error) {
        handleError(res, error, 'Erro ao reenviar código.');
    }
};

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await prisma.user.findFirst({ where: { email, isVerified: true } });
        if (user) {
            const code = generateNumericCode().toString();
            await prisma.user.update({
                where: { id: user.id },
                data: { passwordResetCode: code, passwordResetExpires: new Date(Date.now() + 10 * 60 * 1000) }
            });
            await mailer.sendPasswordResetEmail(user.email, code);
        }
        res.status(200).json({ success: true, message: 'Se existir conta, um código será enviado.' });
    } catch (error) {
        handleError(res, error, 'Erro na recuperação de senha.');
    }
};

exports.resetPassword = async (req, res) => {
    const { email, code, newPassword } = req.body;
    try {
        const user = await prisma.user.findFirst({
            where: { email, passwordResetCode: code, passwordResetExpires: { gt: new Date() } }
        });

        if (!user) return res.status(400).json({ success: false, message: 'Código inválido ou expirado.' });

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword, passwordResetCode: null, passwordResetExpires: null }
        });

        res.status(200).json({ success: true, message: 'Senha redefinida com sucesso!' });
    } catch (error) {
        handleError(res, error, 'Erro ao redefinir a senha.');
    }
};