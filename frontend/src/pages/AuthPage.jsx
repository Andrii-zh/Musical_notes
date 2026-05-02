import { useState } from 'react';
import './AuthPage.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function AuthPage({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Помилка при обробці запиту');
      }

      // Зберігаємо токен і логіним користувача
      onLogin(data.token);
    } catch (err) {
      setError(err.message || 'Невідома помилка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>🎵 Musical Notes</h1>
          <p>Нотатки для музикантів</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Пошта</label>
            <input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Завантаження...' : isLogin ? 'Увійти' : 'Зареєструватись'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {isLogin ? 'Немаєте акаунту?' : 'Вже маєте акаунт?'}
            <button
              type="button"
              className="toggle-btn"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setEmail('');
                setPassword('');
              }}
            >
              {isLogin ? 'Зареєструватись' : 'Увійти'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
