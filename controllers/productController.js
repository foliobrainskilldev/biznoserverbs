const prisma = require('../config/db');
const cloudinary = require('cloudinary').v2;
const {
    config
} = require('../config/setup');
const asyncHandler = require('../utils/asyncHandler');
const {
    calculateDiscountPercentage,
    getPaginationParams
} = require('../utils/helpers');
const fs = require('fs');

cloudinary.config(config.cloudinary);

const checkPlanLimits = async (user, feature, options = {}) => {
    if (!user.planId) return false;
    const plan = await prisma.plan.findUnique({
        where: {
            id: user.planId
        }
    });
    if (!plan) return false;

    switch (feature) {
        case 'product':
            if (plan.productLimit === -1) return true;
            const productCount = await prisma.product.count({
                where: {
                    userId: user.id
                }
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
                    video: {
                        not: null
                    }
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

const parseJSONSafe = (data) => {
    try {
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
};

exports.createProduct = asyncHandler(async (req, res) => {
    if (!await checkPlanLimits(req.user, 'product')) {
        return res.status(403).json({
            success: false,
            message: 'Limite de produtos atingido.'
        });
    }

    const plan = await prisma.plan.findUnique({
        where: {
            id: req.user.planId
        }
    });
    if (!await checkPlanLimits(req.user, 'image', {
            newImageCount: req.files?.length || 0
        })) {
        return res.status(403).json({
            success: false,
            message: `O plano permite no máximo ${plan.imageLimitPerProduct} imagens por produto.`
        });
    }

    const {
        name,
        price,
        category,
        description,
        stock,
        originalPrice,
        variants,
        addons,
        seoDescription
    } = req.body;
    const isFeatured = String(req.body.isFeatured) === 'true';

    if (isFeatured && !await checkPlanLimits(req.user, 'featured_product')) {
        return res.status(403).json({
            success: false,
            message: 'Limite de produtos em destaque atingido.'
        });
    }

    if (!name || !price || !category) {
        return res.status(400).json({
            success: false,
            message: 'Nome, preço e categoria obrigatórios.'
        });
    }

    const finalPrice = parseFloat(price);
    const finalStock = stock ? parseInt(stock, 10) : 0;
    const finalOriginalPrice = originalPrice ? parseFloat(originalPrice) : null;

    if (isNaN(finalPrice) || finalPrice < 0 || isNaN(finalStock) || finalStock < 0 || (finalOriginalPrice !== null && (isNaN(finalOriginalPrice) || finalOriginalPrice < 0))) {
        return res.status(400).json({
            success: false,
            message: 'Valores numéricos inválidos.'
        });
    }

    let uploadedImages = [];
    if (req.files?.length) {
        const results = await Promise.all(req.files.map(async file => {
            const uploadResult = await cloudinary.uploader.upload(file.path, {
                folder: `bizno/${req.user.id}/products`,
                resource_type: "image",
                format: "webp",
                quality: "auto:good",
                width: 1080,
                crop: "limit"
            });
            fs.unlink(file.path, () => {});
            return uploadResult;
        }));
        uploadedImages = results.map(img => ({
            url: img.secure_url,
            public_id: img.public_id
        }));
    }

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
            name: String(name).substring(0, 150),
            price: finalPrice,
            categoryId: category,
            description: description ? String(description).substring(0, 2000) : '',
            seoDescription: seoDescription ? String(seoDescription).substring(0, 160) : '',
            stock: finalStock,
            images: uploadedImages,
            isFeatured,
            promotion: promotionData,
            variants: parseJSONSafe(variants),
            addons: parseJSONSafe(addons)
        }
    });

    res.status(201).json({
        success: true,
        message: 'Produto criado!',
        product
    });
});

exports.updateProduct = asyncHandler(async (req, res) => {
    const {
        id
    } = req.params;
    const {
        name,
        price,
        category,
        description,
        stock,
        originalPrice,
        existingImages,
        variants,
        addons,
        seoDescription
    } = req.body;
    const isFeatured = String(req.body.isFeatured) === 'true';

    const product = await prisma.product.findFirst({
        where: {
            id,
            userId: req.user.id
        }
    });
    if (!product) return res.status(404).json({
        success: false,
        message: "Produto não encontrado."
    });

    if (isFeatured && !product.isFeatured && !await checkPlanLimits(req.user, 'featured_product')) {
        return res.status(403).json({
            success: false,
            message: 'Limite de destaques atingido.'
        });
    }

    const finalPrice = parseFloat(price);
    const finalStock = stock ? parseInt(stock, 10) : 0;
    const finalOriginalPrice = originalPrice ? parseFloat(originalPrice) : null;

    if (isNaN(finalPrice) || finalPrice < 0 || isNaN(finalStock) || finalStock < 0 || (finalOriginalPrice !== null && (isNaN(finalOriginalPrice) || finalOriginalPrice < 0))) {
        return res.status(400).json({
            success: false,
            message: 'Valores numéricos inválidos.'
        });
    }

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
        const results = await Promise.all(req.files.map(async file => {
            const uploadResult = await cloudinary.uploader.upload(file.path, {
                folder: `bizno/${req.user.id}/products`,
                resource_type: "image",
                format: "webp",
                quality: "auto:good",
                width: 1080,
                crop: "limit"
            });
            fs.unlink(file.path, () => {});
            return uploadResult;
        }));
        newUploadedImages = results.map(img => ({
            url: img.secure_url,
            public_id: img.public_id
        }));
    }

    const keptImages = (product.images || []).filter(img => existingImagesArray.includes(img.public_id));

    let promotionData = null;
    if (finalOriginalPrice && finalOriginalPrice > finalPrice) {
        promotionData = {
            originalPrice: finalOriginalPrice,
            discountPercentage: calculateDiscountPercentage(finalOriginalPrice, finalPrice)
        };
    }

    const updatedProduct = await prisma.product.update({
        where: {
            id
        },
        data: {
            name: String(name).substring(0, 150),
            price: finalPrice,
            categoryId: category,
            description: description ? String(description).substring(0, 2000) : '',
            seoDescription: seoDescription ? String(seoDescription).substring(0, 160) : '',
            stock: finalStock,
            images: [...keptImages, ...newUploadedImages],
            isFeatured,
            promotion: promotionData,
            variants: variants ? parseJSONSafe(variants) : product.variants,
            addons: addons ? parseJSONSafe(addons) : product.addons
        }
    });

    res.status(200).json({
        success: true,
        message: "Produto atualizado!",
        product: updatedProduct
    });
});

exports.deleteProduct = asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
        where: {
            id: req.params.id,
            userId: req.user.id
        }
    });
    if (!product) return res.status(404).json({
        success: false,
        message: 'Produto não encontrado.'
    });

    if (product.images?.length) {
        await cloudinary.api.delete_resources(product.images.map(img => img.public_id).filter(Boolean), {
            resource_type: 'image'
        });
    }

    if (product.video?.public_id) {
        await cloudinary.uploader.destroy(product.video.public_id, {
            resource_type: 'video'
        });
    }

    await prisma.product.delete({
        where: {
            id: product.id
        }
    });
    res.status(200).json({
        success: true,
        message: 'Produto removido.'
    });
});

exports.toggleProductFeature = asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
        where: {
            id: req.params.id,
            userId: req.user.id
        }
    });
    if (!product) return res.status(404).json({
        success: false,
        message: 'Produto não encontrado.'
    });

    if (!product.isFeatured && !await checkPlanLimits(req.user, 'featured_product')) {
        return res.status(403).json({
            success: false,
            message: 'Limite atingido.'
        });
    }

    const updatedProduct = await prisma.product.update({
        where: {
            id: product.id
        },
        data: {
            isFeatured: !product.isFeatured
        }
    });
    res.status(200).json({
        success: true,
        message: updatedProduct.isFeatured ? 'Destacado.' : 'Removido dos destaques.',
        product: updatedProduct
    });
});

exports.addProductVideo = asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
        where: {
            id: req.params.id,
            userId: req.user.id
        }
    });
    if (!product) return res.status(404).json({
        success: false,
        message: 'Produto não encontrado.'
    });

    if (!await checkPlanLimits(req.user, 'video', {
            isExistingVideo: !!product.video
        })) {
        return res.status(403).json({
            success: false,
            message: 'Limite de vídeo atingido.'
        });
    }

    if (!req.file) return res.status(400).json({
        success: false,
        message: 'Nenhum ficheiro enviado.'
    });

    if (product.video?.public_id) {
        await cloudinary.uploader.destroy(product.video.public_id, {
            resource_type: 'video'
        });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
        resource_type: "video",
        folder: `bizno/${req.user.id}/products`,
        quality: "auto",
        width: 720,
        crop: "limit",
        bit_rate: "500k"
    });
    fs.unlink(req.file.path, () => {});

    const updatedProduct = await prisma.product.update({
        where: {
            id: product.id
        },
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
});

exports.getProducts = asyncHandler(async (req, res) => {
    const {
        skip,
        take,
        page,
        limit
    } = getPaginationParams(req, 50);
    const [products, total] = await Promise.all([
        prisma.product.findMany({
            where: {
                userId: req.user.id
            },
            include: {
                category: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            skip,
            take
        }),
        prisma.product.count({
            where: {
                userId: req.user.id
            }
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
});

exports.createCategory = asyncHandler(async (req, res) => {
    if (!req.body.name) return res.status(400).json({
        success: false,
        message: 'O nome é obrigatório.'
    });

    let uploadedImage = null;
    if (req.file) {
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: `bizno/${req.user.id}/categories`,
            resource_type: "image",
            format: "webp",
            quality: "auto:good",
            width: 800,
            crop: "limit"
        });
        fs.unlink(req.file.path, () => {});
        uploadedImage = {
            url: result.secure_url,
            public_id: result.public_id
        };
    }

    const category = await prisma.category.create({
        data: {
            userId: req.user.id,
            name: String(req.body.name).substring(0, 50),
            image: uploadedImage
        }
    });
    res.status(201).json({
        success: true,
        message: 'Categoria criada.',
        category
    });
});

exports.getCategories = asyncHandler(async (req, res) => {
    const categories = await prisma.category.findMany({
        where: {
            userId: req.user.id
        },
        orderBy: {
            name: 'asc'
        }
    });
    res.status(200).json({
        success: true,
        categories
    });
});

exports.updateCategory = asyncHandler(async (req, res) => {
    const category = await prisma.category.findFirst({
        where: {
            id: req.params.id,
            userId: req.user.id
        }
    });
    if (!category) return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada.'
    });

    let uploadedImage = category.image;
    if (req.file) {
        if (category.image?.public_id) await cloudinary.uploader.destroy(category.image.public_id);
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: `bizno/${req.user.id}/categories`,
            resource_type: "image",
            format: "webp",
            quality: "auto:good",
            width: 800,
            crop: "limit"
        });
        fs.unlink(req.file.path, () => {});
        uploadedImage = {
            url: result.secure_url,
            public_id: result.public_id
        };
    }

    const updatedCategory = await prisma.category.update({
        where: {
            id: category.id
        },
        data: {
            name: String(req.body.name).substring(0, 50),
            image: uploadedImage
        }
    });
    res.status(200).json({
        success: true,
        message: 'Categoria atualizada.',
        category: updatedCategory
    });
});

exports.deleteCategory = asyncHandler(async (req, res) => {
    const category = await prisma.category.findFirst({
        where: {
            id: req.params.id,
            userId: req.user.id
        }
    });
    if (!category) return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada.'
    });

    const productCount = await prisma.product.count({
        where: {
            categoryId: category.id
        }
    });
    if (productCount > 0) {
        return res.status(400).json({
            success: false,
            message: `Usada por ${productCount} produto(s). Não pode ser removida.`
        });
    }

    if (category.image?.public_id) await cloudinary.uploader.destroy(category.image.public_id);
    await prisma.category.delete({
        where: {
            id: category.id
        }
    });

    res.status(200).json({
        success: true,
        message: 'Categoria removida.'
    });
});