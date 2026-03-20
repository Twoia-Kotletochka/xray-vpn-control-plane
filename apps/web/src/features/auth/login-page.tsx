import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { ui } from '../../i18n';
import { ApiError } from '../../lib/api';
import { useAuth } from './auth-context';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, status } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (status === 'authenticated') {
    return <Navigate replace to="/dashboard" />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await login(username, password);
      navigate('/dashboard', {
        replace: true,
      });
    } catch (submissionError) {
      setError(
        submissionError instanceof ApiError
          ? submissionError.message
          : 'Не удалось выполнить вход. Проверьте логин и пароль.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <div>
          <p className="page-header__eyebrow">{ui.auth.eyebrow}</p>
          <h1>{ui.auth.title}</h1>
          <p>{ui.auth.description}</p>
        </div>

        <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            <span>{ui.auth.username}</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            <span>{ui.auth.password}</span>
            <input
              type="password"
              placeholder={ui.auth.passwordPlaceholder}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <div className="banner banner--danger">{error}</div> : null}
          <button className="button button--primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Выполняем вход...' : ui.auth.submit}
          </button>
        </form>
      </section>
    </main>
  );
}
