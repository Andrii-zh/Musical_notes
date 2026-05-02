const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  uploadInstrumental,
  uploadVocal,
  exportProject,
  downloadExport,
} = require('../controllers/audioController');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

const mimeToExtension = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.webm',
};

// Налаштування multer для завантаження файлів
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { projectId } = req.params;
    const uploadPath = path.join(__dirname, '../uploads', req.user.userId, projectId, 'temp');

    // Створюємо папку якщо її немає
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const originalExt = path.extname(file.originalname || '');
    const mappedExt = mimeToExtension[file.mimetype] || '';
    const fileExt = originalExt || mappedExt;
    cb(null, file.fieldname + '-' + uniqueSuffix + fileExt);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Дозволені формати: mp3, wav, ogg
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Недопустимий формат файлу'));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// Всі маршрути захищені JWT middleware
router.use(authenticateToken);

// Завантажити інструментальну доріжку
router.post('/upload/instrumental/:projectId', upload.single('instrumental'), uploadInstrumental);

// Завантажити вокальну доріжку
router.post('/upload/vocal/:projectId/:trackIndex', upload.single('vocal'), uploadVocal);

// Експортувати проект
router.post('/export/:projectId', exportProject);

// Завантажити експортований файл
router.get('/download/:userId/:projectId/:fileName', downloadExport);

module.exports = router;
