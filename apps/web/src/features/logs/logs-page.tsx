import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '../../components/ui/page-header';
import { SectionCard } from '../../components/ui/section-card';
import { useI18n } from '../../i18n';
import type {
  LogContentResponse,
  LogSourceListResponse,
  LogSourceRecord,
} from '../../lib/api-types';
import { formatBytes, formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/auth-context';

export function LogsPage() {
  const { apiFetch } = useAuth();
  const { locale, ui } = useI18n();
  const [sources, setSources] = useState<LogSourceRecord[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [content, setContent] = useState<LogContentResponse | null>(null);
  const [lines, setLines] = useState('200');
  const [lineFilter, setLineFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text =
    locale === 'en'
      ? {
          loadLog: 'Failed to load the log.',
          loadSources: 'Failed to load the log source list.',
          description:
            'Tail approved API, Xray, and Caddy logs with basic filters for fast diagnostics.',
          sourcesTitle: 'Sources',
          sourcesSubtitle: 'Pick a stream and the number of recent lines to tail.',
          fileMissing: 'File has not been created yet',
          sourcesEmpty: 'No log sources are defined yet.',
          viewerTitle: 'Viewer',
          viewerSubtitle:
            'Tail a file without shell access. Useful for quick checks after deploys and runtime changes.',
          lines: 'Lines',
          level: 'Level',
          allLines: 'All lines',
          textFilter: 'Text filter',
          refreshing: 'Refreshing...',
          refreshTail: 'Refresh tail',
          source: 'Source',
          file: 'File',
          size: 'Size',
          updated: 'Updated',
          shownLines: 'Shown lines',
          noLines: 'No lines match the current filter.',
          emptyViewer: 'Choose a log source to view the tail.',
          notAvailable: '—',
        }
      : {
          loadLog: 'Не удалось загрузить лог.',
          loadSources: 'Не удалось загрузить список логов.',
          description:
            'Tail разрешённых логов API, Xray и Caddy с базовыми фильтрами для быстрой диагностики.',
          sourcesTitle: 'Источники',
          sourcesSubtitle: 'Выберите нужный поток и количество последних строк для tail-просмотра.',
          fileMissing: 'Файл пока не создан',
          sourcesEmpty: 'Источники логов пока не определены.',
          viewerTitle: 'Просмотр',
          viewerSubtitle:
            'Tail по файлу без shell-доступа. Подходит для быстрой диагностики после деплоя и изменений рантайма.',
          lines: 'Количество строк',
          level: 'Уровень',
          allLines: 'Все строки',
          textFilter: 'Фильтр по тексту',
          refreshing: 'Обновляем...',
          refreshTail: 'Обновить tail',
          source: 'Источник',
          file: 'Файл',
          size: 'Размер',
          updated: 'Обновлён',
          shownLines: 'Показано строк',
          noLines: 'По текущему фильтру строк нет.',
          emptyViewer: 'Выберите источник логов, чтобы увидеть tail.',
          notAvailable: '—',
        };

  const loadSource = useCallback(
    async (sourceId: string, linesValue: string) => {
      setIsRefreshing(true);
      setError(null);

      try {
        const response = await apiFetch<LogContentResponse>(
          `/api/logs/${sourceId}?lines=${encodeURIComponent(linesValue)}`,
        );
        setContent(response);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : text.loadLog);
      } finally {
        setIsRefreshing(false);
      }
    },
    [apiFetch, text.loadLog],
  );

  const loadSources = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch<LogSourceListResponse>('/api/logs/sources');
      const nextSelected =
        response.items.find((item) => item.available)?.id ?? response.items[0]?.id ?? '';

      setSources(response.items);
      setSelectedSourceId((current) => current || nextSelected);

      if (nextSelected) {
        await loadSource(nextSelected, lines);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : text.loadSources);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, lines, loadSource, text.loadSources]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const filteredLines = useMemo(() => {
    if (!content) {
      return [];
    }

    const query = lineFilter.trim().toLowerCase();

    return content.content
      .split('\n')
      .filter((line) => {
        const normalized = line.toLowerCase();
        const levelMatches =
          levelFilter === 'ALL' ||
          (levelFilter === 'ERROR' &&
            (normalized.includes('error') ||
              normalized.includes('exception') ||
              normalized.includes('fatal'))) ||
          (levelFilter === 'WARN' &&
            (normalized.includes('warn') || normalized.includes('warning'))) ||
          (levelFilter === 'INFO' && normalized.includes('info')) ||
          (levelFilter === 'DEBUG' && normalized.includes('debug'));

        if (!levelMatches) {
          return false;
        }

        if (!query) {
          return true;
        }

        return normalized.includes(query);
      });
  }, [content, levelFilter, lineFilter]);

  return (
    <div className="page">
      <PageHeader
        title={ui.logs.title}
        description={text.description}
      />

      {error ? <div className="banner banner--danger">{error}</div> : null}

      <div className="split-grid">
        <SectionCard
          title={text.sourcesTitle}
          subtitle={text.sourcesSubtitle}
        >
          <div className="logs-source-list">
            {sources.map((source) => (
              <button
                key={source.id}
                className={`logs-source-button ${selectedSourceId === source.id ? 'logs-source-button--active' : ''}`}
                type="button"
                onClick={() => {
                  setSelectedSourceId(source.id);
                  void loadSource(source.id, lines);
                }}
              >
                <strong>{source.label}</strong>
                <span>{source.available ? source.path : text.fileMissing}</span>
              </button>
            ))}

            {!isLoading && sources.length === 0 ? (
              <div className="empty-state">{text.sourcesEmpty}</div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title={text.viewerTitle} subtitle={text.viewerSubtitle}>
          <div className="toolbar">
            <div className="field-grid">
              <label className="login-form__field">
                <span>{text.lines}</span>
                <input
                  type="number"
                  min="50"
                  max="2000"
                  value={lines}
                  onChange={(event) => setLines(event.target.value)}
                />
              </label>
              <label className="login-form__field">
                <span>{text.level}</span>
                <select
                  value={levelFilter}
                  onChange={(event) => setLevelFilter(event.target.value)}
                >
                  <option value="ALL">{text.allLines}</option>
                  <option value="ERROR">ERROR / FATAL</option>
                  <option value="WARN">WARN</option>
                  <option value="INFO">INFO</option>
                  <option value="DEBUG">DEBUG</option>
                </select>
              </label>
            </div>

            <div className="toolbar__actions">
              <label className="toolbar__search">
                <input
                  placeholder={text.textFilter}
                  value={lineFilter}
                  onChange={(event) => setLineFilter(event.target.value)}
                />
              </label>
              <button
                className="button"
                type="button"
                onClick={() => selectedSourceId && void loadSource(selectedSourceId, lines)}
                disabled={!selectedSourceId || isRefreshing}
              >
                <RefreshCw size={16} />
                {isRefreshing ? text.refreshing : text.refreshTail}
              </button>
            </div>
          </div>

          {content ? (
            <div className="detail-stack">
              <dl className="detail-list">
                <div>
                  <dt>{text.source}</dt>
                  <dd>{content.label}</dd>
                </div>
                <div>
                  <dt>{text.file}</dt>
                  <dd className="detail-list__mono">{content.path}</dd>
                </div>
                <div>
                  <dt>{text.size}</dt>
                  <dd>{content.sizeBytes ? formatBytes(content.sizeBytes, locale) : text.notAvailable}</dd>
                </div>
                <div>
                  <dt>{text.updated}</dt>
                  <dd>{formatDateTime(content.updatedAt, text.notAvailable, locale)}</dd>
                </div>
                <div>
                  <dt>{text.shownLines}</dt>
                  <dd>
                    {filteredLines.length} / {content.content ? content.content.split('\n').length : 0}
                  </dd>
                </div>
              </dl>

              <pre className="mono-output">{filteredLines.length > 0 ? filteredLines.join('\n') : text.noLines}</pre>
            </div>
          ) : (
            <div className="empty-state">{text.emptyViewer}</div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
