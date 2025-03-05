const mongoose = require('mongoose');
const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

exports.listOffers1 = (req, res) => {
  res.render('offers1', { currentPage: 'offers1' });
};
// Get All Product Offers
exports.getProductOffers = async (req, res) => {
  try {
    const pdtOffers = await Offer.find({ type: 'product' }).populate(
      'productId'
    );
    const products = await Product.find(); // Fetch all products separately

    res.render('productOffer', { pdtOffers, products, currentPage: 'offers1' }); // Pass both to EJS
  } catch (error) {
    console.error('Error fetching product offers:', error);
    res.redirect('/admin/dashboard');
  }
};

// Add Product Offer
// exports.addProductOffer = async (req, res) => {
//   try {
//       const { productId, discountPercentage, startDate, endDate } = req.body;

//       const product = await mongoose.model("products").findById(productId);
//       if (!product) return res.redirect("/admin/product-offers");

//       // Save Offer in Offer Collection
//       const newOffer = new Offer({
//           type: "product",
//           productId,
//           discountPercentage,
//           startDate,
//           endDate,
//           isActive: true,
//       });

//       const savedOffer = await newOffer.save();

//       // ✅ Link Offer to Product (Do not store `offerPrice` in the product itself)
//       product.pdtOffer = savedOffer._id;
//       await product.save();

//       res.redirect("/admin/product-offers");
//   } catch (error) {
//       console.error(error);
//       res.redirect("/admin/dashboard");
//   }
// };

// exports.addProductOffer = async (req, res) => {
//   try {
//     const { productId, discountValue, expiry } = req.body;

//     if (!productId || !discountValue || !expiry) {
//       console.log("Missing required fields:", { productId, discountValue, expiry });
//       return res.redirect("/admin/product-offers");
//     }

//     const product = await Product.findById(productId);
//     if (!product) {
//       console.log("Product not found for ID:", productId);
//       return res.redirect("/admin/product-offers");
//     }

//     console.log("Product details before updating:", product);

//     // Validate product price before applying the discount
//     if (!product.salePrice || isNaN(product.salePrice)) {
//       console.log("Error: Product price is missing or invalid:", product.price);
//       return res.redirect("/admin/product-offers");
//     }

//     if (!discountValue || isNaN(discountValue)) {
//       console.log("Error: Discount value is missing or invalid:", discountValue);
//       return res.redirect("/admin/product-offers");
//     }

//     // Calculate discount
//     const discountAmount = (product.salePrice * discountValue) / 100;
//     const newFinalPrice = product.salePrice - discountAmount;

//     console.log("Calculated discount:", discountAmount);
//     console.log("New final price:", newFinalPrice);

//     if (isNaN(newFinalPrice)) {
//       console.log("Error: newFinalPrice is NaN. Debug:", { productPrice: product.salePrice, discountValue });
//       return res.redirect("/admin/product-offers");
//     }

//     const newOffer = new Offer({
//       type: "product",
//       productId,
//       discountValue,
//       expiry,
//       isActive: true,
//     });

//     const savedOffer = await newOffer.save();

//     // Update product with offer and new final price
//     product.pdtOffer = savedOffer._id;

//     // Ensure finalPrice is always set
// product.finalPrice = newFinalPrice || product.salePrice;

//     console.log("Product before saving:", product);

//     await product.save();

//     res.redirect("/admin/product-offers");
//   } catch (error) {
//     console.error("Error adding product offer:", error);
//     res.redirect("/admin/dashboard");
//   }
// };

// exports.addProductOffer = async (req, res) => {
//   try {
//     const { productId, discountValue, expiry } = req.body;

//     if (!productId || !discountValue || !expiry) {
//       console.log("Missing required fields:", { productId, discountValue, expiry });
//       return res.redirect("/admin/product-offers");
//     }

//     const product = await Product.findById(productId);
//     if (!product) {
//       console.log("Product not found for ID:", productId);
//       return res.redirect("/admin/product-offers");
//     }

//     console.log("Product details before updating:", product);

//     // Validate product price before applying the discount
//     if (!product.salePrice || isNaN(product.salePrice)) {
//       console.log("Error: Product price is missing or invalid:", product.price);
//       return res.redirect("/admin/product-offers");
//     }

//     if (!discountValue || isNaN(discountValue)) {
//       console.log("Error: Discount value is missing or invalid:", discountValue);
//       return res.redirect("/admin/product-offers");
//     }

//     // Calculate discount
//     const discountAmount = (product.salePrice * discountValue) / 100;
//     const newFinalPrice = product.salePrice - discountAmount;

//     console.log("Calculated discount:", discountAmount);
//     console.log("New final price:", newFinalPrice);

//     if (isNaN(newFinalPrice)) {
//       console.log("Error: newFinalPrice is NaN. Debug:", { productPrice: product.salePrice, discountValue });
//       return res.redirect("/admin/product-offers");
//     }

//     const newOffer = new Offer({
//       type: "product",
//       productId,
//       discountValue,
//       expiry,
//       isActive: true,
//     });

//     const savedOffer = await newOffer.save();

//     // Update product with offer and new final price
//     product.pdtOffer = savedOffer._id;

//     // Ensure finalPrice is always set
// product.finalPrice = newFinalPrice || product.salePrice;

//     console.log("Product before saving:", product);

//     await product.save();

//     res.redirect("/admin/product-offers");
//   } catch (error) {
//     console.error("Error adding product offer:", error);
//     res.redirect("/admin/dashboard");
//   }
// };

exports.addProductOffer = async (req, res) => {
  try {
    const { productId, discountValue, expiry } = req.body;

    if (!productId || !discountValue || !expiry) {
      return res.json({
        success: false,
        message: 'Please fill all required fields.',
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.json({ success: false, message: 'Product not found.' });
    }

    // Check if there's any active offer for this product
    const existingOffer = await Offer.findOne({
      productId,
      type: 'product',
      expiry: { $gte: new Date() }, // Ensure the offer is still valid
    });

    if (existingOffer) {
      return res.json({
        success: false,
        message: 'This product already has an active offer.',
      });
    }

    // Validate discount value
    if (!discountValue || isNaN(discountValue)) {
      return res.json({
        success: false,
        message: 'Discount value is invalid.',
      });
    }

    // Calculate discount
    const discountAmount = (product.salePrice * discountValue) / 100;
    const newFinalPrice = product.salePrice - discountAmount;

    const newOffer = new Offer({
      type: 'product',
      productId,
      discountValue,
      expiry,
      discountType: 'percentage', // Assuming percentage discount for simplicity
    });

    await newOffer.save();

    // Update product with the new offer
    product.pdtOffer = newOffer._id;
    product.finalPrice = newFinalPrice || product.salePrice;
    await product.save();

    res.json({ success: true, message: 'Offer added successfully.' });
  } catch (error) {
    console.error('Error adding product offer:', error);
    res.json({
      success: false,
      message: 'An error occurred while adding the offer.',
    });
  }
};

exports.addCategoryOffer = async (req, res) => {
  try {
    const { categoryId, discountValue, expiry } = req.body;

    if (!categoryId || !discountValue || !expiry) {
      return res.json({
        success: false,
        message: 'Please fill all required fields.',
      });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.json({ success: false, message: 'Category not found.' });
    }

    // Check if an active offer already exists for this category
    const existingOffer = await Offer.findOne({
      categoryId,
      type: 'category',
      expiry: { $gte: new Date() }, // Ensures the offer is still valid
    });

    if (existingOffer) {
      return res.json({
        success: false,
        message: 'This category already has an active offer.',
      });
    }

    // Validate discount value
    if (!discountValue || isNaN(discountValue)) {
      return res.json({
        success: false,
        message: 'Discount value is invalid.',
      });
    }

    // Create new offer
    const newOffer = new Offer({
      type: 'category',
      categoryId,
      discountValue,
      expiry,
      discountType: 'percentage', // Assuming percentage discount
    });

    await newOffer.save();

    // Assign offer to category
    category.catOffer = newOffer._id;
    await category.save();

    // Apply category discount to all products in this category
    const products = await Product.find({ category: categoryId });

    for (const product of products) {
      const discountAmount = (product.salePrice * discountValue) / 100;
      const newFinalPrice = product.salePrice - discountAmount;

      product.catOffer = newOffer._id;
      product.finalPrice = newFinalPrice || product.salePrice;
      await product.save();
    }

    res.json({ success: true, message: 'Category offer added successfully.' });
  } catch (error) {
    console.error('Error adding category offer:', error);
    res.json({
      success: false,
      message: 'An error occurred while adding the category offer.',
    });
  }
};

// Delete Product Offer
// exports.deleteProductOffer = async (req, res) => {
//   try {
//     await Offer.findByIdAndDelete(req.body.offerId);
//     res.redirect("/admin/product-offers");
//   } catch (error) {
//     console.error(error);
//     res.redirect("/admin/dashboard");
//   }
// };
exports.deleteProductOffer = async (req, res) => {
  try {
    const { offerId } = req.body;
    const offer = await Offer.findById(offerId);

    if (!offer) {
      return res.json({ success: false, message: 'Offer not found.' });
    }

    // Delete the offer using deleteOne or findByIdAndDelete
    await Offer.findByIdAndDelete(offerId); // Using findByIdAndDelete

    // Optionally, remove the offer reference from the product
    const product = await Product.findById(offer.productId);
    if (product) {
      product.pdtOffer = null;
      await product.save();
    }

    res.json({ success: true, message: 'Offer deleted successfully.' });
  } catch (error) {
    console.error('Error deleting product offer:', error);
    res.json({
      success: false,
      message: 'An error occurred while deleting the offer.',
    });
  }
};

exports.deleteCategoryOffer = async (req, res) => {
  try {
    const { offerId } = req.body;

    // Find the offer by ID
    const offer = await Offer.findById(offerId);
    if (!offer) {
      return res.json({ success: false, message: 'Offer not found.' });
    }

    // Delete the offer from the database
    await Offer.findByIdAndDelete(offerId);

    // Optionally, remove the offer reference from the category
    const category = await Category.findById(offer.categoryId);
    if (category) {
      category.catOffer = null;
      await category.save();
    }

    res.json({
      success: true,
      message: 'Category offer deleted successfully.',
    });
  } catch (error) {
    console.error('Error deleting category offer:', error);
    res.json({
      success: false,
      message: 'An error occurred while deleting the offer.',
    });
  }
};

// Get All Category Offers
exports.getCategoryOffers = async (req, res) => {
  try {
    const categories = await Category.find();
    const categoryOffers = await Offer.find({ type: 'category' }).populate(
      'categoryId'
    );
    res.render('categoryOffer', {
      categoryOffers,
      categories,
      currentPage: 'offers1',
    });
  } catch (error) {
    console.error(error);
    res.redirect('/admin/dashboard');
  }
};

// Add Category Offer

// Delete Category Offer
// exports.deleteCategoryOffer = async (req, res) => {
//   try {
//     await Offer.findByIdAndDelete(req.body.offerId);
//     res.redirect("/admin/category-offers");
//   } catch (error) {
//     console.error(error);
//     res.redirect("/admin/dashboard");
//   }
// };

// Get All Referral Offers
exports.getReferralOffers = async (req, res) => {
  try {
    const referralOffers = await Offer.find({ type: 'referral' });
    res.render('referrelOffer', { referralOffers });
  } catch (error) {
    console.error(error);
    res.redirect('/admin/dashboard');
  }
};

// Add Referral Offer
exports.addReferralOffer = async (req, res) => {
  try {
    const { discountPercentage, startDate, endDate } = req.body;

    const newOffer = new Offer({
      type: 'referral',
      discountPercentage,
      startDate,
      endDate,
      isActive: true,
    });

    await newOffer.save();
    res.redirect('/admin/referral-offers');
  } catch (error) {
    console.error(error);
    res.redirect('/admin/dashboard');
  }
};

// Delete Referral Offer
exports.deleteReferralOffer = async (req, res) => {
  try {
    await Offer.findByIdAndDelete(req.body.offerId);
    res.redirect('/admin/referral-offers');
  } catch (error) {
    console.error(error);
    res.redirect('/admin/dashboard');
  }
};

// GET /admin/edit-product-offer/:offerId
// GET /admin/edit-product-offer/:offerId
