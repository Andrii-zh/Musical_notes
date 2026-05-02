import { useState } from 'react';
import './ProjectList.css';

export default function ProjectList({
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  loading,
}) {
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const handleCreateClick = async () => {
    if (!newProjectName.trim()) return;
    await onCreateProject(newProjectName);
    setNewProjectName('');
    setShowNewProjectInput(false);
  };

  return (
    <div className="project-list">
      <button
        className="new-project-btn"
        onClick={() => setShowNewProjectInput(!showNewProjectInput)}
      >
        + Новий проект
      </button>

      {showNewProjectInput && (
        <div className="new-project-form">
          <input
            type="text"
            placeholder="Назва проекту..."
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') handleCreateClick();
            }}
            autoFocus
          />
          <div className="form-actions">
            <button className="create-btn" onClick={handleCreateClick}>
              Створити
            </button>
            <button
              className="cancel-btn"
              onClick={() => setShowNewProjectInput(false)}
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      <div className="projects-container">
        {loading ? (
          <div className="projects-loading">Завантаження...</div>
        ) : projects.length === 0 ? (
          <div className="projects-empty">Немає проектів</div>
        ) : (
          <ul className="projects-list">
            {projects.map((project) => (
              <li key={project._id} className="project-list-item">
                <button
                  className={`project-item ${
                    selectedProjectId === project._id ? 'active' : ''
                  }`}
                  onClick={() => onSelectProject(project._id)}
                >
                  <span className="project-name">{project.name}</span>
                </button>
                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      confirm(
                        `Видалити проект "${project.name}"? Це не можна скасувати.`
                      )
                    ) {
                      onDeleteProject(project._id);
                    }
                  }}
                  title="Видалити"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
