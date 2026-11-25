"""Normalize reported provider usage and keep daily totals per account."""

from dataclasses import asdict, dataclass


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0

    def record(self, raw: dict, *, input_key: str, output_key: str) -> None:
        incoming = raw.get(input_key) or 0
        outgoing = raw.get(output_key) or 0
        self.input_tokens += incoming
        self.output_tokens += outgoing
        self.total_tokens += raw.get("total_tokens") or incoming + outgoing

    def as_dict(self) -> dict[str, int]:
        return asdict(self)


def record_daily_usage(store: dict, day: str, usage: dict[str, int]) -> None:
    days = store.get("coach_usage_by_day", {})
    total = TokenUsage(**days.get(day, {}))
    total.record(usage, input_key="input_tokens", output_key="output_tokens")
    days[day] = total.as_dict()
    store["coach_usage_by_day"] = {key: days[key] for key in sorted(days)[-35:]}
