from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any, Dict, List

from google.adk.agents import LlmAgent, LoopAgent, SequentialAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools.tool_context import ToolContext
from google.genai import types

# --- Constantes ---
GEMINI_MODEL = "gemini-2.5-flash"
APP_NAME = "cover_letter_app"
USER_ID = "user_1"

# --- Instrucciones ---

ESCRITOR_INSTRUCTION = """
Eres un experto en reclutamiento y redacción profesional especializado en cartas de presentación.
Tu idioma de salida es español.

REGLA ABSOLUTA — PROHIBICIONES ESTRICTAS:
• NUNCA inventes proyectos, logros, métricas, porcentajes ni nombres de empresas que no aparezcan en el perfil del candidato.
• NUNCA atribuyas al candidato años de experiencia superiores a los que constan en su perfil.
• NUNCA menciones tecnologías, certificaciones o habilidades que no estén en su lista de habilidades.
• Si el perfil no incluye logros o proyectos concretos, redacta en términos de capacidades y potencial — NUNCA los inventes.
• Usa SOLO la información devuelta por fetch_candidate_profile() y fetch_job_details(). Nada más.

Objetivo:
• Redactar una carta de presentación persuasiva, honesta y personalizada.
• Cuando se te pida el Borrador (Draft), céntrate sólo en el contenido.
• Cuando se te pase la Crítica (Critique), reescribe la carta aplicando TODAS las mejoras.

Proceso obligatorio:
1) Llama a fetch_job_details() para obtener los detalles del puesto.
2) Llama a fetch_candidate_profile() para obtener el perfil REAL del candidato.
3) Escribe la carta usando EXCLUSIVAMENTE esos datos. Si algo no está en el perfil, no lo pongas.
4) Estructura: Saludo → Introducción → Cuerpo (alineación skills reales con oferta) → Cierre con llamada a la acción.
""".strip()


EDITOR_INSTRUCTION = """
Eres un Reclutador Senior extremadamente estricto, crítico y corporativo.
Tu trabajo NO es escribir cartas. Tu trabajo es LEER el borrador y detectar errores graves.
Tu idioma de salida es el español.

Proceso obligatorio:
1) Llama a fetch_candidate_profile() para obtener el perfil REAL del candidato.
2) Llama a fetch_job_details() para obtener los detalles del puesto.
3) Lee el borrador línea a línea y comprueba:

   VERIFICACIÓN DE VERACIDAD (PRIORITARIA):
   • ¿Menciona proyectos, logros o métricas que NO están en el perfil? → ERROR CRÍTICO, debe eliminarse.
   • ¿Atribuye años de experiencia superiores a los del perfil? → ERROR CRÍTICO.
   • ¿Menciona habilidades o tecnologías que no están en la lista de habilidades del perfil? → ERROR CRÍTICO.
   • ¿Cita nombres de empresas anteriores o certificaciones inventadas? → ERROR CRÍTICO.

   VERIFICACIÓN DE CALIDAD:
   • Frases genéricas sin conexión real con la oferta.
   • Falta de alineación entre las habilidades del candidato y los requisitos del puesto.
   • Tono inadecuado o estructura deficiente.

4) Genera una lista directa de mejoras obligatorias. Si hay ERRORES CRÍTICOS, indícalos primero.
5) Llama a exit_loop() SOLO si el borrador es honesto (sin inventos) Y de alta calidad. Si hay cualquier ERROR CRÍTICO, NO llames a exit_loop().
""".strip()

FORMATEADOR_INSTRUCTION = """
Toma el texto de la carta en {borrador} y conviértelo al siguiente JSON válido.

El JSON debe tener exactamente dos campos:
- carta_presentacion: el texto completo de la carta (string)
- analisis_estrategico: un objeto con tres campos:
    - puntos_clave_resaltados: lista de los puntos clave que se destacan en la carta (array de strings)
    - tono_utilizado: descripción del tono de la carta (string)
    - sugerencia_adicional: un consejo adicional para mejorar la candidatura (string)

Devuelve SOLO el JSON válido, sin markdown, sin texto extra.
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


def _strip_code_fences(text: str) -> str:
    raw = (text or "").strip()
    if not raw.startswith("```"):
        return raw
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def _extract_json(text: str) -> Dict[str, Any]:
    raw = _strip_code_fences(text)
    if not raw:
        return {}
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    decoder = json.JSONDecoder()
    last_valid: Dict[str, Any] = {}
    for idx, char in enumerate(raw):
        if char != "{":
            continue
        try:
            candidate, _ = decoder.raw_decode(raw[idx:])
        except json.JSONDecodeError:
            continue
        if isinstance(candidate, dict):
            last_valid = candidate
    return last_valid


def _normalize_job_offer(job_offer: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "titulo_puesto": str(job_offer.get("titulo_puesto", "No especificado")).strip(),
        "empresa": str(job_offer.get("empresa", "No especificado")).strip(),
        "requisitos": _as_clean_list(job_offer.get("skills_requeridos", []), limit=15),
    }


def _normalize_cv_profile(cv_profile: Dict[str, Any]) -> Dict[str, Any]:
    exp_years = str(cv_profile.get("experiencia_anos", "")).strip()
    combined_skills = (
        _as_clean_list(cv_profile.get("skills_tecnicos", []), limit=30)
        + _as_clean_list(cv_profile.get("skills_blandos", []), limit=20)
        + _as_clean_list(cv_profile.get("idiomas", []), limit=10)
    )
    deduped_skills: List[str] = []
    for skill in combined_skills:
        if skill not in deduped_skills:
            deduped_skills.append(skill)
        if len(deduped_skills) >= 20:
            break
    profile: Dict[str, Any] = {
        "nombre": str(cv_profile.get("nombre", "Candidato")).strip(),
        "experiencia_anos": exp_years,
        "habilidades": deduped_skills,
        "AVISO": (
            "Este perfil contiene TODOS los datos reales del candidato. "
            "No añadas nada que no figure aquí."
        ),
    }
    # Incluir campos adicionales si el CV original los trae
    for extra_key in ("logros", "proyectos", "certificaciones", "nivel_educacion"):
        val = cv_profile.get(extra_key)
        if val:
            profile[extra_key] = val
    return profile


def _normalize_output(payload: Dict[str, Any], nombre: str) -> Dict[str, Any]:
    carta = str(payload.get("carta_presentacion", "")).strip()
    if not carta:
        carta = "No se pudo generar una carta válida."
    if nombre and nombre.lower() not in carta[-120:].lower():
        carta = carta + f"\n\n{nombre}"
    raw_analysis = payload.get("analisis_estrategico", {})
    analysis = raw_analysis if isinstance(raw_analysis, dict) else {}
    return {
        "carta_presentacion": carta,
        "analisis_estrategico": {
            "puntos_clave_resaltados": _as_clean_list(analysis.get("puntos_clave_resaltados", []), limit=8),
            "tono_utilizado": str(analysis.get("tono_utilizado", "No especificado")).strip() or "No especificado",
            "sugerencia_adicional": str(analysis.get("sugerencia_adicional", "No especificado")).strip() or "No especificado",
        },
    }


# --- Factory ---

def crear_pipeline_carta(job_offer: Dict[str, Any], cv_profile: Dict[str, Any]) -> SequentialAgent:
    """Crea el pipeline de carta: LoopAgent(Escritor + Editor) → Formateador."""
    job = _normalize_job_offer(job_offer)
    cv = _normalize_cv_profile(cv_profile)

    # --- Herramientas (closures con contexto) ---

    def exit_loop(tool_context: ToolContext) -> dict:
        """Llama a esta herramienta cuando la carta sea excelente y no necesite más mejoras."""
        tool_context.actions.escalate = True
        return {}

    def fetch_job_details() -> Dict[str, Any]:
        """Devuelve los detalles del puesto de trabajo."""
        return job

    def fetch_candidate_profile() -> Dict[str, Any]:
        """Devuelve el perfil del candidato extraído del CV."""
        return cv

    # --- Agentes ---

    escritor = LlmAgent(
        name="Escritor",
        model=GEMINI_MODEL,
        tools=[fetch_job_details, fetch_candidate_profile],
        instruction=ESCRITOR_INSTRUCTION,
        output_key="borrador",
    )

    editor = LlmAgent(
        name="Editor",
        model=GEMINI_MODEL,
        tools=[fetch_job_details, fetch_candidate_profile, exit_loop],
        instruction=EDITOR_INSTRUCTION,
        output_key="critica",
    )

    bucle = LoopAgent(
        name="BucleCarta",
        sub_agents=[escritor, editor],
        max_iterations=3,
    )

    formateador = LlmAgent(
        name="Formateador",
        model=GEMINI_MODEL,
        instruction=FORMATEADOR_INSTRUCTION,
        output_key="carta_final",
    )

    return SequentialAgent(
        name="PipelineCarta",
        sub_agents=[bucle, formateador],
    )


# --- Ejecución ---

async def generar_carta(job_offer: Dict[str, Any], cv_profile: Dict[str, Any]) -> Dict[str, Any]:
    """Ejecuta el pipeline de carta y devuelve el resultado JSON normalizado."""
    os.environ["GOOGLE_API_KEY"] = os.getenv("GEMINI_API_KEY", "")

    pipeline = crear_pipeline_carta(job_offer, cv_profile)
    session_service = InMemorySessionService()
    session_id = f"carta-{uuid.uuid4().hex}"
    await session_service.create_session(
        app_name=APP_NAME, user_id=USER_ID, session_id=session_id,
        state={"critica": "", "borrador": ""},
    )
    runner = Runner(agent=pipeline, app_name=APP_NAME, session_service=session_service)
    content = types.Content(role="user", parts=[types.Part(text="Genera la carta de presentación.")])

    carta_text = ""
    async for event in runner.run_async(user_id=USER_ID, session_id=session_id, new_message=content):
        if event.is_final_response() and event.content and event.content.parts:
            text = event.content.parts[0].text or ""
            if text.strip():
                carta_text = text  # keep updating — last one is the Formateador's output

    parsed = _extract_json(carta_text)

    # Fallback: read from session state if parsing the event text failed
    if not parsed:
        session = await session_service.get_session(
            app_name=APP_NAME, user_id=USER_ID, session_id=session_id
        )
        if session and session.state:
            parsed = _extract_json(session.state.get("carta_final", ""))

    nombre = _normalize_cv_profile(cv_profile).get("nombre", "Candidato")

    if parsed:
        return _normalize_output(parsed, nombre)

    return {
        "carta_presentacion": "Error al generar la carta.",
        "analisis_estrategico": {
            "puntos_clave_resaltados": [],
            "tono_utilizado": "",
            "sugerencia_adicional": "",
        },
        "_error": "No se pudo extraer JSON válido de la respuesta del agente.",
    }
