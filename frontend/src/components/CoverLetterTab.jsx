import { useState } from 'react'
import { generateCoverLetter } from '../api/client'

export default function CoverLetterTab({ bestJob, cvProfile }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    setError(''); setLoading(true)
    try {
      const data = await generateCoverLetter({ bestJob, cvProfile: cvProfile || {} })
      setResult(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const copy = () => {
    if (result?.carta_presentacion) {
      navigator.clipboard.writeText(result.carta_presentacion)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  const download = () => {
    if (!result?.carta_presentacion) return
    const paragraphs = result.carta_presentacion
      .split('\n')
      .map(line => `<p style="margin:0 0 6pt 0">${line || '&nbsp;'}</p>`)
      .join('')
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Calibri,sans-serif;font-size:11pt;line-height:1.6;margin:2.5cm 3cm}</style></head><body>${paragraphs}</body></html>`
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'carta_presentacion.doc'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <p className="section-label" style={{ marginBottom: 8 }}>Generador</p>
          <h3 style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em', color: 'var(--text)', marginBottom: 6 }}>
            Carta de presentación
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Genera una carta personalizada alineada con la oferta y tu perfil.
          </p>
        </div>
        {!result ? (
          <button className="btn btn-primary" onClick={generate} disabled={loading} style={{ minWidth: 160, flexShrink: 0 }}>
            {loading ? <><span className="spinner" /> Generando…</> : 'Generar carta'}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>Regenerar</button>
            <button className="btn btn-primary btn-sm" onClick={download}>Descargar .doc</button>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error mt-4">{error}</div>}

      {result && (
        <div>
          {result._error && <div className="alert alert-error mb-4">{result._error}</div>}

          {/* Letter body */}
          <div style={{
            background: '#ffffff', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '28px 32px', whiteSpace: 'pre-wrap',
            fontSize: 14, lineHeight: 1.9, color: 'var(--text)', marginBottom: 16,
            fontFamily: 'inherit', textAlign: 'justify', hyphens: 'auto',
          }}>
            {result.carta_presentacion}
          </div>

        </div>
      )}
    </div>
  )
}
