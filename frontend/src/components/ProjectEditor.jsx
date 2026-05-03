import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import Crunker from 'crunker';
import './ProjectEditor.css';
import AudioTrack from './AudioTrack';
import { getAudioUrl } from '../utils/audioUtils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const TIMELINE_PIXELS_PER_SECOND = 90;
const MIN_TIMELINE_SECONDS = 5;
const TRACK_CONTROL_PANEL_WIDTH = 148;
const SLIDER_EXTRA_PX = 12; // make slider a bit wider
const SLIDER_SHIFT_LEFT_PX = 17; // shift slider a few pixels to the left
const TIMELINE_ALIGN_ADJUST_PX = 4; // fine tune alignment (pixels)
const SLIDER_ALIGN_ADJUST_PX = 0; // slider-only micro-adjust (pixels)
const SLIDER_RIGHT_EXTRA_PX = 0; // extra pixels to extend slider to the right
const SLIDER_LEFT_EXTRA_PX = 2; // extra pixels to extend slider to the left (keeps right edge fixed)

function ProjectEditor({ projectId, onUpdate, onToggleSidebar }, ref) {
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
  const [trackDurations, setTrackDurations] = useState({
    instrumental: 0,
    vocal: [],
  });
  const audioContextRef = useRef(null);
  const [buffers, setBuffers] = useState({ instrumental: null, vocal: [] });
  const sourcesRef = useRef({ instrumental: null, vocal: [] });
  const gainsRef = useRef({ instrumental: null, vocal: [] });
  const playbackStartRef = useRef(0); // audioContext.currentTime - playheadTime when playing
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const lyricsTimeoutRef = useRef(null);
  const instrumentalAudioRef = useRef(null);
  const vocalAudioRefs = useRef([]);
  const playheadAnimationRef = useRef(null);
  const timelineStartedRef = useRef(false);
  const tracksTimelineRef = useRef(null);
  const [timelineOffsetPx, setTimelineOffsetPx] = useState(TRACK_CONTROL_PANEL_WIDTH + 12 + 16);

  useImperativeHandle(ref, () => ({
    playAll,
    stopAll,
    openSaveDialog: () => setShowSaveDialog(true),
    openExportDialog: () => setShowExportDialog(true),
  }));

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
        setTrackDurations({
          instrumental: 0,
          vocal: data.vocalTracks.map(() => 0),
        });
        setBuffers({ instrumental: null, vocal: data.vocalTracks.map(() => null) });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  // helper: ensure AudioContext
  const ensureAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const loadBufferFromPath = async (filePath) => {
    if (!filePath) return null;
    try {
      const apiUrl = getAudioUrl(filePath);
      if (!apiUrl) return null;
      const resp = await fetch(apiUrl);
      if (!resp.ok) return null;
      const arrayBuffer = await resp.arrayBuffer();
      const ac = ensureAudioContext();
      const audioBuffer = await ac.decodeAudioData(arrayBuffer.slice(0));
      return audioBuffer;
    } catch (e) {
      console.error('loadBufferFromPath failed', e);
      return null;
    }
  };

  // load buffers when project files change
  useEffect(() => {
    let mounted = true;
    const loadAll = async () => {
      if (!project) return;
      const newBuffers = { instrumental: null, vocal: [] };
      if (project.instrumentalPath) {
        newBuffers.instrumental = await loadBufferFromPath(project.instrumentalPath);
      }
      for (let i = 0; i < project.vocalTracks.length; i += 1) {
        const p = project.vocalTracks[i]?.filePath || null;
        newBuffers.vocal[i] = p ? await loadBufferFromPath(p) : null;
      }

      if (!mounted) return;
      setBuffers(newBuffers);

      // update durations from buffers
      setTrackDurations((prev) => ({
        instrumental: (newBuffers.instrumental && newBuffers.instrumental.duration) || prev.instrumental || 0,
        vocal: (newBuffers.vocal || []).map((b, idx) => (b ? b.duration : (prev.vocal && prev.vocal[idx]) || 0)),
      }));
    };

    loadAll();
    return () => { mounted = false; };
  }, [project?.instrumentalPath, project?.vocalTracks?.map((t) => t?.filePath).join('|')]);

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

  const handleTrackDurationChange = useCallback((trackIndex, duration) => {
    const safeDuration = Number.isFinite(duration)
      ? Math.max(0, duration)
      : 0;

    setTrackDurations((prev) => {
      if (trackIndex === null) {
        if (prev.instrumental === safeDuration) {
          return prev;
        }

        return {
          ...prev,
          instrumental: safeDuration,
        };
      }

      const vocalDurations = prev.vocal || [];
      if (vocalDurations[trackIndex] === safeDuration) {
        return prev;
      }

      const nextVocalDurations = [...vocalDurations];
      nextVocalDurations[trackIndex] = safeDuration;

      return {
        ...prev,
        vocal: nextVocalDurations,
      };
    });
  }, []);

  const maxTrackDuration = useMemo(() => {
    return Math.max(
      trackDurations.instrumental || 0,
      ...(trackDurations.vocal || []),
      0
    );
  }, [trackDurations]);

  const timelineDuration = Math.max(
    MIN_TIMELINE_SECONDS,
    Math.ceil(maxTrackDuration)
  );
  const timelineWidth = timelineDuration * TIMELINE_PIXELS_PER_SECOND;
  const timelineMarkers = useMemo(
    () => Array.from({ length: timelineDuration + 1 }, (_, second) => second),
    [timelineDuration]
  );

  // compute pixel offset where waveforms start inside the scroll area
  useEffect(() => {
    const computeOffset = () => {
      try {
        const container = tracksTimelineRef.current;
        if (!container) return;
        // find first canvas waveform inside the container
        const canvas = container.querySelector('.waveform-canvas');
        if (!canvas) return;
        const containerRect = container.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const offset = Math.round(canvasRect.left - containerRect.left);
        if (Number.isFinite(offset)) setTimelineOffsetPx(offset);
      } catch (e) {
        // ignore
      }
    };

    computeOffset();
    window.addEventListener('resize', computeOffset);
    const mo = new MutationObserver(computeOffset);
    if (tracksTimelineRef.current) mo.observe(tracksTimelineRef.current, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('resize', computeOffset);
      try { mo.disconnect(); } catch {}
    };
  }, [timelineWidth, project]);

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

  const sanitizeExportName = (name) => {
    const safe = String(name || 'project')
      .split('')
      .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
      .join('')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    return safe || 'project';
  };

  const applyGainToBuffer = (audioContext, buffer, gain = 1) => {
    const clampedGain = Number.isFinite(gain) ? Math.max(0, gain) : 1;
    const output = audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const inputData = buffer.getChannelData(channel);
      const outputData = output.getChannelData(channel);
      for (let i = 0; i < inputData.length; i += 1) {
        outputData[i] = inputData[i] * clampedGain;
      }
    }

    return output;
  };

  const exportWithCrunkerFallback = async () => {
    const sources = [];

    if (selectedTracksForExport.includes(-1) && project.instrumentalPath) {
      const url = getAudioUrl(project.instrumentalPath);
      if (url) {
        sources.push({ url, volume: project.instrumentalVolume ?? 1 });
      }
    }

    selectedTracksForExport
      .filter((idx) => idx >= 0 && idx < project.vocalTracks.length)
      .forEach((idx) => {
        const track = project.vocalTracks[idx];
        if (track?.filePath) {
          const url = getAudioUrl(track.filePath);
          if (url) {
            sources.push({ url, volume: track.volume ?? 1 });
          }
        }
      });

    if (sources.length === 0) {
      throw new Error('Немає доступних доріжок для експорту');
    }

    const crunker = new Crunker({ sampleRate: 44100 });

    try {
      const buffers = await crunker.fetchAudio(...sources.map((item) => item.url));
      const gained = buffers.map((buffer, i) => applyGainToBuffer(crunker.context, buffer, sources[i].volume));
      const merged = crunker.mergeAudio(gained);
      const output = crunker.export(merged, 'audio/wav');

      crunker.download(output.blob, `${sanitizeExportName(project.name)}_mix`);
    } finally {
      crunker.close();
    }
  };

  const handleExportProject = async () => {
    setSaving(true);
    setError('');

    try {
      await exportWithCrunkerFallback();
      setShowExportDialog(false);
    } catch (fallbackErr) {
      setError(fallbackErr.message || 'Не вдалося експортувати проект');
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
      setTrackDurations((prev) => ({
        ...prev,
        vocal: [...(prev.vocal || []), 0],
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveTrack = async (trackIndexToRemove) => {
    if (!project || project.vocalTracks.length <= 1) {
      setError('Має бути хоча б одна вокальна доріжка');
      return;
    }

    const newTracks = project.vocalTracks
      .filter((_, idx) => idx !== trackIndexToRemove)
      .map((track, newIndex) => ({
        ...track,
        trackIndex: newIndex,
      }));

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

      if (!response.ok) throw new Error('Не вдалося видалити доріжку');

      const data = await response.json();
      setProject(data.project);
      onUpdate(data.project);
      setTrackDurations((prev) => ({
        ...prev,
        vocal: (prev.vocal || []).filter((_, idx) => idx !== trackIndexToRemove),
      }));

      vocalAudioRefs.current = vocalAudioRefs.current.filter((_, idx) => idx !== trackIndexToRemove);
      setSelectedTracksForExport((prev) => prev
        .filter((idx) => idx === -1 || idx !== trackIndexToRemove)
        .map((idx) => (idx > trackIndexToRemove ? idx - 1 : idx))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStartVocalRecording = () => {
    // Запускаємо інструментальну доріжку при запуску вокального запису
    if (instrumentalAudioRef.current && project?.instrumentalPath) {
      instrumentalAudioRef.current.currentTime = 0;
      instrumentalAudioRef.current.play().catch(() => {
        setError('Не вдалося запустити інструментал під час запису');
      });
    }
  };

  function playAll() {
    // Start WebAudio master playback from current playheadTime
    const ac = ensureAudioContext();
    if (!buffers) {
      setError('Аудіо дані не готові');
      return;
    }

    // stop any existing sources
    try {
      stopAll();
    } catch {}

    // resume context if suspended
    if (ac.state === 'suspended') ac.resume().catch(() => {});

    const startTime = ac.currentTime + 0.05;
    playbackStartRef.current = startTime - playheadTime;

    // create instrument source
    if (buffers.instrumental) {
      const src = ac.createBufferSource();
      src.buffer = buffers.instrumental;
      const gain = ac.createGain();
      gain.gain.value = typeof project.instrumentalVolume === 'number' ? project.instrumentalVolume : 1;
      src.connect(gain).connect(ac.destination);
      src.start(startTime, Math.min(playheadTime, buffers.instrumental.duration || 0));
      sourcesRef.current.instrumental = src;
      gainsRef.current.instrumental = gain;
    }

    // create vocal sources
    sourcesRef.current.vocal = [];
    gainsRef.current.vocal = [];
    project.vocalTracks.forEach((track, i) => {
      const buffer = buffers.vocal && buffers.vocal[i];
      if (buffer) {
        const src = ac.createBufferSource();
        src.buffer = buffer;
        const gain = ac.createGain();
        gain.gain.value = typeof track.volume === 'number' ? track.volume : 1;
        src.connect(gain).connect(ac.destination);
        src.start(startTime, Math.min(playheadTime, buffer.duration || 0));
        sourcesRef.current.vocal[i] = src;
        gainsRef.current.vocal[i] = gain;
      } else {
        sourcesRef.current.vocal[i] = null;
        gainsRef.current.vocal[i] = null;
      }
    });

    setIsTimelinePlaying(true);
    cancelAnimationFrame(playheadAnimationRef.current);
    const raf = () => {
      const t = ac.currentTime - playbackStartRef.current;
      setPlayheadTime(t);
      if (t >= timelineDuration) {
        // stop when reach end
        stopAll();
        return;
      }
      playheadAnimationRef.current = requestAnimationFrame(raf);
    };
    playheadAnimationRef.current = requestAnimationFrame(raf);
  }

  function stopAll() {
    // stop WebAudio sources if present
    try {
      if (sourcesRef.current.instrumental) {
        try { sourcesRef.current.instrumental.stop(); } catch {};
        try { sourcesRef.current.instrumental.disconnect(); } catch {};
        sourcesRef.current.instrumental = null;
      }
      if (sourcesRef.current.vocal && Array.isArray(sourcesRef.current.vocal)) {
        sourcesRef.current.vocal.forEach((s, idx) => {
          if (s) {
            try { s.stop(); } catch {};
            try { s.disconnect(); } catch {};
            sourcesRef.current.vocal[idx] = null;
          }
        });
      }
    } catch (e) {
      // ignore
    }

    // stop RAF
    cancelAnimationFrame(playheadAnimationRef.current);
    setIsTimelinePlaying(false);
  }

  const seekAll = (time) => {
    // set logical playhead position; if playing, restart master playback from this time
    setPlayheadTime(time);
    if (isTimelinePlaying) {
      // restart master playback from new time
      stopAll();
      // small timeout to ensure previous sources stopped
      setTimeout(() => {
        playAll();
      }, 10);
    }
  };

  

  const startTimelinePlay = () => {
    const playTargets = [];
    if (instrumentalAudioRef.current) playTargets.push(instrumentalAudioRef.current);
    vocalAudioRefs.current.forEach((a) => { if (a) playTargets.push(a); });

    if (playTargets.length === 0) {
      setError('Немає доріжок для відтворення');
      return;
    }

    // set currentTime for all targets, then play
    playTargets.forEach((audio) => {
      try {
        audio.currentTime = playheadTime;
        const p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {
        // ignore
      }
    });

    setIsTimelinePlaying(true);
    cancelAnimationFrame(playheadAnimationRef.current);
    playheadAnimationRef.current = requestAnimationFrame(animatePlayhead);
  };

  const pauseTimeline = () => {
    setIsTimelinePlaying(false);
    if (instrumentalAudioRef.current) instrumentalAudioRef.current.pause();
    vocalAudioRefs.current.forEach((a) => { if (a) a.pause(); });
    cancelAnimationFrame(playheadAnimationRef.current);
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

      <div className="editor-toolbar">
        <button
          type="button"
          className="projects-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle projects sidebar"
        >
          Проекти
        </button>
        <button
          className="action-btn start-btn"
          onClick={playAll}
        >
          ▶
        </button>
        <button
          className="action-btn stop-btn"
          onClick={stopAll}
        >
          ⏸
        </button>
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
          Експорт
        </button>
      </div>

      {/* timeline controls moved into tracks area so they scroll together with waveforms */}

      <div className="editor-content">
        <div className="editor-tracks">
          <div className="tracks-scroll-area">
            <div
              ref={tracksTimelineRef}
              className="tracks-timeline-content"
              style={{ minWidth: `${Math.max(timelineOffsetPx + timelineWidth + SLIDER_RIGHT_EXTRA_PX, timelineWidth + TRACK_CONTROL_PANEL_WIDTH)}px` }}
            >
              <div className="timeline-top" style={{ width: `${timelineWidth + TRACK_CONTROL_PANEL_WIDTH + SLIDER_RIGHT_EXTRA_PX}px` }}>
                <div className="timeline-slider-bar">
                  <input
                    type="range"
                    min={0}
                    max={timelineDuration}
                    step={0.01}
                    value={playheadTime}
                    onChange={(e) => {
                      const t = parseFloat(e.target.value);
                      seekAll(t);
                    }}
                    className="timeline-slider"
                    style={{ width: `${timelineWidth + SLIDER_EXTRA_PX + SLIDER_RIGHT_EXTRA_PX + SLIDER_LEFT_EXTRA_PX}px`, marginLeft: `${timelineOffsetPx - SLIDER_SHIFT_LEFT_PX - SLIDER_ALIGN_ADJUST_PX - SLIDER_LEFT_EXTRA_PX}px` }}
                  />
                </div>

                <div
                  className="global-timeline"
                  style={{ width: `${timelineWidth}px`, marginLeft: `${Math.max(0, timelineOffsetPx - TIMELINE_ALIGN_ADJUST_PX)}px` }}
                >
                  {timelineMarkers.map((second) => (
                    <div
                      key={second}
                      className="timeline-marker"
                      style={{ left: `${second * TIMELINE_PIXELS_PER_SECOND}px` }}
                    >
                      <span>{second}s</span>
                    </div>
                  ))}
                </div>

                <div
                  className="playhead-line"
                  style={{ left: `${timelineOffsetPx - TIMELINE_ALIGN_ADJUST_PX + playheadTime * TIMELINE_PIXELS_PER_SECOND}px` }}
                />
              </div>

              {/* Інструментальна доріжка */}
              <AudioTrack
                title="Інструментал"
                projectId={projectId}
                trackIndex={null}
                filePath={project.instrumentalPath}
                volume={instrumentalVolume}
                timelineDuration={timelineDuration}
                pixelsPerSecond={TIMELINE_PIXELS_PER_SECOND}
                onDurationChange={handleTrackDurationChange}
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

              {/* Вокал */}
              <div className="vocal-tracks-section">
                <div className="section-header">
                  <h3>Вокал</h3>
                </div>

                <div className="vocal-tracks-container">
                  {project.vocalTracks.map((track, index) => (
                    <div key={index} className="vocal-track-item">
                      <button
                        className="remove-track-btn"
                        onClick={() => handleRemoveTrack(index)}
                        title={`Видалити доріжку ${index + 1}`}
                        disabled={project.vocalTracks.length <= 1}
                      >
                        ✕
                      </button>
                      <AudioTrack
                        title={`Доріжка ${index + 1}`}
                        projectId={projectId}
                        trackIndex={index}
                        filePath={track.filePath}
                        volume={track.volume}
                        timelineDuration={timelineDuration}
                        pixelsPerSecond={TIMELINE_PIXELS_PER_SECOND}
                        onDurationChange={handleTrackDurationChange}
                        onStartRecording={handleStartVocalRecording}
                        onAudioReady={(audio) => {
                          vocalAudioRefs.current[index] = audio;
                        }}
                        onStopRecording={() => {
                          if (instrumentalAudioRef.current) {
                            try {
                              instrumentalAudioRef.current.pause();
                              instrumentalAudioRef.current.currentTime = 0;
                            } catch {
                              // ignore
                            }
                          }
                        }}
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
                    </div>
                  ))}
                </div>
                <div style={{ paddingTop: 8 }}>
                  <button
                    className="add-track-btn"
                    onClick={handleAddTrack}
                    disabled={project.vocalTracks.length >= 5}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lyrics-section">
          <h2>Текст</h2>
          <textarea
            className="lyrics-textarea"
            value={lyrics}
            onChange={handleLyricsChange}
            placeholder="Введіть текст..."
          />
        </div>
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
            <h3>Експорт</h3>
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

export default forwardRef(ProjectEditor);
