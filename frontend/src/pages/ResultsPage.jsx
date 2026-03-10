import { useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import CoverLetterTab from '../components/CoverLetterTab'
import InterviewTab from '../components/InterviewTab'
import CompanyResearchTab from '../components/CompanyResearchTab'
import CvProfileTab from '../components/CvProfileTab'
import UpskillingTab from '../components/UpskillingTab'

const TABS = [
  { id: 'job', label: 'Oferta' },
  { id: 'cover', label: 'Carta de presentación' },
  { id: 'interview', label: 'Entrevista' },
  { id: 'research', label: 'Research empresa' },
  { id: 'upskilling', label: 'Plan de aprendizaje' },
]

function ScoreCircle({ score }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#b45309' : '#dc2626'
  const r = 42
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ

  return (
    <div style={{ position: 'relative', width: 112, height: 112, flexShrink: 0 }}>
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle
          cx="56" cy="56" r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 56 56)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontWeight: 700, fontSize: 22, color, lineHeight: 1 }}>{score}%</span>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 16,
      padding: '18px 20px', flex: 1,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12, alignSelf: 'flex-start' }}>{label}</p>
      <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <p style={{ fontSize: 30, fontWeight: 800, color: color || 'var(--text)', lineHeight: 1, margin: 0 }}>{value}</p>
        {sub && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{sub}</p>}
      </div>
    </div>
  )
}

function JobDetail({ bestJob, bestScore }) {
  const scoreColor = bestScore ? (bestScore.score >= 70 ? '#16a34a' : bestScore.score >= 40 ? '#b45309' : '#dc2626') : 'var(--text)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Stats row */}
      {bestScore && (
        <div style={{ display: 'flex', gap: 12 }}>
          {/* Compatibilidad con aro */}
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12, alignSelf: 'flex-start' }}>Compatibilidad</p>
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ScoreCircle score={bestScore.score} />
            </div>
          </div>
          <StatCard
            label="Skills cubiertas"
            value={`${bestScore.matched?.length ?? 0}/${bestScore.total_job_skills}`}
            sub={bestScore.partial?.length > 0 ? `+${bestScore.partial.length} parciales` : 'de la oferta'}
            color="#2563eb"
          />
          <StatCard
            label="Skills que faltan"
            value={bestScore.missing?.length ?? 0}
            sub="por desarrollar"
            color={bestScore.missing?.length > 0 ? '#b91c1c' : '#16a34a'}
          />
        </div>
      )}


      {/* Skills */}
      {bestScore && (bestScore.matched?.length > 0 || bestScore.partial?.length > 0 || bestScore.missing?.length > 0) && (
        <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Skills requeridas</p>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { label: 'Tienes', bg: '#dcfce7', color: '#15803d' },
                { label: 'Parcial', bg: '#fef9c3', color: '#a16207' },
                { label: 'Falta', bg: '#fee2e2', color: '#b91c1c' },
              ].map(({ label, bg, color }) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {bestScore.matched?.map((skill) => (
              <span key={skill} style={{ padding: '5px 13px', borderRadius: 999, fontSize: 13, fontWeight: 500, background: '#dcfce7', color: '#15803d' }}>{skill}</span>
            ))}
            {bestScore.partial?.map((skill) => (
              <span key={skill} style={{ padding: '5px 13px', borderRadius: 999, fontSize: 13, fontWeight: 500, background: '#fef9c3', color: '#a16207' }}>{skill}</span>
            ))}
            {bestScore.missing?.map((skill) => (
              <span key={skill} style={{ padding: '5px 13px', borderRadius: 999, fontSize: 13, fontWeight: 500, background: '#fee2e2', color: '#b91c1c' }}>{skill}</span>
            ))}
          </div>
        </div>
      )}

      {/* Responsibilities & Benefits */}
      {(Array.isArray(bestJob.responsabilidades) && bestJob.responsabilidades.length > 0 || Array.isArray(bestJob.beneficios) && bestJob.beneficios.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {Array.isArray(bestJob.responsabilidades) && bestJob.responsabilidades.length > 0 && (
            <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px 24px' }}>
              <p style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 14 }}>Responsabilidades</p>
              <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.9, color: 'var(--text)' }}>
                {bestJob.responsabilidades.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          {Array.isArray(bestJob.beneficios) && bestJob.beneficios.length > 0 && (
            <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px 24px' }}>
              <p style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 14 }}>Beneficios</p>
              <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.9, color: 'var(--text)' }}>
                {bestJob.beneficios.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

export default function ResultsPage() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('job')
  const [showProfile, setShowProfile] = useState(false)

  if (!state?.data) {
    navigate('/', { replace: true })
    return null
  }

  const { best_job: bestJob, best_score: bestScore, cv_profile: cvProfile } = state.data
  const isManual = state.manual === true

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ padding: '16px 0', position: 'sticky', top: 0, background: 'var(--blue)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 220, paddingRight: 24 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', color: 'white' }}>Alina</span>
          </div>
          <button
            onClick={() => setShowProfile(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 99,
              border: 'none',
              background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: 'white',
              fontFamily: 'inherit',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            </div>
            Mi perfil
          </button>
        </div>
      </header>

      {/* Profile modal */}
      {showProfile && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', justifyContent: 'flex-end',
          }}
          onClick={() => setShowProfile(false)}
        >
          <div
            style={{
              width: 480, maxWidth: '90vw',
              height: '100%', overflowY: 'auto',
              background: 'var(--bg)',
              borderLeft: '1px solid var(--border)',
              padding: '32px 28px',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Mi perfil</span>
              <button
                onClick={() => setShowProfile(false)}
                style={{
                  width: 30, height: 30, borderRadius: '50%', border: 'none',
                  background: 'var(--surface-2)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <CvProfileTab cvProfile={cvProfile} />
          </div>
        </div>
      )}

      {/* Body: sidebar + content */}
      <div style={{ flex: 1, display: 'flex' }}>

        {/* Sidebar */}
        <aside style={{
          width: 220, flexShrink: 0,
          background: 'var(--surface)',
          position: 'sticky', top: 65,
          height: 'calc(100vh - 65px)',
          overflowY: 'auto',
          padding: '20px 12px',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}

          <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => navigate('/')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 12px', borderRadius: 8, border: 'none',
                background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 500, color: 'var(--text-muted)',
                fontFamily: 'inherit',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
              Nueva búsqueda
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: '40px 0 80px', minWidth: 0 }}>
          <div className="container">
            {/* Tab content — always mounted to preserve state across tab switches */}
            <div style={{ display: activeTab === 'job' ? 'block' : 'none' }}>
              {/* Hero card */}
              <div style={{
                background: 'var(--surface)',
                borderRadius: 20,
                padding: '28px 32px',
                marginBottom: 20,
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24,
              }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    Mejor oferta encontrada
                  </p>
                  <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2, marginBottom: 4, letterSpacing: '-0.02em' }}>
                    {bestJob.titulo_puesto}
                  </h1>
                  {bestJob.empresa && bestJob.empresa !== '—' && (
                    <p style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 14 }}>{bestJob.empresa}</p>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {bestJob.lugar && bestJob.lugar !== '—' && bestJob.lugar !== 'No especificado' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 99, padding: '4px 12px' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                        {bestJob.lugar}
                      </span>
                    )}
                    {bestJob.modalidad && bestJob.modalidad !== '—' && bestJob.modalidad !== 'No especificado' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 99, padding: '4px 12px' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                        {bestJob.modalidad}
                      </span>
                    )}
                    {bestJob.salario && bestJob.salario !== '—' && bestJob.salario !== 'No especificado' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 99, padding: '4px 12px' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        {bestJob.salario}
                      </span>
                    )}
                  </div>
                </div>
                {!isManual && bestJob.link && (
                  <a
                    href={bestJob.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-sm"
                    style={{ flexShrink: 0 }}
                  >
                    Ver oferta completa →
                  </a>
                )}
              </div>
              <JobDetail bestJob={bestJob} bestScore={bestScore} />
            </div>
<div style={{ display: activeTab === 'cover' ? 'block' : 'none' }}>
              <CoverLetterTab bestJob={bestJob} cvProfile={cvProfile} />
            </div>
            <div style={{ display: activeTab === 'interview' ? 'block' : 'none' }}>
              <InterviewTab bestJob={bestJob} cvProfile={cvProfile} />
            </div>
            <div style={{ display: activeTab === 'upskilling' ? 'block' : 'none' }}>
            <UpskillingTab bestJob={bestJob} cvProfile={cvProfile} bestScore={bestScore} />
            </div>
            <div style={{ display: activeTab === 'research' ? 'block' : 'none' }}>
              <CompanyResearchTab bestJob={bestJob} cvProfile={cvProfile} />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
