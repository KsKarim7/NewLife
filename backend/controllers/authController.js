const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
};

const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
  );
};

const setRefreshCookie = (res, token) => {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: sevenDaysMs,
  });
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res
      .status(401)
      .json({ success: false, message: 'Invalid credentials' });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res
      .status(401)
      .json({ success: false, message: 'Invalid credentials' });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user._id);

  user.last_login = new Date();
  const hashedRefresh = await bcrypt.hash(refreshToken, 10);
  user.refreshToken = hashedRefresh;
  await user.save();

  setRefreshCookie(res, refreshToken);

  return res.json({
    success: true,
    data: {
      token: accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    },
  });
};

exports.logout = async (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  if (req.user) {
    req.user.refreshToken = null;
    await req.user.save();
  }

  return res.json({ success: true, data: {} });
};

exports.refreshToken = async (req, res) => {
  const token = req.cookies && req.cookies.refreshToken;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: 'Invalid refresh token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    const user = await User.findById(decoded.id);

    if (!user || !user.refreshToken) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid refresh token' });
    }

    const isMatch = await bcrypt.compare(token, user.refreshToken);

    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid refresh token' });
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user._id);

    const hashedNewRefresh = await bcrypt.hash(newRefreshToken, 10);
    user.refreshToken = hashedNewRefresh;
    await user.save();

    setRefreshCookie(res, newRefreshToken);

    return res.json({
      success: true,
      data: {
        token: newAccessToken,
      },
    });
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: 'Invalid refresh token' });
  }
};

exports.getMe = async (req, res) => {
  const user = req.user;

  return res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    },
  });
};

exports.changeOwnPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  const { currentPassword, newPassword } = req.body;
  const user = req.user;

  // Verify current password
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Current password is incorrect',
    });
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  await user.save();

  return res.json({
    success: true,
    message: 'Password changed successfully',
  });
};

exports.changeOwnEmail = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  const { newEmail } = req.body;
  const user = req.user;

  // Check if email already exists
  const existingUser = await User.findOne({
    email: newEmail.toLowerCase(),
    _id: { $ne: user._id },
  });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: 'Email already in use',
    });
  }

  user.email = newEmail.toLowerCase();
  await user.save();

  return res.json({
    success: true,
    message: 'Email changed successfully',
  });
};

exports.changeOwnName = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  const { newName } = req.body;
  const user = req.user;

  if (!newName || newName.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Name cannot be empty',
    });
  }

  user.name = newName.trim();
  await user.save();

  return res.json({
    success: true,
    message: 'Name changed successfully',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    },
  });
};

