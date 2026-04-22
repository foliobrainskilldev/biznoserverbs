const express = require('express');
const router = express.Router();
const multer = require('multer');

const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'image/x-icon', 'image/vnd.microsoft.icon'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de ficheiro não suportado.'));
        }
    }
});

const authController = require('../controllers/authController');
const storeController = require('../controllers/storeController');
const dashboardController = require('../controllers/dashboardController');
const productController = require('../controllers/productController');
const settingsController = require('../controllers/settingsController');
const adminController = require('../controllers/adminController');
const webhookController = require('../controllers/webhookController'); 

const { verifyUserToken, verifyAdminToken, checkPlanStatus } = require('../middlewares/authMiddleware');
const { emailLimiter, loginLimiter, orderLimiter, registerRules, loginRules, emailRules, resetPasswordRules, validate } = require('../middlewares/validators');

router.get('/ping', (req, res) => {
    res.status(200).json({ success: true, message: 'Servidor ativo' });
});

router.post('/register', registerRules(), validate, authController.registerUser);
router.post('/login', loginRules(), validate, loginLimiter, authController.loginUser);
router.post('/google-auth', authController.googleAuth);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', emailRules(), validate, emailLimiter, authController.resendVerificationCode);
router.post('/forgot-password', emailRules(), validate, emailLimiter, authController.forgotPassword);
router.post('/reset-password', resetPasswordRules(), validate, authController.resetPassword);

router.post('/webhooks/paysuite', webhookController.handlePaysuiteWebhook);

router.get('/store/:storeName', storeController.getPublicStoreData);
router.get('/product/:productId', storeController.getPublicProductData);
router.get('/product/:productId/cross-sell', storeController.getCrossSellProducts);
router.get('/store/:storeName/coupon/:code', storeController.validateCoupon);
router.post('/store/cart/abandoned', orderLimiter, storeController.logAbandonedCart);

router.get('/plans', storeController.getPlans); 
router.post('/interaction', orderLimiter, storeController.logInteraction);
router.get('/sitemap.xml', storeController.generateSitemap);

router.post('/admin/login', adminController.loginAdmin); 

const adminProtectedRoutes = express.Router();
adminProtectedRoutes.use(verifyAdminToken);
adminProtectedRoutes.get('/dashboard', adminController.getAdminDashboard);
adminProtectedRoutes.get('/users', adminController.getAllUsers);
adminProtectedRoutes.get('/users/:id', adminController.getUserById);
adminProtectedRoutes.post('/users/:id/impersonate', adminController.impersonateUser);
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

router.use('/admin', adminProtectedRoutes);

const userProtectedRoutes = express.Router();
userProtectedRoutes.use(verifyUserToken);

userProtectedRoutes.get('/dashboard', dashboardController.getDashboardData);
userProtectedRoutes.get('/dashboard/charts', dashboardController.getDashboardChartData);
userProtectedRoutes.get('/statistics', dashboardController.getStatisticsData);
userProtectedRoutes.get('/orders', dashboardController.getOrders);
userProtectedRoutes.put('/orders/:id/status', dashboardController.updateOrderStatus);
userProtectedRoutes.get('/messages', dashboardController.getMessages);
userProtectedRoutes.get('/customers', dashboardController.getCustomers);
userProtectedRoutes.get('/abandoned-carts', dashboardController.getAbandonedCarts);

userProtectedRoutes.get('/products', productController.getProducts);
userProtectedRoutes.post('/products', checkPlanStatus, upload.array('images', 10), productController.createProduct);
userProtectedRoutes.put('/products/:id', checkPlanStatus, upload.array('images', 10), productController.updateProduct);
userProtectedRoutes.delete('/products/:id', checkPlanStatus, productController.deleteProduct);
userProtectedRoutes.post('/products/:id/toggle-feature', checkPlanStatus, productController.toggleProductFeature);
userProtectedRoutes.post('/products/:id/video', checkPlanStatus, upload.single('video'), productController.addProductVideo);

userProtectedRoutes.get('/categories', productController.getCategories);
userProtectedRoutes.post('/categories', checkPlanStatus, upload.single('image'), productController.createCategory);
userProtectedRoutes.put('/categories/:id', checkPlanStatus, upload.single('image'), productController.updateCategory);
userProtectedRoutes.delete('/categories/:id', checkPlanStatus, productController.deleteCategory);

userProtectedRoutes.post('/coupons', checkPlanStatus, settingsController.createCoupon);
userProtectedRoutes.get('/coupons', settingsController.getCoupons);
userProtectedRoutes.delete('/coupons/:id', checkPlanStatus, settingsController.deleteCoupon);

userProtectedRoutes.get('/my-account', settingsController.getAccountInfo);
userProtectedRoutes.put('/my-account', checkPlanStatus, settingsController.updateAccountInfo);
userProtectedRoutes.get('/visual', settingsController.getVisualTheme);
userProtectedRoutes.post('/visual', checkPlanStatus, settingsController.updateVisualTheme);
userProtectedRoutes.post('/visual/apply-preset', checkPlanStatus, settingsController.applyThemePreset);

userProtectedRoutes.post('/media/cover', checkPlanStatus, upload.single('coverImage'), settingsController.updateCoverImage);
userProtectedRoutes.post('/media/profile', checkPlanStatus, upload.single('profileImage'), settingsController.updateProfileImage);
userProtectedRoutes.post('/media/favicon', checkPlanStatus, upload.single('favicon'), settingsController.updateFavicon);
userProtectedRoutes.post('/media/avatar', checkPlanStatus, upload.single('userAvatar'), settingsController.updateUserAvatar);
userProtectedRoutes.get('/media', settingsController.getMedia);
userProtectedRoutes.delete('/media/:asset_id', checkPlanStatus, settingsController.deleteMedia);

userProtectedRoutes.get('/contacts', settingsController.getContacts);
userProtectedRoutes.post('/contacts', checkPlanStatus, settingsController.updateContacts);

userProtectedRoutes.post('/payment/initiate', settingsController.initiatePlanPayment);
userProtectedRoutes.get('/payment/verify/:gatewayReference', settingsController.verifyPaymentStatus);
userProtectedRoutes.get('/my-plan', settingsController.getCurrentPlan);
userProtectedRoutes.post('/my-plan/downgrade', settingsController.downgradeToFree);
userProtectedRoutes.get('/payment/history', settingsController.getPaymentHistory);

router.use('/', userProtectedRoutes);

module.exports = router;