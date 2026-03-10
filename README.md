# Alina — Job Finder con IA

Alina es una aplicación de búsqueda y preparación de empleo potenciada por inteligencia artificial. Analiza tu CV, busca ofertas de trabajo, evalúa el match de habilidades, simula entrevistas, genera cartas de presentación personalizadas e investiga las empresas que te interesan.

## Características

- **Análisis de CV**: extrae perfil profesional, skills técnicas y blandas desde PDF o DOCX.
- **Búsqueda de ofertas**: busca en Adzuna automáticamente o permite pegar una oferta manualmente.
- **Match de skills**: calcula un porcentaje de compatibilidad y muestra skills cubiertas, parciales y faltantes.
- **Simulador de entrevistas**: entrevista con preguntas personalizadas, evaluación con puntuación y feedback detallado.
- **Carta de presentación**: genera una carta adaptada a la oferta y al perfil del candidato.
- **Research de empresa**: analiza cultura, red flags, noticias recientes y preguntas inteligentes para la entrevista.
- **Chat con Alina**: asistente conversacional para resolver dudas sobre la oferta o tu candidatura.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI + Uvicorn (Python) |
| Frontend | React 18 + Vite 5 (sin librería UI) |
| IA | Google Gemini 2.5 Flash |
| Agentes | Google ADK |
| Scraping | Selenium + WebDriver Manager |
| Jobs API | Adzuna |

---

## Estructura del proyecto

```text
ia-project-II/
├── backend/
│   ├── main.py                        # API FastAPI + endpoints
│   ├── interview_agent_adk.py         # Agente de entrevista
│   ├── cover_letter_ADK.py            # Agente de carta
│   ├── company_research_agent_ADK.py  # Agente de investigación de empresa
│   ├── upskilling_agent_adk.py        # Agente de upskilling
│   ├── requirements.txt
│   ├── render.yaml
│   └── .env                           # Variables de entorno (local)
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx
│   │   │   ├── LoadingPage.jsx
│   │   │   └── ResultsPage.jsx
│   │   ├── components/
│   │   │   ├── CvProfileTab.jsx
│   │   │   ├── CoverLetterTab.jsx
│   │   │   ├── InterviewTab.jsx
│   │   │   ├── CompanyResearchTab.jsx
│   │   │   ├── UpskillingTab.jsx
│   │   │   └── ChatTab.jsx
│   │   ├── api/
│   │   │   └── client.js
│   │   ├── styles/
│   │   │   └── globals.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js
│   └── vercel.json
├── .gitignore
└── README.md
```


---

## Instalación local

### Requisitos previos

- ⁠Python 3.11+
- Node.js 18+
- ⁠Google Chrome (para Selenium)
- ⁠Cuentas en [Adzuna API](https://developer.adzuna.com/) y [Google AI Studio](https://aistudio.google.com/)

### Backend

1. Entra al directorio del backend e instala dependencias:

```bash
cd backend
pip install -r requirements.txt
```

2. Crea el archivo `.env` en `backend/`:

```env
ADZUNA_APP_ID=tu_app_id
ADZUNA_APP_KEY=tu_app_key
GEMINI_API_KEY=tu_gemini_key
```

3. Inicia el servidor:

```bash
uvicorn main:app --reload
```

Backend disponible en `http://localhost:8000`.

### Frontend

1. Entra al directorio del frontend e instala dependencias:

```bash
cd frontend
npm install
```

2. Crea el archivo `.env` en `frontend/`:

```env
VITE_API_URL=http://localhost:8000
```

3. Inicia la aplicación:

```bash
npm run dev
```

Frontend disponible en `http://localhost:5173`.

---

## API — Endpoints principales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| ⁠ POST ⁠ | ⁠ /api/analyze ⁠ | CV + búsqueda en Adzuna → match. Responde con *SSE streaming* |
| ⁠ POST ⁠ | ⁠ /api/analyze-manual ⁠ | CV + texto de oferta → match. Responde con *SSE streaming* |
| ⁠ POST ⁠ | ⁠ /api/cover-letter ⁠ | Genera carta de presentación |
| ⁠ POST ⁠ | ⁠ /api/interview/start ⁠ | Inicia sesión de entrevista |
| ⁠ POST ⁠ | ⁠ /api/interview/answer ⁠ | Envía respuesta y recibe evaluación |
| ⁠ POST ⁠ | ⁠ /api/chat ⁠ | Chat libre sobre la oferta |
| ⁠ POST ⁠ | ⁠ /api/company-research ⁠ | Research de la empresa |
| ⁠ GET ⁠ | ⁠ /health ⁠ | Health check |

---

## Agentes IA

### InterviewADKAgent
Simula entrevistas personalizadas con 4 herramientas internas: contexto del puesto, perfil del candidato, rúbrica de evaluación y secuencia de temas. Evalúa cada respuesta con puntuación 0–10, fortalezas, mejoras y respuesta ideal.

### CoverLetterADKAgent
Genera cartas de presentación estratégicas cruzando los datos del CV con los requisitos de la oferta. Devuelve la carta y un análisis del tono y los puntos clave resaltados.

### CompanyResearchADKAgent
Usa ⁠ google_search ⁠ para investigar la empresa y devuelve un informe estructurado con puntos fuertes, red flags, cultura, noticias recientes y preguntas inteligentes para la entrevista.

### UpskillingADKAgent
Analiza el gap de habilidades entre el CV y la oferta y genera un plan de aprendizaje priorizado con recursos verificados.

---

## Variables de entorno

| Variable | Dónde | Descripción |
|----------|-------|-------------|
| ⁠ ADZUNA_APP_ID ⁠ | Backend | ID de la API de Adzuna |
| ⁠ ADZUNA_APP_KEY ⁠ | Backend | Clave de la API de Adzuna |
| ⁠ GEMINI_API_KEY ⁠ | Backend | Clave de Google Gemini

---

## Autores 
Proyecto realizado por Adrián Alemany, Bruno Esteve, Silvia Pla y Clàudia Salgado. 
