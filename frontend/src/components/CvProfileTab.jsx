export default function CvProfileTab({ cvProfile }) {
  if (!cvProfile) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        No se ha subido ningún CV o no se pudo analizar.
      </div>
    )
  }

  const { nombre, skills_tecnicos, skills_blandos, experiencia_anos, nivel_educacion, idiomas } = cvProfile

  const Section = ({ title, children }) => (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 'var(--radius)', padding: '20px 24px',
      boxShadow: 'var(--shadow-md)',
    }}>
      <p style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 14 }}>
        {title}
      </p>
      {children}
    </div>
  )

  const Pills = ({ items, color, bg, border }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {items.map((s) => (
        <span key={s} style={{
          padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500,
          background: bg, color, border: `1px solid ${border}`,
        }}>{s}</span>
      ))}
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p className="section-label" style={{ marginBottom: 8 }}>Análisis</p>
        <h3 style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em', color: 'var(--text)', marginBottom: 6 }}>
          {nombre || 'Tu perfil'}
        </h3>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {experiencia_anos && experiencia_anos !== '—' && (
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600 }}>Experiencia:</span> {experiencia_anos}
            </span>
          )}
          {nivel_educacion && nivel_educacion !== '—' && (
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600 }}>Educación:</span> {nivel_educacion}
            </span>
          )}
          {idiomas?.length > 0 && (
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600 }}>Idiomas:</span> {idiomas.join(', ')}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {skills_tecnicos?.length > 0 && (
          <Section title="Skills técnicas">
            <Pills
              items={skills_tecnicos}
              bg="#eff6ff" color="#1d4ed8" border="#bfdbfe"
            />
          </Section>
        )}

        {skills_blandos?.length > 0 && (
          <Section title="Skills blandas">
            <Pills
              items={skills_blandos}
              bg="#f5f3ff" color="#6d28d9" border="#ddd6fe"
            />
          </Section>
        )}
      </div>
    </div>
  )
}
