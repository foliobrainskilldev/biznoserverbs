const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const mailer = require('../services/mailer');
const asyncHandler = require('../utils/asyncHandler');
const { OAuth2Client } = require('google-auth-library');
const { generateNumericCode, sanitizeStoreNameForURL } = require('../utils/helpers');
const { config } = require('../config/setup');

const googleClient = new OAuth2Client("64941390066-oig9le0vl98cl6q1f6qlsqcktkqu9i3n.apps.googleusercontent.com");

exports.registerUser = asyncHandler(async (req, res) => {
    const { storeName, whatsapp, email, password } = req.body;
    if (!storeName || !whatsapp || !email || !password) return res.status(400).json({
        success: false, message: 'Todos os campos são obrigatórios.'
    });

    let urlFriendlyStoreName = sanitizeStoreNameForURL(storeName);
    if (!urlFriendlyStoreName) return res.status(400).json({
        success: false, message: 'Nome da loja inválido.'
    });

    let existingUser = await prisma.user.findFirst({ where: { storeName: urlFriendlyStoreName } });
    while (existingUser) {
        urlFriendlyStoreName = `${sanitizeStoreNameForURL(storeName)}${Math.floor(100 + Math.random() * 900)}`;
        existingUser = await prisma.user.findFirst({ where: { storeName: urlFriendlyStoreName } });
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) return res.status(409).json({ success: false, message: 'E-mail já registado.' });

    let sanitizedWhatsapp = whatsapp.replace(/\s+/g, '').replace('+', '');
    if (!sanitizedWhatsapp.startsWith('258')) sanitizedWhatsapp = `258${sanitizedWhatsapp}`;
    if (sanitizedWhatsapp.startsWith('258258')) sanitizedWhatsapp = sanitizedWhatsapp.substring(3);

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationCode = generateNumericCode().toString();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

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
            visual: {}, contacts: {}, deliverySettings: {}
        }
    });

    const emailResult = await mailer.sendVerificationEmail(newUser.email, newUser.displayName, verificationCode);
    
    const token = jwt.sign({ id: newUser.id, role: newUser.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    
    res.status(201).json({
        success: true,
        message: 'Conta criada com sucesso!',
        token,
        isVerified: false,
        emailSent: emailResult.success
    });
}, 'Erro ao registrar utilizador.');

exports.loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.role === 'admin') return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });

    const token = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    res.status(200).json({ success: true, message: 'Login bem-sucedido!', token, isVerified: user.isVerified });
}, 'Erro ao fazer login.');

exports.googleAuth = asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token do Google ausente.' });

    const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: "64941390066-oig9le0vl98cl6q1f6qlsqcktkqu9i3n.apps.googleusercontent.com"
    });

    const payload = ticket.getPayload();
    const { email, name } = payload;

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        let urlFriendlyStoreName = sanitizeStoreNameForURL(name || 'loja');
        let existingStore = await prisma.user.findFirst({ where: { storeName: urlFriendlyStoreName } });
        while (existingStore) {
            urlFriendlyStoreName = `${sanitizeStoreNameForURL(name || 'loja')}${Math.floor(1000 + Math.random() * 9000)}`;
            existingStore = await prisma.user.findFirst({ where: { storeName: urlFriendlyStoreName } });
        }

        const hashedPassword = await bcrypt.hash(Math.random().toString(36).slice(-12), 12);
        const freePlan = await prisma.plan.findUnique({ where: { name: 'Free' } });

        user = await prisma.user.create({
            data: {
                storeName: urlFriendlyStoreName,
                displayName: name || 'Minha Loja',
                whatsapp: '258000000000',
                email,
                password: hashedPassword,
                isVerified: true,
                planId: freePlan.id,
                planStatus: 'free',
                visual: {}, contacts: {}, deliverySettings: {}
            }
        });
    }

    const biznoToken = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    
    res.status(200).json({ 
        success: true, 
        message: 'Login com Google bem-sucedido!', 
        token: biznoToken, 
        isVerified: user.isVerified 
    });
}, 'Erro na autenticação com o Google.');

exports.verifyEmail = asyncHandler(async (req, res) => {
    const { email, code } = req.body;
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
}, 'Erro ao verificar e-mail.');

exports.resendVerificationCode = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return res.status(404).json({ success: false, message: 'Utilizador não encontrado.' });
    if (user.isVerified) return res.status(400).json({ success: false, message: 'Esta conta já foi verificada.' });

    const code = generateNumericCode().toString();
    await prisma.user.update({
        where: { id: user.id },
        data: { verificationCode: code, verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) }
    });

    const emailResult = await mailer.sendVerificationEmail(user.email, user.displayName, code);
    if (!emailResult.success) {
        return res.status(500).json({ success: false, message: 'Erro ao comunicar com o servidor de e-mails. A conta de envio pode estar restrita.' });
    }

    res.status(200).json({ success: true, message: 'Novo código enviado.' });
}, 'Erro ao reenviar código.');

exports.forgotPassword = asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({ where: { email: req.body.email, isVerified: true } });
    if (user) {
        const code = generateNumericCode().toString();
        await prisma.user.update({
            where: { id: user.id },
            data: { passwordResetCode: code, passwordResetExpires: new Date(Date.now() + 10 * 60 * 1000) }
        });
        await mailer.sendPasswordResetEmail(user.email, code);
    }
    res.status(200).json({ success: true, message: 'Se existir conta, um código será enviado.' });
}, 'Erro na recuperação de senha.');

exports.resetPassword = asyncHandler(async (req, res) => {
    const { email, code, newPassword } = req.body;
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
}, 'Erro ao redefinir a senha.');