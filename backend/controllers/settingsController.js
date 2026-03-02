const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const Settings = require('../models/Settings');
const User = require('../models/User');

// Store Information
exports.getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne({});

    // If no settings exist, create default ones
    if (!settings) {
      settings = new Settings({
        store_info: {
          store_name: '',
          owner_name: '',
          phone_number: '',
          email_address: '',
          physical_address: '',
          city: '',
          logo_url: '',
          currency_symbol: '৳',
        },
        purge_after_days: 30,
      });
      await settings.save();
    }

    return res.json({
      success: true,
      data: settings,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error fetching settings',
    });
  }
};

exports.updateStoreInfo = async (req, res) => {
  // Check authorization
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Only owner can update store information',
    });
  }

  try {
    const { store_name, owner_name, phone_number, email_address, physical_address, city, logo_url } = req.body;

    let settings = await Settings.findOne({});

    // If no settings exist, create new ones
    if (!settings) {
      settings = new Settings({
        store_info: {},
        purge_after_days: 30,
      });
    }

    // Update store info fields
    if (store_name !== undefined) settings.store_info.store_name = store_name;
    if (owner_name !== undefined) settings.store_info.owner_name = owner_name;
    if (phone_number !== undefined) settings.store_info.phone_number = phone_number;
    if (email_address !== undefined) settings.store_info.email_address = email_address;
    if (physical_address !== undefined) settings.store_info.physical_address = physical_address;
    if (city !== undefined) settings.store_info.city = city;
    if (logo_url !== undefined) settings.store_info.logo_url = logo_url;

    await settings.save();

    return res.json({
      success: true,
      data: settings,
      message: 'Store information updated',
    });
  } catch (err) {
    console.error('Error updating store information:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Error updating store information',
    });
  }
};

// Retention Settings
exports.getRetention = async (req, res) => {
  // Check authorization
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Only owner can view retention settings',
    });
  }

  try {
    let settings = await Settings.findOne({});

    // If no settings exist, create with defaults
    if (!settings) {
      settings = new Settings({
        store_info: {},
        purge_after_days: 30,
      });
      await settings.save();
    }

    return res.json({
      success: true,
      data: {
        purge_after_days: settings.purge_after_days,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error fetching retention settings',
    });
  }
};

exports.updateRetention = async (req, res) => {
  // Check authorization
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Only owner can update retention settings',
    });
  }

  try {
    const { purge_after_days } = req.body;

    // Validate range
    if (purge_after_days < 7 || purge_after_days > 365) {
      return res.status(400).json({
        success: false,
        message: 'Purge days must be between 7 and 365',
      });
    }

    let settings = await Settings.findOne({});

    // If no settings exist, create new ones
    if (!settings) {
      settings = new Settings({
        store_info: {},
        purge_after_days,
      });
    } else {
      settings.purge_after_days = purge_after_days;
    }

    await settings.save();

    return res.json({
      success: true,
      data: { purge_after_days: settings.purge_after_days },
      message: 'Retention settings updated',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error updating retention settings',
    });
  }
};

// User Management
exports.listUsers = async (req, res) => {
  // Check authorization
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Only owner can list users',
    });
  }

  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const users = await User.find({})
      .select('-password -refreshToken')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments({});

    return res.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error listing users',
    });
  }
};

exports.createUser = async (req, res) => {
  // Check authorization
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Only owner can create users',
    });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  try {
    const { name, email, role, phone, password } = req.body;

    // Validate role
    if (!['manager', 'staff'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be manager or staff',
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already in use',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email: email.toLowerCase(),
      role,
      phone: phone || undefined,
      password: hashedPassword,
      is_active: true,
    });

    await newUser.save();

    return res.status(201).json({
      success: true,
      data: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        phone: newUser.phone,
        is_active: newUser.is_active,
        createdAt: newUser.createdAt,
      },
      message: 'User created successfully',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error creating user',
    });
  }
};

exports.updateUser = async (req, res) => {
  // Check authorization
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Only owner can update users',
    });
  }

  try {
    const { id } = req.params;
    const { name, phone } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update allowed fields only
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;

    await user.save();

    return res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        is_active: user.is_active,
        createdAt: user.createdAt,
      },
      message: 'User updated successfully',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error updating user',
    });
  }
};

exports.deactivateUser = async (req, res) => {
  // Check authorization
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Only owner can deactivate users',
    });
  }

  try {
    const { id } = req.params;

    // Cannot deactivate self
    if (req.user._id.toString() === id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Toggle is_active status
    user.is_active = !user.is_active;
    await user.save();

    return res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        is_active: user.is_active,
      },
      message: `User ${user.is_active ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error deactivating user',
    });
  }
};
