import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { StatusPill } from '../../components/ui/status-pill';
import type {
  AdminUserMutationResponse,
  AdminUsersResponse,
  TwoFactorMutationResponse,
  TwoFactorSetupResponse,
  TwoFactorStatusResponse,
} from '../../lib/api-types';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

function formatTotpSecret(secret: string) {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}

function formatAdminRole(role: string) {
  if (role === 'SUPER_ADMIN') {
    return 'Супер-админ';
  }

  if (role === 'OPERATOR') {
    return 'Оператор';
  }

  if (role === 'READ_ONLY') {
    return 'Только чтение';
  }

  return role;
}

export function AdminUsersPage() {
  const { admin, apiFetch, refreshSession } = useAuth();
  const [response, setResponse] = useState<AdminUsersResponse | null>(null);
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatusResponse | null>(null);
  const [setupSession, setSetupSession] = useState<TwoFactorSetupResponse | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupPassword, setSetupPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [createUsername, setCreateUsername] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingSetup, setIsStartingSetup] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const [deletingAdminId, setDeletingAdminId] = useState<string | null>(null);

  const canManageAdmins = response?.capabilities.canManageAdmins ?? admin?.role === 'SUPER_ADMIN';

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [adminsResponse, nextTwoFactorStatus] = await Promise.all([
        apiFetch<AdminUsersResponse>('/api/admin-users'),
        apiFetch<TwoFactorStatusResponse>('/api/admin-users/me/two-factor'),
      ]);

      setResponse(adminsResponse);
      setTwoFactorStatus(nextTwoFactorStatus);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Не удалось загрузить администраторов.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    let cancelled = false;

    const renderQr = async () => {
      if (!setupSession?.otpauthUrl) {
        setQrImageUrl(null);
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(setupSession.otpauthUrl, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 320,
        });

        if (!cancelled) {
          setQrImageUrl(dataUrl);
        }
      } catch {
        if (!cancelled) {
          setQrImageUrl(null);
        }
      }
    };

    void renderQr();

    return () => {
      cancelled = true;
    };
  }, [setupSession]);

  const handleStartSetup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsStartingSetup(true);
    setError(null);
    setNotice(null);

    try {
      const payload = await apiFetch<TwoFactorSetupResponse>(
        '/api/admin-users/me/two-factor/setup',
        {
          method: 'POST',
          body: JSON.stringify({
            password: setupPassword,
          }),
        },
      );

      setSetupSession(payload);
      setSetupCode('');
      setNotice('Сканируйте QR-код в приложении-аутентификаторе и подтвердите шестизначным кодом.');
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Не удалось начать настройку 2FA.',
      );
    } finally {
      setIsStartingSetup(false);
    }
  };

  const handleEnable = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!setupSession) {
      return;
    }

    setIsEnabling(true);
    setError(null);
    setNotice(null);

    try {
      await apiFetch<TwoFactorMutationResponse>('/api/admin-users/me/two-factor/enable', {
        method: 'POST',
        body: JSON.stringify({
          setupToken: setupSession.setupToken,
          code: setupCode,
        }),
      });

      setSetupPassword('');
      setSetupCode('');
      setSetupSession(null);
      setNotice('2FA включена. Следующие входы будут требовать код подтверждения.');
      await refreshSession();
      await loadPage();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : 'Не удалось включить 2FA.',
      );
    } finally {
      setIsEnabling(false);
    }
  };

  const handleDisable = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsDisabling(true);
    setError(null);
    setNotice(null);

    try {
      await apiFetch<TwoFactorMutationResponse>('/api/admin-users/me/two-factor/disable', {
        method: 'POST',
        body: JSON.stringify({
          password: disablePassword,
          code: disableCode,
        }),
      });

      setDisablePassword('');
      setDisableCode('');
      setSetupSession(null);
      setNotice('2FA отключена для текущего администратора.');
      await refreshSession();
      await loadPage();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : 'Не удалось отключить 2FA.',
      );
    } finally {
      setIsDisabling(false);
    }
  };

  const handleCreateAdmin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingAdmin(true);
    setError(null);
    setNotice(null);

    try {
      await apiFetch('/api/admin-users', {
        method: 'POST',
        body: JSON.stringify({
          username: createUsername,
          email: createEmail,
          password: createPassword,
        }),
      });

      setCreateUsername('');
      setCreateEmail('');
      setCreatePassword('');
      setNotice('Оператор создан. Он может управлять клиентами, но не админскими аккаунтами.');
      await loadPage();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Не удалось создать операторский аккаунт.',
      );
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (adminUserId: string, username: string) => {
    if (!window.confirm(`Удалить аккаунт ${username}? Доступ этого оператора будет отозван.`)) {
      return;
    }

    setDeletingAdminId(adminUserId);
    setError(null);
    setNotice(null);

    try {
      await apiFetch<AdminUserMutationResponse>(`/api/admin-users/${adminUserId}`, {
        method: 'DELETE',
      });
      setNotice(`Аккаунт ${username} удалён.`);
      await loadPage();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Не удалось удалить администраторский аккаунт.',
      );
    } finally {
      setDeletingAdminId(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Администраторы"
        description="Роли доступа, статус учётных записей и усиленная защита входа для административного доступа."
      />

      {notice ? <div className="banner banner--success">{notice}</div> : null}
      {error ? <div className="banner banner--danger">{error}</div> : null}

      <SectionCard
        title="Защита входа"
        subtitle="TOTP 2FA включается для текущего администратора и начинает требоваться на следующем входе."
      >
        <div className="two-factor-stack">
          <div className="feature-list__card">
            <div className="two-factor-status">
              <div>
                <strong>{admin?.username ?? 'Текущий администратор'}</strong>
                <span>
                  {twoFactorStatus?.enabled
                    ? 'Для входа требуется код из приложения-аутентификатора.'
                    : setupSession
                      ? 'Настройка начата. Подтвердите кодом, чтобы активировать 2FA.'
                      : '2FA пока выключена. Включите её для защиты панели.'}
                </span>
              </div>
              <StatusPill
                tone={twoFactorStatus?.enabled ? 'success' : setupSession ? 'warning' : 'muted'}
              >
                {twoFactorStatus?.enabled
                  ? '2FA включена'
                  : setupSession
                    ? 'Ожидает подтверждения'
                    : '2FA выключена'}
              </StatusPill>
            </div>
          </div>

          {!twoFactorStatus?.enabled && !setupSession ? (
            <form className="inline-form" onSubmit={(event) => void handleStartSetup(event)}>
              <label className="login-form__field">
                <span>Текущий пароль</span>
                <input
                  type="password"
                  required
                  value={setupPassword}
                  onChange={(event) => setSetupPassword(event.target.value)}
                  placeholder="Подтвердите пароль"
                />
              </label>
              <div className="form-actions">
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={isStartingSetup || setupPassword.length < 8}
                >
                  {isStartingSetup ? 'Готовим QR...' : 'Начать настройку 2FA'}
                </button>
              </div>
            </form>
          ) : null}

          {setupSession ? (
            <div className="two-factor-grid">
              <div className="feature-list__card">
                <strong>1. Добавьте запись в приложение-аутентификатор</strong>
                <span>
                  Подойдут Google Authenticator, Microsoft Authenticator, 2FAS, Authy или Aegis.
                </span>
                {qrImageUrl ? (
                  <div className="qr-shell">
                    <img alt="QR для настройки 2FA" src={qrImageUrl} />
                  </div>
                ) : null}
              </div>

              <div className="feature-list__card">
                <strong>2. Сохраните резервный ручной ключ</strong>
                <code className="detail-list__mono">{formatTotpSecret(setupSession.secret)}</code>
                <span>Этот ключ нужен, если QR-код не открывается или устройство меняется.</span>
                <span>Истекает: {formatDateTime(setupSession.expiresAt)}</span>
              </div>

              <form className="feature-list__card" onSubmit={(event) => void handleEnable(event)}>
                <strong>3. Подтвердите шестизначный код</strong>
                <label className="login-form__field">
                  <span>Код из приложения</span>
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    required
                    placeholder="123456"
                    value={setupCode}
                    onChange={(event) =>
                      setSetupCode(event.target.value.replace(/\D+/g, '').slice(0, 6))
                    }
                  />
                </label>
                <div className="form-actions">
                  <button
                    className="button button--primary"
                    type="submit"
                    disabled={isEnabling || setupCode.length !== 6}
                  >
                    {isEnabling ? 'Подтверждаем...' : 'Включить 2FA'}
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      setSetupSession(null);
                      setSetupCode('');
                      setNotice(null);
                    }}
                  >
                    Отменить
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {twoFactorStatus?.enabled ? (
            <form className="two-factor-disable" onSubmit={(event) => void handleDisable(event)}>
              <div className="field-grid">
                <label className="login-form__field">
                  <span>Текущий пароль</span>
                  <input
                    type="password"
                    required
                    value={disablePassword}
                    onChange={(event) => setDisablePassword(event.target.value)}
                    placeholder="Подтвердите пароль"
                  />
                </label>
                <label className="login-form__field">
                  <span>Код из приложения</span>
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    required
                    placeholder="123456"
                    value={disableCode}
                    onChange={(event) =>
                      setDisableCode(event.target.value.replace(/\D+/g, '').slice(0, 6))
                    }
                  />
                </label>
              </div>
              <div className="form-actions">
                <button
                  className="button button--danger"
                  type="submit"
                  disabled={isDisabling || disablePassword.length < 8 || disableCode.length !== 6}
                >
                  {isDisabling ? 'Отключаем...' : 'Отключить 2FA'}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </SectionCard>

      {canManageAdmins ? (
        <SectionCard
          title="Операторские аккаунты"
          subtitle="Супер-админ может выдавать подчинённым операторам доступ к управлению клиентами без доступа к админским аккаунтам."
        >
          <form className="field-grid" onSubmit={(event) => void handleCreateAdmin(event)}>
            <label className="login-form__field">
              <span>Логин оператора</span>
              <input
                required
                minLength={3}
                value={createUsername}
                onChange={(event) => setCreateUsername(event.target.value)}
                placeholder="operator"
              />
            </label>
            <label className="login-form__field">
              <span>Email</span>
              <input
                type="email"
                required
                value={createEmail}
                onChange={(event) => setCreateEmail(event.target.value)}
                placeholder="operator@example.com"
              />
            </label>
            <label className="login-form__field">
              <span>Стартовый пароль</span>
              <input
                type="password"
                required
                minLength={12}
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder="Минимум 12 символов"
              />
            </label>
            <div className="form-actions">
              <button
                className="button button--primary"
                type="submit"
                disabled={
                  isCreatingAdmin ||
                  createUsername.trim().length < 3 ||
                  createEmail.trim().length < 3 ||
                  createPassword.length < 12
                }
              >
                {isCreatingAdmin ? 'Создаём...' : 'Создать оператора'}
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Список администраторов"
        subtitle={
          canManageAdmins
            ? 'Супер-админ управляет составом операторов. Операторы могут работать с клиентами, но не с админскими аккаунтами.'
            : 'Список административных аккаунтов доступен для справки. Управление составом доступно только супер-админу.'
        }
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>2FA</th>
                <th>Создан</th>
                {canManageAdmins ? <th>Действия</th> : null}
              </tr>
            </thead>
            <tbody>
              {response?.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="table-main">
                      <strong>
                        {item.isCurrentAdmin ? `${item.username} (вы)` : item.username}
                      </strong>
                      <span>{item.email}</span>
                    </div>
                  </td>
                  <td>{formatAdminRole(item.role)}</td>
                  <td>
                    <StatusPill tone={item.isActive ? 'success' : 'muted'}>
                      {item.isActive ? 'Активен' : 'Отключен'}
                    </StatusPill>
                  </td>
                  <td>
                    <StatusPill tone={item.twoFactorEnabled ? 'success' : 'muted'}>
                      {item.twoFactorEnabled ? 'Включена' : 'Выключена'}
                    </StatusPill>
                  </td>
                  <td>{formatDateTime(item.createdAt)}</td>
                  {canManageAdmins ? (
                    <td>
                      {item.canDelete ? (
                        <button
                          className="button button--danger"
                          type="button"
                          aria-label={`Удалить ${item.username}`}
                          disabled={deletingAdminId === item.id}
                          onClick={() => void handleDeleteAdmin(item.id, item.username)}
                        >
                          {deletingAdminId === item.id ? 'Удаляем...' : 'Удалить'}
                        </button>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isLoading ? <div className="empty-state">Загружаем администраторов...</div> : null}
      </SectionCard>
    </div>
  );
}
