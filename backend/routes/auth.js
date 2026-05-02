const express = require('express');
const { body } = require('express-validator');
const { register, login } = require('../controllers/authController');

const router = express.Router();

// Реєстрація
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }).trim().escape(),
  ],
  register
);

// Вхід
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').trim().escape(),
  ],
  login
);

module.exports = router;
