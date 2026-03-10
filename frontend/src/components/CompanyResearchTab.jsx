import { useState } from 'react'
import { researchCompany } from '../api/client'

const cardStyle = {
  background: '#ffffff',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '20px 24px',
}

function Card({ title, titleColor, children }) {
  return (
    <div style={cardStyle}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: titleColor || 'var(--text-muted)', marginBottom: 12 }}>{title}</p>
      {children}
    </div>
  )
}

function ListCard({ title, items, titleColor, itemColor }) {
  if (!items?.length) return null
  return (
    <Card title={title} titleColor={titleColor}>
      <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.8, color: itemColor || 'var(--text)', margin: 0 }}>
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </Card>
  )
}

export default function CompanyResearchTab({ bestJob, cvProfile }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const run = async () => {
    setError('')
    setLoading(true)
    try {
      const data = await researchCompany({ bestJob, cvProfile: cvProfile || {} })
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Research de empresa</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Investiga <strong>{bestJob?.empresa || 'la empresa'}</strong> con búsqueda web en tiempo real para que llegues preparado a la entrevista.
        </p>
      </div>

      {!result && (
        <button
          className="btn btn-primary"
          onClick={run}
          disabled={loading}
          style={{ minWidth: 220 }}
        >
          {loading ? <><span className="spinner" /> Investigando…</> : 'Investigar empresa'}
        </button>
      )}

      {error && <div className="alert alert-error mt-4">{error}</div>}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Cabecera empresa */}
          <div style={{ ...cardStyle }}>
            <p style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>{result.empresa}</p>
            {result.resumen && (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.7, margin: '12px 0 0' }}>
                {result.resumen}
              </p>
            )}
          </div>

          {/* Puntos fuertes + Cultura en fila */}
          {(result.puntos_fuertes?.length > 0 || result.cultura_valores?.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <ListCard title="Puntos fuertes" items={result.puntos_fuertes} />
              <ListCard title="Cultura y valores" items={result.cultura_valores} />
            </div>
          )}

          {/* Noticias */}
          {result.noticias_recientes?.length > 0 && (
            <Card title="Noticias recientes">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.noticias_recientes.map((noticia, i) => {
                  let titular, resumen, url
                  if (typeof noticia === 'string') {
                    try { const p = JSON.parse(noticia); titular = p.titular || p.texto; resumen = p.resumen; url = p.url }
                    catch { titular = noticia; resumen = null; url = null }
                  } else {
                    titular = noticia.titular || noticia.texto
                    resumen = noticia.resumen
                    url = noticia.url
                  }
                  return (
                    <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.5, margin: '0 0 4px 0' }}>{titular}</p>
                      {resumen && <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 8px 0' }}>{resumen}</p>}
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, color: 'var(--blue)', textDecoration: 'none' }}>
                          Leer noticia →
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Red flags */}
          <ListCard title="Red flags" items={result.red_flags} titleColor="#b91c1c" itemColor="#b91c1c" />

          {/* Preguntas */}
          <ListCard title="Preguntas para el entrevistador" items={result.preguntas_inteligentes} />

          {/* Consejo */}
          {result.consejo_entrevista && (
            <Card title="Consejo para la entrevista" titleColor="var(--blue)">
              <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, margin: 0 }}>{result.consejo_entrevista}</p>
            </Card>
          )}

        </div>
      )}
    </div>
  )
}
