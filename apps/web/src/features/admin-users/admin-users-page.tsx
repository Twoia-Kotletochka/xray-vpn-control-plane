import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { StatusPill } from '../../components/ui/status-pill';
import { useI18n } from '../../i18n';
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

function formatAdminRole(role: string, locale: 'ru' | 'en') {
  if (role === 'SUPER_ADMIN') {
    return locale === 'en' ? 'Super admin' : 'Супер-админ';
  }

  if (role === 'OPERATOR') {
    return locale === 'en' ? 'Operator' : 'Оператор';
  }

  if (role === 'READ_ONLY') {
    return locale === 'en' ? 'Read-only' : 'Только чтение';
  }

  return role;
}

export function AdminUsersPage() {
  const { admin, apiFetch, refreshSession } = useAuth();
  const { locale, ui } = useI18n();
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
  const text =
    locale === 'en'
      ? {
          loadError: 'Failed to load admin users.',
          startSetupNotice:
            'Scan the QR code in your authenticator app and confirm with the six-digit code.',
          startSetupError: 'Failed to start 2FA setup.',
          enabledNotice: '2FA is enabled. Future sign-ins will require a verification code.',
          enabledError: 'Failed to enable 2FA.',
          disabledNotice: '2FA has been disabled for the current administrator.',
          disabledError: 'Failed to disable 2FA.',
          operatorCreated:
            'The operator account was created. It can manage clients but not admin accounts.',
          createError: 'Failed to create the operator account.',
          deleteConfirm: (username: string) =>
            `Delete account ${username}? This operator's access will be revoked.`,
          deleteNotice: (username: string) => `Account ${username} was deleted.`,
          deleteError: 'Failed to delete the admin account.',
          description:
            'Access roles, account status, and stronger sign-in protection for administrative access.',
          protectionTitle: 'Sign-in protection',
          protectionSubtitle:
            'TOTP 2FA is enabled for the current administrator and becomes required on the next sign-in.',
          currentAdmin: 'Current administrator',
          codeRequired: 'An authenticator app code is required to sign in.',
          setupStarted: 'Setup started. Confirm with the code to activate 2FA.',
          setupDisabled: '2FA is currently off. Enable it to protect the panel.',
          twoFactorEnabled: '2FA enabled',
          pendingConfirmation: 'Pending confirmation',
          twoFactorDisabled: '2FA disabled',
          currentPassword: 'Current password',
          confirmPassword: 'Confirm your password',
          preparingQr: 'Preparing QR...',
          startTwoFactor: 'Start 2FA setup',
          addAuthenticator: '1. Add the entry to an authenticator app',
          authenticatorApps:
            'Google Authenticator, Microsoft Authenticator, 2FAS, Authy, or Aegis will all work.',
          qrAlt: 'QR for 2FA setup',
          saveManualKey: '2. Save the backup manual key',
          manualKeyHint:
            'You need this key if the QR code does not open or if the device changes.',
          expiresAt: 'Expires at',
          confirmCode: '3. Confirm the six-digit code',
          appCode: 'Code from the app',
          confirming: 'Confirming...',
          enableTwoFactor: 'Enable 2FA',
          cancel: 'Cancel',
          disabling: 'Disabling...',
          disableTwoFactor: 'Disable 2FA',
          operatorsTitle: 'Operator accounts',
          operatorsSubtitle:
            'The super admin can grant operators access to manage clients without allowing admin-account management.',
          operatorUsername: 'Operator username',
          initialPassword: 'Initial password',
          minimumChars: 'Minimum 12 characters',
          creating: 'Creating...',
          createOperator: 'Create operator',
          adminsTitle: 'Admin user list',
          adminsSubtitleManage:
            'The super admin manages the operator roster. Operators can work with clients, but not admin accounts.',
          adminsSubtitleView:
            'The administrative account list is visible for reference. Managing it is restricted to the super admin.',
          user: 'User',
          role: 'Role',
          status: 'Status',
          created: 'Created',
          actions: 'Actions',
          youSuffix: '(you)',
          active: 'Active',
          disabled: 'Disabled',
          enabled: 'Enabled',
          off: 'Off',
          deleting: 'Deleting...',
          delete: 'Delete',
          loading: 'Loading administrators...',
          notSet: 'Not set',
        }
      : {
          loadError: 'Не удалось загрузить администраторов.',
          startSetupNotice:
            'Сканируйте QR-код в приложении-аутентификаторе и подтвердите шестизначным кодом.',
          startSetupError: 'Не удалось начать настройку 2FA.',
          enabledNotice: '2FA включена. Следующие входы будут требовать код подтверждения.',
          enabledError: 'Не удалось включить 2FA.',
          disabledNotice: '2FA отключена для текущего администратора.',
          disabledError: 'Не удалось отключить 2FA.',
          operatorCreated:
            'Оператор создан. Он может управлять клиентами, но не админскими аккаунтами.',
          createError: 'Не удалось создать операторский аккаунт.',
          deleteConfirm: (username: string) =>
            `Удалить аккаунт ${username}? Доступ этого оператора будет отозван.`,
          deleteNotice: (username: string) => `Аккаунт ${username} удалён.`,
          deleteError: 'Не удалось удалить администраторский аккаунт.',
          description:
            'Роли доступа, статус учётных записей и усиленная защита входа для административного доступа.',
          protectionTitle: 'Защита входа',
          protectionSubtitle:
            'TOTP 2FA включается для текущего администратора и начинает требоваться на следующем входе.',
          currentAdmin: 'Текущий администратор',
          codeRequired: 'Для входа требуется код из приложения-аутентификатора.',
          setupStarted: 'Настройка начата. Подтвердите кодом, чтобы активировать 2FA.',
          setupDisabled: '2FA пока выключена. Включите её для защиты панели.',
          twoFactorEnabled: '2FA включена',
          pendingConfirmation: 'Ожидает подтверждения',
          twoFactorDisabled: '2FA выключена',
          currentPassword: 'Текущий пароль',
          confirmPassword: 'Подтвердите пароль',
          preparingQr: 'Готовим QR...',
          startTwoFactor: 'Начать настройку 2FA',
          addAuthenticator: '1. Добавьте запись в приложение-аутентификатор',
          authenticatorApps:
            'Подойдут Google Authenticator, Microsoft Authenticator, 2FAS, Authy или Aegis.',
          qrAlt: 'QR для настройки 2FA',
          saveManualKey: '2. Сохраните резервный ручной ключ',
          manualKeyHint:
            'Этот ключ нужен, если QR-код не открывается или устройство меняется.',
          expiresAt: 'Истекает',
          confirmCode: '3. Подтвердите шестизначный код',
          appCode: 'Код из приложения',
          confirming: 'Подтверждаем...',
          enableTwoFactor: 'Включить 2FA',
          cancel: 'Отменить',
          disabling: 'Отключаем...',
          disableTwoFactor: 'Отключить 2FA',
          operatorsTitle: 'Операторские аккаунты',
          operatorsSubtitle:
            'Супер-админ может выдавать подчинённым операторам доступ к управлению клиентами без доступа к админским аккаунтам.',
          operatorUsername: 'Логин оператора',
          initialPassword: 'Стартовый пароль',
          minimumChars: 'Минимум 12 символов',
          creating: 'Создаём...',
          createOperator: 'Создать оператора',
          adminsTitle: 'Список администраторов',
          adminsSubtitleManage:
            'Супер-админ управляет составом операторов. Операторы могут работать с клиентами, но не с админскими аккаунтами.',
          adminsSubtitleView:
            'Список административных аккаунтов доступен для справки. Управление составом доступно только супер-админу.',
          user: 'Пользователь',
          role: 'Роль',
          status: 'Статус',
          created: 'Создан',
          actions: 'Действия',
          youSuffix: '(вы)',
          active: 'Активен',
          disabled: 'Отключен',
          enabled: 'Включена',
          off: 'Выключена',
          deleting: 'Удаляем...',
          delete: 'Удалить',
          loading: 'Загружаем администраторов...',
          notSet: 'Не задано',
        };

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
      setError(loadError instanceof Error ? loadError.message : text.loadError);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, text.loadError]);

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
      setNotice(text.startSetupNotice);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : text.startSetupError);
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
      setNotice(text.enabledNotice);
      await refreshSession();
      await loadPage();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : text.enabledError);
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
      setNotice(text.disabledNotice);
      await refreshSession();
      await loadPage();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : text.disabledError);
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
      setNotice(text.operatorCreated);
      await loadPage();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : text.createError);
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (adminUserId: string, username: string) => {
    if (!window.confirm(text.deleteConfirm(username))) {
      return;
    }

    setDeletingAdminId(adminUserId);
    setError(null);
    setNotice(null);

    try {
      await apiFetch<AdminUserMutationResponse>(`/api/admin-users/${adminUserId}`, {
        method: 'DELETE',
      });
      setNotice(text.deleteNotice(username));
      await loadPage();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : text.deleteError);
    } finally {
      setDeletingAdminId(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={ui.adminUsers.title}
        description={text.description}
      />

      {notice ? <div className="banner banner--success">{notice}</div> : null}
      {error ? <div className="banner banner--danger">{error}</div> : null}

      <SectionCard title={text.protectionTitle} subtitle={text.protectionSubtitle}>
        <div className="two-factor-stack">
          <div className="feature-list__card">
            <div className="two-factor-status">
              <div>
                <strong>{admin?.username ?? text.currentAdmin}</strong>
                <span>
                  {twoFactorStatus?.enabled
                    ? text.codeRequired
                    : setupSession
                      ? text.setupStarted
                      : text.setupDisabled}
                </span>
              </div>
              <StatusPill
                tone={twoFactorStatus?.enabled ? 'success' : setupSession ? 'warning' : 'muted'}
              >
                {twoFactorStatus?.enabled
                  ? text.twoFactorEnabled
                  : setupSession
                    ? text.pendingConfirmation
                    : text.twoFactorDisabled}
              </StatusPill>
            </div>
          </div>

          {!twoFactorStatus?.enabled && !setupSession ? (
            <form className="inline-form" onSubmit={(event) => void handleStartSetup(event)}>
              <label className="login-form__field">
                <span>{text.currentPassword}</span>
                <input
                  type="password"
                  required
                  value={setupPassword}
                  onChange={(event) => setSetupPassword(event.target.value)}
                  placeholder={text.confirmPassword}
                />
              </label>
              <div className="form-actions">
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={isStartingSetup || setupPassword.length < 8}
                >
                  {isStartingSetup ? text.preparingQr : text.startTwoFactor}
                </button>
              </div>
            </form>
          ) : null}

          {setupSession ? (
            <div className="two-factor-grid">
              <div className="feature-list__card">
                <strong>{text.addAuthenticator}</strong>
                <span>{text.authenticatorApps}</span>
                {qrImageUrl ? (
                  <div className="qr-shell">
                    <img alt={text.qrAlt} src={qrImageUrl} />
                  </div>
                ) : null}
              </div>

              <div className="feature-list__card">
                <strong>{text.saveManualKey}</strong>
                <code className="detail-list__mono">{formatTotpSecret(setupSession.secret)}</code>
                <span>{text.manualKeyHint}</span>
                <span>{text.expiresAt}: {formatDateTime(setupSession.expiresAt, text.notSet, locale)}</span>
              </div>

              <form className="feature-list__card" onSubmit={(event) => void handleEnable(event)}>
                <strong>{text.confirmCode}</strong>
                <label className="login-form__field">
                  <span>{text.appCode}</span>
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
                  {isEnabling ? text.confirming : text.enableTwoFactor}
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
                    {text.cancel}
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {twoFactorStatus?.enabled ? (
            <form className="two-factor-disable" onSubmit={(event) => void handleDisable(event)}>
              <div className="field-grid">
                <label className="login-form__field">
                  <span>{text.currentPassword}</span>
                  <input
                    type="password"
                    required
                    value={disablePassword}
                    onChange={(event) => setDisablePassword(event.target.value)}
                    placeholder={text.confirmPassword}
                  />
                </label>
                <label className="login-form__field">
                  <span>{text.appCode}</span>
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
                  {isDisabling ? text.disabling : text.disableTwoFactor}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </SectionCard>

      {canManageAdmins ? (
        <SectionCard title={text.operatorsTitle} subtitle={text.operatorsSubtitle}>
          <form className="field-grid" onSubmit={(event) => void handleCreateAdmin(event)}>
            <label className="login-form__field">
              <span>{text.operatorUsername}</span>
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
              <span>{text.initialPassword}</span>
              <input
                type="password"
                required
                minLength={12}
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder={text.minimumChars}
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
                {isCreatingAdmin ? text.creating : text.createOperator}
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title={text.adminsTitle}
        subtitle={
          canManageAdmins
            ? text.adminsSubtitleManage
            : text.adminsSubtitleView
        }
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>{text.user}</th>
                <th>{text.role}</th>
                <th>{text.status}</th>
                <th>2FA</th>
                <th>{text.created}</th>
                {canManageAdmins ? <th>{text.actions}</th> : null}
              </tr>
            </thead>
            <tbody>
              {response?.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="table-main">
                      <strong>
                        {item.isCurrentAdmin ? `${item.username} ${text.youSuffix}` : item.username}
                      </strong>
                      <span>{item.email}</span>
                    </div>
                  </td>
                  <td>{formatAdminRole(item.role, locale)}</td>
                  <td>
                    <StatusPill tone={item.isActive ? 'success' : 'muted'}>
                      {item.isActive ? text.active : text.disabled}
                    </StatusPill>
                  </td>
                  <td>
                    <StatusPill tone={item.twoFactorEnabled ? 'success' : 'muted'}>
                      {item.twoFactorEnabled ? text.enabled : text.off}
                    </StatusPill>
                  </td>
                  <td>{formatDateTime(item.createdAt, text.notSet, locale)}</td>
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
                          {deletingAdminId === item.id ? text.deleting : text.delete}
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
        {isLoading ? <div className="empty-state">{text.loading}</div> : null}
      </SectionCard>
    </div>
  );
}
