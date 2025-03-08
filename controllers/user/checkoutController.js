const Order = require('../../models/orderSchema'); // Assuming you have an order model
const Cart = require('../../models/cartSchema');
const UserAddress = require('../../models/addressSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const { v4: uuidv4 } = require('uuid');
const Coupon = require('../../models/couponSchema');
const { getDiscountedPrice } = require('../../utils/priceHelper');
const Offer = require('../../models/offerSchema');
const Category = require('../../models/categorySchema');
const Razorpay = require('razorpay');
const paypal = require('paypal-rest-sdk');
require('dotenv').config();
const mongoose = require('mongoose');

function roundToFixedNumber(value, fixedNumber) {
  return Math.round(value / fixedNumber) * fixedNumber;
}

// Helper function to apply coupon discount
const applyCouponDiscount = async (req, totalAmount) => {
  if (!req.session.appliedCoupon) return totalAmount;

  // Assuming you have a function to apply the coupon based on the code
  const coupon = await Coupon.findOne({ code: req.session.appliedCoupon });

  if (coupon) {
    const discount = (totalAmount * coupon.discount) / 100;
    return totalAmount - discount; // Apply the discount
  }

  return totalAmount;
};

const getCheckoutPage = async (req, res) => {
  try {
    const user = await User.findById(req.session.user).populate(
      'cart.productId'
    );

    if (!user) {
      return res.redirect('/login');
    }

    const addresses = await UserAddress.find({ userId: user._id });

    let totalAmount = req.query.totalAmount
      ? parseFloat(req.query.totalAmount)
      : 0;
    let totalDiscount = 0;
    let originalTotal = 0;
    let productOffers = [];
    let categoryOffers = [];

    console.log('User Cart:', user.cart);

    if (!totalAmount && user.cart.length > 0) {
      console.log('Calculating totals...');

      totalAmount = await user.cart.reduce(async (sumPromise, item) => {
        let sum = await sumPromise;

        if (!item.productId) {
          console.log('Skipping item (no productId):', item);
          return sum;
        }

        console.log('Product Details:', item.productId);

        let salePrice = item.productId.salePrice;
        console.log('Product Price:', salePrice);

        let finalPrice = salePrice;
        let appliedDiscount = 0;

        // Apply Product Offer if available
        if (item.productId.pdtOffer) {
          const pdtOffer = await Offer.findById(item.productId.pdtOffer);
          if (pdtOffer) {
            let discount = (salePrice * pdtOffer.discountValue) / 100;
            let pdtOfferPrice = salePrice - discount;
            if (pdtOfferPrice < finalPrice) {
              finalPrice = pdtOfferPrice;
              appliedDiscount = discount;
              productOffers.push({
                productId: item.productId._id,
                discountValue: pdtOffer.discountValue,
                discountType: pdtOffer.discountType,
              });
            }
          }
        }

        // Apply Category Offer if available
        const category = await Category.findById(
          item.productId.category
        ).populate('catOffer');

        if (category) {
          console.log('Category Found:', category.name);
          console.log('Category Offer:', category.catOffer);

          if (category.catOffer) {
            const catOffer = await Offer.findById(category.catOffer);

            if (catOffer) {
              console.log('Category Offer Details:', catOffer);

              if (
                (catOffer.isActive === undefined || catOffer.isActive) &&
                new Date(catOffer.expiry) > new Date()
              ) {
                let discount = (salePrice * catOffer.discountValue) / 100;
                let catOfferPrice = salePrice - discount;

                if (catOfferPrice < finalPrice) {
                  finalPrice = catOfferPrice;
                  appliedDiscount = discount;

                  categoryOffers.push({
                    categoryId: category._id,
                    discountValue: catOffer.discountValue,
                    discountType: catOffer.discountType,
                  });

                  console.log('✅ Category Offer Applied:', categoryOffers);
                }
              } else {
                console.log('❌ Category Offer Expired or Inactive');
              }
            } else {
              console.log('❌ No Category Offer Found in DB');
            }
          } else {
            console.log('❌ No Category Offer Assigned to Category');
          }
        }

        totalDiscount += appliedDiscount * item.quantity;
        return sum + finalPrice * item.quantity;
      }, Promise.resolve(0));

      originalTotal = totalAmount + totalDiscount;
      console.log('Totals Calculated:', {
        originalTotal,
        totalAmount,
        totalDiscount,
      });
    }

    // Apply coupon discount if any
    totalAmount = await applyCouponDiscount(req, totalAmount);
    originalTotal = totalAmount + totalDiscount;

    let defaultAddress =
      addresses.find((address) => address.isDefault) ||
      (addresses.length > 0 ? addresses[0] : null);
    const appliedCoupon = req.session.appliedCoupon || null;

    // Helper function for rounding
    const roundToFixedNumber = (num, decimals) =>
      parseFloat(num.toFixed(decimals));

    console.log('Final Values:', {
      originalTotal,
      totalAmount,
      totalDiscount,
      productOffers,
      categoryOffers,
      appliedCoupon,
    });

    // ✅ FIX: Replace userId with user._id
    const order = await Order.findOne({
      userId: user._id,
      paymentStatus: 'Pending',
    });

    if (!order) {
      return res.redirect('/cart'); // Redirect if no order found
    }

    res.render('checkout', {
      user,
      addresses,
      defaultAddress,
      totalAmount: roundToFixedNumber(totalAmount, 2),
      originalTotal: roundToFixedNumber(originalTotal, 2),
      totalDiscount: roundToFixedNumber(totalDiscount, 2),
      productOffers,
      categoryOffers,
      appliedCoupon,
      order,
      orderId: order.orderId,
      roundToFixedNumber, // Pass function to EJS
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.redirect('/pageNotFound');
  }
};

//Add new address
const addAddress = async (req, res) => {
  try {
    const user = req.session.user;
    const {
      name,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      phoneNumber,
    } = req.body;

    const newAddress = new UserAddress({
      userId: user,
      name,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      phoneNumber,
      isDefault: false, // Set default address flag when adding a new address
    });

    await newAddress.save();
    res.redirect('/checkout'); // Redirect to checkout page to see updated addresses
  } catch (error) {
    console.error(error);
    res.redirect('/pageNotFound');
  }
};

const getEditAddressPage = async (req, res) => {
  try {
    const addressId = req.params.id;
    const address = await UserAddress.findById(addressId);

    if (!address) {
      return res.redirect('/pageNotFound');
    }

    res.render('checkout-editAdd', { address });
  } catch (error) {
    console.error(error);
    res.redirect('/pageNotFound');
  }
};

// Edit an existing address
const editAddress = async (req, res) => {
  try {
    const {
      addressId,
      name,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      phoneNumber,
    } = req.body;

    await UserAddress.findByIdAndUpdate(addressId, {
      name,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      phoneNumber,
    });

    res.redirect('/checkout');
  } catch (error) {
    console.error(error);
    res.redirect('/pageNotFound');
  }
};

// Set a default address
const setDefaultAddress = async (req, res) => {
  try {
    const { addressId } = req.body;
    const user = req.session.user;

    // Remove default from all addresses
    await UserAddress.updateMany({ userId: user }, { isDefault: false });

    // Set the new default address
    await UserAddress.findByIdAndUpdate(addressId, { isDefault: true });

    res.redirect('/checkout');
  } catch (error) {
    console.error(error);
    res.redirect('/pageNotFound');
  }
};

const orderSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log('🔹 Fetching order for success page:', orderId);
    let order;

    // Check if orderId is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
      order = await Order.findById(orderId).populate('shippingAddress');
    } else {
      order = await Order.findOne({ orderId }).populate('shippingAddress');
    }

    if (!order) {
      return res.status(404).send('Order not found.');
    }

    // Calculate estimated delivery (5 days from now)
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 5);

    res.render('order-success', {
      order,
      estimatedDelivery: estimatedDelivery.toDateString(),
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).send('Something went wrong.');
  }
};




const createOrder = async (req, res) => {
  try {
    const {
      addressId,
      paymentMethod,
      appliedCoupon,
      discountAmount,
      pdtOffer,
      catOffer,
    } = req.body;
    console.log("📦 Address ID received:", addressId);
    const selectedAddress = await UserAddress.findById(addressId);
    console.log("🔹 Selected Address Before Saving:", selectedAddress);
    
    const userId = req.session.user;

    if (!userId) return res.status(400).json({ message: 'User not logged in' });

    const user = await User.findById(userId).populate('cart.productId');
    if (!user) return res.status(400).json({ message: 'User not found' });

    if (!addressId || !paymentMethod) {
      return res
        .status(400)
        .json({ message: 'Address and payment method are required.' });
    }

    const cart = user.cart;
    if (!cart || cart.length === 0)
      return res.status(400).json({ message: 'Cart is empty' });

    // ✅ Check stock availability
    for (const item of cart) {
      const product = await Product.findById(item.productId._id);
      if (!product || product.stock < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${product?.name || 'an item'}`,
        });
      }
    }

    const uniqueOrderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // ✅ Calculate total price before discount
    const totalBeforeDiscount = cart.reduce(
      (sum, item) => sum + item.quantity * item.productId.salePrice,
      0
    );
    console.log('💰 Total Before Discount:', totalBeforeDiscount);

    let totalDiscount = parseFloat(discountAmount) || 0;
    let appliedCouponDiscount = parseFloat(appliedCoupon?.discount || 0) || 0;

    // ✅ Declare variables for tracking discounts
    let productOfferDiscount = 0;
    let categoryOfferDiscount = 0;

    // ✅ Calculate discounts for each product
    for (const item of cart) {
      const product = await Product.findById(item.productId._id);
      if (!product) continue;

      // Fetch category and populate `catOffer`
      const category = await Category.findById(
        item.productId.category
      ).populate('catOffer');

      let productDiscount = 0;
      let categoryDiscount = 0;

      // ✅ Calculate Product Offer Discount
      if (product.pdtOffer) {
        const productOffer = await Offer.findById(product.pdtOffer);
        if (productOffer) {
          productDiscount =
            (product.salePrice * productOffer.discountValue) / 100;
        }
      }

      // ✅ Calculate Category Offer Discount
      if (category && category.catOffer) {
        const catOffer = await Offer.findById(category.catOffer);
        if (
          catOffer &&
          (catOffer.isActive === undefined || catOffer.isActive) &&
          new Date(catOffer.expiry) > new Date()
        ) {
          categoryDiscount = (product.salePrice * catOffer.discountValue) / 100;
        }
      }

      // ✅ Apply the higher discount (either product or category offer)
      const higherDiscount = Math.max(productDiscount, categoryDiscount);
      totalDiscount += higherDiscount * item.quantity;

      // ✅ Track total discounts for logging
      productOfferDiscount += productDiscount * item.quantity;
      categoryOfferDiscount += categoryDiscount * item.quantity;
    }

    // ✅ Add applied coupon discount to the total discount
    totalDiscount += appliedCouponDiscount;

    // ✅ Calculate final total after discount
    const finalTotal = totalBeforeDiscount - totalDiscount;

    console.log('💰 Total Before Discount:', totalBeforeDiscount);
    console.log('🎯 Product Offer Discount:', productOfferDiscount);
    console.log('🎯 Category Offer Discount:', categoryOfferDiscount);
    console.log('🎯 Coupon Discount:', appliedCouponDiscount);
    console.log('✅ Total Discount:', totalDiscount);
    console.log('🔹 Final Total (After Discount):', finalTotal);

    // ✅ Check if COD is selected and total amount is greater than ₹1000
    if (paymentMethod === 'cod' && finalTotal > 1000) {
      return res.status(400).json({
        message:
          'Cash on Delivery (COD) is not available for orders above ₹1000. Please choose another payment method.',
      });
    }
     // Fetch from useraddresses
if (!selectedAddress) {
    return res.status(400).json({ message: 'Invalid shipping address.' });
}
console.log('🛑 Selected Address Before Saving:', selectedAddress)

    const newOrder = new Order({
      orderId: uniqueOrderId,
      userId: userId,
      shippingAddress: selectedAddress,
      paymentMethod: paymentMethod,
      items: cart.map((item) => ({
        productId: item.productId._id,
        quantity: item.quantity,
        price: item.productId.salePrice,
        productImage: item.productId.productImage,
      })),
      totalBeforeDiscount: totalBeforeDiscount,
      discount: totalDiscount,
      totalAmount: finalTotal,
      status: 'Pending',
      couponApplied: appliedCoupon || null,
    });

    await newOrder.save();

    // ✅ Reduce stock quantity for purchased items
    for (const item of cart) {
      const product = await Product.findById(item.productId._id);
      if (product && product.stock >= item.quantity) {
        product.stock -= item.quantity;
        await product.save();
      }
    }

    // ✅ Clear user cart after order completion
    req.session.cart = [];
    req.session.save((err) => {
      if (err) console.error('Error saving session:', err);
    });

    user.cart = [];
    await user.save();

    // ✅ Redirect to order success page
    res.redirect(`/order-success/${newOrder._id}`);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: 'Server error' });
  }
};






const applyCoupon = async (req, res) => {
  try {
    const { couponCode, totalAmount } = req.body;

    if (!couponCode) {
      return res.json({
        success: false,
        message: 'Please enter a coupon code.',
      });
    }

    // Find coupon in DB
    const coupon = await Coupon.findOne({ code: couponCode });

    if (!coupon) {
      return res.json({ success: false, message: 'Invalid coupon code.' });
    }

    // Check if coupon is expired
    const currentDate = new Date();
    if (coupon.expiry < currentDate) {
      return res.json({ success: false, message: 'Coupon has expired.' });
    }

    let discountAmount = 0;
    let newTotal = totalAmount;

    // Apply Discount Based on Type
    if (coupon.discountType === 'percentage') {
      discountAmount = (totalAmount * coupon.discount) / 100;
    } else if (coupon.discountType === 'flat') {
      discountAmount = coupon.discount;
    }

    newTotal = totalAmount - discountAmount;

    // Prevent negative total and apply minimum amount of 0
    if (newTotal < 0) newTotal = 0;

    // Round the new total and discount for display consistency (optional)
    discountAmount = parseFloat(discountAmount.toFixed(2));
    newTotal = parseFloat(newTotal.toFixed(2));

    return res.json({
      success: true,
      newTotal,
      discountAmount,
      message: 'Coupon applied successfully!',
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const removeCoupon = (req, res) => {
  try {
    const { totalAmount } = req.body; // Ensure this matches frontend
    res.json({
      success: true,
      newTotal: totalAmount,
      message: 'Coupon removed!',
    });
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({ success: false, message: 'Server error!' });
  }
};

module.exports = {
  getCheckoutPage,
  addAddress,
  getEditAddressPage,
  editAddress,
  setDefaultAddress,
  createOrder,
  orderSuccess,
  applyCoupon,
  removeCoupon,
};
