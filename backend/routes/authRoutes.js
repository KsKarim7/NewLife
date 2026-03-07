const express = require('express');
const { body } = require('express-validator');
const {
  login,
  logout,
  refreshToken,
  getMe,
  changeOwnPassword,
  changeOwnEmail,
  changeOwnName,
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

router.patch(
  '/me/password',
  protect,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters'),
  ],
  changeOwnPassword
);

router.patch(
  '/me/email',
  protect,
  [body('newEmail').isEmail().withMessage('Valid email is required')],
  changeOwnEmail
);

router.patch(
  '/me/name',
  protect,
  [body('newName').notEmpty().withMessage('Name is required')],
  changeOwnName
);

module.exports = router;

