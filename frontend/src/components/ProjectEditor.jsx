import { useState, useEffect, useRef } from 'react';
import './ProjectEditor.css';
import AudioTrack from './AudioTrack';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function ProjectEditor({ projectId, onUpdate }) {
  const [project, setProject] = useState(null);
  const [lyrics, setLyrics] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [instrumentalVolume, setInstrumentalVolume] = useState(1);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedTracksForExport, setSelectedTracksForExport] = useState([]);
  const lyricsTimeoutRef = useRef(null);
  const instrumentalAudioRef = useRef(null);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/projects/${projectId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error('Не вдалося завантажити проект');

        const data = await response.json();
        setProject(data);
        setLyrics(data.lyrics || '');
        setProjectName(data.name);
        setInstrumentalVolume(data.instrumentalVolume || 1);
        setSelectedTracksForExport(
          data.vocalTracks.map((_, idx) => idx)
        );
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  const saveLyrics = async (newLyrics) => {
    if (!project) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lyrics: newLyrics,
        }),
      });

      if (!response.ok) throw new Error('Не вдалося зберегти текст');

      const data = await response.json();
      setProject(data.project);
      onUpdate(data.project);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLyricsChange = (e) => {
    const newLyrics = e.target.value;
    setLyrics(newLyrics);

    if (lyricsTimeoutRef.current) {
      clearTimeout(lyricsTimeoutRef.current);
    }

    lyricsTimeoutRef.current = setTimeout(() => {
      saveLyrics(newLyrics);
    }, 1000);
  };

  const handleSaveProject = async () => {
    if (!projectName.trim()) return;

    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: projectName,
        }),
      });

      if (!response.ok) throw new Error('Не вдалося зберегти проект');

      const data = await response.json();
      setProject(data.project);
      onUpdate(data.project);
      setShowSaveDialog(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportProject = async () => {
    if (selectedTracksForExport.length === 0) {
      setError('Виберіть хоча б одну доріжку для експорту');
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/audio/export/${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          trackIndices: selectedTracksForExport,
        }),
      });

      if (!response.ok) throw new Error('Не вдалося експортувати проект');

      const data = await response.json();

      // Завантажуємо файл
      const downloadUrl = `${API_URL}${data.filePath}`;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${project.name}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setShowExportDialog(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTrack = async () => {
    if (!project || project.vocalTracks.length >= 5) {
      setError('Максимум 5 вокальних доріжок');
      return;
    }

    const newTracks = [
      ...project.vocalTracks,
      {
        trackIndex: project.vocalTracks.length,
        filePath: null,
        volume: 1,
      },
    ];

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          vocalTracks: newTracks,
        }),
      });

      if (!response.ok) throw new Error('Не вдалося додати доріжку');

      const data = await response.json();
      setProject(data.project);
      onUpdate(data.project);
      setSelectedTracksForExport([...selectedTracksForExport, project.vocalTracks.length]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStartVocalRecording = () => {
    // Запускаємо інструментальну доріжку при запуску вокального запису
    if (instrumentalAudioRef.current && project?.instrumentalPath) {
      instrumentalAudioRef.current.play();
    }
  };

  if (loading) {
    return <div className="editor-loading">Завантаження...</div>;
  }

  if (!project) {
    return <div className="editor-error">Проект не знайдено</div>;
  }

  return (
    <div className="project-editor">
      {error && (
        <div className="editor-error-banner">
          {error}
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      <div className="editor-content">
        <div className="editor-tracks">
          {/* Інструментальна доріжка */}
          <AudioTrack
            title="Інструментал"
            projectId={projectId}
            trackIndex={null}
            filePath={project.instrumentalPath}
            volume={instrumentalVolume}
            onAudioReady={(audio) => {
              instrumentalAudioRef.current = audio;
            }}
            onVolumeChange={async (newVolume) => {
              setInstrumentalVolume(newVolume);
              try {
                const token = localStorage.getItem('token');
                const response = await fetch(`${API_URL}/projects/${projectId}`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    instrumentalVolume: newVolume,
                  }),
                });
                if (response.ok) {
                  const data = await response.json();
                  setProject(data.project);
                  onUpdate(data.project);
                }
              } catch (err) {
                setError(err.message);
              }
            }}
            onFileUpload={async (newFilePath) => {
              const newProject = {
                ...project,
                instrumentalPath: newFilePath,
              };
              setProject(newProject);
              onUpdate(newProject);
            }}
          />

          {/* Вокальні доріжки */}
          <div className="vocal-tracks-section">
            <div className="section-header">
              <h3>Вокальні доріжки</h3>
              <button
                className="add-track-btn"
                onClick={handleAddTrack}
                disabled={project.vocalTracks.length >= 5}
              >
                +
              </button>
            </div>

            <div className="vocal-tracks-container">
              {project.vocalTracks.map((track, index) => (
                <AudioTrack
                  key={index}
                  title={`Доріжка ${index + 1}`}
                  projectId={projectId}
                  trackIndex={index}
                  filePath={track.filePath}
                  volume={track.volume}
                  onStartRecording={handleStartVocalRecording}
                  onVolumeChange={async (newVolume) => {
                    const newTracks = [...project.vocalTracks];
                    newTracks[index].volume = newVolume;
                    try {
                      const token = localStorage.getItem('token');
                      const response = await fetch(
                        `${API_URL}/projects/${projectId}`,
                        {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({
                            vocalTracks: newTracks,
                          }),
                        }
                      );
                      if (response.ok) {
                        const data = await response.json();
                        setProject(data.project);
                        onUpdate(data.project);
                      }
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                  onFileUpload={async (newFilePath) => {
                    const newTracks = [...project.vocalTracks];
                    newTracks[index].filePath = newFilePath;
                    const newProject = { ...project, vocalTracks: newTracks };
                    setProject(newProject);
                    onUpdate(newProject);
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="lyrics-section">
          <h2>Текст пісні</h2>
          <textarea
            className="lyrics-textarea"
            value={lyrics}
            onChange={handleLyricsChange}
            placeholder="Введіть текст пісні..."
          />
        </div>
      </div>

      <div className="editor-footer">
        <button
          className="action-btn save-btn"
          onClick={() => setShowSaveDialog(true)}
        >
          Зберегти
        </button>
        <button
          className="action-btn export-btn"
          onClick={() => setShowExportDialog(true)}
        >
          Експорт MP3
        </button>
      </div>

      {/* Діалог збереження */}
      {showSaveDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Зберегти проект</h3>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Назва проекту"
              autoFocus
            />
            <div className="modal-buttons">
              <button
                className="modal-btn primary"
                onClick={handleSaveProject}
                disabled={saving}
              >
                {saving ? 'Збереження...' : 'Зберегти'}
              </button>
              <button
                className="modal-btn"
                onClick={() => setShowSaveDialog(false)}
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Діалог експорту */}
      {showExportDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Експорт MP3</h3>
            <div className="export-checklist">
              <label>
                <input
                  type="checkbox"
                  checked={selectedTracksForExport.includes(-1)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTracksForExport([-1, ...selectedTracksForExport]);
                    } else {
                      setSelectedTracksForExport(
                        selectedTracksForExport.filter((i) => i !== -1)
                      );
                    }
                  }}
                />
                Інструментал
              </label>
              {project.vocalTracks.map((_, index) => (
                <label key={index}>
                  <input
                    type="checkbox"
                    checked={selectedTracksForExport.includes(index)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTracksForExport([
                          ...selectedTracksForExport,
                          index,
                        ]);
                      } else {
                        setSelectedTracksForExport(
                          selectedTracksForExport.filter((i) => i !== index)
                        );
                      }
                    }}
                  />
                  Доріжка {index + 1}
                </label>
              ))}
            </div>
            <div className="modal-buttons">
              <button
                className="modal-btn primary"
                onClick={handleExportProject}
                disabled={saving}
              >
                {saving ? 'Експортування...' : 'Експортувати'}
              </button>
              <button
                className="modal-btn"
                onClick={() => setShowExportDialog(false)}
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
