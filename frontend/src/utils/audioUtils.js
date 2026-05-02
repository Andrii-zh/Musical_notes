const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Конвертує шлях файлу у повний URL для відтворення
 * Змінює backslashes на forward slashes для Windows путів
 */
export const getAudioUrl = (filePath) => {
  if (!filePath) return null;

  if (filePath.startsWith('http')) {
    return filePath;
  }

  // Замінюємо backslashes на forward slashes для Windows
  let normalizedPath = filePath.replace(/\\/g, '/');
  if (normalizedPath.startsWith('uploads/')) {
    normalizedPath = normalizedPath.slice('uploads/'.length);
  }
  return `${API_URL}/files/${normalizedPath}`;
};
