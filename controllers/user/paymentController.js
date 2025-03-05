const Razorpay = require('razorpay');
const paypal = require('paypal-rest-sdk');
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const path = require('path');
const Order = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');
const mongoose = require('mongoose');
const User = require('../../models/userSchema');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
console.log('🔑 Razorpay Key ID:', process.env.RAZORPAY_KEY_ID);
console.log(
  '🔑 Razorpay Key Secret:',
  process.env.RAZORPAY_KEY_SECRET ? 'Loaded ✅' : 'Not Loaded ❌'
);

const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency, paymentMethod, shippingAddressId } = req.body;

    if (!shippingAddressId) {
      return res.status(400).json({
        success: false,
        message: 'Shipping address is missing. Please add an address.',
      });
    }

    // ✅ Fetch the selected address from the Address model
    const selectedAddress = await Address.findById(shippingAddressId);

    if (!selectedAddress) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid shipping address.' });
    }

    const orderId = `order_${Date.now()}`;

    const options = {
      amount: amount * 100, // Convert to paise if INR
      currency,
      receipt: orderId,
    };

    const order = await razorpay.orders.create(options);

    const newOrder = new Order({
      userId: req.user.id,
      orderId,
      razorpay_order_id: order.id,
      paymentMethod,
      totalAmount: amount,
      currency: order.currency,
      paymentStatus: 'Pending',
      shippingAddress: selectedAddress, // ✅ Save Address
    });

    await newOrder.save();

    res.json({ success: true, order });
  } catch (error) {
    console.error('❌ Error creating Razorpay order:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

//

const verifyPayment = async (req, res) => {
  try {
    const { order_id, payment_id, signature } = req.body;

    // Fetch the order from the database
    const order = await Order.findOne({ razorpay_order_id: order_id });

    if (!order) {
      console.error(`⚠ Order not found for Razorpay Order ID: ${order_id}`);
      return res
        .status(400)
        .json({ success: false, message: 'Order not found in database' });
    }

    // Verify the Razorpay signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${order_id}|${payment_id}`)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.error(`⚠ Invalid payment signature`);
      return res
        .status(400)
        .json({ success: false, message: 'Invalid payment signature' });
    }

    // ✅ Update order status to 'Paid'
    order.paymentStatus = 'Paid';
    order.razorpay_payment_id = payment_id;
    await order.save();

    // ✅ Clear user's cart inside the users collection
    await User.updateOne(
      { _id: order.userId },
      { $set: { cart: [] } } // Set cart to an empty array
    );

    res.json({
      success: true,
      message: 'Payment verified successfully',
      orderId: order._id,
    });
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    res
      .status(500)
      .json({ success: false, message: 'Payment verification failed' });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const { order_id, paymentStatus } = req.body;

    // Find the order and update the payment status
    const order = await Order.findOne({ razorpay_order_id: order_id });

    if (!order) {
      return res
        .status(400)
        .json({ success: false, message: 'Order not found' });
    }

    order.paymentStatus = paymentStatus;
    await order.save();

    res.json({ success: true, message: 'Payment status updated successfully' });
  } catch (error) {
    console.error('Error updating payment status:', error);
    res
      .status(500)
      .json({ success: false, message: 'Failed to update payment status' });
  }
};

const razorpayWebhookHandler = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Get Razorpay signature from headers
    const razorpaySignature = req.headers['x-razorpay-signature'];

    // Validate the webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(req.body)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid signature' });
    }

    // Extract event details
    const event = JSON.parse(req.body);

    console.log('Received Webhook Event:', event.event);

    // Handle different event types
    if (event.event === 'payment.captured') {
      const { order_id, status } = event.payload.payment.entity;

      // Find the order in DB and update status
      await Order.findOneAndUpdate(
        { razorpayOrderId: order_id },
        { status: 'Paid' }
      );

      console.log(`Order ${order_id} updated to ${status}`);
    }

    return res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (error) {
    console.error('Webhook Handling Error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const generateInvoice = (req, res) => {
  const { orderId, amount, paymentId } = req.body;

  const doc = new PDFDocument();
  const filePath = path.join(__dirname, `../invoices/invoice_${orderId}.pdf`);

  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(18).text('Invoice', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text(`Order ID: ${orderId}`);
  doc.text(`Payment ID: ${paymentId}`);
  doc.text(`Amount: ₹${amount}`);
  doc.text(`Date: ${new Date().toLocaleString()}`);

  doc.end();

  res.download(filePath, `invoice_${orderId}.pdf`);
};

const paymentFailed = async (req, res) => {
  const { order_id } = req.body;

  try {
    const order = await Order.findOne({ orderId: order_id });

    if (order) {
      order.paymentStatus = 'Failed';
      order.status = 'Cancelled'; // or any other status you want to set for failed payments
      await order.save();
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ success: false, message: 'Order not found' });
    }
  } catch (error) {
    console.error('Error handling failed payment:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Fetch order details from DB
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Create PDF
    const doc = new PDFDocument();
    const filePath = `./invoices/invoice_${orderId}.pdf`;
    const writeStream = fs.createWriteStream(filePath);

    doc.pipe(writeStream);
    doc.text(`Invoice for Order: ${orderId}`);
    doc.text(`Total: ${order.totalAmount}`);
    doc.end();

    writeStream.on('finish', () => {
      res.download(filePath);
    });
  } catch (error) {
    console.error('Invoice Error:', error);
    res.status(500).json({ message: 'Failed to generate invoice' });
  }
};

const rePayment = async (req, res) => {
  try {
    let { orderId } = req.params;
    console.log('Retrying payment for Order ID:', orderId);

    // Find order using orderId (not _id)
    const order = await Order.findOne({ orderId: orderId });

    if (!order) {
      console.log('Order not found with orderId:', orderId);
      return res.status(404).send('Order not found');
    }

    console.log('Order found:', order);

    // Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Razorpay order options
    const options = {
      amount: order.totalAmount * 100, // Amount in paise (1 INR = 100 paise)
      currency: 'INR',
      receipt: order.orderId, // Use existing orderId
    };

    console.log('Creating Razorpay order...');

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create(options);
    console.log('Razorpay order created successfully:', razorpayOrder);

    // Render retryPayment.ejs
    res.render('retryPayment', {
      razorpayKey: process.env.RAZORPAY_KEY_ID,
      orderId: order.orderId,
      razorpayOrderId: razorpayOrder.id,
      totalAmount: order.totalAmount,
      amount: options.amount,
    });
  } catch (error) {
    console.error('Error in retry payment:', error);

    // Handle Razorpay API errors
    if (error.statusCode === 502) {
      return res
        .status(502)
        .send(
          'Razorpay Service is Temporarily Unavailable. Please try again later.'
        );
    }

    res.status(500).send('Internal Server Error');
  }
};

const paymentSuccess = async (req, res) => {
  try {
    const { orderId, paymentId } = req.query;
    console.log(`🔹 Received Order ID: ${orderId}, Payment ID: ${paymentId}`);

    if (!orderId) {
      console.log('❌ Missing orderId in request!');
      return res.json({ success: false, message: 'Order ID missing' });
    }

    const order = await Order.findOne({ orderId });

    if (!order) {
      console.log(`❌ Order not found with ID: ${orderId}`);
      return res.json({ success: false, message: 'Order not found' });
    }

    order.paymentStatus = 'Paid';
    order.razorpayPaymentId = paymentId;
    await order.save();

    console.log('✅ Payment status updated successfully!');
    res.json({ success: true, orderId });
  } catch (error) {
    console.error('❌ Error in paymentSuccess:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

module.exports = {
  createRazorpayOrder,
  verifyPayment,
  generateInvoice,
  downloadInvoice,
  updatePaymentStatus,

  rePayment,

  paymentFailed,
  razorpayWebhookHandler,
  paymentSuccess,
};
