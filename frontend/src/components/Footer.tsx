import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();
  const WHATSAPP = 'https://wa.me/5519988322428';
  const INSTAGRAM = 'https://instagram.com/jeane_silva1208';

  return (
    <footer className="bg-slate-900 dark:bg-slate-950 text-slate-300 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid gap-8 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <img src="/img/logo.jpg" className="w-10 h-10 rounded-full" alt="logo" />
            <span className="text-white font-semibold">{t('common.appName')}</span>
          </div>
          <p className="text-sm text-slate-400">
            <em>{t('footer.tagline')}</em>
          </p>
          <p className="text-sm text-slate-400 mt-2">
            {t('footer.byline', { name: 'Jeane Silva' })}
          </p>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">{t('footer.families')}</h4>
          <ul className="space-y-2 text-sm">
            <li>{t('footer.findProfessionals')}</li>
            <li>{t('footer.publishJob')}</li>
            <li>{t('footer.openJobs')}</li>
            <li>{t('footer.howItWorks')}</li>
          </ul>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">{t('footer.professionals')}</h4>
          <ul className="space-y-2 text-sm">
            <li>{t('footer.registerCv')}</li>
            <li>{t('footer.findJobs')}</li>
            <li>{t('footer.uploadDiploma')}</li>
            <li>{t('footer.credentialCheck')}</li>
          </ul>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">{t('footer.contact')}</h4>
          <ul className="space-y-3 text-sm">
            <li>
              <a href={WHATSAPP} target="_blank" rel="noopener" className="flex items-center gap-2 hover:text-emerald-400 transition">
                💬 <span>(19) 98832-2428</span>
              </a>
            </li>
            <li>
              <a href={INSTAGRAM} target="_blank" rel="noopener" className="flex items-center gap-2 hover:text-pink-400 transition">
                📸 <span>@jeane_silva1208</span>
              </a>
            </li>
            <li className="flex items-center gap-2">
              📍 <span>{t('footer.location')}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        {t('footer.copyright', { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}
