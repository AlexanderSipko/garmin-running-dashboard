"""Compatibility aliases for saved consultant model selections."""

DEFAULT_OPENAI_PRESET = "openai-light"
DEFAULT_GIGACHAT_PRESET = "gigachat-max"


def normalize_coach_preset(preset: str) -> str:
    if preset in {"openai", "openai-astra"}:
        return DEFAULT_OPENAI_PRESET
    if preset in {"gigachat", "gigachat-lite", "gigachat-pro"}:
        return DEFAULT_GIGACHAT_PRESET
    return preset
