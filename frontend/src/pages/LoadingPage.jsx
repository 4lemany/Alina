import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { analyzeJobs, analyzeManual } from '../api/client'

const STEPS = [
  { label: 'Leyendo tu CV' },
  { label: 'Analizando ofertas' },
  { label: 'Calculando tu match' },
]

// Mapeo de eventos del backend → índice visual
const STEP_INDEX = { cv: 0, search: 1, scrape: 1, parse: 1, match: 2 }

export default function LoadingPage() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [error, setError] = useState('')
  const startedRef = useRef(false)

  useEffect(() => {
    if (!state) { navigate('/', { replace: true }); return }
    if (startedRef.current) return
    startedRef.current = true

    const { cvFile, jobQuery, city, country, modalidad, jobText, manual } = state

    const onStep = (stepId) => {
      const idx = STEP_INDEX[stepId]
      if (idx !== undefined) setCurrentStep(idx)
    }

    const promise = manual
      ? analyzeManual({ cvFile, jobText, modalidad, onStep })
      : analyzeJobs({ cvFile, jobQuery, city, country, modalidad, onStep })

    promise
      .then((data) => {
        setCurrentStep(STEPS.length - 1)
        setTimeout(() => navigate('/results', { state: { data, manual } }), 500)
      })
      .catch((err) => {
        setError(err.message || 'Algo ha ido mal. Vuelve a intentarlo.')
      })
  }, [])

  const goBack = () => navigate('/', { replace: true })

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg, #eff6ff 0%, var(--bg) 60%)', padding: 24,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Decorative circles */}
      <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', border: '1px solid rgba(37,99,235,0.06)', top: -160, right: -160, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', border: '1px solid rgba(37,99,235,0.06)', bottom: -80, left: -80, pointerEvents: 'none' }} />
      {/* Deco text */}
      <span style={{
        position: 'absolute', fontWeight: 900,
        fontSize: 'clamp(200px,30vw,380px)', lineHeight: 1, color: 'rgba(37,99,235,0.04)',
        userSelect: 'none', pointerEvents: 'none', right: -20, bottom: -30, letterSpacing: '-0.04em',
      }}>AI</span>

      {error ? (
        /* ERROR STATE */
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ width: 56, height: 56, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="section-label" style={{ marginBottom: 10 }}>Error</p>
          <h2 style={{ fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 12 }}>
            Algo ha ido mal
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 28, fontSize: 14, lineHeight: 1.6 }}>{error}</p>
          <button className="btn btn-primary" onClick={goBack}>Volver al inicio</button>
        </div>
      ) : (
        /* LOADING STATE */
        <div style={{ maxWidth: 480, width: '100%', position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 32, height: 32, background: 'var(--blue)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                Alina
              </span>
            </div>
            <h2 style={{
              fontWeight: 800,
              fontSize: 'clamp(32px,5vw,52px)',
              letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1.1, marginBottom: 10,
            }}>
              Analizando <span style={{ color: 'var(--blue)' }}>ofertas</span>
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Esto puede tardar hasta un minuto…</p>
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderTop: '1px solid var(--border)' }}>
            {STEPS.map((step, i) => {
              const done   = i < currentStep
              const active = i === currentStep
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '14px 0',
                  borderBottom: '1px solid var(--border)',
                  transition: 'all 0.3s',
                }}>
                  {/* Indicator */}
                  <div style={{
                    width: 4, height: 36, flexShrink: 0, borderRadius: 99,
                    background: done ? 'var(--sky)' : active ? 'var(--blue)' : 'var(--border-strong)',
                    transition: 'background 0.3s',
                  }} />

                  <span style={{
                    fontSize: 14, flex: 1,
                    fontWeight: active ? 600 : 400,
                    color: done ? 'var(--text-light)' : active ? 'var(--text)' : 'var(--text-light)',
                    transition: 'all 0.3s',
                    textDecoration: done ? 'line-through' : 'none',
                  }}>
                    {step.label}
                  </span>

                  <div style={{ width: 24, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                    {done ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sky)" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : active ? (
                      <span className="spinner spinner-blue" style={{ width: 14, height: 14 }} />
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
