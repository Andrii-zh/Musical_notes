import { useState, useRef, useEffect } from 'react';
import './AudioTrack.css';
import { getAudioUrl } from '../utils/audioUtils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function AudioTrack({
  title,
  projectId,
  trackIndex,
  filePath,
  volume,
  onVolumeChange,
  onFileUpload,
  onStartRecording,
  onAudioReady,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const analyserRef = useRef(null);
  const animationIdRef = useRef(null);

  const getOrCreateAudioElement = () => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
      });
      audio.addEventListener('error', () => {
        setError('Помилка при відтворенні аудіо');
      });
      audioRef.current = audio;

      if (trackIndex === null && onAudioReady) {
        onAudioReady(audio);
      }
    }

    return audioRef.current;
  };

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

      // Запускаємо інструментал якщо це вокальна доріжка та існує інструментал
      if (trackIndex !== null && onStartRecording) {
        onStartRecording();
      }

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);

      // Старт вейвформи для запису
      startRecordingWaveform(stream);
    } catch (err) {
      setError('Помилка доступу до мікрофону: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      stopRecordingWaveform();
    }
  };

  const startRecordingWaveform = (stream) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      drawRecordingWaveform();
    } catch (err) {
      console.error('Помилка при створенні analyser:', err);
    }
  };

  const drawRecordingWaveform = () => {
    if (!canvasRef.current || !analyserRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationIdRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      // Очищуємо canvas
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Малюємо смужки частот
      ctx.fillStyle = '#0a84ff';
      const barWidth = canvas.width / bufferLength;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth - 1, barHeight);
      }
    };

    draw();
  };

  const stopRecordingWaveform = () => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  // Малювання вейвформи для завантаженого файлу
  useEffect(() => {
    if (!filePath || isRecording) return;

    const drawPlaybackWaveform = async () => {
      if (!canvasRef.current) return;

      try {
        const audioUrl = getAudioUrl(filePath);
        if (!audioUrl) return;

        const response = await fetch(audioUrl, { method: 'GET' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();

        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }

        const audioContext = audioContextRef.current;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Очищуємо canvas
        ctx.fillStyle = '#0d0d0d';
        ctx.fillRect(0, 0, width, height);

        // Отримуємо дані звуку
        const data = audioBuffer.getChannelData(0);
        const blockSize = Math.ceil(data.length / width);
        const filterData = [];

        for (let i = 0; i < width; i++) {
          let blockStart = blockSize * i;
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(data[blockStart + j]);
          }
          filterData.push(sum / blockSize);
        }

        // Малюємо лінію вейвформи
        const scale = height / 2;
        ctx.strokeStyle = '#0a84ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, scale);

        for (let i = 0; i < width; i++) {
          const y = height - (filterData[i] * scale * 5) - scale;
          ctx.lineTo(i, y);
        }
        ctx.stroke();

        // Малюємо центральну лінію
        ctx.strokeStyle = '#3a3a3c';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, scale);
        ctx.lineTo(width, scale);
        ctx.stroke();

      } catch {
        // Якщо аудіо ще не доступне або файл не підтримується, не засмічуємо UI помилками.
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          ctx.fillStyle = '#0d0d0d';
          ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.strokeStyle = '#0a84ff';
          ctx.beginPath();
          ctx.moveTo(0, canvasRef.current.height / 2);
          ctx.lineTo(canvasRef.current.width, canvasRef.current.height / 2);
          ctx.stroke();
        }
      }
    };

    drawPlaybackWaveform();
  }, [filePath, isRecording]);

  // Оновлюємо volume при змінах
  useEffect(() => {
    const audioElement = audioRef.current;
    if (audioElement) {
      audioElement.volume = Math.max(0, Math.min(1, volume));
    }
  }, [volume]);

  const uploadRecording = async () => {
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      await uploadAudio(audioBlob);
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

    uploadAudio(file);
  };

  const uploadAudio = async (audioData) => {
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
      const audioUrl = getAudioUrl(filePath);
      if (!audioUrl) {
        setError('Невирний шлях файлу');
        return;
      }

      console.log('🔊 Відтворюю:', audioUrl);

      const audioElement = getOrCreateAudioElement();
      if (!audioElement) return;

      audioElement.src = audioUrl;
      audioElement.volume = volume;
      audioElement.currentTime = 0;
      
      const playPromise = audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.error('Помилка play():', err);
          setError('Не вдалося запустити відтворення: ' + err.message);
        });
      }
      
      setIsPlaying(true);
    } catch (err) {
      console.error('Помилка при відтворенні:', err);
      setError('Помилка при відтворенні: ' + err.message);
    }
  };

  const stopPlaying = () => {
    const audioElement = audioRef.current;
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
    setIsPlaying(false);
  };

  const clearTrack = async () => {
    try {
      stopPlaying();
      stopRecording();

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

      <canvas
        ref={canvasRef}
        className="waveform-canvas"
        width={300}
        height={80}
      />

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

    </div>
  );
}
