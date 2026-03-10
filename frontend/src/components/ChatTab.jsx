import { useState, useRef, useEffect } from 'react'
import { sendChatMessage } from '../api/client'

export default function ChatTab({ bestJob, cvProfile }) {
  const [messages, setMessages] = useState([{
    role: 'bot',
    content: `Hola. Puedo ayudarte con dudas sobre **${bestJob?.titulo_puesto || 'este puesto'}**, tu CV, la entrevista o la carta. ¿En qué te puedo ayudar?`,
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    const userMsg = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const apiHistory = messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
      const { reply } = await sendChatMessage({ message: text, history: apiHistory, context: { job: bestJob, cv_profile: cvProfile } })
      setMessages((prev) => [...prev, { role: 'bot', content: reply }])
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'bot', content: `Error: ${e.message}` }])
    } finally { setLoading(false) }
  }

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 600, maxWidth: 760, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p className="section-label" style={{ marginBottom: 6 }}>Chat</p>
        <h3 style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em', color: 'var(--text)', marginBottom: 4 }}>
          Asistente conversacional
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Pregúntame lo que quieras sobre la oferta, tu candidatura o cómo preparar la entrevista.
        </p>
      </div>

      {/* Messages area */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
        padding: '20px 16px',
        background: 'var(--surface-2)',
        borderRadius: 16,
        marginBottom: 12,
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            gap: 8,
            alignItems: 'flex-end',
          }}>
            {/* Bot avatar */}
            {msg.role === 'bot' && (
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--blue)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 2,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
              </div>
            )}

            <div style={{
              maxWidth: '75%',
              padding: '10px 14px',
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              borderRadius: msg.role === 'user'
                ? '18px 18px 4px 18px'
                : '18px 18px 18px 4px',
              background: msg.role === 'user' ? 'var(--blue)' : 'var(--surface)',
              color: msg.role === 'user' ? 'white' : 'var(--text)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              border: msg.role === 'bot' ? '1px solid var(--border)' : 'none',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--blue)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <div style={{
              padding: '12px 16px', borderRadius: '18px 18px 18px 4px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              display: 'flex', gap: 5, alignItems: 'center',
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
            }}>
              {[0, 0.18, 0.36].map((delay, i) => (
                <span key={i} style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--text-light)',
                  animation: `bounce 1.1s infinite ${delay}s`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'flex-end',
        background: 'var(--surface)',
        border: '1.5px solid var(--border-strong)',
        borderRadius: 16,
        padding: '8px 8px 8px 16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <textarea
          style={{
            flex: 1, border: 'none', outline: 'none', resize: 'none',
            fontSize: 14, fontFamily: 'inherit', color: 'var(--text)',
            background: 'transparent', padding: '6px 0', lineHeight: 1.5,
            maxHeight: 120, overflowY: 'auto',
          }}
          placeholder="Escribe tu pregunta…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: input.trim() && !loading ? 'var(--blue)' : 'var(--border-strong)',
            color: 'white', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background 0.15s',
          }}
        >
          {loading ? (
            <span style={{
              width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)',
              borderTopColor: 'white', borderRadius: '50%',
              animation: 'spin 0.7s linear infinite', display: 'block',
            }} />
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>

      <style>{`
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
