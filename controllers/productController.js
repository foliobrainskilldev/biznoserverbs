const prisma = require('../config/db');
const cloudinary = require('cloudinary').v2;
const { config } = require('../config/setup');
const asyncHandler = require('../utils/asyncHandler');
const { calculateDiscountPercentage, getPaginationParams } = require('../utils/helpers');

cloudinary.config(config.cloudinary);

const checkPlanLimits = async (user, feature, options = {}) => {
    if (!user.planId) return false;
    const plan = await prisma.plan.findUnique({
        where: { id: user.planId }
    });
    if (!plan) return false;

    switch (feature) {
        case 'product':
            if (plan.productLimit === -1) return true;
            const productCount = await prisma.product.count({
                where: { userId: user.id }
            });
            return productCount < plan.productLimit;
        case 'image':
            if (plan.imageLimitPerProduct === -1) return true;
            return ((options.currentImageCount || 0) + (options.newImageCount || 0)) <= plan.imageLimitPerProduct;
        case 'video':
            if (plan.videoLimit === 0) return false;
            if (plan.videoLimit === -1) return true;
            const videoCount = await prisma.product.count({
                where: {
                    userId: user.id,
                    video: { not: null }
                }
            });
            return options.isExistingVideo ? videoCount <= plan.videoLimit : videoCount < plan.videoLimit;
        case 'featured_product':
            if (plan.name === 'Free') {
                const featuredCount = await prisma.product.count({
                    where: {
                        userId: user.id,
                        isFeatured: true
                    }
                });
                return featuredCount < 5;
            }
            return true;
        default:
            return true;
    }
};

exports.createProduct = asyncHandler(async (req, res) => {
    if (!await checkPlanLimits(req.user, 'product')) return res.status(403).json({
        success: false,
        message: 'Limite de produtos atingido.'
    });

    const plan = await prisma.plan.findUnique({
        where: { id: req.user.planId }
    });
    if (!await checkPlanLimits(req.user, 'image', { newImageCount: req.files?.length || 0 })) {
        return res.status(403).json({
            success: false,
            message: `O plano permite no máximo ${plan.imageLimitPerProduct} imagens por produto.`
        });
    }

    const { name, price, category, description, stock, originalPrice } = req.body;
    const isFeatured = req.body.isFeatured === 'true' || req.body.isFeatured === true;

    if (isFeatured && !await checkPlanLimits(req.user, 'featured_product')) return res.status(403).json({
        success: false,
        message: 'Limite de produtos em destaque atingido.'
    });
    if (!name || !price || !category) return res.status(400).json({
        success: false,
        message: 'Nome, preço e categoria obrigatórios.'
    });

    let uploadedImages = [];
    if (req.files?.length) {
        const results = await Promise.all(req.files.map(file => cloudinary.uploader.upload(file.path, {
            folder: `bizno/${req.user.id}/products`,
            resource_type: "image"
        })));
        uploadedImages = results.map(img => ({
            url: img.secure_url,
            public_id: img.public_id
        }));
    }

    const finalPrice = parseFloat(price);
    const finalOriginalPrice = originalPrice ? parseFloat(originalPrice) : null;

    let promotionData = null;
    if (finalOriginalPrice && finalOriginalPrice > finalPrice) {
        promotionData = {
            originalPrice: finalOriginalPrice,
            discountPercentage: calculateDiscountPercentage(finalOriginalPrice, finalPrice)
        };
    }

    const product = await prisma.product.create({
        data: {
            userId: req.user.id,
            name,
            price: finalPrice,
            categoryId: category,
            description,
            stock: stock ? parseInt(stock) : 0,
            images: uploadedImages,
            isFeatured,
            promotion: promotionData
        }
    });

    res.status(201).json({
        success: true,
        message: 'Produto criado!',
        product
    });
}, 'Erro ao criar produto.');

exports.updateProduct = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, price, category, description, stock, originalPrice, existingImages } = req.body;
    const isFeatured = req.body.isFeatured === 'true' || req.body.isFeatured === true;

    const product = await prisma.product.findFirst({
        where: { id, userId: req.user.id }
    });
    if (!product) return res.status(404).json({
        success: false,
        message: "Produto não encontrado."
    });

    if (isFeatured && !product.isFeatured && !await checkPlanLimits(req.user, 'featured_product')) return res.status(403).json({
        success: false,
        message: 'Limite de destaques atingido.'
    });

    const existingImagesArray = existingImages ? (Array.isArray(existingImages) ? existingImages : [existingImages]) : [];

    if (!await checkPlanLimits(req.user, 'image', {
            currentImageCount: existingImagesArray.length,
            newImageCount: req.files?.length || 0
        })) {
        return res.status(403).json({
            success: false,
            message: `Limite de imagens atingido.`
        });
    }

    const imagesToDelete = (product.images || []).filter(img => !existingImagesArray.includes(img.public_id));
    if (imagesToDelete.length) await cloudinary.api.delete_resources(imagesToDelete.map(img => img.public_id));

    let newUploadedImages = [];
    if (req.files?.length) {
        const results = await Promise.all(req.files.map(file => cloudinary.uploader.upload(file.path, {
            folder: `bizno/${req.user.id}/products`
        })));
        newUploadedImages = results.map(img => ({
            url: img.secure_url,
            public_id: img.public_id
        }));
    }

    const keptImages = (product.images || []).filter(img => existingImagesArray.includes(img.public_id));
    const finalImages = [...keptImages, ...newUploadedImages];

    const finalPrice = parseFloat(price);
    const finalOriginalPrice = originalPrice ? parseFloat(originalPrice) : null;

    let promotionData = null;
    if (finalOriginalPrice && finalOriginalPrice > finalPrice) {
        promotionData = {
            originalPrice: finalOriginalPrice,
            discountPercentage: calculateDiscountPercentage(finalOriginalPrice, finalPrice)
        };
    }

    const updatedProduct = await prisma.product.update({
        where: { id },
        data: {
            name,
            price: finalPrice,
            categoryId: category,
            description,
            stock: stock ? parseInt(stock) : 0,
            images: finalImages,
            isFeatured,
            promotion: promotionData
        }
    });

    res.status(200).json({
        success: true,
        message: "Produto atualizado!",
        product: updatedProduct
    });
}, 'Erro ao atualizar produto.');

exports.deleteProduct = asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
        where: { id: req.params.id, userId: req.user.id }
    });
    if (!product) return res.status(404).json({
        success: false,
        message: 'Produto não encontrado.'
    });

    if (product.images?.length) await cloudinary.api.delete_resources(product.images.map(img => img.public_id).filter(Boolean), {
        resource_type: 'image'
    });
    if (product.video?.public_id) await cloudinary.uploader.destroy(product.video.public_id, {
        resource_type: 'video'
    });

    await prisma.product.delete({
        where: { id: product.id }
    });
    res.status(200).json({
        success: true,
        message: 'Produto removido.'
    });
}, 'Erro ao remover produto.');

exports.toggleProductFeature = asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
        where: { id: req.params.id, userId: req.user.id }
    });
    if (!product) return res.status(404).json({
        success: false,
        message: 'Produto não encontrado.'
    });
    if (!product.isFeatured && !await checkPlanLimits(req.user, 'featured_product')) return res.status(403).json({
        success: false,
        message: 'Limite atingido.'
    });

    const updatedProduct = await prisma.product.update({
        where: { id: product.id },
        data: { isFeatured: !product.isFeatured }
    });
    res.status(200).json({
        success: true,
        message: updatedProduct.isFeatured ? 'Destacado.' : 'Removido dos destaques.',
        product: updatedProduct
    });
}, 'Erro ao alterar destaque.');

exports.addProductVideo = asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
        where: { id: req.params.id, userId: req.user.id }
    });
    if (!product) return res.status(404).json({
        success: false,
        message: 'Produto não encontrado.'
    });
    
    if (!await checkPlanLimits(req.user, 'video', { isExistingVideo: !!product.video })) {
        return res.status(403).json({
            success: false,
            message: 'O seu plano atual não permite o upload de vídeos ou o limite foi atingido.'
        });
    }

    if (!req.file) return res.status(400).json({
        success: false,
        message: 'Nenhum ficheiro enviado.'
    });

    if (product.video?.public_id) await cloudinary.uploader.destroy(product.video.public_id, {
        resource_type: 'video'
    });
    const result = await cloudinary.uploader.upload(req.file.path, {
        resource_type: "video",
        folder: `bizno/${req.user.id}/products`
    });

    const updatedProduct = await prisma.product.update({
        where: { id: product.id },
        data: {
            video: {
                url: result.secure_url,
                public_id: result.public_id
            }
        }
    });
    res.status(200).json({
        success: true,
        message: 'Vídeo adicionado.',
        product: updatedProduct
    });
}, 'Erro ao adicionar vídeo.');

exports.getProducts = asyncHandler(async (req, res) => {
    const { skip, take, page, limit } = getPaginationParams(req, 50);
    const [products, total] = await Promise.all([
        prisma.product.findMany({
            where: { userId: req.user.id },
            include: {
                category: {
                    select: { name: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take
        }),
        prisma.product.count({
            where: { userId: req.user.id }
        })
    ]);
    res.status(200).json({
        success: true,
        products,
        meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    });
}, 'Erro ao buscar produtos.');

exports.createCategory = asyncHandler(async (req, res) => {
    if (!req.body.name) return res.status(400).json({
        success: false,
        message: 'O nome é obrigatório.'
    });
    const category = await prisma.category.create({
        data: {
            userId: req.user.id,
            name: req.body.name
        }
    });
    res.status(201).json({
        success: true,
        message: 'Categoria criada.',
        category
    });
}, 'Erro ao criar categoria.');

exports.getCategories = asyncHandler(async (req, res) => {
    const categories = await prisma.category.findMany({
        where: { userId: req.user.id },
        orderBy: { name: 'asc' }
    });
    res.status(200).json({
        success: true,
        categories
    });
}, 'Erro ao buscar categorias.');

exports.updateCategory = asyncHandler(async (req, res) => {
    const category = await prisma.category.findFirst({
        where: { id: req.params.id, userId: req.user.id }
    });
    if (!category) return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada.'
    });
    const updatedCategory = await prisma.category.update({
        where: { id: category.id },
        data: { name: req.body.name }
    });
    res.status(200).json({
        success: true,
        message: 'Categoria atualizada.',
        category: updatedCategory
    });
}, 'Erro ao atualizar categoria.');

exports.deleteCategory = asyncHandler(async (req, res) => {
    const category = await prisma.category.findFirst({
        where: { id: req.params.id, userId: req.user.id }
    });
    if (!category) return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada.'
    });

    const productCount = await prisma.product.count({
        where: { categoryId: category.id }
    });
    if (productCount > 0) return res.status(400).json({
        success: false,
        message: `Usada por ${productCount} produto(s). Não pode ser removida.`
    });

    await prisma.category.delete({
        where: { id: category.id }
    });
    res.status(200).json({
        success: true,
        message: 'Categoria removida.'
    });
}, 'Erro ao remover categoria.');