from __future__ import annotations

import asyncio
import json
import os
import re
import uuid
from typing import Any, Dict, List, Optional

import requests as http_requests

from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import google_search
from google.genai import types

# --- Constantes ---
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
APP_NAME = "upskilling_app"
USER_ID = "user_1"

# --- Instrucciones ---

INVESTIGADOR_INSTRUCTION = """
Eres un experto en formación profesional y desarrollo de carrera.
Tu idioma SIEMPRE es español.

Objetivo:
Dado un conjunto de skills que le faltan al candidato para el puesto (skill gaps), genera un plan de aprendizaje priorizado, accionable y con recursos concretos y reales.

El mensaje del usuario incluye:
•⁠  ⁠GAPS_SKILLS: lista de skills que el candidato no tiene o tiene parcialmente (ya calculadas por el sistema de matching)
•⁠  ⁠PERFIL_CANDIDATO: skills actuales del candidato extraídas del CV
•⁠  ⁠PUESTO: título del puesto y empresa

Proceso:
1) Identifica el sector del puesto antes de buscar recursos. Según el sector, elige las plataformas más adecuadas:
   - Tecnología / programación / datos: Coursera, Udemy, edX, LinkedIn Learning, YouTube, GitHub
   - Diseño / creatividad / fotografía / vídeo: Domestika, Skillshare, YouTube, Udemy
   - Marketing / ventas / comunicación: Coursera, Udemy, LinkedIn Learning, YouTube
   - Negocio / finanzas / contabilidad: Coursera, edX, LinkedIn Learning, Udemy
   - Hostelería / cocina / turismo / restauración: YouTube, Udemy, Coursera
   - Derecho / asesoría / compliance: Coursera, edX, YouTube, webs de colegios de abogados
   - Salud / medicina / enfermería / farmacia: Coursera, edX, YouTube, webs de colegios profesionales
   - Construcción / electricidad / fontanería / oficios: YouTube, fundae.es, Udemy
   - Educación / formación / pedagogía: Coursera, edX, Udemy, YouTube
   - Idiomas: YouTube, Coursera, edX
   - Cualquier otro sector: YouTube, Udemy, Coursera como base
2) Para cada skill del gap, usa google_search para buscar recursos reales y actualizados:
   - "<skill> curso online 2024 2025 español"
   - "<skill> tutorial documentación oficial"
   - "<skill> proyecto práctico para aprender"
3) Evalúa la dificultad de adquisición de cada skill:
   - DIFICULTAD ALTA (⚠️) si: es un idioma a nivel C1/C2 que no posee el candidato, certificación profesional que toma años (CFA, CPA, PMP, médico, abogado, PhD, etc.), requiere muchos más años de experiencia de los que tiene el candidato, o requiere acceso físico o infraestructura especial.
   - DIFICULTAD NORMAL para todo lo demás.
4) Ordena las skills por prioridad de aprendizaje:
   - Primero las que mayor impacto tienen para el puesto y son más alcanzables a corto plazo.
   - Las de dificultad alta van al final o claramente separadas.
5) Para cada skill, genera:
   - Tiempo estimado realista para alcanzar un nivel funcional (no experto)
   - 2-3 recursos concretos: cursos (con plataforma), documentación oficial, proyecto práctico
6) Genera un resumen estratégico: cómo abordar estos gaps de forma global.

Reglas:
•⁠  ⁠Usa google_search para encontrar el nombre real de cursos, documentación y proyectos.
•⁠  ⁠Para las URLs sigue esta estrategia según el tipo de recurso:
  * CURSOS en plataformas (Coursera, Udemy, LinkedIn Learning, edX, YouTube, etc.): usa la URL de búsqueda de esa plataforma. Ejemplos:
    - Coursera: https://www.coursera.org/search?query=<skill>
    - Udemy: https://www.udemy.com/courses/search/?q=<skill>
    - YouTube: https://www.youtube.com/results?search_query=<skill>+tutorial
    - edX: https://www.edx.org/search?q=<skill>
    - LinkedIn Learning: https://www.linkedin.com/learning/search?keywords=<skill>
  * DOCUMENTACIÓN OFICIAL: usa la URL directa de la web oficial (ej: https://docs.python.org). Solo si existe documentación técnica relevante para la skill; si no, omite este tipo de recurso.
  * PROYECTOS PRÁCTICOS:
    - Si el sector es tecnología o programación: usa GitHub https://github.com/search?q=<skill>+tutorial&type=repositories
    - Para cualquier otro sector (hostelería, derecho, salud, oficios, diseño, etc.): NO uses GitHub. En su lugar describe un ejercicio práctico real sin URL (ej: "practica elaborando un menú semanal", "simula una consulta jurídica", "realiza un proyecto de instalación eléctrica básica en casa").
•⁠  ⁠Reemplaza <skill> por el nombre real de la skill en la URL.
•⁠  ⁠Si no encuentras recursos para una skill, indícalo brevemente.
•⁠  ⁠Las advertencias de dificultad alta deben ser honestas y específicas (ej: "El alemán C2 requiere 600-750 horas de estudio según el Marco Europeo").
•⁠  ⁠El resumen estratégico debe ser práctico: qué hacer esta semana, este mes, este trimestre.
•⁠  ⁠NO uses markdown, NO uses asteriscos (*), NO uses negritas. Escribe texto plano en el resumen estratégico.
""".strip()


FORMATEADOR_INSTRUCTION = """
Convierte el siguiente plan de upskilling en un objeto JSON válido.
NO añadas información que no esté en el plan. NO uses conocimiento propio. Solo reformateas.

Plan:
{raw_plan}

JSON esperado (devuelve SOLO el JSON, sin markdown, sin texto adicional):
{{
  "skill_gaps_analizados": [
    {{
      "skill": "string",
      "prioridad": 1,
      "dificultad_alta": false,
      "advertencia": "string o null",
      "tiempo_estimado": "string",
      "recursos": [
        {{
          "tipo": "curso | documentacion | proyecto",
          "nombre": "string",
          "plataforma": "string o null",
          "url": "string con la URL real o null",
          "descripcion": "string"
        }}
      ]
    }}
  ],
  "resumen_estrategico": "string",
  "orden_aprendizaje": ["skill1", "skill2"]
}}
""".strip()


# --- Helpers ---

def _as_clean_list(value: Any, limit: int = 20) -> List[str]:
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


def _normalize_job_offer(job_offer: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "titulo_puesto": str(job_offer.get("titulo_puesto", "No especificado")).strip(),
        "empresa": str(job_offer.get("empresa", "No especificado")).strip(),
        "skills_requeridos": _as_clean_list(job_offer.get("skills_requeridos", []), limit=20),
    }


def _normalize_cv_profile(cv_profile: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "nombre": str(cv_profile.get("nombre", "No especificado")).strip(),
        "skills_tecnicos": _as_clean_list(cv_profile.get("skills_tecnicos", []), limit=30),
        "skills_blandos": _as_clean_list(cv_profile.get("skills_blandos", []), limit=20),
        "experiencia_anos": str(cv_profile.get("experiencia_anos", "No especificado")).strip(),
        "idiomas": _as_clean_list(cv_profile.get("idiomas", []), limit=10),
    }


def _normalize_skill_gaps(skill_gaps: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "missing": _as_clean_list(skill_gaps.get("missing", []), limit=15),
        "partial": _as_clean_list(skill_gaps.get("partial", []), limit=10),
    }


def _check_url(url: str) -> bool:
    try:
        headers = {"User-Agent": "Mozilla/5.0"}
        resp = http_requests.head(url, timeout=6, allow_redirects=True, headers=headers)
        if resp.status_code == 405:
            resp = http_requests.get(url, timeout=6, allow_redirects=True, headers=headers, stream=True)
        return resp.status_code < 400
    except Exception:
        return False


_SEARCH_DOMAINS = (
    "coursera.org/search",
    "udemy.com/courses/search",
    "edx.org/search",
    "linkedin.com/learning/search",
    "youtube.com/results",
    "domestika.org/es/courses",
    "skillshare.com/search",
    "fundae.es",
    "github.com/search",
)


def _is_search_url(url: str) -> bool:
    return any(d in url for d in _SEARCH_DOMAINS)


async def _verify_urls(recursos: List[Dict]) -> List[Dict]:
    """Verifica en paralelo solo las URLs que NO son búsquedas en plataformas conocidas."""
    to_check = [
        (i, r["url"]) for i, r in enumerate(recursos)
        if r.get("url") and not _is_search_url(r["url"])
    ]
    if not to_check:
        return recursos

    results = recursos.copy()

    async def _check_one(i: int, url: str) -> None:
        ok = await asyncio.to_thread(_check_url, url)
        if not ok:
            results[i] = {**results[i], "url": None}

    await asyncio.gather(*[_check_one(i, url) for i, url in to_check])
    return results


async def _normalize_recursos(recursos: Any) -> List[Dict[str, str]]:
    if not isinstance(recursos, list):
        return []
    result = []
    for r in recursos:
        if not isinstance(r, dict):
            continue
        url = str(r.get("url", "") or "").strip()
        result.append({
            "tipo": str(r.get("tipo", "curso")).strip(),
            "nombre": str(r.get("nombre", "")).strip(),
            "plataforma": str(r.get("plataforma", "") or "").strip() or None,
            "url": url if url.startswith("http") else None,
            "descripcion": str(r.get("descripcion", "")).strip(),
        })
    return await _verify_urls(result)


async def _normalize_skill_entry(entry: Any, idx: int) -> Dict[str, Any]:
    if not isinstance(entry, dict):
        return {}
    dificultad_alta = bool(entry.get("dificultad_alta", False))
    advertencia = entry.get("advertencia")
    if advertencia is not None:
        advertencia = str(advertencia).strip() or None
    return {
        "skill": str(entry.get("skill", f"Skill {idx}")).strip(),
        "prioridad": int(entry.get("prioridad", idx)),
        "dificultad_alta": dificultad_alta,
        "advertencia": advertencia,
        "tiempo_estimado": str(entry.get("tiempo_estimado", "No estimado")).strip(),
        "recursos": await _normalize_recursos(entry.get("recursos", [])),
    }


# --- Factory ---

def crear_pipeline_upskilling(
    job_offer: Dict[str, Any],
    cv_profile: Dict[str, Any],
    skill_gaps: Dict[str, Any],
) -> SequentialAgent:
    """Crea el pipeline: InvestigadorUpskilling (google_search) → FormateadorPlan."""
    investigador = LlmAgent(
        name="InvestigadorUpskilling",
        model=GEMINI_MODEL,
        tools=[google_search],
        description="Genera un plan de aprendizaje priorizado para cerrar skill gaps de un candidato.",
        instruction=INVESTIGADOR_INSTRUCTION,
        output_key="raw_plan",
    )

    formateador = LlmAgent(
        name="FormateadorPlan",
        model=GEMINI_MODEL,
        instruction=FORMATEADOR_INSTRUCTION,
        output_key="plan_json",
    )

    return SequentialAgent(
        name="PipelineUpskilling",
        sub_agents=[investigador, formateador],
    )


# --- Ejecución ---

async def generar_plan_upskilling(
    job_offer: Dict[str, Any],
    cv_profile: Dict[str, Any],
    skill_gaps: Dict[str, Any],
) -> Dict[str, Any]:
    """Ejecuta el pipeline de upskilling y devuelve el plan normalizado."""
    os.environ["GOOGLE_API_KEY"] = os.getenv("GEMINI_API_KEY", "")

    job = _normalize_job_offer(job_offer)
    cv = _normalize_cv_profile(cv_profile)
    gaps = _normalize_skill_gaps(skill_gaps)

    all_gaps = gaps["missing"] + gaps["partial"]

    if not all_gaps:
        return {
            "skill_gaps_analizados": [],
            "resumen_estrategico": "¡Excelente! Tu perfil cubre todas las skills requeridas por esta oferta. No hay gaps de upskilling que trabajar.",
            "orden_aprendizaje": [],
            "_no_gaps": True,
        }

    partial_note = ""
    if gaps["partial"]:
        partial_note = (
            f" Las skills PARCIALES (conocimiento básico, necesita mejorar): "
            f"{', '.join(gaps['partial'])}."
        )

    candidate_brief = json.dumps(cv, ensure_ascii=False)
    prompt_usuario = (
        f"PUESTO: {job['titulo_puesto']} en {job['empresa']}. "
        f"GAPS_SKILLS (skills que faltan completamente): {', '.join(gaps['missing'])}.{partial_note} "
        f"PERFIL_CANDIDATO (skills actuales del CV): {candidate_brief}. "
        "Genera el plan de upskilling completo usando google_search para encontrar recursos reales. "
        "Para cada skill: evalúa dificultad, estima tiempo realista, y da 2-3 recursos concretos."
    )

    pipeline = crear_pipeline_upskilling(job_offer, cv_profile, skill_gaps)

    session_service = InMemorySessionService()
    session_id = f"upskilling-{uuid.uuid4().hex}"
    await session_service.create_session(
        app_name=APP_NAME, user_id=USER_ID, session_id=session_id
    )
    runner = Runner(agent=pipeline, app_name=APP_NAME, session_service=session_service)
    content = types.Content(role="user", parts=[types.Part(text=prompt_usuario)])

    resultado_text = ""
    async for event in runner.run_async(user_id=USER_ID, session_id=session_id, new_message=content):
        if event.is_final_response() and event.content and event.content.parts:
            text = event.content.parts[0].text or ""
            if text.strip():
                resultado_text = text

    result = _extract_json(resultado_text)

    # Fallback: read from session state
    if not result:
        session = await session_service.get_session(
            app_name=APP_NAME, user_id=USER_ID, session_id=session_id
        )
        if session and session.state:
            result = _extract_json(session.state.get("plan_json", ""))

    if not result:
        raise RuntimeError("El pipeline no generó un JSON válido. Comprueba la API key y la conexión.")

    # --- Post-proceso: normalizar recursos y verificar URLs ---
    skill_gaps_raw = result.get("skill_gaps_analizados", [])
    if not isinstance(skill_gaps_raw, list):
        skill_gaps_raw = []

    skill_gaps_normalized = list(await asyncio.gather(*[
        _normalize_skill_entry(entry, i + 1)
        for i, entry in enumerate(skill_gaps_raw)
        if entry
    ]))

    return {
        "skill_gaps_analizados": skill_gaps_normalized,
        "resumen_estrategico": str(result.get("resumen_estrategico", "")).strip(),
        "orden_aprendizaje": _as_clean_list(result.get("orden_aprendizaje", []), limit=20),
    }
