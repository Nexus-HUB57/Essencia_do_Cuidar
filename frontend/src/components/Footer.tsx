import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bg-slate-900 dark:bg-slate-950 text-slate-300 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid gap-8 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <img src="/logo.jpg" className="w-8 h-8 rounded-full object-cover" alt={t('footer.logoAlt')} />
            <span className="text-white font-semibold">{t('app.name')}</span>
          </div>
          <p className="text-sm text-slate-400">
            {t('footer.tagline')}
          </p>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">{t('footer.forFamilies')}</h4>
          <ul className="space-y-2 text-sm">
            <li>{t('footer.forFamiliesSearch')}</li>
            <li>{t('footer.forFamiliesPostJob')}</li>
            <li>{t('footer.forFamiliesHowItWorks')}</li>
            <li>{t('footer.forFamiliesSeals')}</li>
          </ul>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">{t('footer.forProfessionals')}</h4>
          <ul className="space-y-2 text-sm">
            <li>{t('footer.forProfessionalsResume')}</li>
            <li>{t('footer.forProfessionalsFindJobs')}</li>
            <li>{t('footer.forProfessionalsDiploma')}</li>
            <li>{t('footer.forProfessionalsVerify')}</li>
          </ul>
        </div>

        <div>
          <h4 className="text-white text-sm font-semibold mb-3">{t('footer.security')}</h4>
          <p className="text-sm text-slate-400">
            {t('footer.securityText')}
          </p>
        </div>
      </div>

      <div className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        {t('footer.copyright', { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}