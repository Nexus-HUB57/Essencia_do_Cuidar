import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Section, Spinner } from '../components/UI.jsx';

const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
const MAX_BYTES = 10 * 1024 * 1024;

export default function MeusDocumentos() {
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [uploading, setUploading] = useState(null); // 'diploma' | 'registro_conselho' | null

  async function load() {
    setLoading(true);
    try { setPerfil(await api.getMeuPerfil()); }
    catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  if (loading) return <div className="container-page py-16 text-center"><Spinner /></div>;
  if (erro) return <div className="container-page py-16 text-center text-rose-600">{erro}</div>;
  if (!perfil) return null;

  async function onArquivo(tipo, file) {
    if (!file) return;
    setOk(''); setErro('');
    // validações no client (alinhadas com o back)
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      setErro('Tipo de arquivo não permitido. Use PDF, JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setErro('Arquivo excede 10 MB.');
      return;
    }
    setUploading(tipo);
    try {
      await api.uploadDocumento(tipo, file);
      setOk(`Documento "${tipo === 'diploma' ? 'Diploma' : 'Registro do Conselho'}" atualizado com sucesso.`);
      await load();
    } catch (e) {
      setErro(e.message);
    } finally { setUploading(null); }
  }

  return (
    <Section
      title="Meus Documentos"
      subtitle="Mantenha seu diploma e registro do conselho sempre atualizados. Os contratantes veem o selo de verificação na sua lista de candidatos."
      action={<Link to="/dashboard-profissional" className="btn-ghost text-sm">← Voltar</Link>}
    >
      {ok && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3">{ok}</div>}
      {erro && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm p-3">{erro}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        <DocCard
          titulo="Diploma / Certificado"
          subtitulo="Comprovante de formação (PDF, JPG, PNG ou WEBP, até 10 MB)."
          doc={{
            url: perfil.diploma_url,
            originalName: perfil.diploma_original_name,
            uploadedAt: perfil.diploma_uploaded_at,
          }}
          tipo="diploma"
          uploading={uploading === 'diploma'}
          onArquivo={(f) => onArquivo('diploma', f)}
        />
        <DocCard
          titulo="Registro no Conselho"
          subtitulo="Carteira ou declaração emitida pelo conselho de classe."
          doc={{
            url: perfil.registro_conselho_url,
            originalName: perfil.registro_conselho_original_name,
            uploadedAt: perfil.registro_conselho_uploaded_at,
          }}
          tipo="registro_conselho"
          uploading={uploading === 'registro_conselho'}
          onArquivo={(f) => onArquivo('registro_conselho', f)}
        />
      </div>

      <p className="mt-6 text-xs text-brand-slate">
        <b>Dica:</b> conferir o número de registro diretamente no site do conselho da sua categoria (COREN, CRM, CREFITO, CRP, CFN, CREFONO, etc.) é um passo importante antes de contratar.
      </p>
    </Section>
  );
}

function DocCard({ titulo, subtitulo, doc, tipo, uploading, onArquivo }) {
  const inputRef = useRef(null);
  const isImage = doc.url && /\.(jpe?g|png|webp)(\?|$)/i.test(doc.url);
  const [preview, setPreview] = useState(null);

  function onChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    onArquivo(f);
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
    e.target.value = ''; // permite re-upload do mesmo arquivo
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{titulo}</h3>
          <p className="text-xs text-brand-slate">{subtitulo}</p>
        </div>
        {doc.url
          ? <span className="badge-green">✓ Enviado</span>
          : <span className="badge-amber">⚠ Pendente</span>}
      </div>

      {doc.url ? (
        <div className="mt-3 rounded-xl border border-slate-100 p-3">
          {preview || isImage ? (
            <a href={doc.url} target="_blank" rel="noreferrer" className="block">
              <img
                src={preview || doc.url}
                alt={`Pré-visualização ${titulo}`}
                className="w-full max-h-64 object-contain rounded-lg bg-slate-50"
              />
            </a>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-brand-blue/10 text-brand-blue grid place-items-center">📄</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.originalName || 'Documento'}</p>
                {doc.uploadedAt && (
                  <p className="text-xs text-brand-slate">Enviado em {new Date(doc.uploadedAt).toLocaleDateString('pt-BR')}</p>
                )}
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={doc.url} target="_blank" rel="noreferrer" className="btn-secondary text-xs">Abrir</a>
            <button onClick={() => inputRef.current?.click()} className="btn-primary text-xs" disabled={uploading}>
              {uploading ? 'Enviando…' : 'Trocar arquivo'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="mt-3 w-full rounded-xl border-2 border-dashed border-slate-200 p-6 text-center hover:border-brand-blue hover:bg-brand-blue/5 transition"
          disabled={uploading}
        >
          <div className="text-3xl">📎</div>
          <p className="mt-1 text-sm font-medium">Clique para enviar</p>
          <p className="text-xs text-brand-slate">PDF, JPG, PNG ou WEBP · até 10 MB</p>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
        className="hidden"
        onChange={onChange}
      />
    </div>
  );
}
