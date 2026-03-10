import { useState } from 'react'
import { getUpskillingPlan } from '../api/client'

const TIPO_LABEL = {
  curso: 'Curso',
  documentacion: 'Documentación',
  proyecto: 'Proyecto práctico',
}

// Elimina asteriscos y markdown antes de renderizar
function PlainText({ text }) {
  if (!text) return null
  const clean = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^[#]+\s/gm, '')
  const paragraphs = clean.split(/\n{2,}/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.8, margin: 0 }}>{p}</p>
      ))}
    </div>
  )
}

function WarningIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.5" style={{ flexShrink: 0 }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}

function ResourceList({ recursos }) {
  if (!recursos?.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      {recursos.map((r, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
        }}>
          {/* Barra de color por tipo */}
          <div style={{
            width: 3, alignSelf: 'stretch', borderRadius: 99, flexShrink: 0,
            background: r.tipo === 'curso' ? 'var(--blue)' : r.tipo === 'documentacion' ? '#7c3aed' : '#059669',
          }} />

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{r.nombre}</span>
              {r.plataforma && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  background: 'var(--blue-light)', color: 'var(--blue)',
                }}>
                  {r.plataforma}
                </span>
              )}
              <span style={{
                fontSize: 11, color: 'var(--text-light)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                {TIPO_LABEL[r.tipo] || r.tipo}
              </span>
            </div>
            {r.descripcion && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, marginBottom: r.url ? 8 : 0 }}>
                {r.descripcion}
              </p>
            )}
            {r.url && (
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 12, fontWeight: 600, color: 'var(--blue)',
                  textDecoration: 'none',
                }}
              >
                Acceder al recurso <ExternalLinkIcon />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function SkillCard({ entry, index }) {
  const [open, setOpen] = useState(index === 0)

  return (
    <div style={{
      border: entry.dificultad_alta ? '1.5px solid #fbbf24' : '1px solid var(--border)',
      borderRadius: 14,
      overflow: 'hidden',
      background: 'var(--surface)',
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', border: 'none', cursor: 'pointer',
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
          background: entry.dificultad_alta ? '#fffbeb' : 'var(--surface)',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {entry.dificultad_alta && <WarningIcon />}
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{entry.skill}</span>
            {entry.dificultad_alta && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a',
              }}>
                Dificultad alta
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, margin: 0 }}>
            Tiempo estimado: <strong>{entry.tiempo_estimado}</strong>
          </p>
        </div>

        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="var(--text-light)" strokeWidth="2.5"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: '4px 20px 20px', borderTop: '1px solid var(--border)' }}>
          {entry.dificultad_alta && entry.advertencia && (
            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '3px solid #f59e0b',
              borderRadius: 8, padding: '10px 14px', margin: '14px 0',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <WarningIcon />
              <p style={{ fontSize: 13, color: '#92400e', lineHeight: 1.5, margin: 0 }}>{entry.advertencia}</p>
            </div>
          )}

          {entry.recursos?.length > 0 ? (
            <>
              <p style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: 'var(--text-muted)',
                marginTop: 14, marginBottom: 0,
              }}>
                Recursos de aprendizaje
              </p>
              <ResourceList recursos={entry.recursos} />
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-light)', marginTop: 14, fontStyle: 'italic' }}>
              No se encontraron recursos específicos para esta skill.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function UpskillingTab({ bestJob, cvProfile, bestScore }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const skillGaps = {
    missing: bestScore?.missing || [],
    partial: bestScore?.partial || [],
  }
  const hasGaps = skillGaps.missing.length > 0 || skillGaps.partial.length > 0

  const generate = async () => {
    setError('')
    setLoading(true)
    try {
      const data = await getUpskillingPlan({ bestJob, cvProfile: cvProfile || {}, skillGaps })
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <p className="section-label" style={{ marginBottom: 8 }}>Plan de formación</p>
        <h3 style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em', color: 'var(--text)', marginBottom: 6 }}>
          Plan de aprendizaje
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Plan priorizado para cerrar los gaps de skills detectados en el match. Las skills de dificultad alta requieren un esfuerzo significativo a largo plazo.
        </p>
      </div>

      {/* Resumen de gaps antes de generar */}
      {!result && hasGaps && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 20,
        }}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 10 }}>
            Gaps detectados
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {skillGaps.missing.map(s => (
              <span key={s} style={{
                padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500,
                background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca',
              }}>{s}</span>
            ))}
            {skillGaps.partial.map(s => (
              <span key={s} style={{
                padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500,
                background: '#fef9c3', color: '#a16207', border: '1px solid #fde68a',
              }}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {!result && !hasGaps && (
        <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Tu perfil ya cubre todas las skills requeridas. No hay gaps que trabajar para esta oferta.
        </div>
      )}

      {!result && hasGaps && (
        <button className="btn btn-primary" onClick={generate} disabled={loading} style={{ minWidth: 240 }}>
          {loading ? <><span className="spinner" /> Generando plan…</> : 'Generar plan de aprendizaje'}
        </button>
      )}

      {error && <div className="alert alert-error mt-4">{error}</div>}

      {result && (
        <div>
          {result._no_gaps ? (
            <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {result.resumen_estrategico}
            </div>
          ) : (
            <>
              <div className="alert alert-success mb-4" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Plan de aprendizaje generado
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                {result.skill_gaps_analizados?.map((entry, i) => (
                  <SkillCard key={i} entry={entry} index={i} />
                ))}
              </div>

              {/* Resumen estratégico */}
              {result.resumen_estrategico && (
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid var(--border)',
                  borderLeft: '3px solid var(--blue)',
                  borderRadius: 10, padding: '20px 24px', marginBottom: 20,
                }}>
                  <p style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: 'var(--blue)', marginBottom: 14,
                  }}>
                    Resumen estratégico
                  </p>
                  <PlainText text={result.resumen_estrategico} />
                </div>
              )}

              {/* Orden de aprendizaje */}
              {result.orden_aprendizaje?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Orden de aprendizaje recomendado
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {result.orden_aprendizaje.map((skill, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: 'var(--blue)', color: 'white',
                            fontWeight: 700, fontSize: 11,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {i + 1}
                          </div>
                          {i < result.orden_aprendizaje.length - 1 && (
                            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
                          )}
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
                          {skill}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>
                Re-generar plan
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
