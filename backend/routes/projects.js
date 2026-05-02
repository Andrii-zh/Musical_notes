const express = require('express');
const {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} = require('../controllers/projectController');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Всі маршрути захищені JWT middleware
router.use(authenticateToken);

// Отримати всі проекти
router.get('/', getProjects);

// Створити новий проект
router.post('/', createProject);

// Отримати один проект
router.get('/:id', getProject);

// Оновити проект
router.put('/:id', updateProject);

// Видалити проект
router.delete('/:id', deleteProject);

module.exports = router;
