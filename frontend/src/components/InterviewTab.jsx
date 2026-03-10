import { useState, useRef } from 'react'
import { startInterview, submitAnswer } from '../api/client'

const scoreColor = (s) => s >= 7 ? '#16a34a' : s >= 4 ? '#b45309' : '#dc2626'

export default function InterviewTab({ bestJob, cvProfile }) {
  const [phase, setPhase] = useState('idle')
  const [sessionId, setSessionId] = useState(null)
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [questionIndex, setQuestionIndex] = useState(1)
  const [answer, setAnswer] = useState('')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Audio recording
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [transcript, setTranscript] = useState('')
  const mediaRecorderRef = useRef(null)
  const recognitionRef = useRef(null)
  const chunksRef = useRef([])

  const start = async () => {
    setError(''); setLoading(true)
    try {
      const data = await startInterview({ bestJob, cvProfile: cvProfile || {}, totalQuestions: 99 })
      setSessionId(data.session_id); setCurrentQuestion(data.pregunta)
      setQuestionIndex(1); setHistory([]); setAnswer(''); setAudioBlob(null); setPhase('active')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // MediaRecorder → audio blob para Gemini
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        stream.getTracks().forEach(t => t.stop())
      }
      recorder.start()
      mediaRecorderRef.current = recorder

      // SpeechRecognition → transcripción en pantalla
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SR) {
        const recognition = new SR()
        recognition.lang = 'es-ES'
        recognition.continuous = true
        recognition.interimResults = true
        recognition.onresult = (e) => {
          const text = Array.from(e.results).map(r => r[0].transcript).join(' ')
          setTranscript(text)
        }
        recognition.start()
        recognitionRef.current = recognition
      }

      setIsRecording(true)
      setAudioBlob(null)
      setTranscript('')
    } catch (e) {
      setError('No se pudo acceder al micrófono: ' + e.message)
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    recognitionRef.current?.stop()
    setIsRecording(false)
  }

  const clearAudio = () => { setAudioBlob(null); setTranscript('') }

  const submit = async () => {
    if (!answer.trim() && !audioBlob) return
    setError(''); setLoading(true)
    try {
      const result = await submitAnswer({ sessionId, currentQuestion, questionIndex, answerText: answer, history, audioBlob })
      const evaluation = result.evaluacion || {}
      setHistory((prev) => [...prev, { index: questionIndex, question: currentQuestion, answer, evaluation }])
      setAnswer(''); setAudioBlob(null); setTranscript('')
      if (result.finalizar || !result.siguiente_pregunta) setPhase('done')
      else { setCurrentQuestion(result.siguiente_pregunta); setQuestionIndex((i) => i + 1) }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const reset = () => {
    setPhase('idle'); setSessionId(null); setCurrentQuestion(''); setQuestionIndex(1)
    setHistory([]); setAnswer(''); setError(''); setAudioBlob(null)
    if (isRecording) { mediaRecorderRef.current?.stop(); setIsRecording(false) }
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <p className="section-label" style={{ marginBottom: 8 }}>Simulador</p>
        <h3 style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em', color: 'var(--text)', marginBottom: 6 }}>
          Entrevista
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Practica respondiendo preguntas reales sobre esta oferta y recibe feedback inmediato.</p>
      </div>

      {/* IDLE */}
      {phase === 'idle' && (
        <div style={{ maxWidth: 440 }}>
          {error && <div className="alert alert-error mb-4">{error}</div>}
          <button className="btn btn-primary" onClick={start} disabled={loading} style={{ minWidth: 220 }}>
            {loading ? <><span className="spinner" /> Iniciando…</> : 'Comenzar entrevista'}
          </button>
        </div>
      )}

      {/* ACTIVE */}
      {phase === 'active' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Pregunta {questionIndex}
            </span>
            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 12px' }} onClick={() => setPhase('done')}>Terminar entrevista</button>
          </div>

          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px 22px', marginBottom: 16 }}>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text)' }}>{currentQuestion}</p>
          </div>

          {/* Textarea */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <textarea
              className="form-input"
              style={{ resize: 'vertical', minHeight: 120, fontFamily: 'inherit', background: 'var(--surface)' }}
              placeholder="Escribe tu respuesta aquí…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              disabled={loading}
            />
          </div>

          {/* Mic row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={loading}
                title={audioBlob ? 'Audio grabado' : 'Hablar'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 40, height: 40, borderRadius: '50%',
                  border: 'none',
                  background: audioBlob ? '#16a34a' : '#dc2626',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                  opacity: loading ? 0.5 : 1,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="12" rx="3"/>
                  <path d="M5 10a7 7 0 0 0 14 0"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="9" y1="22" x2="15" y2="22"/>
                </svg>
              </button>
            ) : (
              <button
                onClick={stopRecording}
                title="Grabando… (clic para detener)"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 40, height: 40, borderRadius: '50%',
                  border: 'none', background: '#dc2626',
                  cursor: 'pointer', flexShrink: 0,
                  animation: 'pulse 1.2s infinite',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12"><rect width="12" height="12" rx="2" fill="white"/></svg>
              </button>
            )}
            {audioBlob && !isRecording && (
              <button
                onClick={clearAudio}
                style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Descartar audio
              </button>
            )}
          </div>

          {/* Transcripción en tiempo real */}
          {(isRecording || transcript) && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '12px 16px', marginBottom: 16,
              fontSize: 14, color: isRecording ? 'var(--text-muted)' : 'var(--text)',
              lineHeight: 1.6, minHeight: 40,
              fontStyle: isRecording && !transcript ? 'italic' : 'normal',
            }}>
              {transcript || 'Escuchando…'}
            </div>
          )}

          {error && <div className="alert alert-error mb-3">{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={submit} disabled={loading || (!answer.trim() && !audioBlob)}>
              {loading ? <><span className="spinner" /> Analizando…</> : 'Enviar respuesta'}
            </button>
          </div>
        </div>
      )}

      {/* DONE */}
      {phase === 'done' && (
        <div>
          <button onClick={reset} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 24, fontFamily: 'inherit' }}>Nueva entrevista</button>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <hr className="divider" />
          <p style={{ fontWeight: 600, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>Correcciones</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...history].reverse().map((item, i) => {
              const ev = item.evaluation || {}
              const score = ev.puntuacion_0_10
              return (
                <details key={i} style={{ background: 'var(--surface)', borderRadius: 16, overflow: 'hidden' }}>
                  <summary style={{
                    padding: '14px 20px', cursor: 'pointer',
                    fontWeight: 600, fontSize: 13,
                    letterSpacing: '0.03em', textTransform: 'uppercase',
                    userSelect: 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)',
                  }}>
                    <span>Pregunta {item.index}</span>
                    {score !== undefined && (
                      <span style={{ fontWeight: 800, color: scoreColor(score), fontSize: 15 }}>{score}/10</span>
                    )}
                  </summary>
                  <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, background: '#ffffff', borderTop: '1px solid var(--border)' }}>
                    {/* Pregunta + respuesta */}
                    {[
                      { label: 'Pregunta', value: item.question },
                      item.answer && { label: 'Tu respuesta', value: item.answer },
                    ].filter(Boolean).map(({ label, value }, j) => (
                      <div key={j}>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</p>
                        <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{value}</p>
                      </div>
                    ))}
                    {/* Separador */}
                    {(ev.resumen || ev.fortalezas?.length > 0 || ev.mejoras?.length > 0 || ev.respuesta_ideal) && (
                      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0' }} />
                    )}
                    {/* Feedback */}
                    {[
                      ev.resumen && { label: 'Resumen', value: ev.resumen },
                      ev.fortalezas?.length > 0 && { label: 'Fortalezas', value: ev.fortalezas.join('\n') },
                      ev.mejoras?.length > 0 && { label: 'A mejorar', value: ev.mejoras.join('\n') },
                      ev.respuesta_ideal && { label: 'Respuesta ideal', value: ev.respuesta_ideal },
                    ].filter(Boolean).map(({ label, value }, j) => (
                      <div key={j}>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</p>
                        <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{value}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
