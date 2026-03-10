const BASE_URL = import.meta.env.VITE_API_URL || ''

export async function analyzeJobs({ cvFile, jobQuery, city, country, modalidad, onStep }) {
  const form = new FormData()
  if (cvFile) form.append('cv_file', cvFile)
  form.append('job_query', jobQuery)
  form.append('city', city)
  form.append('country', country)
  form.append('modalidad', modalidad)

  const res = await fetch(`${BASE_URL}/api/analyze`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Error ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() // keep incomplete last line
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = JSON.parse(line.slice(6))
      if (payload.error) throw new Error(payload.error)
      if (payload.step && onStep) onStep(payload.step)
      if (payload.done) return payload.result
    }
  }

  throw new Error('Stream terminado sin resultado')
}

export async function analyzeManual({ cvFile, jobText, modalidad, onStep }) {
  const form = new FormData()
  if (cvFile) form.append('cv_file', cvFile)
  form.append('job_text', jobText)
  form.append('modalidad', modalidad)

  const res = await fetch(`${BASE_URL}/api/analyze-manual`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Error ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = JSON.parse(line.slice(6))
      if (payload.error) throw new Error(payload.error)
      if (payload.step && onStep) onStep(payload.step)
      if (payload.done) return payload.result
    }
  }

  throw new Error('Stream terminado sin resultado')
}

export async function generateCoverLetter({ bestJob, cvProfile }) {
  const res = await fetch(`${BASE_URL}/api/cover-letter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ best_job: bestJob, cv_profile: cvProfile }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Error ${res.status}`)
  }
  return res.json()
}

export async function startInterview({ bestJob, cvProfile, totalQuestions = 6 }) {
  const res = await fetch(`${BASE_URL}/api/interview/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ best_job: bestJob, cv_profile: cvProfile, total_questions: totalQuestions }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Error ${res.status}`)
  }
  return res.json()
}

export async function submitAnswer({ sessionId, currentQuestion, questionIndex, answerText, history, audioBlob }) {
  const form = new FormData()
  form.append('session_id', sessionId)
  form.append('current_question', currentQuestion)
  form.append('question_index', String(questionIndex))
  form.append('answer_text', answerText || '')
  form.append('history', JSON.stringify(history))
  if (audioBlob) form.append('audio_file', audioBlob, 'answer.webm')

  const res = await fetch(`${BASE_URL}/api/interview/answer`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Error ${res.status}`)
  }
  return res.json()
}

export async function researchCompany({ bestJob, cvProfile }) {
  const res = await fetch(`${BASE_URL}/api/company-research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ best_job: bestJob, cv_profile: cvProfile || {} }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Error ${res.status}`)
  }
  return res.json()
}

export async function getUpskillingPlan({ bestJob, cvProfile, skillGaps }) {
  const res = await fetch(`${BASE_URL}/api/upskilling`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ best_job: bestJob, cv_profile: cvProfile || {}, skill_gaps: skillGaps || {} }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Error ${res.status}`)
  }
  return res.json()
}

export async function sendChatMessage({ message, history, context }) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, context }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Error ${res.status}`)
  }
  return res.json()
}
