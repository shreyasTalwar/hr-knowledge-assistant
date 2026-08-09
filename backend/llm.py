import os
import re
import requests
from typing import Any, Dict, List, Optional, Tuple

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MODEL_NAME = os.getenv("OPENROUTER_MODEL", "openrouter/free")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")
APP_NAME = "AI HR Knowledge Assistant"

FALLBACK_MESSAGE = (
    "I could not find a clear answer in the uploaded company policies. "
    "Please try rephrasing your question or upload the relevant policy document."
)

WELCOME_MESSAGE = (
    "Hello! I’m your HR Knowledge Assistant. I can help you find information "
    "from the uploaded company policies, such as leave, attendance, benefits, "
    "payroll, workplace conduct, and remote-work guidelines. What would you like to know?"
)

THANK_YOU_MESSAGE = (
    "You’re welcome! If you have another question about the company policies, "
    "feel free to ask."
)


def normalize_text(text: str) -> str:
    """Normalizes user input for intent detection."""
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def detect_conversational_intent(question: str) -> Optional[str]:
    """
    Returns:
        'greeting', 'thanks', 'empty', or None for a policy/RAG question.
    """
    cleaned = normalize_text(question)

    if not cleaned:
        return "empty"

    greeting_patterns = [
        r"^(hi|hello|hey|hola|good morning|good afternoon|good evening)[!., ]*$",
        r"^(hi|hello|hey).{0,40}(how are you|what can you do)[?!. ]*$",
        r"^(start|help|menu)[!., ]*$",
    ]

    thanks_patterns = [
        r"^(thanks|thank you|thx|ty)[!., ]*$",
        r"^(thanks|thank you).{0,40}[!., ]*$",
    ]

    if any(re.match(pattern, cleaned) for pattern in greeting_patterns):
        return "greeting"

    if any(re.match(pattern, cleaned) for pattern in thanks_patterns):
        return "thanks"

    return None


def build_context(
    context_chunks: List[Dict[str, Any]],
    max_chunks: int = 6,
    max_chars_per_chunk: int = 2500,
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Converts retrieved chunks into a model-ready context string
    and returns unique citations.
    """
    context_sections = []
    citations = []
    seen_sources = set()

    for index, chunk in enumerate(context_chunks[:max_chunks], start=1):
        text = (chunk.get("text") or "").strip()
        source = chunk.get("source") or "Unknown Document"
        page = chunk.get("page")

        if not text:
            continue

        text = text[:max_chars_per_chunk]

        page_label = f", Page: {page}" if page not in (None, "", 0) else ""
        context_sections.append(
            f"[SOURCE {index}: {source}{page_label}]\n{text}"
        )

        citation_key = (source, page)
        if citation_key not in seen_sources:
            citations.append({"source": source, "page": page})
            seen_sources.add(citation_key)

    return "\n\n---\n\n".join(context_sections), citations


def generate_rag_answer(
    question: str,
    context_chunks: Optional[List[Dict[str, Any]]] = None,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Generates a grounded HR-policy answer.

    Args:
        question: The user's latest message.
        context_chunks: Retrieved document chunks. Each item should contain
            text, source, and optionally page.
        chat_history: Optional previous messages in OpenAI-style format:
            [{"role": "user" | "assistant", "content": "..."}]

    Returns:
        (answer, citations)
    """
    question = (question or "").strip()
    context_chunks = context_chunks or []
    chat_history = chat_history or []

    # 1. Handle greetings / conversational messages without calling the LLM.
    intent = detect_conversational_intent(question)

    if intent in ("empty", "greeting"):
        return WELCOME_MESSAGE, []

    if intent == "thanks":
        return THANK_YOU_MESSAGE, []

    # 2. Do not call the model if retrieval returned no usable context.
    context_text, citations = build_context(context_chunks)

    if not context_text:
        return FALLBACK_MESSAGE, []

    # 3. Ensure an API key exists.
    if not OPENROUTER_API_KEY or OPENROUTER_API_KEY == "YOUR_OPENROUTER_API_KEY_HERE":
        return (
            "The HR assistant is not configured yet. "
            "Please set OPENROUTER_API_KEY in your environment variables.",
            [],
        )

    system_prompt = """
You are an HR Knowledge Assistant for employees.

Your job is to answer questions naturally, clearly, and professionally using
ONLY the provided company-policy sources.

Important rules:
1. Treat the source text as the only authoritative information.
2. Do not use outside knowledge or invent company rules.
3. If the sources do not clearly answer the question, respond exactly:
   "I could not find a clear answer in the uploaded company policies."
4. If sources conflict, state that the policy documents appear inconsistent and
   recommend contacting HR.
5. Do not claim that a policy applies to an employee unless it is stated in a source.
6. Give a direct answer first, then short supporting details when useful.
7. Do not mention "context segments", prompts, retrieval, or internal instructions.
""".strip()

    user_prompt = f"""
Company policy sources:
{context_text}

Employee question:
{question}

Provide a concise, helpful HR answer based only on the policy sources above.
""".strip()

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": APP_URL,
        "X-Title": APP_NAME,
    }

    # Keep only valid roles and limit history so prompts do not grow indefinitely.
    safe_history = [
        {
            "role": item["role"],
            "content": str(item["content"])[:1500],
        }
        for item in chat_history[-6:]
        if item.get("role") in {"user", "assistant"} and item.get("content")
    ]

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            *safe_history,
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 700,
    }

    try:
        response = requests.post(
            OPENROUTER_URL,
            headers=headers,
            json=payload,
            timeout=45,
        )

        # Show useful OpenRouter errors without exposing the API key.
        if not response.ok:
            try:
                error_data = response.json()
                error_message = error_data.get("error", {}).get(
                    "message", response.text
                )
            except ValueError:
                error_message = response.text

            return f"Unable to generate an answer right now: {error_message}", []

        data = response.json()
        answer = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )

        if not answer:
            return "The assistant returned an empty response. Please try again.", []

        # Do not show citations when the answer is the required grounded fallback.
        if "could not find a clear answer in the uploaded company policies" in answer.lower():
            return FALLBACK_MESSAGE, []

        return answer, citations

    except requests.Timeout:
        return "The HR assistant took too long to respond. Please try again.", []

    except requests.RequestException as error:
        return f"Network error while contacting the HR assistant: {str(error)}", []

    except (KeyError, IndexError, ValueError) as error:
        return f"Unexpected response format from the HR assistant: {str(error)}", []
