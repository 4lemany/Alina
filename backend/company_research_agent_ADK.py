from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any, Dict, List, Optional

from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import google_search
from google.genai import types

try:
    from google import genai as modern_genai
except Exception:
    modern_genai = None

# --- Constantes ---
GEMINI_MODEL = "gemini-2.5-flash"
APP_NAME = "company_research_app"
USER_ID = "user_1"

# --- Instrucciones ---

INVESTIGADOR_INSTRUCTION = """
Eres un analista de inteligencia empresarial especializado en preparación de candidatos para entrevistas.
Tu idioma SIEMPRE es español.

Objetivo:
Investigar la empresa de la oferta laboral y generar un informe accionable para que el candidato llegue a la entrevista con ventaja.

El mensaje del usuario ya incluye el nombre de la empresa, ciudad y puesto.
También incluye un bloque PERFIL_CANDIDATO con datos extraídos del CV.

Proceso:
1) Usa google_search para buscar información real y reciente. Haz estas búsquedas:
   - "<empresa> cultura valores misión visión empleados"
   - "<empresa> noticias 2025 2026"
   - "<empresa> opiniones glassdoor linkedin trabajar"
   - "<empresa> <ciudad> crecimiento financiación expansión"
2) Redacta un análisis estructurado en español con estas secciones:

SECTOR: [sector o industria de la empresa]
RESUMEN: [2-3 frases sobre qué hace la empresa, tamaño y posicionamiento]
PUNTOS FUERTES: [lista de puntos fuertes basados en la investigación]
RED FLAGS: [señales de alerta si las hay; escribe "Ninguno detectado" si no hay]
CULTURA Y VALORES: [lista de valores y cultura empresarial encontrados]
NOTICIAS RECIENTES:
Para cada noticia encontrada en la búsqueda, escribe EXACTAMENTE este bloque de tres líneas:
TITULAR: [título corto y descriptivo de la noticia]
RESUMEN: [1-2 frases explicando el contenido de la noticia]
FUENTE: [URL completa del artículo tal como aparece en los resultados de búsqueda]
Repite el bloque por cada noticia. OBLIGATORIO incluir la URL real de la fuente.
PREGUNTAS PARA EL ENTREVISTADOR: [lista de preguntas inteligentes y específicas para esta empresa]
CONSEJO FINAL: [un consejo concreto para destacar en la entrevista con esta empresa]

Reglas:
•⁠  ⁠Basa el análisis SOLO en información encontrada. No inventes datos.
•⁠  ⁠Si no encuentras información de un apartado, indícalo brevemente.
•⁠  ⁠Las preguntas deben ser específicas a esta empresa, no genéricas.
•⁠  ⁠En CONSEJO FINAL:
  - Diferencia claramente entre "requisito de la oferta" y "evidencia real del candidato".
  - NUNCA recomiendes afirmar experiencia, años o skills que no estén en PERFIL_CANDIDATO.
  - Si falta un requisito, sugiere cómo abordarlo con honestidad (habilidades transferibles + plan de aprendizaje).
""".strip()


FORMATEADOR_INSTRUCTION = """
Convierte el siguiente análisis de empresa en un objeto JSON válido.
NO añadas NINGUNA información que no esté en el análisis.
NO uses conocimiento propio. Solo reformateas lo que ves.

Análisis:
{raw_analysis}

INSTRUCCIÓN ESPECIAL para noticias_recientes:
Las noticias aparecen en el análisis como bloques de tres líneas:
  TITULAR: <título>
  RESUMEN: <resumen breve>
  FUENTE: <url>
Para cada bloque extrae "titular", "resumen" y "url". Si no hay FUENTE usa null.

JSON esperado (devuelve SOLO el JSON, sin markdown, sin texto adicional):
{{
  "empresa": "{empresa}",
  "sector": "string",
  "resumen": "string",
  "puntos_fuertes": ["string"],
  "red_flags": ["string"],
  "cultura_valores": ["string"],
  "noticias_recientes": [{{"titular": "string", "resumen": "string", "url": "string or null"}}],
  "preguntas_inteligentes": ["string"],
  "consejo_entrevista": "string"
}}
""".strip()


CANDIDATE_ADVICE_GUARDRAIL_PROMPT = """
Reescribe el consejo de entrevista para que sea 100% fiel al CV del candidato.

Datos del candidato (solo hechos del CV):
{cv_profile}

Datos de la oferta:
{job_offer}

Consejo actual:
{advice}

Reglas estrictas:
•⁠  ⁠No inventes datos.
•⁠  ⁠No atribuyas al candidato skills, años de experiencia ni logros que no aparezcan en su CV.
•⁠  ⁠Si la oferta pide algo que falta en el CV, indica una estrategia honesta para responder en entrevista.
•⁠  ⁠Mantén el consejo en 1-2 frases, claro y accionable.
•⁠  ⁠Devuelve SOLO el texto final del consejo, sin JSON, sin markdown.
""".strip()


# --- Helpers ---

def _as_clean_list(value: Any, limit: int = 10) -> List[str]:
    if not isinstance(value, list):
        return []
    cleaned: List[str] = []
    for item in value:
        text = str(item).strip()
        if text and text not in cleaned:
            cleaned.append(text)
        if len(cleaned) >= limit:
            break
    return cleaned



def _normalize_noticias(value: Any, limit: int = 6) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    result: List[Dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            titular = str(item.get("titular", item.get("texto", ""))).strip()
            resumen = str(item.get("resumen", "")).strip()
        else:
            raw = str(item).strip()
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    titular = str(parsed.get("titular", parsed.get("texto", ""))).strip()
                    resumen = str(parsed.get("resumen", "")).strip()
                else:
                    titular = raw; resumen = ""
            except (json.JSONDecodeError, ValueError):
                titular = raw; resumen = ""
        if titular:
            result.append({"titular": titular, "resumen": resumen})
        if len(result) >= limit:
            break
    return result


def _parse_noticias_from_raw(text: str, limit: int = 6) -> List[Dict[str, Any]]:
    """Extrae bloques TITULAR:/RESUMEN: del texto crudo como fallback."""
    result: List[Dict[str, Any]] = []
    lines = text.splitlines()
    i = 0
    while i < len(lines) and len(result) < limit:
        line = lines[i].strip()
        if line.upper().startswith("TITULAR:"):
            titular = line[8:].strip()
            resumen = ""
            if i + 1 < len(lines) and lines[i + 1].strip().upper().startswith("RESUMEN:"):
                resumen = lines[i + 1].strip()[8:].strip()
                i += 1
            if titular:
                result.append({"titular": titular, "resumen": resumen})
        i += 1
    return result


def _normalize_job_offer(job_offer: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "titulo_puesto": str(job_offer.get("titulo_puesto", "No especificado")).strip(),
        "empresa": str(job_offer.get("empresa", "No especificado")).strip(),
        "lugar": str(job_offer.get("lugar", "No especificado")).strip(),
        "modalidad": str(job_offer.get("modalidad", "No especificado")).strip(),
        "skills_requeridos": _as_clean_list(job_offer.get("skills_requeridos", []), limit=15),
        "responsabilidades": _as_clean_list(job_offer.get("responsabilidades", []), limit=10),
    }


def _normalize_cv_profile(cv_profile: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "nombre": str(cv_profile.get("nombre", "No especificado")).strip(),
        "skills_tecnicos": _as_clean_list(cv_profile.get("skills_tecnicos", []), limit=30),
        "skills_blandos": _as_clean_list(cv_profile.get("skills_blandos", []), limit=20),
        "experiencia_anos": str(cv_profile.get("experiencia_anos", "No especificado")).strip(),
        "nivel_educacion": str(cv_profile.get("nivel_educacion", "No especificado")).strip(),
        "idiomas": _as_clean_list(cv_profile.get("idiomas", []), limit=10),
    }


def _normalize_for_match(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9áéíóúüñ+#./ -]", " ", text.lower())).strip()


def _extract_years(text: str) -> Optional[float]:
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*años?", str(text).lower())
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", "."))
    except ValueError:
        return None


def _candidate_evidence_terms(cv_profile: Dict[str, Any]) -> List[str]:
    evidence = (
        cv_profile.get("skills_tecnicos", [])
        + cv_profile.get("skills_blandos", [])
        + cv_profile.get("idiomas", [])
    )
    terms: List[str] = []
    for item in evidence:
        norm = _normalize_for_match(item)
        if norm and norm not in terms:
            terms.append(norm)
    return terms


def _infer_missing_skills(job_offer: Dict[str, Any], cv_profile: Dict[str, Any], limit: int = 2) -> List[str]:
    evidence_terms = _candidate_evidence_terms(cv_profile)
    missing: List[str] = []
    for skill in job_offer.get("skills_requeridos", []):
        norm_skill = _normalize_for_match(skill)
        if not norm_skill:
            continue
        present = any(
            norm_skill in term or term in norm_skill for term in evidence_terms if len(term) >= 3
        )
        if not present:
            missing.append(skill)
        if len(missing) >= max(1, limit):
            break
    return missing


def _safe_advice_template(cv_profile: Dict[str, Any], job_offer: Dict[str, Any]) -> str:
    transferable = cv_profile.get("skills_tecnicos", [])[:2]
    transferable_txt = ", ".join(transferable) if transferable else "tus fortalezas actuales"
    missing = _infer_missing_skills(job_offer, cv_profile, limit=2)
    if missing:
        missing_txt = ", ".join(missing)
        return (
            f"No afirmes experiencia que no aparece en tu CV. Sé transparente con tu experiencia real y conecta "
            f"{transferable_txt} con lo que pide el puesto; para el gap en {missing_txt}, plantea cómo lo cubrirás "
            "con aprendizaje rápido y ejemplos transferibles."
        )
    return (
        f"No afirmes experiencia que no aparece en tu CV. Sé transparente con tu experiencia real y usa "
        f"{transferable_txt} para demostrar valor y capacidad de adaptación al puesto."
    )


def _sanitize_interview_advice(advice: str, cv_profile: Dict[str, Any], job_offer: Dict[str, Any]) -> str:
    text = str(advice).strip()
    if not text:
        return ""
    lower = text.lower()

    risky_claim = re.search(
        r"\b(di|dí|menciona|afirma|comenta)\b[^.!?\n]{0,80}\b(que\s+)?(tienes|has|cuentas con)\b",
        lower,
    )
    if risky_claim:
        return _safe_advice_template(cv_profile, job_offer)

    claimed_years = _extract_years(lower)
    cv_years_raw = str(cv_profile.get("experiencia_anos", ""))
    cv_years = _extract_years(cv_years_raw)
    if claimed_years is not None and (cv_years is None or claimed_years > cv_years + 0.25):
        return _safe_advice_template(cv_profile, job_offer)

    norm_text = _normalize_for_match(text)
    for missing_skill in _infer_missing_skills(job_offer, cv_profile, limit=3):
        norm_skill = _normalize_for_match(missing_skill)
        if not norm_skill:
            continue
        if f"experiencia en {norm_skill}" in norm_text or f"dominio de {norm_skill}" in norm_text:
            return _safe_advice_template(cv_profile, job_offer)

    return text


def _ground_interview_advice(
    advice: str,
    cv_profile: Dict[str, Any],
    job_offer: Dict[str, Any],
    api_key: str,
) -> str:
    raw_advice = str(advice).strip()
    if not raw_advice:
        return ""

    cv_json = json.dumps(cv_profile, ensure_ascii=False)
    job_json = json.dumps(
        {
            "titulo_puesto": job_offer.get("titulo_puesto", ""),
            "skills_requeridos": job_offer.get("skills_requeridos", []),
            "responsabilidades": job_offer.get("responsabilidades", []),
        },
        ensure_ascii=False,
    )

    prompt = CANDIDATE_ADVICE_GUARDRAIL_PROMPT.format(
        cv_profile=cv_json, job_offer=job_json, advice=raw_advice
    )

    try:
        client = modern_genai.Client(api_key=api_key)
        grounded = client.models.generate_content(model=GEMINI_MODEL, contents=prompt).text.strip()
        if grounded.startswith("```"):
            grounded = grounded.split("```")[1]
            if grounded.startswith("json"):
                grounded = grounded[4:]
        return _sanitize_interview_advice(grounded or raw_advice, cv_profile, job_offer)
    except Exception:
        return _sanitize_interview_advice(raw_advice, cv_profile, job_offer)


def _extract_json(text: str) -> Dict[str, Any]:
    raw = text.strip()
    if not raw:
        return {}
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return {}
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}


# --- Factory ---

def crear_pipeline_investigacion(
    job_offer: Dict[str, Any], cv_profile: Dict[str, Any]
) -> SequentialAgent:
    """Crea el pipeline: InvestigadorEmpresa (google_search) → FormateadorJSON."""
    job = _normalize_job_offer(job_offer)
    cv = _normalize_cv_profile(cv_profile)

    empresa = job.get("empresa", "la empresa")
    lugar = job.get("lugar", "")
    puesto = job.get("titulo_puesto", "")
    skills = ", ".join(job.get("skills_requeridos", [])[:5])
    candidate_brief = json.dumps(cv, ensure_ascii=False)

    prompt_investigador = (
        f"Empresa: {empresa}. Ciudad: {lugar}. Puesto: {puesto}. "
        f"Skills principales: {skills}. "
        f"PERFIL_CANDIDATO (hechos del CV): {candidate_brief}. "
        "Investiga esta empresa usando google_search y redacta el análisis completo con todas las secciones. "
        "En CONSEJO FINAL nunca digas al candidato que afirme experiencia que no esté en su PERFIL_CANDIDATO."
    )

    investigador = LlmAgent(
        name="InvestigadorEmpresa",
        model=GEMINI_MODEL,
        tools=[google_search],
        description="Investiga una empresa con búsqueda web real y genera un análisis en español.",
        instruction=INVESTIGADOR_INSTRUCTION,
        output_key="raw_analysis",
    )

    formateador = LlmAgent(
        name="FormateadorJSON",
        model=GEMINI_MODEL,
        instruction=FORMATEADOR_INSTRUCTION,
        output_key="resultado_json",
    )

    # Store the research prompt for use in execution
    investigador._initial_prompt = prompt_investigador  # type: ignore[attr-defined]

    return SequentialAgent(
        name="PipelineInvestigacion",
        sub_agents=[investigador, formateador],
    )


# --- Ejecución ---

async def investigar_empresa(
    job_offer: Dict[str, Any], cv_profile: Dict[str, Any]
) -> Dict[str, Any]:
    """Ejecuta el pipeline de investigación y devuelve el informe normalizado."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    os.environ["GOOGLE_API_KEY"] = api_key

    job = _normalize_job_offer(job_offer)
    cv = _normalize_cv_profile(cv_profile)

    empresa = job.get("empresa", "la empresa")
    lugar = job.get("lugar", "")
    puesto = job.get("titulo_puesto", "")
    skills = ", ".join(job.get("skills_requeridos", [])[:5])
    candidate_brief = json.dumps(cv, ensure_ascii=False)

    prompt_usuario = (
        f"Empresa: {empresa}. Ciudad: {lugar}. Puesto: {puesto}. "
        f"Skills principales: {skills}. "
        f"PERFIL_CANDIDATO (hechos del CV): {candidate_brief}. "
        "Investiga esta empresa usando google_search y redacta el análisis completo con todas las secciones. "
        "En CONSEJO FINAL nunca digas al candidato que afirme experiencia que no esté en su PERFIL_CANDIDATO."
    )

    pipeline = crear_pipeline_investigacion(job_offer, cv_profile)

    session_service = InMemorySessionService()
    session_id = f"investigacion-{uuid.uuid4().hex}"
    await session_service.create_session(
        app_name=APP_NAME, user_id=USER_ID, session_id=session_id,
        state={"empresa": empresa},
    )
    runner = Runner(agent=pipeline, app_name=APP_NAME, session_service=session_service)
    content = types.Content(role="user", parts=[types.Part(text=prompt_usuario)])

    raw_analysis = ""
    resultado_text = ""

    async for event in runner.run_async(user_id=USER_ID, session_id=session_id, new_message=content):
        if event.is_final_response() and event.content and event.content.parts:
            text = event.content.parts[0].text or ""
            if text.strip():
                resultado_text = text

    # Also read from session state for raw_analysis
    session = await session_service.get_session(
        app_name=APP_NAME, user_id=USER_ID, session_id=session_id
    )
    if session and session.state:
        raw_analysis = session.state.get("raw_analysis", "")

    # Parse JSON from formateador's output
    result = _extract_json(resultado_text)
    if not result and session and session.state:
        result = _extract_json(session.state.get("resultado_json", ""))

    if not result and raw_analysis:
        raise RuntimeError("El pipeline no generó un JSON válido. Comprueba la API key y la conexión.")

    # --- Post-proceso: guardrails y normalización ---
    advice = _ground_interview_advice(
        str(result.get("consejo_entrevista", "")).strip(), cv, job, api_key
    )

    noticias = _normalize_noticias(result.get("noticias_recientes", []), limit=6)
    if not noticias:
        parsed_from_raw = _parse_noticias_from_raw(raw_analysis)
        if parsed_from_raw:
            noticias = parsed_from_raw

    return {
        "empresa": str(result.get("empresa", empresa)).strip(),
        "sector": str(result.get("sector", "")).strip(),
        "resumen": str(result.get("resumen", "")).strip(),
        "puntos_fuertes": _as_clean_list(result.get("puntos_fuertes", []), limit=8),
        "red_flags": _as_clean_list(result.get("red_flags", []), limit=5),
        "cultura_valores": _as_clean_list(result.get("cultura_valores", []), limit=8),
        "noticias_recientes": noticias,
        "preguntas_inteligentes": _as_clean_list(result.get("preguntas_inteligentes", []), limit=6),
        "consejo_entrevista": advice,
        "_raw_analysis": raw_analysis,
    }
