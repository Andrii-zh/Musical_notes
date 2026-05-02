const Project = require('../models/Project');
const fs = require('fs');
const path = require('path');

// Отримати всі проекти користувача
const getProjects = async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.user.userId }).sort({
      createdAt: -1,
    });

    res.status(200).json(projects);
  } catch (error) {
    console.error('Помилка при отриманні проектів:', error);
    res.status(500).json({ error: 'Помилка при отриманні проектів' });
  }
};

// Отримати один проект
const getProject = async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({ error: 'Проект не знайдено' });
    }

    // Перевіряємо, чи користувач є власником проекту
    if (project.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }

    res.status(200).json(project);
  } catch (error) {
    console.error('Помилка при отриманні проекту:', error);
    res.status(500).json({ error: 'Помилка при отриманні проекту' });
  }
};

// Створити новий проект
const createProject = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Назва проекту обов'язкова' });
    }

    const project = new Project({
      userId: req.user.userId,
      name,
      lyrics: '',
      vocalTracks: [
        {
          trackIndex: 0,
          filePath: null,
          volume: 1,
        },
      ],
    });

    await project.save();

    res.status(201).json({
      message: 'Проект успішно створено',
      project,
    });
  } catch (error) {
    console.error('Помилка при створенні проекту:', error);
    res.status(500).json({ error: 'Помилка при створенні проекту' });
  }
};

// Оновити проект
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, lyrics, instrumentalVolume, vocalTracks } = req.body;

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({ error: 'Проект не знайдено' });
    }

    // Перевіряємо, чи користувач є власником проекту
    if (project.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }

    // Оновлюємо поля
    if (name) project.name = name;
    if (lyrics !== undefined) project.lyrics = lyrics;
    if (instrumentalVolume !== undefined) project.instrumentalVolume = instrumentalVolume;
    if (vocalTracks) {
      project.vocalTracks = vocalTracks;
    }

    await project.save();

    res.status(200).json({
      message: 'Проект успішно оновлено',
      project,
    });
  } catch (error) {
    console.error('Помилка при оновленні проекту:', error);
    res.status(500).json({ error: 'Помилка при оновленні проекту' });
  }
};

// Видалити проект
const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({ error: 'Проект не знайдено' });
    }

    // Перевіряємо, чи користувач є власником проекту
    if (project.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Доступ заборонено' });
    }

    // Видаляємо файли проекту
    const projectDir = path.join(__dirname, '../uploads', req.user.userId, id);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }

    await Project.findByIdAndDelete(id);

    res.status(200).json({
      message: 'Проект успішно видалено',
    });
  } catch (error) {
    console.error('Помилка при видаленні проекту:', error);
    res.status(500).json({ error: 'Помилка при видаленні проекту' });
  }
};

module.exports = {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
};
