import { useEffect, useState } from 'react';

/**
 * Tema claro/escuro. Preferência de UI, então mora no localStorage (não no banco):
 * é por-dispositivo e não precisa do backend. O CSS reage a `data-theme` na raiz.
 */

export type Theme = 'dark' | 'light';

const CHAVE = 'orkai.theme';

export function themeInicial(): Theme {
  const salvo = localStorage.getItem(CHAVE);
  return salvo === 'light' ? 'light' : 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(themeInicial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(CHAVE, theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return { theme, toggle };
}
