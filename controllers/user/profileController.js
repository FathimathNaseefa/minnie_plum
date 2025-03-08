const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../../models/userSchema');
const session = require('express-session');
const Address = require('../../models/addressSchema');
const user = require('./userController');
const Order = require('../../models/orderSchema');
require('dotenv').config();

function generateOtp() {
  const digits = '1234567890';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

const sendVerificationEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.USER ,
        pass: process.env.PASS,
      },
    });

    const mailOptions = {
      from: 'naseefabroto@gmail.com',
      to: email,
      subject: 'Your otp for email change',
      text: `Your OTP is:${otp}`,
      html: `<b>Your OTP:${otp}</b>`,
    };
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email', error);
    return false;
  }
};

const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {}
};

const getForgotPassPage = async (req, res) => {
  try {
    res.render('forgot-password');
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const forgotEmailValid = async (req, res) => {
  try {
    const { email } = req.body;
    const findUser = await User.findOne({ email: email });
    if (findUser) {
      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email, otp);
      if (emailSent) {
        req.session.userOtp = otp;
        req.session.email = email;
        res.render('forgotPass-otp');
        console.log('OTP', otp);
      } else {
        res.json({
          success: false,
          message: 'Failed to send OTP.Please try again',
        });
      }
    } else {
      res.render('forgot-password', {
        message: 'User with this email does not exist',
      });
    }
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const verifyForgotPassOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    if (enteredOtp === req.session.userOtp) {
      return res.json({
        success: true,
        redirectUrl: '/reset-password', // Ensure this matches your route
      });
    } else {
      return res.json({
        success: false,
        message: 'OTP not matching',
      });
    }
  } catch (error) {
    console.error('Error in verifyChangePassOtp:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred, please try again later',
    });
  }
};

const getResetPassPage = async (req, res) => {
  try {
    res.render('reset-password');
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};
const getUpdatePage = async (req, res) => {
  try {
    // Ensure the user is logged in
    if (!req.session.user) {
      return res.redirect('/login'); // Redirect to login if session is missing
    }

    // Fetch the user data
    const user = await User.findById(req.session.user);
    if (!user) {
      return res.redirect('/pageNotFound');
    }

    res.render('new-email', {
      userData: req.session.userData,
      currentEmail: user.email, // Pass the current email
      message: '',
      successMessage: req.session.successMessage || '',
    });

    // Clear success message after rendering
    req.session.successMessage = '';
  } catch (error) {
    console.error('Error in getUpdateEmail:', error);
    res.redirect('/pageNotFound');
  }
};

const resendOtp = async (req, res) => {
  try {
    const otp = generateOtp();
    const email = req.session.email;

    console.log('Resendimg OTP to email', email);
    const emailSent = await sendVerificationEmail(email, otp);

    if (emailSent) {
      req.session.userOtp = newOtp; // Update session with new OTP
      console.log('Resend OTP sent:', otp);

      return res.json({
        success: true,
        message: 'Resed otp successful.',
      });
    } else {
      return res.json({
        success: false,
        message: 'Failed to send OTP. Please try again.',
      });
    }
  } catch (error) {
    console.error('Error resending OTP:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again later.',
    });
  }
};

const postNewPassword = async (req, res) => {
  try {
    const { newPass1, newPass2 } = req.body;
    const email = req.session.email;
    if (newPass1 === newPass2) {
      const passwordHash = await securePassword(newPass1);
      await User.updateOne(
        { email: email },
        { $set: { password: passwordHash } }
      );
      res.redirect('/login');
    } else {
      res.render('reset-password', { message: 'Password do not match' });
    }
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const userProfile = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const addressData = await Address.find({ userId }); // Fetch all addresses

    const userOrders = await Order.find({ userId })
      .populate('items.productId') // Populate product details
      .sort({ createdAt: -1 })
      .lean();

    res.render('profile', {
      user: userData,
      userAddresses: addressData,
      userOrders: userOrders,
      baseUrl: `${req.protocol}://${req.get('host')}`, // Pass base URL
    });
  } catch (error) {
    console.error('Error retrieving profile data:', error);
    res.redirect('/pageNotFound');
  }
};

const changeEmail = async (req, res) => {
  try {
    res.render('change-email');
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const changeEmailValid = async (req, res) => {
  try {
    const { email } = req.body;

    const userExists = await User.findOne({ email });

    if (!userExists) {
      return res.render('change-email', {
        message: 'Email address not found.',
      });
    }

    if (userExists) {
      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email, otp);
      if (emailSent) {
        req.session.userOtp = otp;
        req.session.userData = req.body;
        req.session.email = email;
        res.render('change-email-otp', {
          successMessage: 'OTP sent successfully!',
        });
        console.log('Email sent:', email);
        console.log('OTP', otp);
      } else {
        res.json('email-error');
      }
    } else {
      res.render('change-email', {
        message: 'User with this email not exist',
      });
    }
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const verifyEmailOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    if (enteredOtp === req.session.userOtp) {
      return res.json({
        success: true,
        redirectUrl: '/update-email', // Ensure this matches your route
      });
    } else {
      return res.json({
        success: false,
        message: 'OTP not matching',
      });
    }
  } catch (error) {
    console.error('Error in verifyChangePassOtp:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred, please try again later',
    });
  }
};

const resendEmailOtp = async (req, res) => {
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

const updateEmail = async (req, res) => {
  try {
    const { newEmail } = req.body;
    const userId = req.session.user;

    // Fetch user
    const user = await User.findById(userId);
    if (!user) {
      console.log('Error: User not found');
      return res.json({ success: false, message: 'User not found.' });
    }

    // Validate email format (server-side check)
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailPattern.test(newEmail)) {
      console.log('Error: Invalid email format');
      return res.json({ success: false, message: 'Invalid email format.' });
    }

    // Check if new email is the same as the current email
    if (newEmail.toLowerCase() === user.email.toLowerCase()) {
      console.log('Error: Email already in use by the same user');
      return res.json({
        success: false,
        message: 'This is already your current email.',
      });
    }
    // Check if email already exists (excluding the current user)
    const existingUser = await User.findOne({
      email: newEmail,
      _id: { $ne: req.session.user },
    });

    if (existingUser) {
      return res.json({
        success: false,
        message: 'This email already registered.',
      });
    }

    // Update email
    user.email = newEmail;
    await user.save();

    return res.json({
      success: true,
      message: 'Email updated successfully!',
      redirectUrl: '/userProfile',
    });
  } catch (error) {
    console.error(error);
    res.redirect('/pageNotFound');
  }
};

const changePassword = async (req, res) => {
  try {
    res.render('change-password');
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const changePasswordValid = async (req, res) => {
  try {
    const { email } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) {
      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email, otp);
      if (emailSent) {
        req.session.userOtp = otp;
        req.session.userData = req.body;
        req.session.email = email;
        res.render('change-password-otp');
        console.log('OTP:', otp);
      } else {
        res.json({
          success: false,
          message: 'Failed to send OTP,please enter again',
        });
      }
    } else {
      res.render('change-password', {
        message: 'User with this email does not exist',
      });
    }
  } catch (error) {
    console.error('Error in change password validation', Error);
    res.redirect('/pageNotFound');
  }
};

const verifyChangePassOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    if (enteredOtp === req.session.userOtp) {
      return res.json({
        success: true,
        redirectUrl: '/reset-password', // Ensure this matches your route
      });
    } else {
      return res.json({
        success: false,
        message: 'OTP not matching',
      });
    }
  } catch (error) {
    console.error('Error in verifyChangePassOtp:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred, please try again later',
    });
  }
};

// Route to resend OTP for changing password
const resendChangePassOtp = async (req, res) => {
  try {
    const email = req.session.email;

    if (!email) {
      return res.json({
        success: false,
        message: 'Email not found. Please enter again.',
      });
    }

    const newOtp = generateOtp();
    const emailSent = await sendVerificationEmail(email, newOtp);

    if (emailSent) {
      req.session.userOtp = newOtp; // Update session with new OTP
      console.log('New OTP sent:', newOtp);

      return res.json({
        success: true,
        message: 'A new OTP has been sent to your email.',
      });
    } else {
      return res.json({
        success: false,
        message: 'Failed to send OTP. Please try again.',
      });
    }
  } catch (error) {
    console.error('Error resending OTP:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again later.',
    });
  }
};

const addAddress = async (req, res) => {
  try {
    const user = req.session.user;
    res.render('add-address', { error: null, user }); // Pass null when no error
  } catch (error) {
    console.error('Error loading add address page:', error);
    res.redirect('/pageNotFound');
  }
};

const postAddAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const {
      name,
      addressLine1,
      city,
      state,
      postalCode,
      country,
      phoneNumber,
      isDefault,
    } = req.body;

    const newAddress = new Address({
      userId,
      name,
      addressLine1,
      addressLine2: req.body.addressLine2 || '',
      city,
      state,
      postalCode,
      country,
      phoneNumber,
      isDefault,
    });

    await newAddress.save();

    // Redirect to profile page with query param to stay on "My Address" tab
    res.redirect('/userProfile#address');
  } catch (error) {
    console.error('Error adding address:', error);
    res.render('add-address', { error: 'Something went wrong! Try again.' });
  }
};

const editAddress = async (req, res) => {
  try {
    const addressId = req.query.id;
    const userId = req.session.user;

    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.redirect('/pageNotFound');
    }

    // Fetch user data from the database using the userId stored in session
    const user = await User.findById(userId); // Assuming you have a User model

    if (!user) {
      return res.redirect('/pageNotFound');
    }

    // Log the user to check if it's correct
    console.log('User data:', user);

    // Find the address by ID and userId
    const address = await Address.findOne({ _id: addressId, userId });

    if (!address) {
      return res.redirect('/pageNotFound');
    }

    res.render('edit-address', { address, user, error: null });
  } catch (error) {
    console.error('Error in getEditAddress:', error);
    res.redirect('/pageNotFound');
  }
};

const postEditAddress = async (req, res) => {
  try {
    const addressId = req.body.id;
    const userId = req.session.user; // Get userId from session
    const {
      name,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      phoneNumber,
      isDefault,
    } = req.body;

    // Update the address
    const updatedAddress = await Address.findOneAndUpdate(
      { _id: addressId, userId }, // Use userId from session
      {
        $set: {
          name,
          addressLine1,
          addressLine2: addressLine2 || '',
          city,
          state,
          postalCode,
          country,
          phoneNumber,
          isDefault: isDefault === 'on',
        },
      },
      { new: true }
    );

    if (!updatedAddress) {
      return res.redirect('/pageNotFound');
    }

    // If this address is set as default, unset the default for other addresses
    if (isDefault === 'on') {
      await Address.updateMany(
        { userId, _id: { $ne: addressId } },
        { $set: { isDefault: false } }
      );
    }

    res.redirect('/userProfile');
  } catch (error) {
    console.error('Error in postEditAddress:', error);
    res.render('edit-address', {
      error: 'Something went wrong! Try again.',
      address: req.body,
      user: req.session.user,
    });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const addressId = req.query.id;
    const userId = req.session.user; // Get userId from session

    // Validate address ID
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(404).send('Address not found');
    }

    // Find the address using both userId and addressId
    const findAddress = await Address.findOne({ _id: addressId, userId });

    if (!findAddress) {
      return res.status(404).send('Address not found');
    }

    // Remove the address from the user's addresses
    await Address.deleteOne({ _id: addressId, userId });

    // Redirect to the user profile page after deletion
    res.redirect('/userProfile');
  } catch (error) {
    console.error('Error in delete address:', error);
    res.redirect('/pageNotFound');
  }
};

module.exports = {
  sendVerificationEmail,
  getForgotPassPage,
  forgotEmailValid,
  verifyForgotPassOtp,
  resendOtp,
  postNewPassword,
  getUpdatePage,

  userProfile,
  changeEmail,
  changeEmailValid,
  verifyEmailOtp,
  resendEmailOtp,
  updateEmail,
  changePassword,
  changePasswordValid,
  verifyChangePassOtp,
  resendChangePassOtp,
  getResetPassPage,
  addAddress,
  postAddAddress,
  editAddress,
  postEditAddress,
  deleteAddress,
  // cancelOrder,
};
