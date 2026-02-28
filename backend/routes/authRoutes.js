const express = require('express');
const { body } = require('express-validator');
const {
  login,
  logout,
  refreshToken,
  getMe,
} = require('../controllers/authController');
const protect = require('../middleware/protect');

const router = express.Router();

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  login
);

router.post('/logout', protect, logout);
router.post('/refresh', refreshToken);
router.get('/me', protect, getMe);

module.exports = router;

