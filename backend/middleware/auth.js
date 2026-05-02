const jwt = require('jsonwebtoken');

// Middleware для перевірки JWT токена
const authenticateToken = (req, res, next) => {
  try {
    // Отримуємо токен з заголовка Authorization
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Токен не знайдено' });
    }

    // Перевіряємо та декодуємо токен
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Невалідний токен' });
      }

      req.user = user;
      next();
    });
  } catch (error) {
    return res.status(500).json({ error: 'Помилка при перевірці токена' });
  }
};

module.exports = authenticateToken;
