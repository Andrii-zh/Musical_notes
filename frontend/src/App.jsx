import { useState } from 'react';
import './App.css';
import AuthPage from './pages/AuthPage';
import MainLayout from './pages/MainLayout';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const token = localStorage.getItem('token');
    return Boolean(token);
  });
  const loading = false;

  const handleLogin = (token) => {
    localStorage.setItem('token', token);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  if (loading) {
    return <div className="loading">Завантаження...</div>;
  }

  return (
    <div className="app">
      {isAuthenticated ? (
        <MainLayout onLogout={handleLogout} />
      ) : (
        <AuthPage onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;
