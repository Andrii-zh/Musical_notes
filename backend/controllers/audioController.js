const Project = require('../models/Project');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// Налаштовуємо шлях до ffmpeg
ffmpeg.setFfmpegPath(ffmpegStatic);

// Helper функція для створення нормалізованого шляху (завжди з forward slashes)
const getNormalizedPath = (...segments) => {
  return path.posix.join(...segments);
};

const sanitizeFileName = (name) => {
  const safe = String(name || 'project')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return safe || 'project';
};

const toUploadDiskPath = (storedPath) => {
  if (!storedPath) return null;

  const normalized = storedPath.replace(/\\/g, '/');
  const trimmed = normalized.startsWith('uploads/')
    ? normalized.slice('uploads/'.length)
    : normalized;

  return path.join(__dirname, '../uploads', trimmed.replace(/\//g, path.sep));
};

const resolveAudioFilePath = (userId, projectId, kind, fileName) => {
  const uploadsRoot = path.join(__dirname, '../uploads', userId, projectId);
  const candidates = [
    path.join(uploadsRoot, kind, fileName),
    path.join(uploadsRoot, 'temp', fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const tempDir = path.join(uploadsRoot, 'temp');
  if (fs.existsSync(tempDir)) {
    const tempFiles = fs.readdirSync(tempDir);
    const exactMatch = tempFiles.find((name) => name === fileName);
    if (exactMatch) {
      return path.join(tempDir, exactMatch);
    }

    const baseName = path.parse(fileName).name;
    const prefixMatch = tempFiles.find((name) => name.startsWith(baseName));
    if (prefixMatch) {
      return path.join(tempDir, prefixMatch);
    }
  }

  return null;
};

const getMimeTypeFromFile = (filePath) => {
  try {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.mp3') return 'audio/mpeg';
    if (extension === '.wav') return 'audio/wav';
    if (extension === '.ogg') return 'audio/ogg';
    if (extension === '.webm') return 'audio/webm';

    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    const signature = header.subarray(0, bytesRead);

    if (signature.length >= 3 && signature[0] === 0x49 && signature[1] === 0x44 && signature[2] === 0x33) {
      return 'audio/mpeg';
    }

    if (signature.length >= 2 && signature[0] === 0xff && (signature[1] & 0xe0) === 0xe0) {
      return 'audio/mpeg';
    }

    if (
      signature.length >= 12
      && signature[0] === 0x52
      && signature[1] === 0x49
      && signature[2] === 0x46
      && signature[3] === 0x46
      && signature[8] === 0x57
      && signature[9] === 0x41
      && signature[10] === 0x56
      && signature[11] === 0x45
    ) {
      return 'audio/wav';
    }

    if (signature.length >= 4 && signature[0] === 0x4f && signature[1] === 0x67 && signature[2] === 0x67 && signature[3] === 0x53) {
      return 'audio/ogg';
    }

    if (signature.length >= 4 && signature[0] === 0x1a && signature[1] === 0x45 && signature[2] === 0xdf && signature[3] === 0xa3) {
      return 'audio/webm';
    }
  } catch (error) {
    return 'application/octet-stream';
  }

  return 'application/octet-stream';
};

// Завантажити інструментальну доріжку
const uploadInstrumental = async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не завантажено' });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Проект не знайдено' });
    }

    // Перевіряємо, чи користувач є власником проекту
    if (project.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }

    try {
      // Переміщуємо файл з temp до інструментальної папки
      const instrumentalDir = path.join(__dirname, '../uploads', req.user.userId, projectId, 'instrumental');
      
      // Створюємо директорію якщо її нема
      if (!fs.existsSync(instrumentalDir)) {
        fs.mkdirSync(instrumentalDir, { recursive: true });
      }

      const oldPath = req.file.path;
      const fileName = req.file.filename;
      const newPath = path.join(instrumentalDir, fileName);

      // Переміщуємо файл
      fs.renameSync(oldPath, newPath);
      
      console.log(`✅ Інструментал завантажено: ${newPath}`);

      // Зберігаємо шлях відносно backend/uploads, бо /api/files вже вказує на цю папку
      const relativePath = getNormalizedPath(req.user.userId, projectId, 'instrumental', fileName);
      project.instrumentalPath = relativePath;

      await project.save();

      res.status(200).json({
        message: 'Інструментальна доріжка успішно завантажена',
        instrumentalPath: relativePath,
      });
    } catch (fileErr) {
      console.error('Помилка при переміщенні файлу:', fileErr);
      // Видаляємо файл якщо переміщення не вдалось
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
      throw fileErr;
    }
  } catch (error) {
    console.error('Помилка при завантаженні інструментальної доріжки:', error);
    res.status(500).json({ error: error.message || 'Помилка при завантаженні' });
  }
};

// Завантажити вокальну доріжку
const uploadVocal = async (req, res) => {
  try {
    const { projectId, trackIndex } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не завантажено' });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Проект не знайдено' });
    }

    // Перевіряємо, чи користувач є власником проекту
    if (project.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }

    const trackIdx = parseInt(trackIndex);

    // Перевіряємо чи доріжка існує
    if (trackIdx < 0 || trackIdx >= project.vocalTracks.length) {
      return res.status(400).json({ error: 'Невалідний індекс доріжки' });
    }

    try {
      // Переміщуємо файл з temp до вокальної папки
      const vocalDir = path.join(__dirname, '../uploads', req.user.userId, projectId, 'vocal');
      if (!fs.existsSync(vocalDir)) {
        fs.mkdirSync(vocalDir, { recursive: true });
      }

      const oldPath = req.file.path;
      const fileName = `track_${trackIdx}_${req.file.filename}`;
      const newPath = path.join(vocalDir, fileName);

      fs.renameSync(oldPath, newPath);

      console.log(`✅ Вокальна доріжка ${trackIdx} завантажена: ${newPath}`);

      // Зберігаємо шлях відносно backend/uploads, бо /api/files вже вказує на цю папку
      const relativePath = getNormalizedPath(req.user.userId, projectId, 'vocal', fileName);
      project.vocalTracks[trackIdx].filePath = relativePath;

      await project.save();

      res.status(200).json({
        message: 'Вокальна доріжка успішно завантажена',
        filePath: relativePath,
      });
    } catch (fileErr) {
      console.error('Помилка при переміщенні файлу:', fileErr);
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
      throw fileErr;
    }
  } catch (error) {
    console.error('Помилка при завантаженні вокальної доріжки:', error);
    res.status(500).json({ error: error.message || 'Помилка при завантаженні' });
  }
};

// Експортувати проект в MP3
const exportProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { trackIndices } = req.body;
    const selectedIndices = Array.isArray(trackIndices) ? [...new Set(trackIndices)] : [];
    const includeInstrumental = selectedIndices.includes(-1);

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Проект не знайдено' });
    }

    // Перевіряємо, чи користувач є власником проекту
    if (project.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }

    // Перевіряємо наявність файлів
    const files = [];

    // Додаємо інструментальну доріжку тільки якщо її явно обрано
    if (includeInstrumental && project.instrumentalPath) {
      const instrumentalPath = toUploadDiskPath(project.instrumentalPath);
      if (fs.existsSync(instrumentalPath)) {
        files.push({
          path: instrumentalPath,
          volume: project.instrumentalVolume,
          name: 'instrumental',
        });
      }
    }

    // Додаємо вокальні доріжки
    if (selectedIndices.length > 0) {
      for (const trackIdx of selectedIndices) {
        if (trackIdx >= 0 && trackIdx < project.vocalTracks.length) {
          const track = project.vocalTracks[trackIdx];
          if (track.filePath) {
            const trackPath = toUploadDiskPath(track.filePath);
            if (fs.existsSync(trackPath)) {
              files.push({
                path: trackPath,
                volume: track.volume,
                name: `vocal_${trackIdx}`,
              });
            }
          }
        }
      }
    }

    if (files.length === 0) {
      return res.status(400).json({ error: 'Немає доступних доріжок для експорту' });
    }

    // Генеруємо ім'я вихідного файлу
    const outputFileName = `${sanitizeFileName(project.name)}_${Date.now()}.mp3`;
    const outputDir = path.join(__dirname, '../uploads', req.user.userId, projectId);
    const outputPath = path.join(outputDir, outputFileName);

    // Створюємо директорію якщо її нема
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Складаємо команду ffmpeg для змішування
    let ffmpegCommand = ffmpeg();
    files.forEach((file) => {
      ffmpegCommand = ffmpegCommand.input(file.path);
    });

    let stderrLog = '';
    let responseSent = false;

    ffmpegCommand
      .on('start', (commandLine) => {
        console.log('🎛 ffmpeg export command:', commandLine);
      })
      .on('stderr', (line) => {
        stderrLog += `${line}\n`;
      })
      .on('end', () => {
        if (responseSent) return;
        responseSent = true;
        console.log(`✅ Експорт завершено: ${outputPath}`);
        const downloadUrl = getNormalizedPath('audio', 'download', req.user.userId, projectId, outputFileName);
        // Вказуємо заголовки, щоб браузер не кешував динамічно згенеровані файли експорту
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');

        res.status(200).json({
          message: 'Експорт успішно завершено',
          filePath: `/${downloadUrl}`,
        });
      })
      .on('error', (error) => {
        if (responseSent) return;
        responseSent = true;
        console.error('Помилка при експорті:', error);
        if (stderrLog) {
          const tail = stderrLog.split('\n').slice(-20).join('\n');
          console.error('ffmpeg stderr tail:\n', tail);
        }

        const devDetails = process.env.NODE_ENV !== 'production'
          ? ` ${String(error.message || '').slice(0, 240)}`
          : '';
        res.status(500).json({ error: `Помилка при експорті.${devDetails}` });
      });

    if (files.length === 1) {
      const singleVolume = Number.isFinite(files[0].volume) ? files[0].volume : 1;
      ffmpegCommand
        .audioFilters(`aformat=sample_rates=44100:channel_layouts=stereo,volume=${singleVolume}`)
        .audioCodec('libmp3lame')
        .outputOptions('-q:a', '5')
        .format('mp3')
        .output(outputPath)
        .run();
    } else {
      const normalizeFilters = files.map((file, index) => {
        const volume = Number.isFinite(file.volume) ? file.volume : 1;
        return `[${index}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${volume}[a${index}]`;
      });
      const mixInputs = files.map((_, index) => `[a${index}]`).join('');
      const filterComplex = [
        ...normalizeFilters,
        `${mixInputs}amix=inputs=${files.length}:duration=longest:normalize=0:dropout_transition=0[aout]`,
      ];

      ffmpegCommand
        .complexFilter(filterComplex)
        .outputOptions('-map', '[aout]')
        .audioCodec('libmp3lame')
        .outputOptions('-q:a', '5')
        .format('mp3')
        .output(outputPath)
        .run();
    }
  } catch (error) {
    console.error('Помилка при експорті проекту:', error);
    res.status(500).json({ error: 'Помилка при експорті' });
  }
};

// Приймає з клієнта WAV/Blob і конвертує у MP3, повертає шлях для завантаження
const convertMixToMp3 = async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл міксу не надіслано' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      // видаляємо тимчасовий файл
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(404).json({ error: 'Проект не знайдено' });
    }

    if (project.userId.toString() !== req.user.userId) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(403).json({ error: 'Доступ заборонено' });
    }

    const outputDir = path.join(__dirname, '../uploads', req.user.userId, projectId);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFileName = `${sanitizeFileName(project.name)}_${Date.now()}.mp3`;
    const outputPath = path.join(outputDir, outputFileName);

    let stderrLog = '';
    let responded = false;

    ffmpeg(req.file.path)
      .on('start', (cmd) => {
        console.log('🎛 ffmpeg convert command:', cmd);
      })
      .on('stderr', (line) => {
        stderrLog += `${line}\n`;
      })
      .on('end', () => {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        if (responded) return;
        responded = true;

        // Вказуємо no-cache заголовки
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');

        const downloadUrl = getNormalizedPath('audio', 'download', req.user.userId, projectId, outputFileName);
        res.status(200).json({ message: 'Конвертація завершена', filePath: `/${downloadUrl}` });
      })
      .on('error', (err) => {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        if (responded) return;
        responded = true;
        console.error('Помилка при конвертації міксу:', err);
        if (stderrLog) console.error('ffmpeg stderr tail:\n', stderrLog.split('\n').slice(-20).join('\n'));
        res.status(500).json({ error: 'Помилка при конвертації міксу' });
      })
      .audioCodec('libmp3lame')
      .audioChannels(2)
      .audioFrequency(44100)
      .audioBitrate('192k')
      .format('mp3')
      .outputOptions('-q:a', '5')
      .save(outputPath);
  } catch (error) {
    console.error('Помилка в convertMixToMp3:', error);
    try { if (req.file && req.file.path) fs.unlinkSync(req.file.path); } catch (e) {}
    res.status(500).json({ error: 'Внутрішня помилка при обробці міксу' });
  }
};

// Завантажити експортований файл
const downloadExport = (req, res) => {
  try {
    const { userId, projectId, fileName } = req.params;

    const filePath = path.join(__dirname, '../uploads', userId, projectId, fileName);

    // Перевіряємо безпеку (щоб користувач не міг завантажити файли інших користувачів)
    if (!filePath.includes(userId)) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }

    // Встановлюємо явні заголовки, щоб уникнути кешування та вказати content-type
    const mimeType = getMimeTypeFromFile(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    return res.sendFile(filePath);
  } catch (error) {
    console.error('Помилка при завантаженні файлу:', error);
    res.status(500).json({ error: 'Помилка при завантаженні файлу' });
  }
};

const streamAudioFile = (req, res) => {
  try {
    const relativePath = ((req.params && req.params[0]) || req.originalUrl || '')
      .replace(/^\/api\/files\//, '')
      .replace(/^\/+/, '');
    const [userId, projectId, kind, ...fileNameParts] = relativePath.split('/');
    const fileName = fileNameParts.join('/');

    if (!userId || !projectId || !kind || !fileName) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }

    const filePath = resolveAudioFilePath(userId, projectId, kind, fileName);

    if (!filePath) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }

    const mimeType = getMimeTypeFromFile(filePath);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(filePath);
  } catch (error) {
    console.error('Помилка при стрімінгу аудіо:', error);
    return res.status(500).json({ error: 'Помилка при відтворенні файлу' });
  }
};

module.exports = {
  uploadInstrumental,
  uploadVocal,
  exportProject,
  convertMixToMp3,
  downloadExport,
  streamAudioFile,
};
