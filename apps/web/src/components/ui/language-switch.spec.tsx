// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { LocaleProvider, useI18n } from '../../i18n';
import { LanguageSwitch } from './language-switch';

function LocaleProbe() {
  const { locale, ui } = useI18n();

  return (
    <div>
      <span>{locale}</span>
      <span>{ui.common.logout}</span>
    </div>
  );
}

describe('LanguageSwitch', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('switches the UI copy and persists the selected locale', () => {
    render(
      <LocaleProvider>
        <LanguageSwitch />
        <LocaleProbe />
      </LocaleProvider>,
    );

    expect(screen.getByText('ru')).toBeTruthy();
    expect(screen.getByText('Выйти')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'EN' }));

    expect(screen.getByText('en')).toBeTruthy();
    expect(screen.getByText('Log out')).toBeTruthy();
    expect(window.localStorage.getItem('server-vpn-locale')).toBe('en');
  });
});
