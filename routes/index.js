// Ficheiro: src/routes/index.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Importação dos Controllers refatorados
const authController = require('../controllers/authController');
const storeController = require('../controllers/storeController');
const dashboardController = require('../controllers/dashboardController');
const productController = require('../controllers/productController');
const settingsController = require('../controllers/settingsController');
const adminController = require('../controllers/adminController');

// Importação de Middlewares
const { verifyUserToken, verifyAdminToken, checkPlanStatus } = require('../middlewares/authMiddleware');
const { emailLimiter, loginLimiter, registerRules, loginRules, emailRules, resetPasswordRules, validate } = require('../middlewares/validators');

// ==========================================
// 1. ROTAS PÚBLICAS E AUTENTICAÇÃO
// ==========================================
router.post('/register', registerRules(), validate, authController.registerUser);
router.post('/login', loginRules(), validate, loginLimiter, authController.loginUser);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', emailRules(), validate, emailLimiter, authController.resendVerificationCode);
router.post('/forgot-password', emailRules(), validate, emailLimiter, authController.forgotPassword);
router.post('/reset-password', resetPasswordRules(), validate, authController.resetPassword);

// ==========================================
// 2. ROTAS PÚBLICAS DA LOJA (USADAS PELO SUBDOMÍNIO)
// O front-end captura "loja.bizno.store" e faz GET /api/store/loja
// ==========================================
router.get('/store/:storeName', storeController.getPublicStoreData);
router.get('/product/:productId', storeController.getPublicProductData);
router.get('/sitemap.xml', storeController.generateSitemap);
router.get('/plans', storeController.getPlans); 

// ==========================================
// 3. ROTAS DO PAINEL DO UTILIZADOR
// ==========================================
const userProtectedRoutes = express.Router();
userProtectedRoutes.use(verifyUserToken);

// Dashboard
userProtectedRoutes.get('/dashboard', dashboardController.getDashboardData);
userProtectedRoutes.get('/dashboard/charts', dashboardController.getDashboardChartData);
userProtectedRoutes.get('/statistics', dashboardController.getStatisticsData);

// Produtos & Categorias (Escrita validada por checkPlanStatus)
userProtectedRoutes.get('/products', productController.getProducts);
userProtectedRoutes.post('/products', checkPlanStatus, upload.array('images', 10), productController.createProduct);
userProtectedRoutes.put('/products/:id', checkPlanStatus, upload.array('images', 10), productController.updateProduct);
userProtectedRoutes.delete('/products/:id', checkPlanStatus, productController.deleteProduct);
userProtectedRoutes.post('/products/:id/toggle-feature', checkPlanStatus, productController.toggleProductFeature);
userProtectedRoutes.post('/products/:id/video', checkPlanStatus, upload.single('video'), productController.addProductVideo);

userProtectedRoutes.get('/categories', productController.getCategories);
userProtectedRoutes.post('/categories', checkPlanStatus, productController.createCategory);
userProtectedRoutes.put('/categories/:id', checkPlanStatus, productController.updateCategory);
userProtectedRoutes.delete('/categories/:id', checkPlanStatus, productController.deleteCategory);

// Configurações
userProtectedRoutes.get('/my-account', settingsController.getAccountInfo);
userProtectedRoutes.put('/my-account', checkPlanStatus, settingsController.updateAccountInfo);
userProtectedRoutes.post('/visual', checkPlanStatus, settingsController.updateVisualTheme);
userProtectedRoutes.post('/media/cover', checkPlanStatus, upload.single('coverImage'), settingsController.updateCoverImage);
userProtectedRoutes.post('/payment/upload', checkPlanStatus, upload.single('proof'), settingsController.uploadPaymentProof);

router.use('/', userProtectedRoutes);

// ==========================================
// 4. ROTAS DE ADMINISTRADOR
// ==========================================
const adminProtectedRoutes = express.Router();
router.post('/admin/login', adminController.loginAdmin); 
adminProtectedRoutes.use(verifyAdminToken);

adminProtectedRoutes.get('/admin/dashboard', adminController.getAdminDashboard);
adminProtectedRoutes.get('/admin/users', adminController.getAllUsers);
adminProtectedRoutes.post('/admin/payments/:id/approve', adminController.approvePayment);
adminProtectedRoutes.post('/admin/payments/:id/reject', adminController.rejectPayment);
// Restantes rotas admin...

router.use('/', adminProtectedRoutes);

module.exports = router;