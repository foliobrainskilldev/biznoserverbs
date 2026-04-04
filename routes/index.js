// Ficheiro: src/routes/index.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Importação dos Controllers
const authController = require('../controllers/authController');
const storeController = require('../controllers/storeController');
const dashboardController = require('../controllers/dashboardController');
const productController = require('../controllers/productController');
const settingsController = require('../controllers/settingsController');
const adminController = require('../controllers/adminController');
const webhookController = require('../controllers/webhookController'); 

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

router.post('/webhooks/paysuite', webhookController.handlePaysuiteWebhook);

router.get('/store/:storeName', storeController.getPublicStoreData);
router.get('/product/:productId', storeController.getPublicProductData);
router.get('/plans', storeController.getPlans); 
router.post('/interaction', storeController.logInteraction);
router.get('/sitemap.xml', storeController.generateSitemap);
router.get('/bank-accounts', adminController.getBankAccounts);

// ROTA DE LOGIN DO ADMIN ISOLADA
router.post('/admin/login', adminController.loginAdmin); 


// ==========================================
// 2. ROTAS DE ADMINISTRADOR (PROTEGIDAS)
// ==========================================
const adminProtectedRoutes = express.Router();
adminProtectedRoutes.use(verifyAdminToken);

adminProtectedRoutes.get('/dashboard', adminController.getAdminDashboard);
adminProtectedRoutes.get('/users', adminController.getAllUsers);
adminProtectedRoutes.post('/users/:id/block', adminController.blockUser);
adminProtectedRoutes.post('/users/:id/unblock', adminController.unblockUser);
adminProtectedRoutes.post('/users/assign-plan', adminController.assignPlanToUser);
adminProtectedRoutes.post('/users/assign-custom-plan', adminController.assignCustomPlanToUser);
adminProtectedRoutes.get('/payments', adminController.getPendingPayments);
adminProtectedRoutes.get('/payments/history', adminController.getPaymentHistory);
adminProtectedRoutes.post('/payments/:id/approve', adminController.approvePayment);
adminProtectedRoutes.post('/payments/:id/reject', adminController.rejectPayment);
adminProtectedRoutes.post('/plans', adminController.createPlan);
adminProtectedRoutes.put('/plans/:id', adminController.editPlan);
adminProtectedRoutes.get('/bank-accounts', adminController.getBankAccounts);
adminProtectedRoutes.post('/bank-accounts', adminController.addBankAccount);
adminProtectedRoutes.delete('/bank-accounts/:id', adminController.deleteBankAccount);
adminProtectedRoutes.post('/global-message', adminController.sendGlobalEmail);
adminProtectedRoutes.get('/system-logs', adminController.getSystemLogs);

// Montar as rotas de Admin ANTES das rotas de Utilizador
router.use('/admin', adminProtectedRoutes);


// ==========================================
// 3. ROTAS DO PAINEL DO UTILIZADOR
// ==========================================
const userProtectedRoutes = express.Router();
userProtectedRoutes.use(verifyUserToken);

// Dashboard & Stats
userProtectedRoutes.get('/dashboard', dashboardController.getDashboardData);
userProtectedRoutes.get('/dashboard/charts', dashboardController.getDashboardChartData);
userProtectedRoutes.get('/statistics', dashboardController.getStatisticsData);
userProtectedRoutes.get('/orders', dashboardController.getOrders);
userProtectedRoutes.get('/messages', dashboardController.getMessages);

// Produtos & Categorias
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

// Configurações e Conta
userProtectedRoutes.get('/my-account', settingsController.getAccountInfo);
userProtectedRoutes.put('/my-account', checkPlanStatus, settingsController.updateAccountInfo);
userProtectedRoutes.get('/visual', settingsController.getVisualTheme);
userProtectedRoutes.post('/visual', checkPlanStatus, settingsController.updateVisualTheme);
userProtectedRoutes.post('/visual/apply-preset', checkPlanStatus, settingsController.applyThemePreset);

// Rotas de Media
userProtectedRoutes.post('/media/cover', checkPlanStatus, upload.single('coverImage'), settingsController.updateCoverImage);
userProtectedRoutes.post('/media/profile', checkPlanStatus, upload.single('profileImage'), settingsController.updateProfileImage);
userProtectedRoutes.post('/media/avatar', checkPlanStatus, upload.single('userAvatar'), settingsController.updateUserAvatar);
userProtectedRoutes.get('/media', settingsController.getMedia);
userProtectedRoutes.delete('/media/:asset_id', checkPlanStatus, settingsController.deleteMedia);

userProtectedRoutes.get('/contacts', settingsController.getContacts);
userProtectedRoutes.post('/contacts', checkPlanStatus, settingsController.updateContacts);

// Pagamento Automático
userProtectedRoutes.post('/payment/initiate', settingsController.initiatePlanPayment);
userProtectedRoutes.get('/payment/verify/:gatewayReference', settingsController.verifyPaymentStatus);
userProtectedRoutes.get('/my-plan', settingsController.getCurrentPlan);
userProtectedRoutes.get('/payment/history', settingsController.getPaymentHistory);

router.use('/', userProtectedRoutes);

module.exports = router;