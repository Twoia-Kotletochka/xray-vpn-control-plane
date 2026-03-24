import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';

const platformGuides = [
  {
    platform: 'Windows',
    clientApp: 'v2rayN',
    steps: [
      'Откройте раздел подписок и добавьте subscription URL клиента.',
      'Обновите подписку и выберите нужный профиль в списке.',
      'Если нужен разовый импорт, вставьте VLESS-ссылку напрямую.',
    ],
  },
  {
    platform: 'macOS',
    clientApp: 'FoXray или Streisand',
    steps: [
      'Импортируйте subscription URL или VLESS-ссылку в приложение.',
      'Проверьте параметры профиля: reality, tcp, vision.',
      'Сохраните профиль и выполните подключение.',
    ],
  },
  {
    platform: 'Android',
    clientApp: 'v2rayNG',
    steps: [
      'Добавьте subscription URL в v2rayNG.',
      'Для быстрого импорта можно использовать QR-код из карточки клиента.',
      'После изменений в панели выполните refresh subscription.',
    ],
  },
  {
    platform: 'iPhone / iPad',
    clientApp: 'Streisand или FoXray',
    steps: [
      'Импортируйте subscription URL или добавьте VLESS-ссылку вручную.',
      'Подтвердите создание профиля и сохраните его в клиенте.',
      'После продления или обновления лимитов выполните refresh профиля.',
    ],
  },
];

const operatorChecklist = [
  'Создайте клиента в разделе "Клиенты" и проверьте срок действия и лимит трафика.',
  'Передайте пользователю subscription URL, VLESS-ссылку или QR-код.',
  'После изменения лимитов или продления обычно достаточно обновить подписку в клиенте.',
  'Если доступ нужно остановить, используйте отключение или удаление клиента из карточки.',
];

const troubleshootingSteps = [
  'Проверьте, что клиент в статусе ACTIVE и не истёк по сроку действия.',
  'Убедитесь, что не исчерпан лимит трафика и не задан слишком жёсткий device/ip limit.',
  'Откройте "Состояние сервера" и при необходимости выполните ручной sync Xray.',
  'Для детальной проверки используйте раздел "Логи" и фильтр по ERROR/WARN.',
];

export function HelpPage() {
  return (
    <div className="page">
      <PageHeader
        title="Помощь"
        description="Практические инструкции по выдаче клиентов, резервным копиям и базовой диагностике панели."
      />

      <div className="content-grid">
        <SectionCard title="Быстрый старт оператора">
          <ul className="feature-list">
            {operatorChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Резервные копии и восстановление">
          <div className="feature-list">
            <div className="feature-list__card">
              <strong>Когда делать backup</strong>
              <span>Перед обновлениями, массовым импортом клиентов, изменениями транспорта и ручными recovery-операциями.</span>
            </div>
            <div className="feature-list__card">
              <strong>Как восстанавливать</strong>
              <code>./infra/scripts/restore.sh --yes-restore /absolute/path/to/archive.tar.gz</code>
            </div>
            <div className="feature-list__card">
              <strong>Что входит в архив</strong>
              <span>Дамп PostgreSQL, runtime-конфиг Xray и manifest с метаданными создания.</span>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Рекомендуемые приложения"
        subtitle="Используйте subscription URL как основной способ выдачи. VLESS-ссылка и QR подходят как fallback."
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
        title="Если клиент не подключается"
        subtitle="Минимальный порядок проверки перед тем, как идти в shell или на хост."
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
