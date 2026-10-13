import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="container-page py-20 text-center">
      <h1 className="text-5xl font-semibold tracking-tight text-brand-blue">404</h1>
      <p className="mt-2 text-brand-slate">Página não encontrada.</p>
      <Link to="/" className="btn-primary mt-6 inline-flex">Voltar ao início</Link>
    </section>
  );
}
