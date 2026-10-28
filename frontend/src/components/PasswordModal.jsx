import { useState, useEffect, useRef } from 'react'
import { verifyPassword, authorizeSession, DEFAULT_PASSWORD } from '../utils/security'

export default function PasswordModal({ isOpen, onClose, onSuccess }) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [shake, setShake] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setPassword('')
      setError(false)
      setErrorMessage('')
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!password) {
      setError(true)
      setErrorMessage('Por favor, introduce la contraseña.')
      triggerShake()
      return
    }

    if (verifyPassword(password)) {
      authorizeSession()
      onSuccess?.()
    } else {
      setError(true)
      setErrorMessage('Contraseña incorrecta. Inténtalo de nuevo.')
      triggerShake()
    }
  }

  const triggerShake = () => {
    setShake(true)
    setTimeout(() => setShake(false), 500)
    inputRef.current?.focus()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '430px',
          background: 'var(--surface, #ffffff)',
          borderRadius: '20px',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.25), 0 0 1px 1px rgba(0,0,0,0.05)',
          padding: '32px 28px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          transform: shake ? 'translateX(-8px)' : 'none',
          transition: shake ? 'transform 0.08s ease-in-out' : 'transform 0.15s ease',
        }}
      >
        {/* Header Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              border: '2px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)',
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99, background: 'rgba(37, 99, 235, 0.08)', color: '#2563eb', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb' }}></span>
            Acceso Privado Exclusivo
          </div>
          <h2 style={{ fontSize: 21, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: '0 0 6px 0' }}>
            Directorio Valencia
          </h2>
          <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: 0 }}>
            Introduce tu contraseña para entrar a tu lista privada de empresas y despachos de Valencia.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              placeholder="Escribe tu contraseña..."
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError(false)
              }}
              style={{
                width: '100%',
                padding: '13px 44px 13px 16px',
                fontSize: 15,
                borderRadius: '12px',
                border: error ? '1.5px solid #ef4444' : '1.5px solid #cbd5e1',
                background: error ? '#fef2f2' : '#f8fafc',
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'all 0.15s ease',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                padding: 4,
                cursor: 'pointer',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={showPassword ? 'Ocultar' : 'Mostrar'}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#b91c1c',
                background: '#fee2e2',
                padding: '8px 12px',
                borderRadius: '8px',
                fontWeight: 500,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px 18px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                background: '#f1f5f9',
                color: '#475569',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={{
                flex: 1.4,
                padding: '12px 20px',
                borderRadius: '12px',
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
                transition: 'all 0.15s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Desbloquear
            </button>
          </div>
        </form>

        {/* Tip / Default Password notice */}
        <div
          style={{
            marginTop: 20,
            padding: '10px 12px',
            background: '#f8fafc',
            border: '1px dashed #cbd5e1',
            borderRadius: '10px',
            fontSize: 11,
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span>
            Clave inicial: <code style={{ background: '#e2e8f0', padding: '2px 5px', borderRadius: 4, fontWeight: 700, color: '#1e293b' }}>{DEFAULT_PASSWORD}</code>
          </span>
          <button
            type="button"
            onClick={() => setPassword(DEFAULT_PASSWORD)}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563eb',
              fontWeight: 600,
              fontSize: 11,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Autorrellenar
          </button>
        </div>
      </div>
    </div>
  )
}
