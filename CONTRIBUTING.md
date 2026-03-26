# Contributing

[English](#english) | [Русский](#русский)

## English

### Before You Open a PR

- Search existing issues and discussions first.
- Keep the scope focused. Small, reviewable changes are easier to merge.
- Do not include real secrets, production dumps, REALITY private keys, or live subscription URLs.

### Development Expectations

1. Install dependencies with `npm install`.
2. Run `npm run typecheck`.
3. Run `npm run test`.
4. Run `npm run build`.
5. If you touched formatting-sensitive files, run `npm run format`.

### For UI Changes

- Keep the operator workflow practical and fast.
- Avoid generic dashboard UI patterns when the interface can be clearer.
- Preserve bilingual support where the UI is already translated.

### For Infra and Security Changes

- Explain operational impact clearly in the PR description.
- Call out port changes, auth behavior changes, backup implications, and migration steps explicitly.
- Prefer safe defaults over convenience shortcuts.

### Pull Request Checklist

- Describe what changed and why.
- Mention how it was tested.
- Update docs when the operator workflow changes.
- Keep commits and PR titles clear and searchable.

## Русский

### Перед Тем Как Открывать PR

- Сначала проверь существующие issues и discussions.
- Держи изменения узкими по объёму. Небольшие PR проще ревьюить и мержить.
- Не добавляй реальные секреты, production dumps, REALITY private keys и рабочие subscription URLs.

### Что Ожидается По Разработке

1. Установи зависимости через `npm install`.
2. Запусти `npm run typecheck`.
3. Запусти `npm run test`.
4. Запусти `npm run build`.
5. Если затрагивал форматирование, запусти `npm run format`.

### Для UI-Изменений

- Панель должна оставаться практичной и быстрой для оператора.
- Избегай шаблонного dashboard UI, если можно сделать понятнее.
- Сохраняй двуязычность там, где интерфейс уже переведён.

### Для Infra И Security Изменений

- Ясно описывай operational impact в PR.
- Отдельно отмечай изменения портов, auth-поведения, backup-последствий и migration steps.
- Безопасные значения по умолчанию важнее, чем сомнительные shortcut-решения.

### Чеклист Для Pull Request

- Опиши, что изменилось и зачем.
- Напиши, как это проверялось.
- Обнови документацию, если поменялся операторский workflow.
- Делай понятные и легко ищущиеся commit/PR titles.
