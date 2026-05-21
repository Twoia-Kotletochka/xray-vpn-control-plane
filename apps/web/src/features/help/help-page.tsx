import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { useI18n } from '../../i18n';

export function HelpPage() {
  const { locale, ui } = useI18n();
  const isEnglish = locale === 'en';
  const platformGuides = [
    {
      platform: 'Windows',
      clientApp: 'v2rayN',
      steps: isEnglish
        ? [
            'Open the subscriptions area and add the client subscription URL.',
            'Refresh the subscription and select the required profile from the list.',
            'If you need a one-off import, paste the VLESS link directly.',
          ]
        : [
            'Откройте раздел подписок и добавьте subscription URL клиента.',
            'Обновите подписку и выберите нужный профиль в списке.',
            'Если нужен разовый импорт, вставьте VLESS-ссылку напрямую.',
          ],
    },
    {
      platform: 'macOS',
      clientApp: isEnglish ? 'FoXray or Streisand' : 'FoXray или Streisand',
      steps: isEnglish
        ? [
            'Import the subscription URL or VLESS link into the app.',
            'Verify the profile parameters: reality, tcp, vision.',
            'Save the profile and connect.',
          ]
        : [
            'Импортируйте subscription URL или VLESS-ссылку в приложение.',
            'Проверьте параметры профиля: reality, tcp, vision.',
            'Сохраните профиль и выполните подключение.',
          ],
    },
    {
      platform: 'Android',
      clientApp: 'v2rayNG',
      steps: isEnglish
        ? [
            'Add the subscription URL to v2rayNG.',
            'For quick import you can use the QR code from the client card.',
            'After panel-side changes, refresh the subscription.',
          ]
        : [
            'Добавьте subscription URL в v2rayNG.',
            'Для быстрого импорта можно использовать QR-код из карточки клиента.',
            'После изменений в панели выполните refresh subscription.',
          ],
    },
    {
      platform: 'iPhone / iPad',
      clientApp: isEnglish ? 'Streisand or FoXray' : 'Streisand или FoXray',
      steps: isEnglish
        ? [
            'Import the subscription URL or add the VLESS link manually.',
            'Confirm profile creation and save it in the client app.',
            'After extending access or changing limits, refresh the profile.',
          ]
        : [
            'Импортируйте subscription URL или добавьте VLESS-ссылку вручную.',
            'Подтвердите создание профиля и сохраните его в клиенте.',
            'После продления или обновления лимитов выполните refresh профиля.',
          ],
    },
  ];
  const operatorChecklist = isEnglish
    ? [
        'Create the client in the Clients section and verify the expiry and traffic quota.',
        'Set device limit and IP limit when needed: they are enforced by the number of concurrent online endpoints in the current Xray runtime.',
        'Send the user the subscription URL, VLESS link, or QR code.',
        'After changing limits or extending access, refreshing the subscription is usually enough.',
        'If access must be stopped, disable or delete the client from the card.',
      ]
    : [
        'Создайте клиента в разделе "Клиенты" и проверьте срок действия и лимит трафика.',
        'При необходимости задайте device limit и IP limit: они применяются по числу одновременных online endpoint в текущем Xray runtime.',
        'Передайте пользователю subscription URL, VLESS-ссылку или QR-код.',
        'После изменения лимитов или продления обычно достаточно обновить подписку в клиенте.',
        'Если доступ нужно остановить, используйте отключение или удаление клиента из карточки.',
      ];
  const troubleshootingSteps = isEnglish
    ? [
        'Check that the client is ACTIVE and not expired.',
        'Make sure the traffic limit is not exhausted and the device/IP limit is not exceeded by concurrent online endpoints.',
        'Open Server Status and run a manual Xray sync if needed.',
        'Use the Logs section and the ERROR/WARN filter for deeper checks.',
      ]
    : [
        'Проверьте, что клиент в статусе ACTIVE и не истёк по сроку действия.',
        'Убедитесь, что не исчерпан лимит трафика и не превышен device/ip limit по одновременным online endpoint.',
        'Откройте "Состояние сервера" и при необходимости выполните ручной sync Xray.',
        'Для детальной проверки используйте раздел "Логи" и фильтр по ERROR/WARN.',
      ];

  return (
    <div className="page">
      <PageHeader
        title={ui.help.title}
        description={
          isEnglish
            ? 'Practical instructions for issuing clients, backups, and basic panel diagnostics.'
            : 'Практические инструкции по выдаче клиентов, резервным копиям и базовой диагностике панели.'
        }
      />

      <div className="content-grid">
        <SectionCard title={isEnglish ? 'Operator quick start' : 'Быстрый старт оператора'}>
          <ul className="feature-list">
            {operatorChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title={isEnglish ? 'Backups and restore' : 'Резервные копии и восстановление'}>
          <div className="feature-list">
            <div className="feature-list__card">
              <strong>{isEnglish ? 'When to create a backup' : 'Когда делать backup'}</strong>
              <span>
                {isEnglish
                  ? 'Before updates, bulk client imports, transport changes, and manual recovery work.'
                  : 'Перед обновлениями, массовым импортом клиентов, изменениями транспорта и ручными recovery-операциями.'}
              </span>
            </div>
            <div className="feature-list__card">
              <strong>{isEnglish ? 'Run dry-run first' : 'Сначала dry-run'}</strong>
              <code>
                ./infra/scripts/restore.sh --dry-run --yes-restore /absolute/path/to/archive.tar.gz
              </code>
            </div>
            <div className="feature-list__card">
              <strong>{isEnglish ? 'Then run the confirmed restore' : 'Потом подтверждённый restore'}</strong>
              <code>./infra/scripts/restore.sh --yes-restore /absolute/path/to/archive.tar.gz</code>
            </div>
            <div className="feature-list__card">
              <strong>{isEnglish ? 'What the archive contains' : 'Что входит в архив'}</strong>
              <span>
                {isEnglish
                  ? 'PostgreSQL dump, Xray runtime config, and a manifest with creation metadata.'
                  : 'Дамп PostgreSQL, runtime-конфиг Xray и manifest с метаданными создания.'}
              </span>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title={isEnglish ? 'Recommended apps' : 'Рекомендуемые приложения'}
        subtitle={
          isEnglish
            ? 'Use the subscription URL as the main delivery method. The VLESS link and QR code work as fallback.'
            : 'Используйте subscription URL как основной способ выдачи. VLESS-ссылка и QR подходят как fallback.'
        }
      >
        <div className="guide-grid">
          {platformGuides.map((guide) => (
            <div key={guide.platform} className="insight-card">
              <span>{guide.platform}</span>
              <strong>{guide.clientApp}</strong>
              <ul className="feature-list">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title={isEnglish ? 'If the client does not connect' : 'Если клиент не подключается'}
        subtitle={
          isEnglish
            ? 'Minimum troubleshooting flow before going into the shell or onto the host.'
            : 'Минимальный порядок проверки перед тем, как идти в shell или на хост.'
        }
      >
        <ul className="feature-list">
          {troubleshootingSteps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
