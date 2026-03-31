const express = require('express');
const router = express.Router();

const productController = require('./productController');
const dashboardController = require('./dashboardController');
const settingsController = require('./settingsController');

const adminControllers = require('./adminControllers');
const systemControllers = require('./systemControllers');
const auth = require('./auth');
const multer = require('multer');

const {
    emailLimiter,
    loginLimiter,
    registerRules,
    loginRules,
    emailRules,
    resetPasswordRules,
    validate,
} = require('./validators');

const upload = multer({ dest: 'uploads/' });

// --- ROTAS PÚBLICAS E DE AUTENTICAÇÃO ---

router.post('/register', registerRules(), validate, systemControllers.registerUser);
router.post('/login', loginRules(), validate, loginLimiter, systemControllers.loginUser);

router.post('/verify-email', systemControllers.verifyEmail);

router.post('/resend-verification', emailRules(), validate, emailLimiter, systemControllers.resendVerificationCode);
router.post('/forgot-password', emailRules(), validate, emailLimiter, systemControllers.forgotPassword);

router.post('/reset-password', resetPasswordRules(), validate, systemControllers.resetPassword);

router.post('/admin/login', adminControllers.loginAdmin); 

router.get('/store/:storeName', systemControllers.getPublicStoreData);
router.get('/product/:productId', systemControllers.getPublicProductData);
router.get('/plans', systemControllers.getPlans);
router.get('/bank-accounts', adminControllers.getBankAccounts); // Mantido público para a página de planos
router.post('/interaction', systemControllers.logInteraction);
router.get('/sitemap.xml', systemControllers.generateSitemap);


// --- ROTAS DO DASHBOARD DO USUÁRIO ---
const userProtectedRoutes = express.Router();
userProtectedRoutes.use(auth.verifyUserToken); // Primeiro, verifica se o utilizador está logado

// --- Rotas do Dashboard e Estatísticas (Apenas Leitura - GET) ---
userProtectedRoutes.get('/dashboard', dashboardController.getDashboardData);
userProtectedRoutes.get('/dashboard/charts', dashboardController.getDashboardChartData);
userProtectedRoutes.get('/statistics', dashboardController.getStatisticsData);
userProtectedRoutes.get('/orders', dashboardController.getOrders);
userProtectedRoutes.get('/messages', dashboardController.getMessages);

// --- Rotas de Produtos e Categorias (Leitura e Escrita) ---
// Aplica o checkPlanStatus a todas as rotas de escrita (POST, PUT, DELETE)
userProtectedRoutes.post('/products', auth.checkPlanStatus, upload.array('images', 10), productController.createProduct);
userProtectedRoutes.get('/products', productController.getProducts);
userProtectedRoutes.put('/products/:id', auth.checkPlanStatus, upload.array('images', 10), productController.updateProduct);
userProtectedRoutes.delete('/products/:id', auth.checkPlanStatus, productController.deleteProduct);
userProtectedRoutes.post('/products/:id/video', auth.checkPlanStatus, upload.single('video'), productController.addProductVideo);
userProtectedRoutes.post('/products/:id/toggle-feature', auth.checkPlanStatus, productController.toggleProductFeature);
userProtectedRoutes.post('/categories', auth.checkPlanStatus, productController.createCategory);
userProtectedRoutes.get('/categories', productController.getCategories);
userProtectedRoutes.put('/categories/:id', auth.checkPlanStatus, productController.updateCategory);
userProtectedRoutes.delete('/categories/:id', auth.checkPlanStatus, productController.deleteCategory);

// --- Rotas de Configurações (Leitura e Escrita) ---
userProtectedRoutes.get('/my-account', settingsController.getAccountInfo);
userProtectedRoutes.put('/my-account', auth.checkPlanStatus, settingsController.updateAccountInfo); // <-- NOVA ROTA AQUI
userProtectedRoutes.post('/visual', auth.checkPlanStatus, settingsController.updateVisualTheme);
userProtectedRoutes.get('/visual', settingsController.getVisualTheme);
userProtectedRoutes.post('/visual/apply-preset', auth.checkPlanStatus, settingsController.applyThemePreset);
userProtectedRoutes.post('/media/cover', auth.checkPlanStatus, upload.single('coverImage'), settingsController.updateCoverImage);
userProtectedRoutes.post('/media/profile', auth.checkPlanStatus, upload.single('profileImage'), settingsController.updateProfileImage);
userProtectedRoutes.get('/media', settingsController.getMedia);
userProtectedRoutes.delete('/media/:asset_id', auth.checkPlanStatus, settingsController.deleteMedia);
userProtectedRoutes.post('/contacts', auth.checkPlanStatus, settingsController.updateContacts);
userProtectedRoutes.get('/contacts', settingsController.getContacts);
userProtectedRoutes.post('/payment/upload', auth.checkPlanStatus, upload.single('proof'), settingsController.uploadPaymentProof);
userProtectedRoutes.get('/my-plan', settingsController.getCurrentPlan);
userProtectedRoutes.get('/payment/history', settingsController.getPaymentHistory);

router.use('/', userProtectedRoutes);


// --- ROTAS DO PAINEL DE ADMIN ---
const adminProtectedRoutes = express.Router();
adminProtectedRoutes.use(auth.verifyAdminToken);

adminProtectedRoutes.get('/admin/dashboard', adminControllers.getAdminDashboard);
adminProtectedRoutes.get('/admin/users', adminControllers.getAllUsers);
adminProtectedRoutes.post('/admin/users/:id/block', adminControllers.blockUser);
adminProtectedRoutes.post('/admin/users/:id/unblock', adminControllers.unblockUser);
adminProtectedRoutes.post('/admin/users/assign-plan', adminControllers.assignPlanToUser);
adminProtectedRoutes.post('/admin/users/assign-custom-plan', adminControllers.assignCustomPlanToUser);
adminProtectedRoutes.get('/admin/payments', adminControllers.getPendingPayments);
adminProtectedRoutes.post('/admin/payments/:id/approve', adminControllers.approvePayment);
adminProtectedRoutes.post('/admin/payments/:id/reject', adminControllers.rejectPayment);
adminProtectedRoutes.get('/admin/payments/history', adminControllers.getPaymentHistory);
adminProtectedRoutes.post('/admin/plans', adminControllers.createPlan);
adminProtectedRoutes.put('/admin/plans/:id', adminControllers.editPlan);
adminProtectedRoutes.get('/admin/bank-accounts', adminControllers.getBankAccounts);
adminProtectedRoutes.post('/admin/bank-accounts', adminControllers.addBankAccount);
adminProtectedRoutes.delete('/admin/bank-accounts/:id', adminControllers.deleteBankAccount);
adminProtectedRoutes.post('/admin/global-message', adminControllers.sendGlobalEmail);
adminProtectedRoutes.get('/admin/system-logs', adminControllers.getSystemLogs);

router.use('/', adminProtectedRoutes);

module.exports = router;