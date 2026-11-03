import { useEffect, useState } from 'react';

type Tema = 'light' | 'dark';

export function useTema() {
  const [tema, setTema] = useState<Tema>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem('essencia_tema') as Tema | null;
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (tema === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('essencia_tema', tema);
  }, [tema]);

  return {
    tema,
    isDark: tema === 'dark',
    toggle: () => setTema((t) => (t === 'dark' ? 'light' : 'dark')),
    setTema
  };
}
