const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const { connectDB } = require('../config/db');
const User = require('../models/User');

dotenv.config();

const seedOwner = async () => {
  try {
    await connectDB();

    const existing = await User.findOne({ email: 'owner@ims.com' });

    if (existing) {
      console.log('Owner already seeded');
      await mongoose.disconnect();
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash('Admin1234', 12);

    await User.create({
      name: 'Owner',
      email: 'owner@ims.com',
      password: hashedPassword,
      role: 'owner',
    });

    console.log('✅ Owner seeded: owner@ims.com / Admin1234');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedOwner();

