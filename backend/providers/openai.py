"""OpenAI Responses adapter for the consultant's existing tool interface."""

import json
from time import monotonic

import httpx

from coach_usage import TokenUsage


class OpenAIError(RuntimeError):
    def __init__(self, status_code=None):
        super().__init__("OpenAI request failed")
        self.status_code = status_code


class OpenAIClient:
    model = "gpt-6.2-sol"

    def __init__(self, key: str):
        self.key = key
        self.usage = TokenUsage()
        self.configured = bool(key)

    def _request(self, client, method, path, **kwargs):
        try:
            response = client.request(method, f"https://api.openai.com/v1/{path}", **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            raise OpenAIError(exc.response.status_code) from None
        except (httpx.HTTPError, ValueError):
            raise OpenAIError() from None

    def check_credentials(self):
        with httpx.Client(headers={"Authorization": f"Bearer {self.key}"}, timeout=10) as client:
            self._request(client, "GET", f"models/{self.model}")

    def complete(self, messages, max_tokens, temperature):
        return self.complete_with_tools(messages, max_tokens, temperature, None)

    def complete_with_tools(self, messages, max_tokens, temperature, tools):
        functions = tools.discover() if tools else []
        allowed = {tool["name"] for tool in functions}
        items = list(messages)
        deadline = monotonic() + 49
        finishing = False
        with httpx.Client(headers={"Authorization": f"Bearer {self.key}"}) as client:
            for turn in range(4):
                remaining = deadline - monotonic()
                if remaining <= 0:
                    raise OpenAIError()
                body = {
                    "model": self.model, "reasoning": {"effort": "medium"},
                    "input": items, "store": False, "include": ["reasoning.encrypted_content"],
                    "max_output_tokens": max(4096, max_tokens * 8) if finishing else max(3072, max_tokens * 6),
                }
                if functions and turn < 3 and not finishing:
                    body["tools"] = [{"type": "function", **tool, "strict": False} for tool in functions]
                    body["parallel_tool_calls"] = False
                result = self._request(client, "POST", "responses", json=body, timeout=min(remaining, 45))
                output = result.get("output") or []
                self.usage.record(result.get("usage") or {}, input_key="input_tokens", output_key="output_tokens")
                calls = [item for item in output if item.get("type") == "function_call"]
                if not calls:
                    answer = "\n".join(
                        part["text"] for item in output if item.get("type") == "message"
                        for part in item.get("content", []) if part.get("type") == "output_text"
                    )
                    incomplete = result.get("status") == "incomplete"
                    if (incomplete or not any(char.isalpha() for char in answer)) and not finishing and turn < 3 and deadline - monotonic() >= 10:
                        finishing = True
                        items.append({"role": "user", "content": "Заверши ответ коротким связным текстом на русском. Используй уже полученные данные и явно отметь пробелы."})
                        continue
                    finish_reason = "length" if incomplete else "stop"
                    return {"choices": [{"message": {"content": answer}, "finish_reason": finish_reason}]}
                items.extend(output)
                for call in calls:
                    value = {"error": "Инструмент недоступен."}
                    if call.get("name") in allowed:
                        try:
                            arguments = json.loads(call["arguments"])
                            if isinstance(arguments, dict):
                                value = tools.call(call["name"], arguments)
                        except Exception:
                            pass
                    items.append({"type": "function_call_output", "call_id": call["call_id"],
                                  "output": json.dumps(value, ensure_ascii=False)})
        raise OpenAIError()
