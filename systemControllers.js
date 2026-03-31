const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('./models');
const mailer = require('./mailer');
const { handleError, generateNumericCode, sanitizeStoreNameForURL } = require('./utils');
const { config } = require('./config');

exports.registerUser = async (req, res) => {
    const { storeName, whatsapp, email, password } = req.body;

    if (!storeName || !whatsapp || !email || !password) {
        return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios.' });
    }

    try {
        let urlFriendlyStoreName = sanitizeStoreNameForURL(storeName);
        if (!urlFriendlyStoreName) {
            return res.status(400).json({ success: false, message: 'O nome da loja é inválido.' });
        }

        let existingUser = await prisma.user.findFirst({ where: { storeName: urlFriendlyStoreName } });
        
        while (existingUser) {
            const randomNumber = Math.floor(100 + Math.random() * 900);
            urlFriendlyStoreName = `${sanitizeStoreNameForURL(storeName)}${randomNumber}`;
            existingUser = await prisma.user.findFirst({ where: { storeName: urlFriendlyStoreName } });
        }
        
        const existingEmail = await prisma.user.findUnique({ where: { email } });
        if (existingEmail) {
            return res.status(409).json({ success: false, message: 'Já existe uma conta com este e-mail.' });
        }
        
        let sanitizedWhatsapp = whatsapp.replace(/\s+/g, '').replace('+', '');
        if (sanitizedWhatsapp.startsWith('8')) sanitizedWhatsapp = `258${sanitizedWhatsapp}`;
        if (!sanitizedWhatsapp.startsWith('258')) sanitizedWhatsapp = `258${sanitizedWhatsapp}`;
        if (sanitizedWhatsapp.startsWith('258258')) sanitizedWhatsapp = sanitizedWhatsapp.substring(3);
        
        const hashedPassword = await bcrypt.hash(password, 12);
        const verificationCode = generateNumericCode().toString();
        const verificationExpires = new Date(Date.now() + 10 * 60 * 1000);

        const freePlan = await prisma.plan.findUnique({ where: { name: 'Free' } });
        if (!freePlan) {
            return handleError(res, new Error("Plano Grátis não encontrado"), 'Erro interno ao configurar a conta.', 500);
        }
        
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
        res.status(201).json({ success: true, message: 'Conta criada com sucesso! Enviamos um código de verificação para o seu e-mail.' });
    } catch (error) {
        handleError(res, error, 'Erro ao registrar utilizador.');
    }
};

exports.loginUser = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'E-mail e senha são obrigatórios.' });

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
        res.status(200).json({ success: true, message: 'Novo código de verificação enviado.' });
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
        res.status(200).json({ success: true, message: 'Se existir uma conta com este e-mail, um código de redefinição será enviado.' });
    } catch (error) {
        handleError(res, error, 'Erro no processo de recuperação de senha.');
    }
};

exports.resetPassword = async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ success: false, message: 'A nova senha deve ter pelo menos 6 caracteres.' });
    
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

exports.getPublicStoreData = async (req, res) => {
    try {
        const { storeName } = req.params;
        const user = await prisma.user.findFirst({ 
            where: { 
                storeName: { equals: storeName, mode: 'insensitive' },
                isVerified: true,
                planStatus: { in: ['active', 'free'] }
            },
            include: { plan: true }
        });

        if (!user) return res.status(404).json({ success: false, message: 'Loja não encontrada ou indisponível.' });

        const [products, categories] = await Promise.all([
            prisma.product.findMany({ where: { userId: user.id }, include: { category: { select: { name: true } } } }),
            prisma.category.findMany({ where: { userId: user.id } }),
            prisma.visit.create({ data: { userId: user.id } })
        ]);
        
        await prisma.user.update({ where: { id: user.id }, data: { clickCount: { increment: 1 } } });

        delete user.password; // Segurança extra

        res.status(200).json({
            success: true,
            store: {
                id: user.id,
                storeName: user.storeName,
                displayName: user.displayName,
                whatsapp: user.whatsapp,
                email: user.email,
                visual: user.visual,
                contacts: user.contacts,
                deliverySettings: user.deliverySettings,
                isFreePlan: user.plan?.name === 'Free'
            },
            products,
            categories,
        });
    } catch (error) {
        handleError(res, error, 'Erro ao carregar dados da loja.');
    }
};

exports.getPublicProductData = async (req, res) => {
    try {
        const { productId } = req.params;
        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: {
                user: { select: { storeName: true, displayName: true, whatsapp: true, contacts: true } },
                category: { select: { name: true } }
            }
        });

        if (!product) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
        
        await prisma.product.update({ where: { id: productId }, data: { viewCount: { increment: 1 } } });

        res.status(200).json({ success: true, product });
    } catch (error) {
        handleError(res, error, 'Erro ao carregar dados do produto.');
    }
};

exports.getPlans = async (req, res) => {
    try {
        const plans = await prisma.plan.findMany({ where: { isVisible: true }, orderBy: { price: 'asc' } });
        res.status(200).json({ success: true, plans });
    } catch (error) {
        handleError(res, error, 'Erro ao carregar os planos.');
    }
};

exports.logInteraction = async (req, res) => {
    try {
        const { storeOwnerId, type, details } = req.body;
        if (!storeOwnerId || !type || !details) return res.status(400).json({ success: false, message: 'Dados insuficientes.' });
        
        await prisma.interaction.create({ data: { userId: storeOwnerId, type, details } });
        res.status(200).json({ success: true, message: 'Interação registada.' });
    } catch (error) {
        console.error("Erro ao registar interação:", error);
        res.status(200).json({ success: true, message: 'Interação não registada, mas a prosseguir.' });
    }
};

exports.generateSitemap = async (req, res) => {
    try {
        const baseUrl = 'https://www.bizno.store';
        let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>${baseUrl}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
    <url><loc>${baseUrl}/how.html</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
`;

        const users = await prisma.user.findMany({ 
            where: { role: 'user', isVerified: true, planStatus: { in: ['active', 'free'] } } 
        });
        
        for (const user of users) {
            const storeUrl = `${baseUrl}/${encodeURIComponent(user.storeName)}`;
            sitemapXml += `<url><loc>${storeUrl}</loc><lastmod>${user.updatedAt.toISOString()}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>`;

            const products = await prisma.product.findMany({ where: { userId: user.id } });
            for (const product of products) {
                sitemapXml += `<url><loc>${storeUrl}/produto/${product.id}</loc><lastmod>${product.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
            }
        }
        sitemapXml += `</urlset>`;
        res.header('Content-Type', 'application/xml');
        res.send(sitemapXml);
    } catch (error) {
        handleError(res, error, 'Erro ao gerar o sitemap.');
    }
};