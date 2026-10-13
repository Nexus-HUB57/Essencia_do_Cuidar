export function Spinner({ className = '' }) {
  return (
    <div className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-blue ${className}`} />
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="card text-center py-12">
      <h3 className="text-lg font-semibold text-brand-ink">{title}</h3>
      {description && <p className="mt-1 text-sm text-brand-slate">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Section({ title, subtitle, children, action }) {
  return (
    <section className="container-page py-8 sm:py-10">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          {title && <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>}
          {subtitle && <p className="mt-1 text-sm text-brand-slate">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
