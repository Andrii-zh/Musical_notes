const Project = require('../models/Project');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// Налаштовуємо шлях до ffmpeg
ffmpeg.setFfmpegPath(ffmpegStatic);

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

    // Сохраняємо шлях до файлу
    const relativePath = path.join('uploads', req.user.userId, projectId, 'instrumental', req.file.filename);
    project.instrumentalPath = relativePath;

    await project.save();

    res.status(200).json({
      message: 'Інструментальна доріжка успішно завантажена',
      instrumentalPath: relativePath,
    });
  } catch (error) {
    console.error('Помилка при завантаженні інструментальної доріжки:', error);
    res.status(500).json({ error: 'Помилка при завантаженні' });
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

    // Сохраняємо шлях до файлу
    const relativePath = path.join('uploads', req.user.userId, projectId, 'vocal', `track_${trackIdx}_${req.file.filename}`);
    project.vocalTracks[trackIdx].filePath = relativePath;

    await project.save();

    res.status(200).json({
      message: 'Вокальна доріжка успішно завантажена',
      filePath: relativePath,
      trackIndex: trackIdx,
    });
  } catch (error) {
    console.error('Помилка при завантаженні вокальної доріжки:', error);
    res.status(500).json({ error: 'Помилка при завантаженні' });
  }
};

// Експортувати проект в MP3
const exportProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { trackIndices } = req.body;

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

    // Додаємо інструментальну доріжку якщо вона є
    if (project.instrumentalPath) {
      const instrumentalPath = path.join(__dirname, '../', project.instrumentalPath);
      if (fs.existsSync(instrumentalPath)) {
        files.push({
          path: instrumentalPath,
          volume: project.instrumentalVolume,
          name: 'instrumental',
        });
      }
    }

    // Додаємо вокальні доріжки
    if (trackIndices && Array.isArray(trackIndices)) {
      for (const trackIdx of trackIndices) {
        if (trackIdx >= 0 && trackIdx < project.vocalTracks.length) {
          const track = project.vocalTracks[trackIdx];
          if (track.filePath) {
            const trackPath = path.join(__dirname, '../', track.filePath);
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
    const outputFileName = `${project.name.replace(/\s+/g, '_')}_${Date.now()}.mp3`;
    const outputPath = path.join(__dirname, '../uploads', req.user.userId, projectId, outputFileName);

    // Складаємо команду ffmpeg для змішування
    let ffmpegCommand = ffmpeg();

    files.forEach((file) => {
      ffmpegCommand = ffmpegCommand.input(file.path);
    });

    // Фільтр для змішування аудіо з врахуванням гучностей
    const filterComplex = files
      .map((file, index) => `[${index}]volume=${file.volume}[a${index}]`)
      .join(';') + '[' + files.map((_, index) => `a${index}`).join('][') + ']amix=inputs=' + files.length + ':duration=longest[aout]';

    ffmpegCommand
      .complexFilter(filterComplex)
      .outputOptions('-map', '[aout]')
      .outputOptions('-q:a', '5') // якість MP3
      .output(outputPath)
      .on('end', () => {
        console.log(`Експорт завершено: ${outputPath}`);
        res.status(200).json({
          message: 'Експорт успішно завершено',
          filePath: `/api/audio/download/${req.user.userId}/${projectId}/${outputFileName}`,
        });
      })
      .on('error', (error) => {
        console.error('Помилка при експорті:', error);
        res.status(500).json({ error: 'Помилка при експорті' });
      })
      .run();
  } catch (error) {
    console.error('Помилка при експорті проекту:', error);
    res.status(500).json({ error: 'Помилка при експорті' });
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

    res.download(filePath, fileName);
  } catch (error) {
    console.error('Помилка при завантаженні файлу:', error);
    res.status(500).json({ error: 'Помилка при завантаженні файлу' });
  }
};

module.exports = {
  uploadInstrumental,
  uploadVocal,
  exportProject,
  downloadExport,
};
