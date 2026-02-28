const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ success: false, message: 'Not authorized' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select(
      '-password -refreshToken'
    );

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: 'Not authorized' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: 'Not authorized' });
  }
};

module.exports = protect;

