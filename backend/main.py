import asyncio
import io
import json
import os
import time
import uuid
from typing import Optional

import PyPDF2
import docx
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from google.adk.agents import LlmAgent, ParallelAgent, SequentialAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools.tool_context import ToolContext
from google.genai import types
from pydantic import BaseModel
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

try:
    from cover_letter_ADK import generar_carta
except Exception:
    generar_carta = None

try:
    from interview_agent_adk import InterviewADKAgent
except Exception:
    InterviewADKAgent = None

try:
    from company_research_agent_ADK import investigar_empresa
except Exception:
    investigar_empresa = None

try:
    from upskilling_agent_adk import generar_plan_upskilling
except Exception:
    generar_plan_upskilling = None

load_dotenv()

app = FastAPI(title="Job Finder API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for interview sessions
interview_sessions: dict[str, "InterviewADKAgent"] = {}

# Caché del path de ChromeDriver — se resuelve una sola vez por proceso
_DRIVER_PATH: Optional[str] = None

# Constantes ADK
GEMINI_MODEL = "gemini-2.5-flash"
ANALISIS_APP_NAME = "analisis_app"
USER_ID = "user_1"


def _get_driver_path() -> Optional[str]:
    global _DRIVER_PATH
    if _DRIVER_PATH is not None:
        return _DRIVER_PATH

    # En entornos serverless como Vercel o AWS Lambda, el filesystem es de solo lectura y no hay Chrome
    if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
        return None

    try:
        raw = ChromeDriverManager().install()
        candidate = os.path.join(os.path.dirname(raw), "chromedriver")
        _DRIVER_PATH = candidate if os.path.isfile(candidate) else raw
    except Exception as e:
        print(f"[WARN] ChromeDriver no disponible ({e}), se usará scraping HTTP o datos directos de Adzuna.")
        _DRIVER_PATH = None
    return _DRIVER_PATH


# ─── JOB FINDER LOGIC ────────────────────────────────────────────────────────

def _setup_driver(driver_path=None):
    if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
        return None

    try:
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument(
            "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        if driver_path is None:
            driver_path = _get_driver_path()
        if not driver_path:
            return None
        return webdriver.Chrome(service=Service(driver_path), options=chrome_options)
    except Exception as e:
        print(f"[WARN] No se pudo inicializar Selenium ({e}).")
        return None


def _scrape_url(url: str, driver_path: Optional[str] = None) -> str:
    # 1. Intentar scraping ligero con requests (rápido y compatible con Vercel/serverless)
    try:
        resp = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            timeout=5,
            allow_redirects=True,
        )
        if resp.status_code == 200 and resp.text:
            import re
            text = re.sub(r'<script.*?</script>', ' ', resp.text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r'<style.*?</style>', ' ', text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r'<[^>]+>', ' ', text)
            clean = ' '.join(text.split())
            if len(clean) > 200:
                return clean[:5000]
    except Exception:
        pass

    # 2. Si hay driver Selenium disponible (ej. en desarrollo local con Chrome instalado), usarlo
    driver = _setup_driver(driver_path)
    if driver is None:
        return ""
    try:
        driver.get(url)
        try:
            WebDriverWait(driver, 10).until(
                lambda d: len(d.execute_script("return document.body.innerText;").strip()) > 200
            )
        except Exception:
            time.sleep(2)
        scroll_step, current = 600, 0
        while True:
            driver.execute_script(f"window.scrollTo(0, {current});")
            time.sleep(0.15)
            current += scroll_step
            if current >= driver.execute_script("return document.body.scrollHeight"):
                break
        driver.execute_script("window.scrollTo(0, 0);")
        time.sleep(0.5)
        return driver.execute_script("return document.body.innerText;")
    except Exception as e:
        print(f"[WARN] Error durante scraping con Selenium: {e}")
        return ""
    finally:
        try:
            driver.quit()
        except Exception:
            pass


def _search_adzuna(app_id, app_key, country, what, where, results_per_page=5):
    url = f"https://api.adzuna.com/v1/api/jobs/{country.lower()}/search/1"
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "what": what,
        "where": where,
        "results_per_page": results_per_page,
        "sort_by": "relevance",
        "content-type": "application/json",
    }
    r = requests.get(url, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def _parse_job_with_llm(text: str, url: str, api_key: str) -> dict:
    client = genai.Client(api_key=api_key)
    prompt = f"""Analiza el texto de una oferta de trabajo y devuelve ÚNICAMENTE un JSON válido con este esquema exacto:

{{
  "titulo_puesto": "string",
  "empresa": "string",
  "lugar": "string",
  "modalidad": "Remoto | Híbrido | Presencial | No especificado",
  "link": "{url}",
  "skills_requeridos": ["Python", "SQL", "React"],
  "responsabilidades": ["resp1", "resp2"],
  "beneficios": ["ben1", "ben2"],
  "salario": "string o 'No especificado'",
  "fecha_publicacion": "string o 'No especificado'"
}}

IMPORTANTE: skills_requeridos son las competencias que el candidato debe TENER o SABER — no las tareas que va a realizar.
Regla de agrupación: máximo 12 elementos. Agrupa si hay más.
Traduce todo al español. Sin texto extra. Sin markdown.

TEXTO:
{text}"""
    try:
        raw = client.models.generate_content(model=GEMINI_MODEL, contents=prompt).text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        return {
            "titulo_puesto": "Error al parsear",
            "empresa": "—",
            "lugar": "—",
            "modalidad": "No especificado",
            "link": url,
            "skills_requeridos": [],
            "responsabilidades": [],
            "beneficios": [],
            "salario": "No especificado",
            "fecha_publicacion": "No especificado",
            "_error": str(e),
        }


def _extract_cv_skills(cv_text: str, api_key: str) -> dict:
    client = genai.Client(api_key=api_key)
    prompt = f"""Analiza este CV y devuelve ÚNICAMENTE un JSON válido:

{{
  "nombre": "string",
  "skills_tecnicos": ["skill1"],
  "skills_blandos": ["skill1"],
  "experiencia_anos": "string",
  "nivel_educacion": "string",
  "idiomas": ["Español nativo"]
}}

Sin texto extra. Sin emojis. Traduce al español.

CV:
{cv_text}"""
    try:
        raw = client.models.generate_content(model=GEMINI_MODEL, contents=prompt).text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        return {"_error": str(e)}


def _compute_match(cv_profile: dict, job: dict, modalidad_pref: str, api_key: str) -> dict:
    job_skills = job.get("skills_requeridos", [])
    cv_skills = cv_profile.get("skills_tecnicos", [])
    if not job_skills:
        return {"score": 0.0, "base": 0.0, "bonus": 0, "matched": [], "partial": [], "missing": [], "total_job_skills": 0}

    client = genai.Client(api_key=api_key)
    prompt = f"""Compara skills candidato vs oferta. Devuelve JSON:
{{"matched": [], "partial": [], "missing": []}}
Candidato: {json.dumps(cv_skills, ensure_ascii=False)}
Oferta: {json.dumps(job_skills, ensure_ascii=False)}"""

    try:
        raw = client.models.generate_content(model=GEMINI_MODEL, contents=prompt).text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw.strip())
        matched = result.get("matched", [])
        partial = result.get("partial", [])
        missing = result.get("missing", [])
        base = (len(matched) + len(partial) * 0.5) / len(job_skills) * 100
    except Exception:
        matched, partial, missing = [], [], []
        cv_lower = [s.lower().strip() for s in cv_skills]
        for js in job_skills:
            if any(js.lower().strip() in cs or cs in js.lower().strip() for cs in cv_lower):
                matched.append(js)
            else:
                missing.append(js)
        base = len(matched) / len(job_skills) * 100

    modalidad = job.get("modalidad", "No especificado")
    bonus = 5 if (modalidad_pref != "Sin preferencia" and modalidad == modalidad_pref) else 0
    return {
        "score": round(min(100.0, base + bonus), 1),
        "base": round(base, 1),
        "bonus": bonus,
        "matched": matched,
        "partial": partial,
        "missing": missing,
        "total_job_skills": len(job_skills),
    }


def _extract_json(text: str) -> dict:
    """Extrae JSON de una respuesta LLM que puede contener markdown fences."""
    raw = (text or "").strip()
    if not raw:
        return {}
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    import re as _re
    m = _re.search(r"\{.*\}", raw, _re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return {}


async def _read_cv_file(cv_file: Optional[UploadFile]) -> str:
    if not cv_file:
        return ""
    content = await cv_file.read()
    fname = cv_file.filename or ""
    if fname.endswith(".txt"):
        return content.decode("utf-8", errors="ignore")
    if fname.endswith(".pdf"):
        reader = PyPDF2.PdfReader(io.BytesIO(content))
        return "".join(page.extract_text() or "" for page in reader.pages)
    if fname.endswith(".docx"):
        doc = docx.Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs)
    return ""


# ─── PIPELINE DE ANÁLISIS MANUAL CON ADK ─────────────────────────────────────

EXTRACTOR_CV_INSTRUCTION = """
Analiza el siguiente CV y devuelve ÚNICAMENTE un JSON válido con estos campos:
- nombre: nombre completo del candidato
- skills_tecnicos: lista de habilidades técnicas
- skills_blandos: lista de habilidades blandas
- experiencia_anos: años de experiencia estimados (string)
- nivel_educacion: nivel educativo más alto (string)
- idiomas: lista de idiomas con nivel (ej: "Español nativo")

Sin texto extra. Sin markdown. Sin emojis. Traduce los valores al español.

CV a analizar:
{cv_text}
""".strip()

PARSEADOR_OFERTA_INSTRUCTION = """
Analiza el siguiente texto de oferta de trabajo y devuelve ÚNICAMENTE un JSON válido con estos campos:
- titulo_puesto: título del puesto (string)
- empresa: nombre de la empresa (string)
- lugar: ubicación (string)
- modalidad: una de "Remoto", "Híbrido", "Presencial" o "No especificado"
- link: cadena vacía ""
- skills_requeridos: competencias que el candidato debe tener, máximo 12 elementos agrupados
- responsabilidades: lista de responsabilidades principales
- beneficios: lista de beneficios ofrecidos
- salario: salario o "No especificado"
- fecha_publicacion: fecha o "No especificado"

IMPORTANTE: skills_requeridos son las competencias que el candidato debe TENER o SABER, no las tareas a realizar.
Traduce todo al español. Sin texto extra. Sin markdown.

Oferta a analizar:
{job_text}
""".strip()

COMPUTADOR_MATCH_INSTRUCTION = """
Compara las skills del candidato con las skills requeridas por la oferta.

Perfil del candidato (JSON): {cv_profile_json}
Datos de la oferta (JSON): {job_json}

Devuelve ÚNICAMENTE un JSON válido con estos campos:
- matched: lista de skills que el candidato tiene completamente
- partial: lista de skills que el candidato tiene parcialmente
- missing: lista de skills que el candidato no tiene

Sin texto extra. Sin markdown. Solo el JSON.
""".strip()


def crear_pipeline_analisis_manual(has_cv: bool, modalidad: str = "Sin preferencia", gemini_key: str = "") -> "LlmAgent | SequentialAgent":
    """
    Pipeline de análisis manual:
      - Con CV: ParallelAgent([AnalizadorCV, ParseadorOferta]) → CalculadorMatchManual
      - Sin CV: ParseadorOferta
    """
    parseador_oferta = LlmAgent(
        name="ParseadorOferta",
        model=GEMINI_MODEL,
        instruction=PARSEADOR_OFERTA_INSTRUCTION,
        output_key="oferta_parseada",
    )

    if not has_cv:
        return parseador_oferta

    extractor_cv = LlmAgent(
        name="AnalizadorCV",
        model=GEMINI_MODEL,
        instruction=EXTRACTOR_CV_INSTRUCTION,
        output_key="cv_profile",
    )

    analizador_paralelo = ParallelAgent(
        name="AnalisisParaleloManual",
        sub_agents=[extractor_cv, parseador_oferta],
    )

    def calcular_match_manual(tool_context: ToolContext) -> str:
        """Calcula el match entre el CV y la oferta parseada y guarda el resultado en estado."""
        cv_str = tool_context.state.get("cv_profile", "{}")
        oferta_str = tool_context.state.get("oferta_parseada", "{}")
        cv_profile = _extract_json(cv_str) if cv_str else {}
        job = _extract_json(oferta_str) if oferta_str else {}
        if cv_profile and job.get("skills_requeridos"):
            score = _compute_match(cv_profile, job, modalidad, gemini_key)
        else:
            score = None
        tool_context.state["resultado_manual"] = json.dumps({
            "oferta": job,
            "score": score,
            "cv_profile": cv_profile,
        }, ensure_ascii=False)
        return "Match calculado."

    calculador_match = LlmAgent(
        name="CalculadorMatchManual",
        model=GEMINI_MODEL,
        tools=[calcular_match_manual],
        instruction=(
            "Llama a calcular_match_manual() para calcular el match entre el CV y la oferta. "
            "La herramienta guarda el resultado automáticamente en el estado."
        ),
    )

    return SequentialAgent(
        name="PipelineManual",
        sub_agents=[analizador_paralelo, calculador_match],
    )


# ─── PIPELINE DE ANÁLISIS CON ADK ────────────────────────────────────────────

def crear_pipeline_analisis(
    cv_text: str,
    query: str,
    city: str,
    country: str,
    modalidad: str,
    app_id: str,
    app_key: str,
    gemini_key: str,
) -> SequentialAgent:
    """
    Pipeline de análisis:
      ParallelAgent([AnalizadorCV, PipelineBusqueda]) → CalculadorMatch

    PipelineBusqueda:
      BuscadorAdzuna → ParallelAgent([Scraper0, Scraper1, Scraper2]) → AnalizadorOfertas
    """
    driver_path = _get_driver_path()

    # --- Herramientas ---

    def buscar_urls_adzuna(tool_context: ToolContext) -> str:
        """Busca ofertas en Adzuna y guarda las URLs y datos crudos en el estado."""
        # Si el estado ya fue pre-poblado desde el endpoint, no rellamar a la API
        if tool_context.state.get("total_ofertas") is not None:
            total = tool_context.state["total_ofertas"]
            num_urls = sum(1 for i in range(3) if tool_context.state.get(f"url_{i}"))
            return json.dumps({"num_urls": num_urls, "total": total}, ensure_ascii=False)

        search = _search_adzuna(app_id, app_key, country, query, city, results_per_page=5)
        results = search.get("results", [])[:3]
        total = search.get("count", 0)

        urls = [
            j.get("redirect_url") or j.get("adref", "")
            for j in results
            if j.get("redirect_url") or j.get("adref")
        ]
        for i in range(3):
            tool_context.state[f"url_{i}"] = urls[i] if i < len(urls) else ""
        tool_context.state["total_ofertas"] = total

        # Guardar datos crudos de la API como respaldo por si el scraping falla
        adzuna_jobs = []
        for j in results:
            salary_parts = [j.get("salary_min"), j.get("salary_max")]
            salary = " - ".join(str(int(s)) for s in salary_parts if s) or "No especificado"
            adzuna_jobs.append({
                "titulo_puesto": j.get("title", ""),
                "empresa": (j.get("company") or {}).get("display_name", "No especificado"),
                "lugar": (j.get("location") or {}).get("display_name", "No especificado"),
                "modalidad": "No especificado",
                "link": j.get("redirect_url") or j.get("adref", ""),
                "descripcion_raw": (j.get("description") or "")[:3000],
                "salario": salary,
                "fecha_publicacion": (j.get("created") or "")[:10],
            })
        tool_context.state["adzuna_jobs"] = json.dumps(adzuna_jobs, ensure_ascii=False)

        return json.dumps({"num_urls": len(urls), "total": total}, ensure_ascii=False)

    def make_scraper_tool(idx: int):
        def scrape(tool_context: ToolContext) -> str:
            """Scrapea la URL asignada del estado y guarda el resultado."""
            url = tool_context.state.get(f"url_{idx}", "")
            if not url:
                tool_context.state[f"scraped_{idx}"] = json.dumps(
                    {"disponible": False, "url": "", "texto": ""}, ensure_ascii=False
                )
                return f"URL {idx} no disponible."
            try:
                texto = _scrape_url(url, driver_path)[:5000]
                result = {"disponible": True, "url": url, "texto": texto}
            except Exception:
                result = {"disponible": False, "url": url, "texto": ""}
            tool_context.state[f"scraped_{idx}"] = json.dumps(result, ensure_ascii=False)
            return f"Scraping completado para URL {idx}."
        scrape.__name__ = f"scrape_url_{idx}"
        scrape.__doc__ = f"Scrapea la URL {idx} del estado de sesión y guarda el texto de la oferta."
        return scrape

    def make_reader_tool(idx: int):
        def leer_oferta(tool_context: ToolContext) -> str:
            """Lee el texto scrapeado de la oferta o el fallback de Adzuna."""
            raw = tool_context.state.get(f"scraped_{idx}", "")
            try:
                scraped = json.loads(raw) if raw else {}
            except (json.JSONDecodeError, ValueError):
                scraped = {}
            if scraped.get("disponible") and scraped.get("texto"):
                return scraped["texto"][:5000]
            try:
                adzuna_raw = tool_context.state.get("adzuna_jobs", "[]")
                adzuna_jobs = json.loads(adzuna_raw) if adzuna_raw else []
            except (json.JSONDecodeError, ValueError):
                adzuna_jobs = []
            if idx < len(adzuna_jobs):
                j = adzuna_jobs[idx]
                return (
                    f"Título: {j.get('titulo_puesto', '')}\n"
                    f"Empresa: {j.get('empresa', '')}\n"
                    f"Lugar: {j.get('lugar', '')}\n"
                    f"Descripción: {j.get('descripcion_raw', '')}\n"
                    f"Salario: {j.get('salario', '')}\n"
                    f"Fecha: {j.get('fecha_publicacion', '')}\n"
                    f"Link: {j.get('link', '')}"
                )
            return "No hay datos disponibles para esta oferta."
        leer_oferta.__name__ = f"leer_oferta_{idx}"
        leer_oferta.__doc__ = f"Lee el contenido de la oferta {idx} (scrapeado o fallback Adzuna)."
        return leer_oferta

    def make_matcher_tool(idx: int):
        def calcular_match_oferta(tool_context: ToolContext) -> str:
            """Calcula el match entre el CV y la oferta parseada y guarda el resultado en estado."""
            cv_str = tool_context.state.get("cv_profile", "{}")
            parsed_str = tool_context.state.get(f"parsed_{idx}", "")
            cv_profile = _extract_json(cv_str) if cv_str else {}
            job = _extract_json(parsed_str) if parsed_str else {}
            if cv_profile and job.get("skills_requeridos"):
                score = _compute_match(cv_profile, job, modalidad, gemini_key)
            else:
                score = None
            tool_context.state[f"match_{idx}"] = json.dumps(
                {"oferta": job, "score": score}, ensure_ascii=False
            )
            return f"Match {idx} calculado."
        calcular_match_oferta.__name__ = f"calcular_match_{idx}"
        calcular_match_oferta.__doc__ = f"Calcula el match para la oferta {idx}."
        return calcular_match_oferta

    def sintetizar_resultados(tool_context: ToolContext) -> str:
        """Lee los matches calculados, encuentra el mejor y guarda resultado_final en estado."""
        total = int(tool_context.state.get("total_ofertas", 0))
        cv_str = tool_context.state.get("cv_profile", "{}")
        cv_profile = _extract_json(cv_str) if cv_str else {}
        matches = []
        for i in range(3):
            raw = tool_context.state.get(f"match_{i}", "")
            if raw:
                try:
                    matches.append(json.loads(raw))
                except (json.JSONDecodeError, ValueError):
                    pass
        # Fallback: usar adzuna_jobs si ningún match fue calculado
        if not matches:
            try:
                adzuna_jobs = json.loads(tool_context.state.get("adzuna_jobs", "[]"))
            except (json.JSONDecodeError, ValueError):
                adzuna_jobs = []
            for aj in adzuna_jobs:
                matches.append({
                    "oferta": {
                        "titulo_puesto": aj.get("titulo_puesto", ""),
                        "empresa": aj.get("empresa", "No especificado"),
                        "lugar": aj.get("lugar", "No especificado"),
                        "modalidad": "No especificado",
                        "link": aj.get("link", ""),
                        "skills_requeridos": [],
                        "responsabilidades": [],
                        "beneficios": [],
                        "salario": aj.get("salario", "No especificado"),
                        "fecha_publicacion": aj.get("fecha_publicacion", "No especificado"),
                    },
                    "score": None,
                })
        best_idx = 0
        scored = [(i, m["score"]["score"]) for i, m in enumerate(matches) if m.get("score")]
        if scored:
            best_idx = max(scored, key=lambda x: x[1])[0]
        tool_context.state["resultado_final"] = json.dumps({
            "matches": matches,
            "best_idx": best_idx,
            "cv_profile": cv_profile,
            "total": total,
        }, ensure_ascii=False)
        return "Síntesis completada."

    # --- Agentes ---

    agente_cv = LlmAgent(
        name="AnalizadorCV",
        model=GEMINI_MODEL,
        instruction=(
            "Analiza el siguiente CV y devuelve ÚNICAMENTE un JSON válido con estos campos: "
            'nombre (string), skills_tecnicos (array), skills_blandos (array), '
            'experiencia_anos (string), nivel_educacion (string), idiomas (array). '
            "Sin texto extra. Sin emojis. Traduce al español.\n\n"
            f"CV:\n{cv_text if cv_text.strip() else 'No se proporcionó CV.'}"
        ),
        output_key="cv_profile",
    )

    agente_buscador = LlmAgent(
        name="BuscadorAdzuna",
        model=GEMINI_MODEL,
        tools=[buscar_urls_adzuna],
        instruction=(
            "Llama a buscar_urls_adzuna() para buscar ofertas en Adzuna. "
            "La herramienta guarda automáticamente las URLs en el estado para el scraping."
        ),
    )

    fase_inicial = ParallelAgent(
        name="FaseInicial",
        sub_agents=[agente_cv, agente_buscador],
    )

    def make_job_pipeline(idx: int) -> SequentialAgent:
        scraper = LlmAgent(
            name=f"Scraper_{idx}",
            model=GEMINI_MODEL,
            tools=[make_scraper_tool(idx)],
            instruction=f"Llama a scrape_url_{idx}() para obtener el texto de la oferta {idx}.",
        )
        parser = LlmAgent(
            name=f"Parser_{idx}",
            model=GEMINI_MODEL,
            tools=[make_reader_tool(idx)],
            instruction=(
                f"Llama a leer_oferta_{idx}() para obtener el texto de la oferta. "
                "Extrae la información y devuelve ÚNICAMENTE un JSON válido con: "
                "titulo_puesto, empresa, lugar, modalidad (Remoto/Híbrido/Presencial/No especificado), "
                "link, skills_requeridos (máx 12, solo competencias que el candidato debe SABER), "
                "responsabilidades, beneficios, salario, fecha_publicacion. "
                "Traduce al español. Sin texto extra. Sin markdown."
            ),
            output_key=f"parsed_{idx}",
        )
        matcher = LlmAgent(
            name=f"Matcher_{idx}",
            model=GEMINI_MODEL,
            tools=[make_matcher_tool(idx)],
            instruction=(
                f"Llama a calcular_match_{idx}() para calcular el match entre el CV y la oferta {idx}. "
                "La herramienta guarda el resultado automáticamente en el estado."
            ),
        )
        return SequentialAgent(
            name=f"JobPipeline_{idx}",
            sub_agents=[scraper, parser, matcher],
        )

    jobs_paralelo = ParallelAgent(
        name="JobsParalelo",
        sub_agents=[make_job_pipeline(i) for i in range(3)],
    )

    sintetizador = LlmAgent(
        name="Sintetizador",
        model=GEMINI_MODEL,
        tools=[sintetizar_resultados],
        instruction=(
            "Llama a sintetizar_resultados() para generar el resultado final con todos los matches. "
            "La herramienta guarda el resultado automáticamente en el estado."
        ),
    )

    return SequentialAgent(
        name="PipelineAnalisis",
        sub_agents=[fase_inicial, jobs_paralelo, sintetizador],
    )


# ─── ENDPOINTS ────────────────────────────────────────────────────────────────

@app.post("/api/analyze")
async def analyze(
    cv_file: Optional[UploadFile] = File(None),
    job_query: str = Form(...),
    city: str = Form(...),
    country: str = Form(default="es"),
    modalidad: str = Form(default="Sin preferencia"),
):
    app_id = os.getenv("ADZUNA_APP_ID", "")
    app_key = os.getenv("ADZUNA_APP_KEY", "")
    gemini_key = os.getenv("GEMINI_API_KEY", "")

    if not app_id or not app_key:
        raise HTTPException(400, "Faltan credenciales de Adzuna")
    if not gemini_key:
        raise HTTPException(400, "Falta GEMINI_API_KEY")

    os.environ["GOOGLE_API_KEY"] = gemini_key

    cv_text = await _read_cv_file(cv_file)

    def sse(data: dict) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    async def generate():
        try:
            # Llamar Adzuna directamente (fuera del pipeline LLM) para garantizar resultados
            try:
                search_result = await asyncio.to_thread(
                    _search_adzuna, app_id, app_key, country, job_query, city, 5
                )
            except Exception as e:
                yield sse({"error": f"Error al llamar a Adzuna: {str(e)}"})
                return

            total_adzuna = search_result.get("count", 0)
            raw_results = search_result.get("results", [])[:3]
            print(f"[DEBUG endpoint] Adzuna total={total_adzuna}, results={len(raw_results)}")

            if total_adzuna == 0 or not raw_results:
                yield sse({"error": "Adzuna no encontró ofertas para esa búsqueda. Prueba con otra ciudad o puesto."})
                return

            # Pre-poblar el estado de sesión con los resultados de Adzuna
            urls = [
                j.get("redirect_url") or j.get("adref", "")
                for j in raw_results
                if j.get("redirect_url") or j.get("adref")
            ]
            adzuna_jobs_prepop = []
            for j in raw_results:
                salary_parts = [j.get("salary_min"), j.get("salary_max")]
                salary = " - ".join(str(int(s)) for s in salary_parts if s) or "No especificado"
                adzuna_jobs_prepop.append({
                    "titulo_puesto": j.get("title", ""),
                    "empresa": (j.get("company") or {}).get("display_name", "No especificado"),
                    "lugar": (j.get("location") or {}).get("display_name", "No especificado"),
                    "modalidad": "No especificado",
                    "link": j.get("redirect_url") or j.get("adref", ""),
                    "descripcion_raw": (j.get("description") or "")[:3000],
                    "salario": salary,
                    "fecha_publicacion": (j.get("created") or "")[:10],
                })
            initial_state: dict = {
                "total_ofertas": total_adzuna,
                "adzuna_jobs": json.dumps(adzuna_jobs_prepop, ensure_ascii=False),
            }
            for i in range(3):
                initial_state[f"url_{i}"] = urls[i] if i < len(urls) else ""

            pipeline = crear_pipeline_analisis(
                cv_text, job_query, city, country, modalidad, app_id, app_key, gemini_key
            )
            session_service = InMemorySessionService()
            session_id = f"analisis-{uuid.uuid4().hex}"
            await session_service.create_session(
                app_name=ANALISIS_APP_NAME, user_id=USER_ID, session_id=session_id,
                state=initial_state,
            )
            runner = Runner(agent=pipeline, app_name=ANALISIS_APP_NAME, session_service=session_service)
            content = types.Content(
                role="user",
                parts=[types.Part(text=f"Analiza el CV y busca ofertas de '{job_query}' en {city}.")]
            )

            # Emit initial steps (both agents start in parallel)
            yield sse({"step": "cv"})
            yield sse({"step": "search"})

            emitted = set()
            async for event in runner.run_async(user_id=USER_ID, session_id=session_id, new_message=content):
                author = getattr(event, "author", "")
                if author in ("Scraper_0", "Scraper_1", "Scraper_2") and "scrape" not in emitted:
                    yield sse({"step": "scrape"})
                    emitted.add("scrape")
                elif author in ("Parser_0", "Parser_1", "Parser_2") and "parse" not in emitted:
                    yield sse({"step": "parse"})
                    emitted.add("parse")
                elif author == "Sintetizador" and "match" not in emitted:
                    yield sse({"step": "match"})
                    emitted.add("match")

            # Extract final result from session state
            session = await session_service.get_session(
                app_name=ANALISIS_APP_NAME, user_id=USER_ID, session_id=session_id
            )
            resultado_raw = ""
            if session and session.state:
                resultado_raw = session.state.get("resultado_final", "")

            print(f"[DEBUG endpoint] resultado_final type={type(resultado_raw).__name__}, len={len(str(resultado_raw))}, preview={str(resultado_raw)[:200]}")
            # La tool escribe JSON string directamente; _extract_json maneja también dicts
            if isinstance(resultado_raw, dict):
                resultado = resultado_raw
            else:
                resultado = _extract_json(resultado_raw) if resultado_raw else {}

            matches = resultado.get("matches", [])
            best_idx = resultado.get("best_idx", 0)
            cv_profile = resultado.get("cv_profile", {})

            if not matches:
                job_offers_raw = session.state.get("job_offers", "") if session and session.state else ""
                offers_data_debug = _extract_json(job_offers_raw)
                num_offers = len(offers_data_debug.get("ofertas", []))
                total_adzuna = session.state.get("total_ofertas", 0) if session and session.state else 0
                if total_adzuna == 0:
                    yield sse({"error": "Adzuna no encontró ofertas para esa búsqueda. Prueba con otra ciudad o puesto."})
                elif num_offers == 0:
                    yield sse({"error": f"Se encontraron {total_adzuna} ofertas en Adzuna pero no se pudo extraer su contenido (scraping fallido o webs bloqueadas)."})
                else:
                    yield sse({"error": "No se pudo calcular el match entre el CV y las ofertas."})
                return

            yield sse({"done": True, "result": {
                "best_job": matches[best_idx]["oferta"] if matches else {},
                "best_score": matches[best_idx]["score"] if matches else None,
                "cv_profile": cv_profile,
                "all_jobs": [m["oferta"] for m in matches],
                "all_scores": [m["score"] for m in matches],
                "total_found": resultado.get("total", 0),
            }})

        except Exception as e:
            yield sse({"error": str(e)})

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/analyze-manual")
async def analyze_manual(
    cv_file: Optional[UploadFile] = File(None),
    job_text: str = Form(...),
    modalidad: str = Form(default="Sin preferencia"),
):
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(400, "Falta GEMINI_API_KEY")

    os.environ["GOOGLE_API_KEY"] = gemini_key
    cv_text = await _read_cv_file(cv_file)

    def sse(data: dict) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    async def generate():
        try:
            has_cv = bool(cv_text.strip())
            yield sse({"step": "analizando"})

            pipeline = crear_pipeline_analisis_manual(has_cv, modalidad, gemini_key)
            session_service = InMemorySessionService()
            session_id = f"analisis-manual-{uuid.uuid4().hex}"
            initial_state: dict = {"job_text": job_text}
            if has_cv:
                initial_state["cv_text"] = cv_text
            await session_service.create_session(
                app_name=ANALISIS_APP_NAME,
                user_id=USER_ID,
                session_id=session_id,
                state=initial_state,
            )

            runner = Runner(agent=pipeline, app_name=ANALISIS_APP_NAME, session_service=session_service)
            content = types.Content(role="user", parts=[types.Part(text="Analiza el CV y la oferta.")])
            async for _ in runner.run_async(user_id=USER_ID, session_id=session_id, new_message=content):
                pass

            session = await session_service.get_session(
                app_name=ANALISIS_APP_NAME, user_id=USER_ID, session_id=session_id
            )
            state = session.state if session else {}

            def _parse_json_state(key: str) -> dict:
                val = state.get(key, "")
                if isinstance(val, dict):
                    return val
                return _extract_json(val) if val else {}

            if has_cv:
                resultado_raw = _parse_json_state("resultado_manual")
                parsed_job = resultado_raw.get("oferta", {})
                cv_data = resultado_raw.get("cv_profile", {})
                cv_profile = cv_data if cv_data and "_error" not in cv_data else None
                best_score = resultado_raw.get("score")
            else:
                parsed_job = _parse_json_state("oferta_parseada")
                cv_profile = None
                best_score = None

            yield sse({"done": True, "result": {
                "best_job": parsed_job,
                "best_score": best_score,
                "cv_profile": cv_profile,
                "all_jobs": [parsed_job],
                "all_scores": [best_score],
                "total_found": 1,
            }})

        except Exception as e:
            yield sse({"error": str(e)})

    return StreamingResponse(generate(), media_type="text/event-stream")


class CoverLetterRequest(BaseModel):
    best_job: dict
    cv_profile: dict


@app.post("/api/cover-letter")
async def generate_cover_letter(req: CoverLetterRequest):
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(400, "Falta GEMINI_API_KEY")
    if generar_carta is None:
        raise HTTPException(500, "Módulo de carta no disponible")

    os.environ["GOOGLE_API_KEY"] = gemini_key
    return await generar_carta(req.best_job, req.cv_profile)


class InterviewStartRequest(BaseModel):
    best_job: dict
    cv_profile: dict
    total_questions: int = 6


@app.post("/api/interview/start")
async def interview_start(req: InterviewStartRequest):
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(400, "Falta GEMINI_API_KEY")
    if InterviewADKAgent is None:
        raise HTTPException(500, "InterviewADKAgent no disponible")

    agent = InterviewADKAgent(
        api_key=gemini_key,
        job_offer=req.best_job,
        cv_profile=req.cv_profile,
        total_questions=req.total_questions,
    )
    first_turn = agent.start_interview()
    session_id = f"interview-{uuid.uuid4().hex}"
    interview_sessions[session_id] = agent

    return {"session_id": session_id, **first_turn}


@app.post("/api/interview/answer")
async def interview_answer(
    session_id: str = Form(...),
    current_question: str = Form(...),
    question_index: int = Form(...),
    answer_text: str = Form(""),
    history: str = Form("[]"),
    audio_file: Optional[UploadFile] = File(None),
):
    agent = interview_sessions.get(session_id)
    if not agent:
        raise HTTPException(404, "Sesión de entrevista no encontrada")

    history_list = json.loads(history)

    answer_audio = None
    audio_mime = "audio/webm"
    if audio_file:
        answer_audio = await audio_file.read()
        audio_mime = audio_file.content_type or "audio/webm"

    result = await asyncio.to_thread(
        agent.evaluate_answer,
        current_question=current_question,
        question_index=question_index,
        history=history_list,
        answer_text=answer_text,
        answer_audio=answer_audio,
        audio_mime_type=audio_mime,
    )
    return result


class ChatRequest(BaseModel):
    message: str
    history: list = []
    context: dict = {}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(400, "Falta GEMINI_API_KEY")

    client = genai.Client(api_key=gemini_key)

    system = "Eres un asistente de empleo experto. Ayuda al candidato con dudas sobre su oferta, CV, entrevista o carta de presentación. Responde en español de forma clara y concisa."
    context_str = ""
    if req.context.get("job"):
        context_str = f"\nOferta: {json.dumps(req.context['job'], ensure_ascii=False)}"
    if req.context.get("cv_profile"):
        context_str += f"\nPerfil candidato: {json.dumps(req.context['cv_profile'], ensure_ascii=False)}"

    history_str = ""
    for h in req.history[-6:]:
        role = "Usuario" if h.get("role") == "user" else "Asistente"
        history_str += f"\n{role}: {h.get('content', '')}"

    prompt = f"{system}{context_str}\n{history_str}\nUsuario: {req.message}\nAsistente:"
    response = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
    return {"reply": response.text.strip()}


class CompanyResearchRequest(BaseModel):
    best_job: dict
    cv_profile: dict = {}


@app.post("/api/company-research")
async def company_research(req: CompanyResearchRequest):
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(400, "Falta GEMINI_API_KEY")
    if investigar_empresa is None:
        raise HTTPException(500, "Módulo de investigación no disponible")

    os.environ["GOOGLE_API_KEY"] = gemini_key
    try:
        return await investigar_empresa(req.best_job, req.cv_profile)
    except Exception as e:
        raise HTTPException(500, detail=str(e))


class UpskillingRequest(BaseModel):
    best_job: dict
    cv_profile: dict = {}
    skill_gaps: dict = {}


@app.post("/api/upskilling")
async def upskilling(req: UpskillingRequest):
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(400, "Falta GEMINI_API_KEY")
    if generar_plan_upskilling is None:
        raise HTTPException(500, "Módulo de upskilling no disponible")

    os.environ["GOOGLE_API_KEY"] = gemini_key
    return await generar_plan_upskilling(req.best_job, req.cv_profile, req.skill_gaps)


@app.get("/health")
def health():
    return {"status": "ok"}
