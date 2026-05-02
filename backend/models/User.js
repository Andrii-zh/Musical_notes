const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Схема користувача
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Будь ласка, вкажіть email'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Будь ласка, вкажіть коректний email',
    ],
  },
  passwordHash: {
    type: String,
    required: [true, 'Будь ласка, вкажіть пароль'],
    minlength: 6,
    select: false, // Не повертати пароль за замовчуванням
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Хешування паролю перед збереженням
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Метод для порівняння паролів
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
