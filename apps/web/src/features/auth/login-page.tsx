import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { LanguageSwitch } from '../../components/ui/language-switch';
import { useI18n } from '../../i18n';
import { ApiError } from '../../lib/api';
import type { AuthTwoFactorChallenge } from '../../lib/api-types';
import { useAuth } from './auth-context';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, status } = useAuth();
  const { ui } = useI18n();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<AuthTwoFactorChallenge | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (status === 'authenticated') {
    return <Navigate replace to="/dashboard" />;
  }

  const resetChallenge = () => {
    setTwoFactorChallenge(null);
    setTwoFactorCode('');
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await login(
        username,
        password,
        twoFactorChallenge
          ? {
              challengeToken: twoFactorChallenge.challengeToken,
              twoFactorCode,
            }
          : undefined,
      );

      if (result.requiresTwoFactor) {
        setTwoFactorChallenge(result);
        return;
      }

      setTwoFactorChallenge(null);
      setTwoFactorCode('');
      navigate('/dashboard', {
        replace: true,
      });
    } catch (submissionError) {
      setError(
        submissionError instanceof ApiError
          ? submissionError.message
          : ui.auth.loginFailed,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-panel__header">
          <div>
            <p className="page-header__eyebrow">{ui.auth.eyebrow}</p>
            <h1>{ui.auth.title}</h1>
            <p>{ui.auth.description}</p>
          </div>
          <LanguageSwitch />
        </div>

        <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            <span>{ui.auth.username}</span>
            <input
              value={username}
              disabled={Boolean(twoFactorChallenge)}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            <span>{ui.auth.password}</span>
            <input
              type="password"
              disabled={Boolean(twoFactorChallenge)}
              placeholder={ui.auth.passwordPlaceholder}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {twoFactorChallenge ? (
            <>
              <div className="banner">{ui.auth.twoFactorBanner}</div>
              <label>
                <span>{ui.auth.twoFactorCode}</span>
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  required
                  placeholder={ui.auth.twoFactorPlaceholder}
                  value={twoFactorCode}
                  onChange={(event) =>
                    setTwoFactorCode(event.target.value.replace(/\D+/g, '').slice(0, 6))
                  }
                />
              </label>
            </>
          ) : null}
          {error ? <div className="banner banner--danger">{error}</div> : null}
          <div className="form-actions">
            <button
              className="button button--primary"
              type="submit"
              disabled={isSubmitting || (Boolean(twoFactorChallenge) && twoFactorCode.length !== 6)}
            >
              {isSubmitting
                ? twoFactorChallenge
                  ? ui.auth.verifyingCode
                  : ui.auth.signingIn
                : twoFactorChallenge
                  ? ui.auth.verifyCode
                  : ui.auth.submit}
            </button>
            {twoFactorChallenge ? (
              <button className="button" type="button" onClick={resetChallenge}>
                {ui.auth.changeCredentials}
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </main>
  );
}
