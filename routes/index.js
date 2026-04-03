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

// Rota do Webhook da PaySuite
router.post('/webhooks/paysuite', webhookController.handlePaysuiteWebhook);

// ==========================================
// 2. ROTAS PÚBLICAS DA LOJA
// ==========================================
router.get('/store/:storeName', storeController.getPublicStoreData);
router.get('/product/:productId', storeController.getPublicProductData);
router.get('/plans', storeController.getPlans); 
router.post('/interaction', storeController.logInteraction);
router.get('/sitemap.xml', storeController.generateSitemap);
router.get('/bank-accounts', adminController.getBankAccounts);

// ==========================================
// 3. LOGIN DO ADMIN (MOVIDO PARA AQUI EM CIMA!)
// Assim não sofre bloqueio do verificador de utilizadores
// ==========================================
router.post('/admin/login', adminController.loginAdmin); 

// ==========================================
// 4. ROTAS DO PAINEL DO UTILIZADOR
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
userProtectedRoutes.post('/media/cover', checkPlanStatus, upload.single('coverImage'), settingsController.updateCoverImage);
userProtectedRoutes.post('/media/profile', checkPlanStatus, upload.single('profileImage'), settingsController.updateProfileImage);
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

// ==========================================
// 5. ROTAS DE ADMINISTRADOR (PROTEGIDAS)
// ==========================================
const adminProtectedRoutes = express.Router();
adminProtectedRoutes.use(verifyAdminToken);

adminProtectedRoutes.get('/admin/dashboard', adminController.getAdminDashboard);
adminProtectedRoutes.get('/admin/users', adminController.getAllUsers);
adminProtectedRoutes.post('/admin/users/:id/block', adminController.blockUser);
adminProtectedRoutes.post('/admin/users/:id/unblock', adminController.unblockUser);
adminProtectedRoutes.post('/admin/users/assign-plan', adminController.assignPlanToUser);
adminProtectedRoutes.post('/admin/users/assign-custom-plan', adminController.assignCustomPlanToUser);
adminProtectedRoutes.get('/admin/payments', adminController.getPendingPayments);
adminProtectedRoutes.get('/admin/payments/history', adminController.getPaymentHistory);
adminProtectedRoutes.post('/admin/payments/:id/approve', adminController.approvePayment);
adminProtectedRoutes.post('/admin/payments/:id/reject', adminController.rejectPayment);
adminProtectedRoutes.post('/admin/plans', adminController.createPlan);
adminProtectedRoutes.put('/admin/plans/:id', adminController.editPlan);
adminProtectedRoutes.get('/admin/bank-accounts', adminController.getBankAccounts);
adminProtectedRoutes.post('/admin/bank-accounts', adminController.addBankAccount);
adminProtectedRoutes.delete('/admin/bank-accounts/:id', adminController.deleteBankAccount);
adminProtectedRoutes.post('/admin/global-message', adminController.sendGlobalEmail);
adminProtectedRoutes.get('/admin/system-logs', adminController.getSystemLogs);

router.use('/', adminProtectedRoutes);

module.exports = router;