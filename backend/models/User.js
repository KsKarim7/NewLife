const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
    },
    role: {
      type: String,
      enum: ['owner', 'manager', 'staff'],
      default: 'owner',
    },
    refreshToken: {
      type: String,
    },
    phone: {
      type: String,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    last_login: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
