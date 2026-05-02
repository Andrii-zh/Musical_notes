import { useState, useEffect } from 'react';
import './MainLayout.css';
import ProjectList from '../components/ProjectList';
import ProjectEditor from '../components/ProjectEditor';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function MainLayout({ onLogout }) {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/projects`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error('Не вдалося завантажити проекти');

        const data = await response.json();
        setProjects(data);
        if (data.length > 0) {
          setSelectedProjectId((currentProjectId) => currentProjectId || data[0]._id);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  const handleCreateProject = async (name) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) throw new Error('Не вдалося створити проект');

      const data = await response.json();
      setProjects([data.project, ...projects]);
      setSelectedProjectId(data.project._id);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteProject = async (projectId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Не вдалося видалити проект');

      const newProjects = projects.filter((p) => p._id !== projectId);
      setProjects(newProjects);

      if (selectedProjectId === projectId) {
        setSelectedProjectId(newProjects.length > 0 ? newProjects[0]._id : null);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleProjectUpdate = (updatedProject) => {
    setProjects(
      projects.map((p) => (p._id === updatedProject._id ? updatedProject : p))
    );
  };

  return (
    <div className="main-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>🎵 Musical Notes</h1>
          <button className="logout-btn" onClick={onLogout} title="Вийти">
            ✕
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <ProjectList
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          loading={loading}
        />
      </aside>

      <main className="editor-area">
        {selectedProjectId && projects.length > 0 ? (
          <ProjectEditor
            projectId={selectedProjectId}
            onUpdate={handleProjectUpdate}
          />
        ) : (
          <div className="no-project">
            {projects.length === 0 ? (
              <>
                <p>Немає проектів</p>
                <p className="hint">Створіть новий проект щоб розпочати</p>
              </>
            ) : (
              <p>Завантаження...</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
