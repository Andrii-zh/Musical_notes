require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const audioRoutes = require('./routes/audio');

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB Memory Server для розробки
let mongoServer;

// ============ MIDDLEWARE ============

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Парсинг JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статичні файли для завантажених аудіо
app.use('/api/files', express.static(path.join(__dirname, 'uploads')));

// ============ ПІДКЛЮЧЕННЯ ДО MONGODB ============

const connectToDatabase = async () => {
  try {
    let mongoUri = process.env.MONGODB_URI;

    // Якщо використовуємо режим розробки без вказаного URI — запускаємо Memory Server
    if (!mongoUri && process.env.NODE_ENV !== 'production') {
      console.log('🚀 Запускаю MongoDB Memory Server...');
      mongoServer = await MongoMemoryServer.create();
      mongoUri = mongoServer.getUri();
      console.log('✅ MongoDB Memory Server готовий');
    }

    mongoUri = mongoUri || 'mongodb://localhost:27017/musical-notes';

    await mongoose.connect(mongoUri);
    console.log('✅ Підключено до MongoDB');
  } catch (error) {
    console.error('❌ Помилка підключення до MongoDB:', error);
    process.exit(1);
  }
};

connectToDatabase();

// ============ МАРШРУТИ ============

// API маршрути
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/audio', audioRoutes);

// Базовий маршрут
app.get('/', (req, res) => {
  res.json({ message: 'Musical Notes API v1.0' });
});

// Обробка помилок 404
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не знайдено' });
});

// Обробка глобальних помилок
app.use((error, req, res, next) => {
  console.error('Помилка:', error);
  res.status(error.status || 500).json({
    error: error.message || 'Внутрішня помилка сервера',
  });
});

// ============ ЗАПУСК СЕРВЕРА ============

const server = app.listen(PORT, () => {
  console.log(`🎵 Musical Notes API запущено на http://localhost:${PORT}`);
});

// Корректне завершення роботи
process.on('SIGTERM', async () => {
  console.log('⛔ Отримано сигнал завершення...');
  server.close(async () => {
    await mongoose.connection.close();
    if (mongoServer) {
      await mongoServer.stop();
    }
    console.log('✅ Сервер завершив роботу');
    process.exit(0);
  });
});
