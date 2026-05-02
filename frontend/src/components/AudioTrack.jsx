import { useState, useRef } from 'react';
import './AudioTrack.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function AudioTrack({
  title,
  projectId,
  trackIndex,
  filePath,
  volume,
  onVolumeChange,
  onFileUpload,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioElementRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const fileInputRef = useRef(null);

  const startRecording = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      audioChunksRef.current = [];
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        await uploadRecording();
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      setError('Помилка доступу до мікрофону: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const uploadRecording = async () => {
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      await uploadAudio(audioBlob, 'audio/webm');
    } catch (err) {
      setError('Помилка при завантаженні запису: ' + err.message);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.includes('audio')) {
      setError('Будь ласка, виберіть аудіо файл');
      return;
    }

    uploadAudio(file, file.type);
  };

  const uploadAudio = async (audioData, mimeType) => {
    try {
      setError('');
      const formData = new FormData();
      formData.append(trackIndex === null ? 'instrumental' : 'vocal', audioData);

      const endpoint =
        trackIndex === null
          ? `/audio/upload/instrumental/${projectId}`
          : `/audio/upload/vocal/${projectId}/${trackIndex}`;

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Помилка при завантаженні');
      }

      const data = await response.json();
      onFileUpload(data.filePath || data.instrumentalPath);
      setUploadProgress(0);
    } catch (err) {
      setError(err.message);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const playAudio = async () => {
    if (!filePath) {
      setError('Файл не завантажено');
      return;
    }

    try {
      if (!audioElementRef.current) {
        const audio = new Audio();
        audioElementRef.current = audio;

        audio.addEventListener('ended', () => {
          setIsPlaying(false);
        });
      }

      const token = localStorage.getItem('token');
      const audioUrl = filePath.startsWith('http')
        ? filePath
        : `${API_URL}/../${filePath}`;

      audioElementRef.current.src = audioUrl;
      audioElementRef.current.play();
      setIsPlaying(true);
    } catch (err) {
      setError('Помилка при відтворенні: ' + err.message);
    }
  };

  const stopPlaying = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  };

  const clearTrack = async () => {
    try {
      stopPlaying();
      stopRecording();

      // На разі просто очищуємо локально, повна реалізація видалення файлу може бути в бекенді
      onFileUpload(null);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="audio-track">
      <div className="track-header">
        <h3>{title}</h3>
        {filePath && <span className="track-indicator">📁</span>}
      </div>

      {error && <div className="track-error">{error}</div>}

      <div className="track-controls">
        <div className="recording-controls">
          {!isRecording ? (
            <button
              className="record-btn"
              onClick={startRecording}
              title="Почати запис"
            >
              ● Запис
            </button>
          ) : (
            <>
              <button
                className="stop-btn"
                onClick={stopRecording}
                title="Зупинити запис"
              >
                ⏹ {recordingTime}s
              </button>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            className="upload-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Завантажити файл"
          >
            📤 Файл
          </button>
        </div>

        <div className="playback-controls">
          {filePath ? (
            <>
              {!isPlaying ? (
                <button
                  className="play-btn"
                  onClick={playAudio}
                  title="Прослухати"
                >
                  ▶ Слухати
                </button>
              ) : (
                <button
                  className="pause-btn"
                  onClick={stopPlaying}
                  title="Паузувати"
                >
                  ⏸ Паузу
                </button>
              )}
            </>
          ) : (
            <button className="play-btn disabled" disabled>
              ▶ Слухати
            </button>
          )}

          {filePath && (
            <button
              className="clear-btn"
              onClick={clearTrack}
              title="Очистити доріжку"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="volume-control">
        <label>Гучність</label>
        <div className="volume-slider-container">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="volume-slider"
          />
          <span className="volume-value">{Math.round(volume * 100)}%</span>
        </div>
      </div>

      {uploadProgress > 0 && uploadProgress < 100 && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}
    </div>
  );
}
