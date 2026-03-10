import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const MODALITIES = ['Sin preferencia', 'Remoto', 'Híbrido', 'Presencial']

const FEATURES = [
  'Match de skills contra la oferta real',
  'Carta de presentación personalizada',
  'Simulación de entrevista con feedback IA',
  'Research de empresa antes de aplicar',
]

export default function LandingPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [mode, setMode] = useState('search') // 'search' | 'manual'
  const [cvFile, setCvFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [jobQuery, setJobQuery] = useState('Data Scientist')
  const [city, setCity] = useState('Madrid')
  const [modalidad, setModalidad] = useState('Sin preferencia')
  const [jobText, setJobText] = useState('')
  const [error, setError] = useState('')

  const handleFile = (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'txt', 'docx'].includes(ext)) { setError('Formato no soportado. Usa PDF, TXT o DOCX.'); return }
    setError(''); setCvFile(file)
  }

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }

  const handleSubmit = (e) => {
    e.preventDefault(); setError('')
    if (!cvFile) return setError('Adjunta tu CV antes de continuar.')
    if (mode === 'search') {
      if (!jobQuery.trim()) return setError('Indica qué trabajo buscas.')
      if (!city.trim()) return setError('Indica una ciudad o ubicación.')
      navigate('/loading', { state: { cvFile, jobQuery, city, country: 'es', modalidad } })
    } else {
      if (!jobText.trim()) return setError('Pega el texto de la oferta antes de continuar.')
      navigate('/loading', { state: { cvFile, jobText, modalidad, manual: true } })
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* HEADER */}
      <header style={{ background: 'var(--blue)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', color: 'white' }}>Alina</span>
          </div>
          <span style={{ display: 'inline-block', padding: '3px 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', borderRadius: 20, background: 'rgba(255,255,255,0.2)', color: 'white' }}>Beta</span>
        </div>
      </header>

      {/* HERO */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <section style={{ width: '100%', padding: '72px 0 80px', background: 'linear-gradient(160deg, #eff6ff 0%, var(--bg) 55%)' }}>
          <div className="container-wide">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>

              {/* LEFT — value proposition */}
              <div>
                <p className="section-label" style={{ marginBottom: 16 }}>Career Intelligence</p>
                <h1 style={{
                  fontWeight: 800,
                  fontSize: 'clamp(34px,4.5vw,56px)',
                  lineHeight: 1.1, letterSpacing: '-0.03em',
                  color: 'var(--text)', marginBottom: 20,
                }}>
                  Tu próximo trabajo,<br />
                  <span style={{ color: 'var(--blue)' }}>con IA de tu lado</span>
                </h1>
                <p style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: 40, maxWidth: 400 }}>
                  Alina busca las mejores ofertas, analiza tu encaje y te prepara para conseguir el trabajo — desde la carta hasta la entrevista.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {FEATURES.map((f) => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'var(--blue-light)', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT — form card */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '32px',
                boxShadow: 'var(--shadow-lg)',
              }}>
                <p style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)', marginBottom: 6 }}>Empieza tu búsqueda</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Rellena los campos y sube tu CV para comenzar.</p>

                {/* Mode toggle */}
                <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, marginBottom: 8 }}>
                  {[
                    { id: 'search', label: 'Buscar en Adzuna' },
                    { id: 'manual', label: 'Pegar oferta' },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => { setMode(id); setError('') }}
                      style={{
                        flex: 1, padding: '7px 0', fontSize: 13, fontWeight: 600,
                        border: 'none', borderRadius: 6, cursor: 'pointer',
                        background: mode === id ? 'var(--surface)' : 'transparent',
                        color: mode === id ? 'var(--text)' : 'var(--text-muted)',
                        boxShadow: mode === id ? 'var(--shadow)' : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {mode === 'search' ? (
                    <>
                      <div className="form-group">
                        <label className="form-label">¿Qué trabajo buscas?</label>
                        <input
                          className="form-input"
                          placeholder="Data Scientist, Frontend Dev…"
                          value={jobQuery}
                          onChange={(e) => setJobQuery(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Ciudad o ubicación</label>
                        <input
                          className="form-input"
                          placeholder="Madrid, Barcelona, Valencia…"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">Texto de la oferta</label>
                      <textarea
                        className="form-input"
                        placeholder="Pega aquí la descripción completa de la oferta que te interesa…"
                        value={jobText}
                        onChange={(e) => setJobText(e.target.value)}
                        rows={6}
                        style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                      />
                    </div>
                  )}

                  {mode === 'search' && (
                    <div className="form-group">
                      <label className="form-label">Modalidad</label>
                      <select
                        className="form-select"
                        value={modalidad}
                        onChange={(e) => setModalidad(e.target.value)}
                      >
                        {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Curriculum vitae</label>
                    <div
                      className={`dropzone${dragging ? ' drag-over' : ''}${cvFile ? ' has-file' : ''}`}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={handleDrop}
                      style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: 'pointer' }}
                    >
                      <input ref={fileInputRef} type="file" accept=".pdf,.txt,.docx" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files[0])} />
                      {cvFile ? (
                        <>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <div>
                            <p style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13 }}>{cvFile.name}</p>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Clic para cambiar</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.8" style={{ flexShrink: 0 }}>
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          <div>
                            <p style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 13 }}>Arrastra tu CV aquí o haz clic</p>
                            <p style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>PDF, TXT o DOCX</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {error && <div className="alert alert-error">{error}</div>}

                  <button type="submit" className="btn btn-primary btn-full" style={{ padding: '14px', fontSize: 15, marginTop: 4 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    Analizar ofertas
                  </button>
                </form>
              </div>

            </div>
          </div>
        </section>
      </main>

      <footer style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 12, color: 'var(--text-light)', fontWeight: 600, letterSpacing: '-0.01em' }}>Alina</p>
        <p style={{ fontSize: 12, color: 'var(--text-light)' }}>Gemini · Adzuna · ADK</p>
      </footer>
    </div>
  )
}
