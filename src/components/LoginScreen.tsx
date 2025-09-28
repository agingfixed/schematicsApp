import React, { useState } from 'react';
import { useAuthStore } from '../state/authStore';
import { DesktopDownloadSection } from './DesktopDownloadSection';

export const LoginScreen: React.FC = () => {
  const login = useAuthStore((state) => state.login);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const success = login(username, password);
    if (success) {
      setPassword('');
    }
  };

  const handleUsernameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (error) {
      clearError();
    }
    setUsername(event.target.value);
  };

  const handlePasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (error) {
      clearError();
    }
    setPassword(event.target.value);
  };

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <form className="login-card" onSubmit={handleSubmit}>
          <h1 className="login-card__title">Sign in</h1>
          <p className="login-card__subtitle">Use the demo credentials to access your boards.</p>
          <div className="login-card__field">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={handleUsernameChange}
              placeholder="admin"
              required
            />
          </div>
          <div className="login-card__field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={handlePasswordChange}
              placeholder="password"
              required
            />
          </div>
          {error && <div className="login-card__error" role="alert">{error}</div>}
          <button type="submit" className="login-card__submit">
            Sign in
          </button>
          <div className="login-card__hint">
            <span>Demo account</span>
            <code>admin / password</code>
          </div>
        </form>
        <DesktopDownloadSection />
      </div>
    </div>
  );
};

export default LoginScreen;
