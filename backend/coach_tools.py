"""Private, read-only Garmin tools exposed to the consultant over MCP."""

import asyncio
import json
from datetime import date, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal

from mcp.server.fastmcp import FastMCP
from mcp.shared.memory import create_connected_server_and_client_session

from activity_metrics import activity_pace, pace_label
from dashboard_data import parse_date
from garmin_api import get_running_activity_splits, get_wellness_series
from readiness import recovery_indicators


class GarminCoachTools:
    """One instance per request, scoped to the authenticated account."""

    def __init__(self, store, read_detail, garmin_key):
        self.server = FastMCP("Garmin consultant tools")

        @self.server.tool()
        def get_garmin_recovery(day: date) -> dict:
            """Read saved sleep, resting HR, 7-day average HRV and recorded running volume. No Garmin readiness score."""
            return recovery_indicators(store, day)

        @self.server.tool()
        def get_garmin_period(start_date: date, end_date: date) -> dict:
            """Return up to 31 days of saved Garmin workouts, sleep, HRV and resting HR by date."""
            if not 0 <= (end_date - start_date).days <= 30:
                return {"error": "Укажи период от 1 до 31 дня."}

            metrics = store.get("wellness_metrics", {})
            labels = {"sleep": "sleep_hours", "hrv": "night_hrv_ms", "resting_hr": "resting_bpm"}
            days = {}
            for key, label in labels.items():
                for point in metrics.get(key, []):
                    day = parse_date(point.get("date"))
                    if day is not None and start_date <= day <= end_date and point.get("value") is not None:
                        days.setdefault(day.isoformat(), {})[label] = point["value"]

            for activity in store.get("activities", []):
                day = parse_date(activity.get("start_time"))
                if day is None or not start_date <= day <= end_date:
                    continue
                workouts = days.setdefault(day.isoformat(), {}).setdefault("workouts", [])
                if len(workouts) >= 5:
                    continue
                workouts.append({
                    "id": activity.get("id"),
                    "name": str(activity.get("name") or "")[:70],
                    "type": activity.get("type"),
                    "km": round(float(activity.get("distance_meters") or 0) / 1000, 2),
                    "pace": activity_pace(activity),
                    "avg_bpm": activity.get("avg_hr_bpm"),
                })

            return {
                "source": "saved_garmin_data",
                "range": [start_date.isoformat(), end_date.isoformat()],
                "last_sync_at": store.get("synced_at"),
                "days": [{"date": key, **days[key]} for key in sorted(days)],
            }

        @self.server.tool()
        def get_garmin_activity(activity_id: str) -> dict:
            """Look up a known account activity and its splits. Fetch splits from Garmin only if no saved detail exists."""
            activity = next((
                row for row in store.get("activities", []) if str(row.get("id")) == activity_id
            ), None)
            if activity is None:
                return {"error": "ID тренировки отсутствует в загруженной истории аккаунта."}

            saved = read_detail(activity_id)
            if saved is not None:
                splits = saved.get("splits") or []
                source = "database"
            else:
                key = garmin_key()
                if not key:
                    splits = []
                    source = "summary_only"
                else:
                    try:
                        with TemporaryDirectory(prefix="coach-garmin-") as directory:
                            splits = get_running_activity_splits(
                                activity_id, key=key, cache_path=Path(directory) / "token.json",
                                timeout=8,
                            )
                        source = "garmin"
                    except Exception:
                        splits = []
                        source = "garmin_unavailable"

            return {
                "source": source,
                "name": str(activity.get("name") or "")[:100],
                "date": str(activity.get("start_time") or "")[:10],
                "notes": str(activity.get("description") or "")[:300],
                "pace": activity_pace(activity),
                "split_count": len(splits),
                "first_splits": [
                    {"km": row.get("distance_km"), "pace": label, "avg_bpm": row.get("avg_hr_bpm")}
                    for row in splits[:12]
                    for label in [pace_label(row.get("pace_seconds_per_km"))]
                ],
            }

        @self.server.tool()
        def get_garmin_wellness(
            metric: Literal["sleep", "hrv", "resting_hr"], start_date: date, end_date: date,
        ) -> dict:
            """Look up one wellness metric for up to seven days. Read Garmin if the date window is missing locally."""
            if not 0 <= (end_date - start_date).days <= 6:
                return {"error": "Для отдельной метрики можно запросить до семи дней."}
            saved = [
                row for row in store.get("wellness_metrics", {}).get(metric, [])
                if (day := parse_date(row.get("date"))) is not None
                and start_date <= day <= end_date and row.get("value") is not None
            ]
            result = {"metric": metric, "range": [start_date.isoformat(), end_date.isoformat()]}
            if saved:
                return {**result, "source": "database", "measurements": saved}
            key = garmin_key()
            if not key:
                return {**result, "source": "not_connected", "measurements": []}
            try:
                with TemporaryDirectory(prefix="coach-garmin-") as directory:
                    measurements = get_wellness_series(
                        metric, start_date, end_date, key=key, cache_path=Path(directory) / "token.json",
                    )
                return {**result, "source": "garmin", "measurements": measurements}
            except Exception:
                return {**result, "source": "garmin_unavailable", "measurements": []}

    def discover(self) -> list[dict]:
        async def list_tools():
            async with create_connected_server_and_client_session(self.server) as session:
                result = await session.list_tools()
                return [
                    {"name": tool.name, "description": tool.description, "parameters": tool.inputSchema}
                    for tool in result.tools
                ]

        return asyncio.run(list_tools())

    def call(self, name: str, arguments: dict) -> dict:
        async def call_tool():
            async with create_connected_server_and_client_session(
                self.server, read_timeout_seconds=timedelta(seconds=18)
            ) as session:
                result = await session.call_tool(name, arguments)
                if not result.isError:
                    if result.structuredContent is not None:
                        return result.structuredContent
                    # Some MCP SDK versions serialize a plain dict as a JSON text block.
                    if len(result.content) == 1 and result.content[0].type == "text":
                        try:
                            payload = json.loads(result.content[0].text)
                        except ValueError:
                            payload = None
                        if isinstance(payload, dict):
                            return payload
                return {"error": "Не удалось получить данные инструмента."}

        return asyncio.run(call_tool())
