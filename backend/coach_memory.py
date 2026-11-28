"""Account-scoped notes for the consultant."""

import re

MEMORY_LIMITS = (2400, 4800, 9600)
DEFAULT_MEMORY_LIMIT = MEMORY_LIMITS[0]


def memory_state(store: dict) -> dict:
    return {"markdown": "", "revision": 0, "limit_chars": DEFAULT_MEMORY_LIMIT,
            **(store.get("coach_memory") or {})}


def wants_memory_update(question: str) -> bool:
    return bool(re.search(
        r"\b(?:запомни|запиши|сохрани.{0,40}(?:правил|предпочтен|заметк|ошибк)"
        r"|добавь.{0,40}(?:правил|предпочтен|заметк|ошибк))",
        question, re.IGNORECASE,
    ))


def wants_memory_display(question: str) -> bool:
    return bool(re.search(
        r"\b(?:покажи|выведи|прочитай)\b.{0,60}(?:\bмд\b|\bmarkdown\b|памят[ьи]|заметк|правила общения|предпочтен)",
        question, re.IGNORECASE,
    ))


def memory_proposal(store: dict, category: str, note: str) -> dict:
    note = " ".join(note.split())
    if not note or len(note) > 300:
        return {"error": "Запиши одну короткую заметку до 300 символов."}
    current = memory_state(store)
    label = {"preference": "Предпочтение", "rule": "Правило общения", "mistake": "Ошибка и урок"}[category]
    line = f"- **{label}.** {note}"
    markdown = current["markdown"].strip()
    if line in markdown.splitlines():
        return {"error": "Такая заметка уже есть."}
    updated = f"{markdown}\n\n{line}" if markdown else f"# Память консультанта\n\n{line}"
    if len(updated) > current["limit_chars"]:
        return {"error": "Память заполнена. Сократи текст или увеличь лимит в настройках."}
    return {"markdown": updated, "revision": current["revision"], "note": line}
