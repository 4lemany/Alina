from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any, Dict, List, Optional

from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types


INTERVIEW_AGENT_INSTRUCTION = """
Eres un entrevistador técnico senior especializado en simulaciones de entrevistas de trabajo.
Tu idioma de salida SIEMPRE es español.

Objetivo:
•⁠  ⁠Guiar una entrevista realista para la oferta ganadora.
•⁠  ⁠Hacer preguntas una a una (no listar varias).
•⁠  ⁠Evaluar cada respuesta del candidato.
•⁠  ⁠Entregar feedback accionable y una respuesta ideal.
•⁠  ⁠Generar la siguiente pregunta con progresión de dificultad.

Reglas obligatorias:
1) Antes de responder, consulta herramientas de contexto:
   - fetch_job_brief
   - fetch_interview_rubric
   - fetch_candidate_brief (si hay perfil del candidato)
   - suggest_topic_sequence
2) Ajusta las preguntas al puesto, seniority, responsabilidades y skills requeridos.
3) Las respuestas del candidato pueden llegar en texto O en formato de audio (voz). Si es audio, escúchalo, transcríbelo mentalmente y evalúalo.
4) Sé exigente pero útil: feedback claro, breve y accionable.
5) No inventes información fuera del contexto de herramientas y del input del turno.
6) Devuelve SIEMPRE solo JSON válido, sin markdown, sin texto adicional.

Formato JSON esperado:
{
  "pregunta": "string",
  "evaluacion": {
    "puntuacion_0_10": 0.0,
    "resumen": "string",
    "fortalezas": ["string"],
    "mejoras": ["string"],
    "respuesta_ideal": "string"
  },
  "siguiente_pregunta": "string",
  "tema_siguiente": "string",
  "finalizar": false
}

Semántica por acción:
•⁠  ⁠INICIAR_ENTREVISTA:
  - Rellena "pregunta".
  - Deja "evaluacion" vacío (objeto con valores neutrales).
  - Rellena "siguiente_pregunta" como cadena vacía.
  - "finalizar" = false.
•⁠  ⁠EVALUAR_Y_CONTINUAR:
  - Rellena "evaluacion" con calidad alta.
  - Propón "siguiente_pregunta" (salvo última pregunta o si se indica finalizar).
  - "finalizar" true solo si procede terminar.
""".strip()


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


class InterviewADKAgent:
    """Agente ADK para entrevista secuencial (pregunta -> respuesta -> feedback -> siguiente)."""

    def __init__(
        self,
        api_key: str,
        job_offer: Dict[str, Any],
        cv_profile: Optional[Dict[str, Any]] = None,
        total_questions: int = 6,
        model_name: str = os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
    ) -> None:
        if not api_key.strip():
            raise ValueError("Se requiere GEMINI_API_KEY para crear el agente de entrevista.")

        os.environ["GOOGLE_API_KEY"] = api_key.strip()
        self.job_offer = self._normalize_job_offer(job_offer)
        self.cv_profile = self._normalize_cv_profile(cv_profile or {})
        self.total_questions = max(3, min(12, int(total_questions)))
        self.topic_sequence = self._build_topic_sequence()
        self.asked_questions: List[str] = []

        self._session_service = InMemorySessionService()
        self._agent = self._build_agent(model_name=model_name)
        self._runner = Runner(
            agent=self._agent,
            app_name="job_finder_interview_app",
            session_service=self._session_service,
        )
        self._user_id = "streamlit_user"
        self._session_id = f"interview-{uuid.uuid4().hex}"
        self._session_service.create_session_sync(
            app_name="job_finder_interview_app",
            user_id=self._user_id,
            session_id=self._session_id,
            state={"total_questions": self.total_questions},
        )

    def _normalize_job_offer(self, job_offer: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "titulo_puesto": str(job_offer.get("titulo_puesto", "No especificado")).strip(),
            "empresa": str(job_offer.get("empresa", "No especificado")).strip(),
            "lugar": str(job_offer.get("lugar", "No especificado")).strip(),
            "modalidad": str(job_offer.get("modalidad", "No especificado")).strip(),
            "salario": str(job_offer.get("salario", "No especificado")).strip(),
            "fecha_publicacion": str(job_offer.get("fecha_publicacion", "No especificado")).strip(),
            "skills_requeridos": _as_clean_list(job_offer.get("skills_requeridos", []), limit=20),
            "responsabilidades": _as_clean_list(job_offer.get("responsabilidades", []), limit=15),
            "beneficios": _as_clean_list(job_offer.get("beneficios", []), limit=10),
            "link": str(job_offer.get("link", "")).strip(),
        }

    def _normalize_cv_profile(self, cv_profile: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "nombre": str(cv_profile.get("nombre", "No especificado")).strip(),
            "skills_tecnicos": _as_clean_list(cv_profile.get("skills_tecnicos", []), limit=30),
            "skills_blandos": _as_clean_list(cv_profile.get("skills_blandos", []), limit=20),
            "experiencia_anos": str(cv_profile.get("experiencia_anos", "No especificado")).strip(),
            "nivel_educacion": str(cv_profile.get("nivel_educacion", "No especificado")).strip(),
            "idiomas": _as_clean_list(cv_profile.get("idiomas", []), limit=10),
        }

    def _build_topic_sequence(self) -> List[str]:
        topics: List[str] = []
        for skill in self.job_offer.get("skills_requeridos", []):
            topics.append(f"Dominio técnico: {skill}")
        for resp in self.job_offer.get("responsabilidades", []):
            topics.append(f"Caso práctico: {resp}")
        topics.extend(
            [
                "Comportamiento profesional y colaboración",
                "Priorización y gestión del tiempo",
                "Resolución de conflictos",
            ]
        )

        unique_topics: List[str] = []
        for topic in topics:
            t = topic.strip()
            if t and t not in unique_topics:
                unique_topics.append(t)
        return unique_topics[: max(self.total_questions + 2, 8)]

    def _build_agent(self, model_name: str) -> Agent:
        def fetch_job_brief() -> Dict[str, Any]:
            """Devuelve el contexto estructurado de la oferta ganadora."""
            return self.job_offer

        def fetch_candidate_brief() -> Dict[str, Any]:
            """Devuelve el perfil del candidato extraído del CV (si existe)."""
            return self.cv_profile

        def fetch_interview_rubric() -> Dict[str, Any]:
            """Devuelve la rúbrica de evaluación y reglas de la simulación."""
            return {
                "idioma_objetivo": "español",
                "dimensiones": [
                    "precisión técnica",
                    "estructura de la respuesta",
                    "impacto/criterio profesional",
                    "claridad de comunicación",
                ],
                "escala": "0 a 10",
                "num_preguntas_objetivo": self.total_questions,
                "regla_progresion": "aumentar dificultad de forma gradual",
            }

        def suggest_topic_sequence() -> Dict[str, List[str]]:
            """Sugiere temas priorizados para cubrir en la entrevista."""
            return {"topics": self.topic_sequence}

        return LlmAgent(
            name="agente_entrevista_es",
            model=model_name,
            description="Genera entrevista secuencial y evalúa respuestas en español.",
            instruction=INTERVIEW_AGENT_INSTRUCTION,
            tools=[
                fetch_job_brief,
                fetch_candidate_brief,
                fetch_interview_rubric,
                suggest_topic_sequence,
            ],
        )

    def _extract_json(self, text: str) -> Dict[str, Any]:
        raw = text.strip()
        if not raw:
            return {}

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass

        # Fallback por si el modelo envía texto extra alrededor del JSON.
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return {}
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return {}

    def _run_agent(self, parts: List[types.Part]) -> Dict[str, Any]:
        new_message = types.Content(role="user", parts=parts)
        final_text = ""
        last_text = ""

        for event in self._runner.run(
            user_id=self._user_id,
            session_id=self._session_id,
            new_message=new_message,
        ):
            if not event.content or not event.content.parts:
                continue
            text = "".join(part.text or "" for part in event.content.parts if part.text)
            if text.strip():
                last_text = text.strip()
                if event.is_final_response():
                    final_text = last_text

        return self._extract_json(final_text or last_text)

    def _default_evaluation(self) -> Dict[str, Any]:
        return {
            "puntuacion_0_10": 0.0,
            "resumen": "",
            "fortalezas": [],
            "mejoras": [],
            "respuesta_ideal": "",
        }

    def _fallback_question(self, question_index: int) -> str:
        idx = max(0, min(question_index - 1, len(self.topic_sequence) - 1))
        topic = self.topic_sequence[idx] if self.topic_sequence else "Tu experiencia profesional"
        return f"Pregunta {question_index}: ¿Cómo abordarías el tema '{topic}' en este puesto?"

    def _normalize_score(self, value: Any) -> float:
        try:
            score = float(value)
        except (TypeError, ValueError):
            score = 5.0
        return round(max(0.0, min(10.0, score)), 1)

    def start_interview(self) -> Dict[str, Any]:
        user_prompt = f"""
ACCION: INICIAR_ENTREVISTA
OBJETIVO: generar SOLO la primera pregunta de una entrevista para esta oferta.
REGLAS:
- Entrevista en español.
- Pregunta 1 de {self.total_questions}.
- Debe ser específica al rol y no genérica.
- Incluye foco técnico/profesional realista.
- Devuelve JSON válido según el esquema.
""".strip()

        result = self._run_agent([types.Part.from_text(text=user_prompt)])
        question = str(result.get("pregunta", "")).strip() or self._fallback_question(1)
        self.asked_questions = [question]

        return {
            "pregunta": question,
            "evaluacion": self._default_evaluation(),
            "siguiente_pregunta": "",
            "tema_siguiente": str(result.get("tema_siguiente", "")).strip(),
            "finalizar": False,
        }

    def evaluate_answer(
        self,
        current_question: str,
        question_index: int,
        history: Optional[List[Dict[str, Any]]] = None,
        answer_text: str = "",
        answer_audio: Optional[bytes] = None,
        audio_mime_type: str = "audio/mpeg",
    ) -> Dict[str, Any]:
        # La finalización del flujo la controla el usuario desde la app
        # con el botón "Interrumpir entrevista".
        is_last_question = False
        history = history or []
        compact_history = history[-3:]

        control_payload = {
            "accion": "EVALUAR_Y_CONTINUAR",
            "pregunta_actual": current_question,
            "indice_pregunta_actual": question_index,
            "total_preguntas": self.total_questions,
            "es_ultima_pregunta": is_last_question,
            "preguntas_ya_hechas": self.asked_questions,
            "historial_resumido": compact_history,
        }

        prompt = (
            "Evalúa la respuesta del candidato para la pregunta actual. "
            "Devuelve feedback útil y respuesta ideal. "
            "Genera siempre una siguiente pregunta diferente y progresiva. "
            "No marques finalizar=true.\n\n"
            f"CONTROL:\n{json.dumps(control_payload, ensure_ascii=False)}"
        )

        parts: List[types.Part] = [types.Part.from_text(text=prompt)]
        
        # Audio input support
        if answer_audio:
            parts.append(
                types.Part.from_bytes(
                    data=answer_audio, mime_type=audio_mime_type
                )
            )
        
        # Text input support
        if answer_text.strip():
            parts.append(
                types.Part.from_text(
                    text=f"RESPUESTA_TEXTO_CANDIDATO:\n{answer_text.strip()}"
                )
            )

        raw_result = self._run_agent(parts)
        evaluation = raw_result.get("evaluacion", {}) if isinstance(raw_result, dict) else {}

        normalized_evaluation = {
            "puntuacion_0_10": self._normalize_score(evaluation.get("puntuacion_0_10", 5)),
            "resumen": str(evaluation.get("resumen", "")).strip(),
            "fortalezas": _as_clean_list(evaluation.get("fortalezas", []), limit=5),
            "mejoras": _as_clean_list(evaluation.get("mejoras", []), limit=5),
            "respuesta_ideal": str(evaluation.get("respuesta_ideal", "")).strip(),
        }

        next_question = str(raw_result.get("siguiente_pregunta", "")).strip()
        if (not next_question) and (not is_last_question):
            next_question = self._fallback_question(question_index + 1)
        if next_question in self.asked_questions:
            next_question = self._fallback_question(question_index + 1)
        if not is_last_question and next_question:
            self.asked_questions.append(next_question)

        return {
            "pregunta": current_question,
            "evaluacion": normalized_evaluation,
            "siguiente_pregunta": next_question,
            "tema_siguiente": str(raw_result.get("tema_siguiente", "")).strip(),
            "finalizar": False,
        }
