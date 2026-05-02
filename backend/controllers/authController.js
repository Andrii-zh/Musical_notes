const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

// Генерування JWT токена
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// Реєстрація користувача
const register = async (req, res) => {
  try {
    // Перевіряємо результати валідації
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Перевіряємо чи користувач вже існує
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Користувач з такою поштою вже існує' });
    }

    // Створюємо нового користувача
    const user = new User({
      email,
      passwordHash: password,
    });

    await user.save();

    // Генеруємо токен
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'Реєстрація успішна',
      token,
      user: {
        id: user._id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Помилка реєстрації:', error);
    res.status(500).json({ error: 'Помилка при реєстрації' });
  }
};

// Вхід користувача
const login = async (req, res) => {
  try {
    // Перевіряємо результати валідації
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Знаходимо користувача за поштою
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ error: 'Невірна пошта або пароль' });
    }

    // Перевіряємо пароль
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Невірна пошта або пароль' });
    }

    // Генеруємо токен
    const token = generateToken(user._id);

    res.status(200).json({
      message: 'Вхід успішний',
      token,
      user: {
        id: user._id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Помилка входу:', error);
    res.status(500).json({ error: 'Помилка при вході' });
  }
};

module.exports = {
  register,
  login,
};
