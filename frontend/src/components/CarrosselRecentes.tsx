import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';

/**
 * Carrossel "Vagas e Profissionais recentes" da Home.
 *
 * Substitui o card fictício "Cuidadora Ana C.": agora a vitrine mostra
 * dados REAIS do app — as vagas ativas mais recentes (GET /api/vagas) e os
 * profissionais recém-cadastrados (GET /api/profissionais), apresentados
 * de forma alternada (vaga → profissional → vaga → …).
 *
 * - Sem dados (API fora do ar ou base vazia): estado vazio amigável,
 *   NUNCA dados fictícios.
 * - Auto-avanço a cada 5s, pausa no hover; setas + indicadores.
 * - Vaga → /vagas/:id · Profissional → /profissional/:id (perfis públicos).
 */

type Vaga = {
  id: number;
  profissional_desejado: string;
  cidade?: string | null;
  regiao?: string | null;
  remuneracao_tipo?: 'hora' | 'plantao' | null;
  remuneracao_valor?: number | null;
  complexidade: 'baixa' | 'media';
  criado_em: string;
};

type Profissional = {
  id: number;
  nome: string;
  criado_em: string;
  profissao?: string | null;
  cidade?: string | null;
  verificado: boolean;
};

type Slide =
  | { tipo: 'vaga'; vaga: Vaga }
  | { tipo: 'profissional'; prof: Profissional };

const INTERVALO_MS = 5000;

function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

function dataCurta(valor: string | undefined, locale: string): string | null {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
  } catch {
    return d.toLocaleDateString();
  }
}

export default function CarrosselRecentes() {
  const { t, i18n } = useTranslation();
  const [slides, setSlides] = useState<Slide[] | null>(null); // null = carregando
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const total = slides?.length ?? 0;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [rv, rp] = await Promise.allSettled([
          api.get('/vagas', { params: { limite: 8 } }),
          api.get('/profissionais', { params: { limite: 8 } })
        ]);
        if (!vivo) return;
        const vagas: Vaga[] =
          rv.status === 'fulfilled' ? (rv.value.data?.vagas ?? []) : [];
        const profs: Profissional[] =
          rp.status === 'fulfilled' ? (rp.value.data?.profissionais ?? []) : [];
        // Apresentação alternada: vaga → profissional → vaga → …
        const intercalados: Slide[] = [];
        const n = Math.max(vagas.length, profs.length);
        for (let i = 0; i < n; i++) {
          if (vagas[i]) intercalados.push({ tipo: 'vaga', vaga: vagas[i] });
          if (profs[i]) intercalados.push({ tipo: 'profissional', prof: profs[i] });
        }
        setSlides(intercalados);
      } catch {
        if (vivo) setSlides([]);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Auto-avanço (pausa no hover)
  useEffect(() => {
    if (total < 2 || pausado) return;
    const timer = window.setInterval(
      () => setIndice((i) => (i + 1) % total),
      INTERVALO_MS
    );
    return () => window.clearInterval(timer);
  }, [total, pausado]);

  const anterior = useCallback(
    () => setIndice((i) => (i - 1 + total) % total),
    [total]
  );
  const proximo = useCallback(() => setIndice((i) => (i + 1) % total), [total]);

  const labelProfissao = (id?: string | null): string | null => {
    if (!id) return null;
    const chave = `matching.profissoes.${id}`;
    const val = t(chave);
    return val === chave ? id : val;
  };

  const locale = i18n.language || 'pt-BR';

  return (
    <div
      className="card relative z-10 max-w-md mx-auto overflow-hidden"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      data-testid="carrossel-recentes"
    >
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="badge-blue">✨ {t('landing.carrossel.titulo')}</span>
        {total > 0 && (
          <span className="text-xs text-slate-400">
            {indice + 1}/{total}
          </span>
        )}
      </div>

      {slides === null ? (
        <p className="px-4 py-10 text-sm text-slate-400 text-center">
          {t('common.loading')}
        </p>
      ) : total === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-3xl mb-3">🌱</p>
          <p className="font-medium text-slate-700 mb-1">
            {t('landing.carrossel.semDadosTitulo')}
          </p>
          <p className="text-sm text-slate-500">
            {t('landing.carrossel.semDados')}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${indice * 100}%)` }}
            >
              {slides.map((s, i) => (
                <div key={i} className="w-full shrink-0 px-4 py-4">
                  {s.tipo === 'vaga' ? (
                    /* ── Card de VAGA real ─────────────────────────── */
                    <div className="flex flex-col h-full">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="badge-blue">📋 {t('landing.carrossel.vaga')}</span>
                        {s.vaga.criado_em && (
                          <span className="text-xs text-slate-400">
                            {dataCurta(s.vaga.criado_em, locale)}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-slate-900 text-lg leading-snug">
                        {s.vaga.profissional_desejado}
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        📍 {s.vaga.cidade || s.vaga.regiao || 'RMC — SP'}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        <span className="badge-green">
                          {s.vaga.complexidade === 'media'
                            ? t('landing.carrossel.complexidadeMedia')
                            : t('landing.carrossel.complexidadeBaixa')}
                        </span>
                        {s.vaga.remuneracao_valor != null && s.vaga.remuneracao_valor > 0 && (
                          <span className="badge-blue">
                            R$ {s.vaga.remuneracao_valor}
                            {s.vaga.remuneracao_tipo === 'plantao'
                              ? ` ${t('vaga.perShift').toLowerCase()}`
                              : ` ${t('vaga.perHour').toLowerCase()}`}
                          </span>
                        )}
                      </div>
                      <Link
                        to={`/vagas/${s.vaga.id}`}
                        className="btn-primary text-xs py-2 mt-4 text-center"
                      >
                        {t('landing.carrossel.verVaga')}
                      </Link>
                    </div>
                  ) : (
                    /* ── Card de PROFISSIONAL real ─────────────────── */
                    <div className="flex flex-col h-full">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="w-12 h-12 shrink-0 rounded-full bg-serenity-100 text-serenity-700 font-bold flex items-center justify-center">
                          {iniciais(s.prof.nome)}
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900 truncate">
                            {s.prof.nome}
                          </h3>
                          <p className="text-xs text-slate-500 truncate">
                            {labelProfissao(s.prof.profissao) ?? t('auth.professional')}
                          </p>
                        </div>
                        {s.prof.verificado && (
                          <span className="ml-auto badge-green">✓ {t('perfil.verified')}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">
                        📍 {s.prof.cidade || 'RMC — SP'}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        <span className="badge-blue">
                          🗓️ {t('landing.carrossel.cadastradoEm')}{' '}
                          {dataCurta(s.prof.criado_em, locale) ?? ''}
                        </span>
                      </div>
                      <Link
                        to={`/profissional/${s.prof.id}`}
                        className="btn-secondary text-xs py-2 mt-4 text-center"
                      >
                        {t('landing.carrossel.verPerfil')}
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Controles */}
          {total > 1 && (
            <div className="flex items-center justify-between px-4 pb-4">
              <button
                onClick={anterior}
                aria-label={t('landing.carrossel.anterior')}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
              >
                ‹
              </button>
              <div className="flex gap-1.5">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIndice(i)}
                    aria-label={`${i + 1}`}
                    className={`h-2 rounded-full transition-all ${
                      i === indice ? 'w-5 bg-serenity-500' : 'w-2 bg-slate-300'
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={proximo}
                aria-label={t('landing.carrossel.proximo')}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
              >
                ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
