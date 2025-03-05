const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');
const Transaction = require('../../models/transactionSchema');
const mongoose = require('mongoose');

const orderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;

    console.log('Fetching order with ID:', orderId); // Debugging

    const order = await Order.findById(orderId)
      .populate({
        path: 'shippingAddress',
        model: 'UserAddress',
      })
      .populate('items.productId');

    if (!order) {
      console.log('Order not found in database'); // Debugging
      return res.status(404).render('orderNotFound');
    }

    if (!order.shippingAddress) {
      console.error('Shipping Address not found for order:', orderId);
    }

    console.log('Fetched Order:', order); // Debugging
    res.render('order-details', { order });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.redirect('/pageNotFound');
  }
};

// Update order status route
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status, reason } = req.body;

    if (!orderId || !status) {
      return res
        .status(400)
        .json({ success: false, message: 'Missing required fields' });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    // Save cancellation reason
    if (status === 'Cancelled') {
      order.cancellationReason = reason;
    }

    // Handle Razorpay refund logic
    let refundMessage = '';
    if (status === 'Cancelled' && order.paymentMethod === 'Razorpay') {
      refundMessage = 'Your payment will be added to your wallet in 24 hours.';
      order.refundStatus = 'Processing'; // You can later implement a real refund process
    }

    order.status = status;
    await order.save();

    res.json({
      success: true,
      message: 'Order status updated',
      paymentMethod: order.paymentMethod,
      refundMessage,
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Render the cancellation page
const getCancelOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) {
      return res.status(404).send('Order not found');
    }
    res.render('cancel-order', { order });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
};

const getReturnOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) {
      return res.status(404).send('Order not found');
    }
    res.render('return-order', { order });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
};

// Handle cancellation request
const cancelOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;

    console.log('Received orderId:', orderId);

    // Find the order by orderId
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    // If payment is Razorpay, return a refund message
    if (order.paymentMethod === 'razorpay') {
      return res.json({
        success: true,
        message:
          'Your payment will be credited to your wallet within 24 hours.',
        paymentMethod: 'razorpay',
        requiresConfirmation: true, // Flag to indicate refund confirmation is needed
      });
    }

    // For COD, directly cancel the order
    order.status = 'Cancelled';
    order.cancellationReason = reason;
    await order.save();

    res.json({
      success: true,
      message: 'Your order has been cancelled successfully.',
      paymentMethod: 'cod',
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const confirmCancelOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;

    console.log('📌 Received cancellation request for Order ID:', orderId);
    console.log('📌 Cancellation Reason:', reason);

    // Fetch order and populate user data
    const order = await Order.findOne({ orderId }).populate('userId');

    if (!order) {
      console.log('❌ Order not found:', orderId);
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    if (order.status === 'Cancelled') {
      console.log('⚠️ Order is already cancelled:', orderId);
      return res.json({
        success: false,
        message: 'Order is already cancelled',
      });
    }

    console.log('✅ Order found:', order._id);
    console.log('🔍 Current Order Status:', order.status);

    // Update order status to "Cancelled"
    order.status = 'Cancelled';
    order.cancellationReason = reason;
    await order.save();

    console.log("✅ Order status updated to 'Cancelled' for:", orderId);

    // ✅ Process wallet refund if payment was done via Razorpay
    if (order.paymentMethod === 'razorpay') {
      console.log('💳 Payment Method is Razorpay, initiating refund...');

      // Ensure user exists
      const user = order.userId;
      if (!user) {
        console.log('❌ User not found for Order ID:', orderId);
        return res
          .status(404)
          .json({ success: false, message: 'User not found' });
      }

      console.log('👤 User found:', user._id);
      console.log('💰 User Wallet Before Refund:', user.wallet);
      console.log('💵 Refund Amount:', order.totalAmount);

      // Validate refund amount
      if (!order.totalAmount || order.totalAmount <= 0) {
        console.log('❌ Invalid refund amount.');
        return res
          .status(400)
          .json({ success: false, message: 'Invalid refund amount.' });
      }

      // ✅ Add refund to wallet
      user.wallet += order.totalAmount;

      // ✅ Save transaction in wallet history
      user.walletHistory.push({
        amount: order.totalAmount,
        type: 'credit',
        description: `Refund for cancelled order #${orderId}`,
        date: new Date(),
      });

      console.log('🔄 Saving updated wallet...');
      await user.save();
      console.log('✅ Wallet updated. New Balance:', user.wallet);

      // ✅ Save refund transaction in Transactions collection
      const refundTransaction = new Transaction({
        transactionId: new mongoose.Types.ObjectId().toString(), // ✅ Generate a unique string ID
        user: user._id,
        transactionType: 'credit',
        amount: order.totalAmount,
        description: `Refund for cancelled order #${orderId}`,
        date: new Date(),
        source: 'refund',
        orderId: order._id,
      });

      console.log(
        '📝 Attempting to save refund transaction:',
        refundTransaction
      );

      try {
        await refundTransaction.save();
        console.log('✅ Refund transaction saved successfully!');
      } catch (error) {
        console.error('❌ Error saving refund transaction:', error);
        return res.status(500).json({
          success: false,
          message: 'Error processing refund transaction.',
        });
      }

      return res.json({
        success: true,
        message: `Your Razorpay payment has been refunded. ₹${order.totalAmount} has been credited to your wallet.`,
        walletBalance: user.wallet,
        refundStatus: 'Processed',
      });
    }

    console.log('⚠️ No refund processed (COD or other payment method).');
    return res.json({
      success: true,
      message: 'Your order has been cancelled successfully.',
      paymentMethod: order.paymentMethod,
      refundStatus: 'No Refund (COD or other payment method)',
    });
  } catch (error) {
    console.error('❌ Error confirming cancellation:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const returnOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;

    console.log('Received orderId:', orderId);

    // Find the order by orderId
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    // Update order status and reason
    order.status = 'Reurn Requested';
    order.cancellationReason = reason;
    await order.save();

    // Return refund message for both payment methods
    if (order.paymentMethod === 'razorpay') {
      return res.json({
        success: true,
        message: ' The refund will be credited to your wallet within 24 hours.',
        paymentMethod: 'razorpay',
        refundStatus: 'Processing',
      });
    } else if (order.paymentMethod === 'cod') {
      return res.json({
        success: true,
        message:
          'If you have made any advance payment, it will be refunded to your wallet within 24 hours.',
        paymentMethod: 'cod',
        refundStatus: 'Processing',
      });
    }
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const confirmReturnOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    // Update order status to "Return Requested"
    order.status = 'Return Requested';
    order.returnReason = reason;
    await order.save();

    res.json({
      success: true,
      message:
        'Return request submitted successfully. Your refund will be processed after verification.',
    });
  } catch (error) {
    console.error('Error returning order:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

module.exports = {
  orderDetails,
  updateOrderStatus,
  getCancelOrder,
  cancelOrder,
  confirmCancelOrder,
  returnOrder,
  getReturnOrder,
  confirmReturnOrder,
};
