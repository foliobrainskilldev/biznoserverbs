const prisma = require('./models');
const { handleError, calculateDiscountPercentage } = require('./utils');
const cloudinary = require('cloudinary').v2;
const { config } = require('./config');

cloudinary.config(config.cloudinary);

const checkPlanLimits = async (user, feature, options = {}) => {
    if (!user.planId) return false;
    const plan = await prisma.plan.findUnique({ where: { id: user.planId } });
    if (!plan) return false;

    switch (feature) {
        case 'product':
            if (plan.productLimit === -1) return true;
            const productCount = await prisma.product.count({ where: { userId: user.id } });
            return productCount < plan.productLimit;
        case 'image':
            if (plan.imageLimitPerProduct === -1) return true;
            const currentImageCount = options.currentImageCount || 0;
            const newImageCount = options.newImageCount || 0;
            return (currentImageCount + newImageCount) <= plan.imageLimitPerProduct;
        case 'video':
            if (plan.videoLimit === 0) return false;
            if (plan.videoLimit === -1) return true;
            const videoCount = await prisma.product.count({ where: { userId: user.id, video: { not: null } } });
            const isExistingVideo = options.isExistingVideo || false;
            return isExistingVideo ? videoCount <= plan.videoLimit : videoCount < plan.videoLimit;
        case 'featured_product':
            if (plan.hasFeaturedProducts) {
                if(plan.name === 'Free') {
                    const featuredCount = await prisma.product.count({ where: { userId: user.id, isFeatured: true } });
                    return featuredCount < 3;
                }
                return true;
            }
            return false;
        default:
            return true;
    }
};

exports.createProduct = async (req, res) => {
    try {
        if (!await checkPlanLimits(req.user, 'product')) return res.status(403).json({ success: false, message: 'Limite de produtos atingido.' });
        if (!await checkPlanLimits(req.user, 'image', { newImageCount: req.files?.length || 0 })) {
            const plan = await prisma.plan.findUnique({ where: { id: req.user.planId } });
            return res.status(403).json({ success: false, message: `O seu plano permite no máximo ${plan.imageLimitPerProduct} imagens.` });
        }
        
        const { name, price, category, description, stock, originalPrice } = req.body;
        const isFeatured = req.body.isFeatured === 'true' || req.body.isFeatured === true;

        if (isFeatured && !await checkPlanLimits(req.user, 'featured_product')) {
            return res.status(403).json({ success: false, message: 'Limite de produtos em destaque atingido.' });
        }
        
        if (!name || !price || !category) return res.status(400).json({ success: false, message: 'Nome, preço e categoria são obrigatórios.' });

        let uploadedImages = [];
        if (req.files && req.files.length > 0) {
            const imageUploads = req.files.map(file => cloudinary.uploader.upload(file.path, { folder: `bizno/${req.user.id}/products`, resource_type: "image" }));
            const results = await Promise.all(imageUploads);
            uploadedImages = results.map(img => ({ url: img.secure_url, public_id: img.public_id }));
        }

        let promotionData = null;
        if (originalPrice && parseFloat(originalPrice) > parseFloat(price)) {
            promotionData = {
                originalPrice: parseFloat(originalPrice),
                discountPercentage: calculateDiscountPercentage(originalPrice, price)
            };
        }

        const product = await prisma.product.create({
            data: {
                userId: req.user.id,
                name,
                price: parseFloat(price),
                categoryId: category,
                description,
                stock: stock ? parseInt(stock) : 0,
                images: uploadedImages,
                isFeatured,
                promotion: promotionData
            }
        });

        res.status(201).json({ success: true, message: 'Produto criado com sucesso!', product });
    } catch (error) {
        handleError(res, error, 'Erro ao criar produto.');
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, category, description, stock, originalPrice, existingImages } = req.body;
        const isFeatured = req.body.isFeatured === 'true' || req.body.isFeatured === true;

        const product = await prisma.product.findFirst({ where: { id, userId: req.user.id } });
        if (!product) return res.status(404).json({ success: false, message: "Produto não encontrado." });
        
        if (isFeatured && !product.isFeatured && !await checkPlanLimits(req.user, 'featured_product')) {
             return res.status(403).json({ success: false, message: 'Limite de destaques atingido.' });
        }
        
        const existingImagesArray = existingImages ? (Array.isArray(existingImages) ? existingImages : [existingImages]) : [];

        if (!await checkPlanLimits(req.user, 'image', { currentImageCount: existingImagesArray.length, newImageCount: req.files?.length || 0 })) {
            return res.status(403).json({ success: false, message: `Limite de imagens atingido.` });
        }

        const productImages = product.images || [];
        const imagesToDelete = productImages.filter(img => !existingImagesArray.includes(img.public_id));
        if (imagesToDelete.length > 0) {
            const publicIdsToDelete = imagesToDelete.map(img => img.public_id);
            await cloudinary.api.delete_resources(publicIdsToDelete);
        }

        let newUploadedImages = [];
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map(file => cloudinary.uploader.upload(file.path, { folder: `bizno/${req.user.id}/products` }));
            const results = await Promise.all(uploadPromises);
            newUploadedImages = results.map(img => ({ url: img.secure_url, public_id: img.public_id }));
        }

        const keptImages = productImages.filter(img => existingImagesArray.includes(img.public_id));
        const finalImages = [...keptImages, ...newUploadedImages];
        
        let promotionData = null;
        if (originalPrice && parseFloat(originalPrice) > parseFloat(price)) {
            promotionData = {
                originalPrice: parseFloat(originalPrice),
                discountPercentage: calculateDiscountPercentage(originalPrice, price)
            };
        }

        const updatedProduct = await prisma.product.update({
            where: { id },
            data: {
                name,
                price: parseFloat(price),
                categoryId: category,
                description,
                stock: stock ? parseInt(stock) : 0,
                images: finalImages,
                isFeatured,
                promotion: promotionData
            }
        });

        res.status(200).json({ success: true, message: "Produto atualizado com sucesso!", product: updatedProduct });
    } catch (error) {
        handleError(res, error, 'Erro ao atualizar produto.');
    }
};

exports.toggleProductFeature = async (req, res) => {
    try {
        const product = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.user.id } });
        if (!product) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
        
        if (!product.isFeatured && !await checkPlanLimits(req.user, 'featured_product')) {
            return res.status(403).json({ success: false, message: 'Limite de produtos em destaque atingido.' });
        }
        
        const updatedProduct = await prisma.product.update({
            where: { id: product.id },
            data: { isFeatured: !product.isFeatured }
        });
        
        res.status(200).json({ success: true, message: updatedProduct.isFeatured ? 'Destacado.' : 'Removido dos destaques.', product: updatedProduct });
    } catch (error) {
        handleError(res, error, 'Erro ao alterar o destaque.');
    }
};

exports.addProductVideo = async (req, res) => {
    try {
        const product = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.user.id } });
        if (!product) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });

        if (!await checkPlanLimits(req.user, 'video', { isExistingVideo: !!product.video })) {
            return res.status(403).json({ success: false, message: 'Limite de vídeos atingido.' });
        }
        if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum ficheiro enviado.' });
        
        if (product.video && product.video.public_id) {
            await cloudinary.uploader.destroy(product.video.public_id, { resource_type: 'video' });
        }
        
        const result = await cloudinary.uploader.upload(req.file.path, { resource_type: "video", folder: `bizno/${req.user.id}/products` });
        
        const updatedProduct = await prisma.product.update({
            where: { id: product.id },
            data: { video: { url: result.secure_url, public_id: result.public_id } }
        });

        res.status(200).json({ success: true, message: 'Vídeo adicionado.', product: updatedProduct });
    } catch (error) {
        handleError(res, error, 'Erro ao adicionar vídeo.');
    }
};

exports.getProducts = async (req, res) => {
    try {
        const products = await prisma.product.findMany({ 
            where: { userId: req.user.id },
            include: { category: { select: { name: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json({ success: true, products });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar produtos.');
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        const product = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.user.id } });
        if (!product) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });

        if (product.images && product.images.length > 0) {
            const publicIds = product.images.map(img => img.public_id).filter(id => id);
            if (publicIds.length > 0) await cloudinary.api.delete_resources(publicIds, { resource_type: 'image' });
        }
        if (product.video && product.video.public_id) {
            await cloudinary.uploader.destroy(product.video.public_id, { resource_type: 'video' });
        }
        
        await prisma.product.delete({ where: { id: product.id } });
        res.status(200).json({ success: true, message: 'Produto removido com sucesso.' });
    } catch (error) {
        handleError(res, error, 'Erro ao remover produto.');
    }
};

exports.createCategory = async (req, res) => {
    try {
        // Ignorando checkPlanLimits category por agora, pois era -1 infinito
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'O nome é obrigatório.' });

        const category = await prisma.category.create({ data: { userId: req.user.id, name } });
        res.status(201).json({ success: true, message: 'Categoria criada.', category });
    } catch (error) {
        handleError(res, error, 'Erro ao criar categoria.');
    }
};

exports.getCategories = async (req, res) => {
    try {
        const categories = await prisma.category.findMany({ where: { userId: req.user.id }, orderBy: { name: 'asc' } });
        res.status(200).json({ success: true, categories });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar categorias.');
    }
};

exports.updateCategory = async (req, res) => {
     try {
        const { name } = req.body;
        const category = await prisma.category.findFirst({ where: { id: req.params.id, userId: req.user.id } });
        if (!category) return res.status(404).json({ success: false, message: 'Categoria não encontrada.' });
        
        const updatedCategory = await prisma.category.update({ where: { id: category.id }, data: { name } });
        res.status(200).json({ success: true, message: 'Categoria atualizada.', category: updatedCategory });
    } catch (error) {
        handleError(res, error, 'Erro ao atualizar categoria.');
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const category = await prisma.category.findFirst({ where: { id: req.params.id, userId: req.user.id } });
        if (!category) return res.status(404).json({ success: false, message: 'Categoria não encontrada.' });

        const productCount = await prisma.product.count({ where: { categoryId: category.id } });
        if (productCount > 0) {
            return res.status(400).json({ success: false, message: `Não pode apagar. Usada por ${productCount} produto(s).` });
        }
        
        await prisma.category.delete({ where: { id: category.id } });
        res.status(200).json({ success: true, message: 'Categoria removida.' });
    } catch (error) {
        handleError(res, error, 'Erro ao remover categoria.');
    }
};