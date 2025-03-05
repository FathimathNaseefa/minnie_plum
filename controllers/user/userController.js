const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const Swal = require('sweetalert2');
const Offer = require('../../models/offerSchema');

const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const User = require('../../models/userSchema');

const pageNotFound = async (req, res) => {
  try {
    res.render('404page');
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const loadHomepage = async (req, res) => {
  try {
    const user = req.session.user;
    if (user) {
      const userData = await User.findOne({ _id: user });
      res.render('home', { user: userData });
    } else {
      return res.render('home');
    }
  } catch (error) {
    console.log('Home page not found', error);
    res.status(500).send('Server error');
  }
};
const loadSignup = async (req, res) => {
  try {
    return res.render('signup');
  } catch (error) {
    console.log('Home page not loading');
    res.status(500).send('Server Error');
  }
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.USER,
        pass: process.env.PASS,
      },
    });
    const info = await transporter.sendMail({
      from: process.env.USER,
      to: email,
      subject: 'Verify your account',
      text: `Your OTP is:${otp}`,
      html: `<b>Your OTP:${otp}</b>`,
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error('Error sending email', error);
    return false;
  }
}

const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {}
};

const generateReferralCode = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase(); // Generates a random 8-character code
};

// Referral Bonus Amount
const REFERRAL_BONUS = 50;

// Signup Function
const signup = async (req, res) => {
  try {
    const { name, email, phone, password, cPassword, ref } = req.body;

    if (password !== cPassword) {
      return res.render('signup', { message: 'Passwords do not match' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render('signup', {
        message: 'User with this email already exists',
      });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.json('email-error');
    }

    req.session.userOtp = otp;
    req.session.userData = { name, email, phone, password, ref };

    res.render('verifyotp');
    console.log(otp);
  } catch (error) {
    console.error('Signup error:', error);
    res.redirect('/pageNotFound');
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (otp === req.session.userOtp) {
      const { name, email, phone, password, ref } = req.session.userData;
      const passwordHash = await bcrypt.hash(password, 10);

      let referredBy = null;
      let walletBalance = 0;
      let walletHistory = [];

      // Validate referral code and assign ObjectId
      if (ref) {
        const referrer = await User.findOne({ referralCode: ref });
        if (referrer) {
          referredBy = referrer._id; // Store referrer's ID

          // Reward the referrer
          referrer.wallet += REFERRAL_BONUS;
          referrer.walletHistory.push({
            type: 'credit',
            description: `Referral Bonus for referring ${name}`,
            amount: REFERRAL_BONUS,
          });
          await referrer.save();

          // Reward the new user as well
          walletBalance = REFERRAL_BONUS;
          walletHistory.push({
            type: 'credit',
            description: 'Signup Bonus (Referred by ' + referrer.name + ')',
            amount: REFERRAL_BONUS,
          });
        }
      }

      // Create the new user with a valid ObjectId (or null) for referredBy
      const newUser = new User({
        name,
        email,
        phone,
        password: passwordHash,
        referredBy,
        wallet: walletBalance,
        walletHistory,
      });

      await newUser.save();

      req.session.user = newUser._id;
      res.json({ success: true, redirectUrl: '/' });
    } else {
      res
        .status(400)
        .json({ success: false, message: 'Invalid OTP, please try again' });
    }
  } catch (error) {
    console.error('Error Verifying OTP', error);
    res.status(500).json({ success: false, message: 'An error occurred' });
  }
};

const resendOtp = async (req, res) => {
  try {
    const { email } = req.session.userData;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: 'Email not found in session' });
    }
    const otp = generateOtp();
    req.session.userOtp = otp;
    const emailSent = await sendVerificationEmail(email, otp);
    if (emailSent) {
      console.log('Resend OTP:', otp);
      res
        .status(200)
        .json({ success: true, message: 'OTP Resend Successfully' });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to resend OTP,Please try again',
      });
    }
  } catch (error) {
    console.error('Error resending OTP', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error,Please try again',
    });
  }
};

const loadLogin = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.render('login');
    } else {
      res.redirect('/');
    }
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const findUser = await User.findOne({ isAdmin: 0, email: email });

    if (!findUser) {
      return res.render('login', { message: 'User not found' });
    }
    if (findUser.isBlocked) {
      return res.render('login', { message: 'User is blocked by admin' });
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);

    if (!passwordMatch) {
      return res.render('login', { message: 'Incorrect Password' });
    }
    req.session.user = findUser._id;
    res.redirect('/');
  } catch (error) {
    console.error('login error', error);
    res.render('login', { message: 'login failed . Please try again later' });
  }
};

const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.log('Session destruction error', err.message);
        return res.redirect('/pageNotFound');
      }
      return res.redirect('/login');
    });
  } catch (error) {
    console.log('Logout error', error);
    res.redirect('/pageNotFound');
  }
};

const loadShoppingPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const categories = await Category.find({ isListed: true });

    let selectedCategories = req.query.category
      ? req.query.category.split(',')
      : [];
    const sortOption = req.query.sort || 'createdOn';
    const showOutOfStock = req.query.outOfStock === 'true';
    const searchQuery = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    let query = { isBlocked: false, status: 'Available' };

    if (selectedCategories.length > 0) {
      query.category = { $in: selectedCategories };
    }

    if (showOutOfStock) {
      query.stock = { $lte: 0 };
    } else {
      query.stock = { $gt: 0 };
    }

    if (searchQuery) {
      query.productName = { $regex: searchQuery, $options: 'i' };
    }

    let sortCriteria = {};
    switch (sortOption) {
      case 'popularity':
        sortCriteria = { popularity: -1 };
        break;
      case 'price_asc':
        sortCriteria = { salePrice: 1 };
        break;
      case 'price_desc':
        sortCriteria = { salePrice: -1 };
        break;
      case 'ratings':
        sortCriteria = { averageRating: -1 };
        break;
      case 'featured':
        sortCriteria = { featured: -1 };
        break;
      case 'new_arrivals':
        sortCriteria = { createdOn: -1 };
        break;
      case 'a_z':
        sortCriteria = { productName: 1 };
        break;
      case 'z_a':
        sortCriteria = { productName: -1 };
        break;
      default:
        sortCriteria = { createdOn: -1 };
        break;
    }

    // Fetch products
    const products = await Product.find(query)
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit)
      .populate('brand', 'brandName')
      .populate('category')
      .populate('pdtOffer', 'discountValue discountType') // Product Offer
      .populate('catOffer', 'discountValue discountType'); // Category Offer

    // Apply discounts to each product
    products.forEach((product) => {
      let salePrice = product.salePrice;
      let pdtDiscount =
        product.pdtOffer?.discountType === 'percentage'
          ? product.pdtOffer.discountValue
          : 0;
      let catDiscount =
        product.catOffer?.discountType === 'percentage'
          ? product.catOffer.discountValue
          : 0;

      // Use the higher of the two discounts
      let discount = Math.max(pdtDiscount, catDiscount);
      let finalPrice = salePrice - salePrice * (discount / 100);

      // Round the final price
      product.finalPrice = Math.round(finalPrice / 10) * 10;
      product.discountPercent = Math.round(
        ((salePrice - product.finalPrice) / salePrice) * 100
      );
    });

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    res.render('shop', {
      user: userData,
      products,
      categories,
      selectedCategories,
      totalProducts,
      currentPage: page,
      totalPages,
      showOutOfStock,
      sortOption,
      searchQuery,
    });
  } catch (error) {
    console.error('Error loading shopping page:', error);
    res.redirect('/pageNotFound');
  }
};

const filterProduct = async (req, res) => {
  try {
    const user = req.session.user;
    const category = req.query.category;
    const brand = req.query.brand;
    const outOfStock = req.query.outOfStock === 'true'; // Check if user wants out-of-stock products

    const findCategory = category
      ? await Category.findOne({ _id: category })
      : null;
    const findBrand = brand ? await Brand.findOne({ _id: brand }) : null;
    const brands = await Brand.find({}).lean();

    let query = { isBlocked: false };

    // Apply stock filter
    if (!outOfStock) {
      query.stock = { $gt: 0 }; // Show only in-stock products
    } else {
      query.stock = 0; // Show only out-of-stock products
    }

    if (findCategory) {
      query.category = findCategory._id;
    }
    if (findBrand) {
      query.brand = findBrand.brandName;
    }

    let findProducts = await Product.find(query).lean();
    findProducts.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));

    const categories = await Category.find({ isListed: true });

    let itemsPerPage = 6;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(findProducts.length / itemsPerPage);

    let currentProduct = findProducts.slice(startIndex, endIndex);
    let userData = null;

    if (user) {
      userData = await User.findOne({ _id: user });
      if (userData) {
        const searchEntry = {
          category: findCategory ? findCategory._id : null,
          brand: findBrand ? findBrand.brandName : null,
          searchedOn: new Date(),
        };
        userData.searchHistory.push(searchEntry);
        await userData.save();
      }
    }

    req.session.filteredProducts = currentProduct;
    res.render('shop', {
      user: userData,
      products: currentProduct,
      category: categories,
      brand: brands,
      totalPages,
      currentPage,
      selectCategory: category || null,
      selectedBrand: brand || null,
      outOfStock, // Pass outOfStock value to frontend
    });
  } catch (error) {
    console.error('Error in filterProduct:', error);
    res.redirect('/pageNotFound');
  }
};

const filterByPrice = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = await User.findOne({ _id: user });
    const brands = await Brand.find({}).lean();
    const categories = await Category.find({ isListed: true }).lean();

    let findProducts = await Product.find({
      salePrice: { $gt: req.query.gt, $lt: req.query.lt },
      isBlocked: false,
      quantity: { $gt: 0 },
    }).lean();

    findProducts.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));

    let itemsPerPage = 6;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(findProducts.lenght / itemsPerPage);
    let currentProduct = findProducts.slice(startIndex, endIndex);
    req.session.filteredProducts = findProducts;

    res.render('shop', {
      user: userData,
      products: currentProduct,
      category: categories,
      brand: brands,
      totalPages,
      currentPage,
    });
  } catch (error) {
    console.log(error);
    res.redirect('/pageNotFound');
  }
};

const searchProducts = async (req, res) => {
  try {
    const { query, category } = req.query;
    let searchQuery = { productName: { $regex: '^' + query, $options: 'i' } }; // Case-insensitive search

    if (category) {
      searchQuery.category = category; // Filter by category if selected
    }

    const products = await Product.find(searchQuery).populate('category');
    res.json(products); // Return JSON response
  } catch (error) {
    console.error('Error in search:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Route definition

module.exports = {
  loadHomepage,
  loadSignup,
  signup,
  verifyOtp,
  resendOtp,
  pageNotFound,
  loadLogin,
  login,
  loadShoppingPage,
  filterProduct,
  filterByPrice,
  searchProducts,
  logout,
};
