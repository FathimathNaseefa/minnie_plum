const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const passport = require('passport');
const { userAuth, adminAuth } = require('../middlewares/auth');
const productController = require('../controllers/user/productController');
const profileController = require('../controllers/user/profileController');
const cartController = require('../controllers/user/cartController');
const checkoutController = require('../controllers/user/checkoutController');
const orderController = require('../controllers/user/orderController');
const paymentController = require('../controllers/user/paymentController');
const wishlistController = require('../controllers/user/wishlistController');
const walletController = require('../controllers/user/walletController');
const referralController = require('../controllers/user/referrralController');



//user management
router.get('/pageNotFound', userController.pageNotFound);
router.get('/', userController.loadHomepage);
router.get('/logout', userController.logout);
router.get('/shop', userController.loadShoppingPage);
router.get('/shop-data', userController.getFilteredProducts);
router.get('/signup', userController.loadSignup);
router.post('/signup', userController.signup);
router.post('/verify-otp', userController.verifyOtp);
router.post('/resend-otp', userController.resendOtp);

//productManagement
router.get('/productDetails', productController.productDetails);
router.get(
  '/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);
router.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/signup' }),
  (req, res) => {
    res.redirect('/');
  }
);

router.get('/login', userController.loadLogin);
router.post('/login', userController.login);



//profile management
router.get('/forgot-password', profileController.getForgotPassPage);
router.post('/forgot-email-valid', profileController.forgotEmailValid);
router.post('/verify-passForgot-otp', profileController.verifyForgotPassOtp);
router.post('/resend-forgot-otp', profileController.resendOtp);
router.post('/resend-email-otp', profileController.resendEmailOtp);
router.get('/reset-password', profileController.getResetPassPage);
router.post('/reset-password', profileController.postNewPassword);
router.get('/userProfile', userAuth, profileController.userProfile);
router.get('/change-email', userAuth, profileController.changeEmail);
router.post('/change-email', userAuth, profileController.changeEmailValid);
router.post('/verify-email-otp', userAuth, profileController.verifyEmailOtp);
router.get('/update-email', userAuth, profileController.getUpdatePage);
router.post('/update-email', userAuth, profileController.updateEmail);
router.get('/change-password', userAuth, profileController.changePassword);
router.post(
  '/change-password',
  userAuth,
  profileController.changePasswordValid
);
router.post(
  '/verify-changepassword-otp',
  userAuth,
  profileController.verifyChangePassOtp
);
router.post(
  '/resend-changepassword-otp',
  userAuth,
  profileController.resendChangePassOtp
);



//address management
router.get('/addAddress', userAuth, profileController.addAddress);
router.post('/addAddress', userAuth, profileController.postAddAddress);
router.get('/editAddress', userAuth, profileController.editAddress);
router.post('/editAddress', userAuth, profileController.postEditAddress);
router.get('/deleteAddress', userAuth, profileController.deleteAddress);




//cart management
router.get('/cart', userAuth, cartController.getCartPage);
router.post('/addToCart', userAuth, cartController.addToCart);
router.post('/changeQuantity', userAuth, cartController.changeQuantity);
router.get('/deleteItem', userAuth, cartController.deleteProduct);


//checkout management
router.get('/checkout', userAuth, checkoutController.getCheckoutPage);
router.post('/checkout/addAddress', userAuth, checkoutController.addAddress);
router.get(
  '/checkout/editAddress/:id',
  userAuth,
  checkoutController.getEditAddressPage
);

router.post('/checkout/editAddress', userAuth, checkoutController.editAddress);
router.post('/checkout/createOrder', userAuth, checkoutController.createOrder);
router.post(
  '/checkout/setDefaultAddress',
  userAuth,
  checkoutController.setDefaultAddress
);
router.get(
  '/order-success/:orderId',
  userAuth,
  checkoutController.orderSuccess
);



//order management
router.get('/order-details/:id', orderController.orderDetails);
router.post('/update-status', userAuth, orderController.updateOrderStatus);
router.get('/cancel-order/:orderId', orderController.getCancelOrder);
router.get('/return-order/:orderId', orderController.getReturnOrder);
router.post('/cancel-order', userAuth, orderController.cancelOrder);
router.post('/return-order', userAuth, orderController.returnOrder);

router.post(
  '/confirm-return-order',
  userAuth,
  orderController.confirmReturnOrder
);
router.post(
  '/confirm-cancel-order',
  userAuth,
  orderController.confirmCancelOrder
);


//razorpay payment
router.post(
  '/create-razorpayorder',userAuth,
  
  paymentController.createRazorpayOrder
);
router.post('/verify-payment', userAuth, paymentController.verifyPayment);
router.post('/download-invoice', userAuth, paymentController.generateInvoice);
router.get(
  '/download-invoice/:orderId',
  userAuth,
  paymentController.downloadInvoice
);

router.post('/webhook/razorpay', paymentController.razorpayWebhookHandler);
router.post('/payment-failed', userAuth, paymentController.paymentFailed);
router.post('/update-payment-status', paymentController.updatePaymentStatus);
router.get('/retry-payment/:orderId', paymentController.rePayment);
router.get('/payment-success', paymentController.paymentSuccess);



//coupon in checkout
router.post('/apply-coupon', userAuth, checkoutController.applyCoupon);
router.post('/remove-coupon', userAuth, checkoutController.removeCoupon);


//wishlist
router.post(
  '/wishlist/add/:productId',
  userAuth,
  wishlistController.wishlistAdd
);
router.post(
  '/wishlist/remove/:productId',
  userAuth,
  wishlistController.wishlistRemove
);
router.get('/wishlist', userAuth, wishlistController.getWishlist);
router.post('/wishlist/toggle', userAuth, wishlistController.toggle);



//wallet
router.post('/addMoney', userAuth, walletController.addMoneyToWallet);
router.post('/verify-payment', userAuth, walletController.verify_payment);



//referral offer
router.post('/apply-referral', referralController.applyReferral);
router.get('/referral-offer', referralController.getReferralOffer);
router.post(
  '/admin/create-referral-offer',
  referralController.createReferralOffer
);
router.post(
  '/admin/deactivate-referral-offer',
  referralController.deactivateReferralOffer
);




module.exports = router;
