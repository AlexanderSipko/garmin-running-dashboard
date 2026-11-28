"""Private, read-only Garmin tools exposed to the consultant over MCP."""

import asyncio
from coach_memory import memory_proposal
from running_power import power_zone_bounds, power_zone_durations, running_power_for_period
from copy import deepcopy
import json
from datetime import date, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal

from mcp.server.fastmcp import FastMCP
from mcp.shared.memory import create_connected_server_and_client_session

from activity_metrics import activity_pace, pace_label
from dashboard_data import parse_date
from garmin_api import get_running_activity_detail, get_running_activity_splits, get_wellness_series
from readiness import recovery_indicators
from activity_metrics import activity_kind
from heart_rate_distribution import running_zone_times
from runner_plan import plan_context
from weekly_heart_rate import weekly_running_zones
from training_week import WeekPreferences, build_week_draft, change_week_distance, save_calendar_session


class GarminCoachTools:
    """One instance per request, scoped to the authenticated account."""

    def __init__(self, store, read_detail, garmin_key, read_details):
        self.session_proposal = None
        self.week_proposal = None
        self.memory_proposal = None
        self.allow_memory = False
        self.review_only = False
        self.server = FastMCP("Garmin consultant tools")

        @self.server.tool()
        def propose_memory_note(category: Literal["preference", "rule", "mistake"], note: str) -> dict:
            """Propose one durable note explicitly requested by the runner. For a mistake, include how to avoid it. The runner confirms saving."""
            if self.review_only or not self.allow_memory:
                return {"error": "Запись памяти доступна по явной просьбе в чате."}
            proposal = memory_proposal(store, category, note)
            if "error" in proposal:
                return proposal
            self.memory_proposal = proposal
            return {"note": proposal["note"], "saved": False}

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
            """Read activity splits and saved running power and zone times. Fetch splits if no saved detail exists."""
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

            zones = plan_context(store.get("runner_plan"), date.today()).get("running_heart_rate_zones_bpm")
            power = (saved or {}).get("running_power") or activity.get("running_power")
            power_zones = power_zone_bounds(store.get("runner_plan")) if activity_kind(activity) == "run" else []
            power_histogram = (saved or {}).get("running_power_seconds_by_watt")
            power_times = power_zone_durations(power_histogram, power_zones) if power_histogram and power_zones else None
            return {
                "heart_rate_zone_times": running_zone_times(saved, zones) if activity_kind(activity) == "run" else None,
                **({"running_power": power} if power else {}),
                **({"power_zone_times": {**power_times, "source": "fit_samples",
                                         "bounds_watts": power_zones}} if power_times else {}),
                "average_heart_rate_bpm": activity.get("avg_hr_bpm"),
                "max_heart_rate_bpm": activity.get("max_hr_bpm"),
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
        def get_weekly_running_zones(week_start: date, compare_previous: bool = False) -> dict:
            """Get running heart-rate zone totals and coverage for a Monday-start week, optionally comparing the previous week. Uses saved data only."""
            if week_start.weekday() != 0:
                return {"error": "Укажи понедельник нужной недели."}

            def summarize(start: date) -> dict:
                result = weekly_running_zones(store, start, read_details)
                result.pop("missing_activity_ids", None)
                covered = result.get("covered_seconds", 0)
                if covered:
                    result["zone_percent"] = {
                        zone: round(seconds * 100 / covered, 1)
                        for zone, seconds in result["seconds_by_zone"].items()
                    }
                return result

            result = {"week": summarize(week_start)}
            if compare_previous and (week_start - date.min).days >= 7:
                result["previous_week"] = summarize(week_start - timedelta(days=7))
            return result

        @self.server.tool()
        def get_weekly_running_power(week_start: date, compare_previous: bool = False) -> dict:
            """Get time in running power zones and coverage for a Monday-start week. Uses saved FIT only."""
            if week_start.weekday() != 0:
                return {"error": "Укажи понедельник нужной недели."}
            today = date.today()
            if week_start > today:
                return {"error": "За будущую неделю нет фактических данных."}
            bounds = power_zone_bounds(store.get("runner_plan"))
            if not bounds:
                return {"error": "Зоны мощности для бега не заполнены в настройках."}
            end = min(week_start + timedelta(days=6), today)

            def summarize(start: date, end: date) -> dict:
                result = running_power_for_period(store, start, end, read_details)
                result.pop("missing_activity_ids", None)
                return {"from": start.isoformat(), "to": end.isoformat(), **result}

            result = {"week": summarize(week_start, end), "bounds_watts": bounds, "source": "fit_samples"}
            if compare_previous and (week_start - date.min).days >= 7:
                offset = timedelta(days=7)
                result["previous_week"] = summarize(week_start - offset, end - offset)
            return result

        @self.server.tool()
        def get_running_zone_times(activity_id: str) -> dict:
            """Read time in personal running heart-rate zones. Fetch original Garmin FIT if detailed data is missing."""
            activity = next((row for row in store.get("activities", []) if str(row.get("id")) == activity_id), None)
            if not activity or activity_kind(activity) != "run":
                return {"error": "Пробежка отсутствует в истории аккаунта."}
            zones = plan_context(store.get("runner_plan"), date.today()).get("running_heart_rate_zones_bpm")
            if not zones:
                return {"error": "Пульсовые зоны для бега не заполнены."}
            saved = read_detail(activity_id)
            estimated = running_zone_times(saved, zones)
            if estimated and estimated["source"] == "fit_samples":
                return estimated
            key = garmin_key()
            if key:
                try:
                    with TemporaryDirectory(prefix="coach-garmin-") as directory:
                        detail = get_running_activity_detail(activity_id, key=key, cache_path=Path(directory) / "token.json")
                    exact = running_zone_times(detail, zones)
                    if exact:
                        return exact
                except Exception:
                    pass
            return estimated or {"error": "Garmin не предоставил точки пульса для расчёта."}

        @self.server.tool()
        def propose_running_week(preferences: WeekPreferences) -> dict:
            """Preview seven days from recent running load. An active plan can be extended immediately, starting after its last date."""
            today = date.today()
            active = store.get("training_week_active")
            last_day = date.fromisoformat(active["sessions"][-1]["date"]) if active else None
            try:
                draft = build_week_draft(
                    store.get("activities", []), store.get("runner_plan") or {}, today, preferences,
                    store.get("deload_weeks", {}),
                    earliest_start=last_day + timedelta(days=1) if last_day else None,
                )
            except ValueError as error:
                return {"error": str(error)}
            self.week_proposal = preferences.model_dump(mode="json")
            return {"sessions": draft["sessions"], "saved": False}

        @self.server.tool()
        def propose_running_session(
            day: date, kind: Literal["easy", "recovery", "long", "tempo", "intervals", "quality"], distance_km: float, instruction: str,
        ) -> dict:
            """Preview one future run or change to the app calendar. Save requires user confirmation in the app."""
            today = date.today()
            if not today <= day <= today + timedelta(days=30):
                return {"error": "Выбери дату в пределах следующих 30 дней."}
            key = day.isoformat()
            active = store.get("training_week_active")
            session = next((row for row in (active or {}).get("sessions", []) if row["date"] == key), None)
            proposal = {"session_date": key, "kind": kind, "distance_km": distance_km, "instruction": instruction.strip()}
            try:
                if active and session and session["kind"] != "rest":
                    change_week_distance(active, store.get("activities", []), today, day, distance_km,
                                         kind=kind, instruction=instruction)
                    proposal.update(plan_id=active["id"], revision=active.get("revision", 0))
                else:
                    current = store.get("calendar_training_sessions", {}).get(key)
                    revision = current["revision"] if current else None
                    mock = {field: deepcopy(store[field]) for field in ("training_week_active", "calendar_training_sessions") if field in store}
                    mock["activities"] = store.get("activities", [])
                    save_calendar_session(mock, today, day, kind, distance_km, instruction, revision)
                    proposal["revision"] = revision
                    if active and session:
                        proposal["expected_week_id"] = active["id"]
                        proposal["expected_week_revision"] = active.get("revision", 0)
            except ValueError as error:
                return {"error": str(error)}
            self.session_proposal = proposal
            return {"proposal": proposal, "saved": False}

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
                    if not self.review_only or tool.name in {"get_garmin_activity", "get_running_zone_times", "get_garmin_wellness"}
                    if self.allow_memory or tool.name != "propose_memory_note"
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
