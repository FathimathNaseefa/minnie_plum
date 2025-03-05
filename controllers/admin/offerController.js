const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');

// List all offers
const listOffers = async (req, res) => {
  try {
    const productOffers = await Offer.find({ type: 'product' }).populate(
      'productId'
    );
    const categoryOffers = await Offer.find({ type: 'category' }).populate(
      'categoryId'
    );
    const referralOffers = await Offer.find({ type: 'referral' });

    res.render('offer-list', { productOffers, categoryOffers, referralOffers });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
};

// Add Offer Page
const addOfferPage = async (req, res) => {
  // const products = await Product.find();
  const products = await Product.find({}, 'productName _id');
  const categories = await Category.find();
  res.render('add-offer', { products, categories });
};

const createOffer = async (req, res) => {
  try {
    const { type, productId, categoryId, referralCode, discount, expiry } =
      req.body;

    if (!expiry) {
      return res.status(400).send('Expiry date is required');
    }

    const newOffer = new Offer({
      type,
      productId: type === 'product' ? productId : null,
      categoryId: type === 'category' ? categoryId : null,
      referralCode: type === 'referral' ? referralCode : null,
      discount,
      expiry: new Date(expiry), // Ensure correct date format
    });

    await newOffer.save();
    res.redirect('/admin/offers');
  } catch (error) {
    console.error('Error creating offer:', error);
    res.status(500).send('Server Error');
  }
};

// Edit Offer Page
const editOfferPage = async (req, res) => {
  const offer = await Offer.findById(req.params.id);
  const products = await Product.find();
  const categories = await Category.find();
  res.render('admin/edit-offer', { offer, products, categories });
};

// Update Offer
const updateOffer = async (req, res) => {
  try {
    const { discount, expiryDate } = req.body;
    await Offer.findByIdAndUpdate(req.params.id, { discount, expiryDate });
    res.redirect('/admin/offers');
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
};

// Delete Offer
const deleteOffer = async (req, res) => {
  try {
    await Offer.findByIdAndDelete(req.params.id);
    res.redirect('/admin/offers');
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  addOfferPage,
  deleteOffer,
  editOfferPage,
  updateOffer,
  createOffer,
  listOffers,
};
