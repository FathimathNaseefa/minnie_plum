const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const mongodb = require('mongodb');
const mongoose = require('mongoose');
const env = require('dotenv').config();
const crypto = require('crypto');

const { v4: uuidv4 } = require('uuid');

const getOrderListPageAdmin = async (req, res) => {
  try {
    const orders = await Order.find({})
      .populate('userId') // Populate userId field
      .sort({ createdOn: -1 }); // Sort by createdOn in descending order

    let itemsPerPage = 5;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(orders.length / itemsPerPage);

    // Filter orders to remove ones with missing users
    const validOrders = orders.filter((order) => order.userId !== null);
    const currentOrder = validOrders.slice(startIndex, endIndex);

    res.render('order-list', { orders: currentOrder, totalPages, currentPage });
  } catch (error) {
    console.error(error);
    res.redirect('/pageerror');
  }
};

const changeOrderStatus = async (req, res) => {
  try {
    console.log('🔥 Request received for /changeOrderStatus');
    console.log('🔹 Request Body:', req.body);

    const { orderId, status } = req.body;

    if (!orderId || !status) {
      console.log('❌ Missing orderId or status');
      return res.status(400).json({ error: 'Missing orderId or status.' });
    }

    await Order.updateOne({ _id: orderId }, { status });

    console.log(`✅ Order ${orderId} status updated to ${status}`);

    return res
      .status(200)
      .json({ message: 'Order status updated successfully!' }); // ✅ Send success response
  } catch (error) {
    console.error('❌ Error updating order status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getOrderDetailsPageAdmin = async (req, res) => {
  try {
    const orderId = req.query.id;
    console.log('Received Order ID:', orderId);

    // Check if orderId is a receipt ID (order_rcptid_XXX) or MongoDB _id
    let findOrder;
    if (orderId.startsWith('order_rcptid_')) {
      findOrder = await Order.findOne({ orderId }); // Search by orderId
    } else {
      findOrder = await Order.findById(orderId); // Search by _id
    }

    if (!findOrder) {
      console.log('Order not found!');
      return res.redirect('/pageerror');
    }

    if (
      !findOrder.items ||
      !Array.isArray(findOrder.items) ||
      findOrder.items.length === 0
    ) {
      console.log('Order has no items!');
      return res.redirect('/pageerror');
    }

    let totalGrant = findOrder.items.reduce(
      (acc, val) => acc + val.price * val.quantity,
      0
    );
    const discount = totalGrant - findOrder.totalAmount;

    res.render('order-details-admin', {
      orders: findOrder,
      orderId: orderId,
      finalAmount: findOrder.totalAmount,
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.redirect('/pageerror');
  }
};

// 🛒 Place Order (Only COD)
const placeOrder = async (req, res) => {
  try {
    const { userId, products } = req.body;
    let totalAmount = 0;

    for (const item of products) {
      const product = await Product.findById(item.productId);
      if (!product || product.stock < item.quantity) {
        return res
          .status(400)
          .json({ error: `Insufficient stock for ${product?.name}` });
      }

      totalAmount += product.price * item.quantity;
      product.stock -= item.quantity; // ✅ Reduce stock when order is placed
      await product.save();
    }

    const newOrder = new Order({
      userId,
      products,
      totalAmount,
      paymentStatus: 'Pending',
      orderStatus: 'Pending',
      payment: 'cod', // ✅ Only COD Payment
    });

    await newOrder.save();
    res.json({ message: 'Order placed successfully', order: newOrder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body; // Extract orderId from the request body

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    const findOrder = await Order.findOne({ _id: orderId });

    if (!findOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (findOrder.status === 'Cancelled') {
      return res
        .status(400)
        .json({ error: 'This order has already been cancelled.' });
    }

    findOrder.status = 'Cancelled';
    await findOrder.save();

    // Restore product stock
    for (const productData of findOrder.items) {
      // Use `items` instead of `products`
      const product = await Product.findById(productData._id);
      if (product) {
        product.stock += productData.quantity;
        await product.save();
      }
    }

    return res.status(200).json({ message: 'Order cancelled successfully' });
  } catch (error) {
    console.error('Error in cancelOrder:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Get Inventory Page
const getInventory = async (req, res) => {
  try {
    const inventory = await Product.find().select(
      'productName size color stock'
    );
    res.render('inventory', { inventory, currentPage: 'inventory' });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
};

const updateStock = async (req, res) => {
  try {
    console.log('Received Request Body:', req.body); // Debugging log

    const { productId, newStock } = req.body;

    if (!productId || isNaN(newStock) || newStock < 0) {
      return res
        .status(400)
        .json({ error: 'Invalid stock value or product ID' });
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      { stock: newStock },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.redirect('/admin/inventory');
  } catch (err) {
    console.error('Stock update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getReturnRequests = async (req, res) => {
  try {
    const returnOrders = await Order.find({
      status: 'Return Requested',
    }).populate('userId');
    res.render('admin/returnRequests', { returnOrders });
  } catch (error) {
    console.error('Error fetching return requests:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const acceptReturn = async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    const order = await Order.findById(orderId);

    // Find the specific product in the order and update its return status
    const productIndex = order.items.findIndex(
      (item) => item.productId.toString() === productId
    );
    if (productIndex === -1) {
      return res.status(404).json({ message: 'Product not found in order.' });
    }

    order.items[productIndex].returnStatus = 'Accepted'; // Add a returnStatus field to your schema
    await order.save();

    res.redirect(`/admin/order-details/${orderId}`);
  } catch (error) {
    console.error('Error accepting return:', error);
    res.redirect('/admin/orders');
  }
};

const rejectReturn = async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    const order = await Order.findById(orderId);

    // Find the specific product in the order and update its return status
    const productIndex = order.items.findIndex(
      (item) => item.productId.toString() === productId
    );
    if (productIndex === -1) {
      return res.status(404).json({ message: 'Product not found in order.' });
    }

    order.items[productIndex].returnStatus = 'Rejected'; // Add a returnStatus field to your schema
    await order.save();

    res.redirect(`/admin/order-details/${orderId}`);
  } catch (error) {
    console.error('Error rejecting return:', error);
    res.redirect('/admin/orders');
  }
};

const Transaction = require('../../models/transactionSchema');

const returnStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  console.log('📌 Received orderId:', orderId);
  console.log('📌 Received status:', status);

  try {
    // Find and update order status
    const updatedOrder = await Order.findOneAndUpdate(
      { _id: orderId },
      { status },
      { new: true }
    ).populate('userId');

    if (!updatedOrder) {
      console.log('❌ Order not found.');
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    console.log('✅ Order updated:', updatedOrder);

    // ✅ If return is accepted, process refund for both Razorpay & COD payments
    if (
      status === 'Return accepted' &&
      (updatedOrder.paymentMethod === 'razorpay' ||
        updatedOrder.paymentMethod === 'cod')
    ) {
      const user = updatedOrder.userId;

      if (!user) {
        console.log('❌ User not found for order:', updatedOrder._id);
        return res
          .status(404)
          .json({ success: false, message: 'User not found' });
      }

      console.log('👤 User found:', user._id);
      console.log('💰 User Wallet Before Refund:', user.wallet);
      console.log('💵 Refund Amount:', updatedOrder.totalAmount);

      if (!updatedOrder.totalAmount || updatedOrder.totalAmount <= 0) {
        console.log('❌ Invalid refund amount.');
        return res
          .status(400)
          .json({ success: false, message: 'Invalid refund amount.' });
      }

      // ✅ Add refund to wallet
      user.wallet += updatedOrder.totalAmount;

      // ✅ Save transaction in user's wallet history
      user.walletHistory.push({
        amount: updatedOrder.totalAmount,
        type: 'credit',
        description: `Refund for returned order #${updatedOrder._id}`,
        date: new Date(),
      });

      console.log('🔄 Saving updated wallet...');
      await user.save();
      console.log('✅ Wallet updated. New Balance:', user.wallet);

      // ✅ Save refund transaction in transactions collection
      const refundTransaction = new Transaction({
        transactionId: `txn_${Date.now()}`, // ✅ Generate a unique transactionId
        user: user._id,
        transactionType: 'credit',
        amount: updatedOrder.totalAmount,
        description: `Refund for returned order #${updatedOrder._id}`,
        date: new Date(),
        source: 'refund',
        orderId: updatedOrder._id,
      });

      await refundTransaction.save();
      console.log('✅ Refund transaction saved:', refundTransaction);

      return res.json({
        success: true,
        message: `Return approved. ₹${updatedOrder.totalAmount} has been credited to your wallet.`,
        walletBalance: user.wallet,
        order: updatedOrder,
      });
    }

    res.json({
      success: true,
      message: 'Status updated successfully',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const orderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;

    // Find the order and populate user and product details
    const order = await Order.findById(orderId)
      .populate('user', 'name email phone') // Fetch user details
      .populate('items.product', 'name price'); // Fetch product details

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.render('admin/orderDetails', { order }); // Send data to admin EJS page
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// 📌 Export Functions
module.exports = {
  getOrderListPageAdmin,
  changeOrderStatus,
  getOrderDetailsPageAdmin,
  placeOrder,
  cancelOrder,
  getInventory,
  updateStock,
  rejectReturn,
  acceptReturn,
  returnStatus,
  orderDetails,
};
