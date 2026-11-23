"""Answer schedule requests from the confirmed plan stored by the dashboard."""

import re
from datetime import date, timedelta

from training_week import move_week_session, week_context

FOLLOW_PLAN = re.compile(
    r"(?:ну |ок |хорошо )?(?:что )?(?:давай(?:те)? |ид[её]м |действуем |бежим )?"
    r"(?:дальше )?(?:что |как )?по (?:плану|палну)(?: дальше)?"
)
SHOW_PLAN = re.compile(
    r"(?:план(?: недели| на неделю)?|(?:какой|покажи|напомни) (?:у меня |мне )?план(?: на неделю| недели)?)"
)
BUILD_PLAN = re.compile(
    r"(?:ну )?(?:давай(?:те)? )?(?:состав\w*|сдела\w*|предлож\w*|сформиру\w*|постро\w*) "
    r"(?:мне )?(?:новый |тренировочный )?план(?: тренировок| на неделю| недели)?"
)
TRAINING_TABLE = re.compile(r"(?im)^\s*\|[^\n]*день[^\n]*\|[^\n]*трениров")
MOVE_REQUEST = re.compile(
    r"\b(?:перенеси(?:те)?|перенести|перенес[её]м|сдвинь(?:те)?|сдвинуть)\b"
)
MOVE_DATES = re.compile(r"\b(?:с|со)\s+(.+?)\s+на\s+([^,;!?]+)")
SESSION_LABELS = {
    "easy": "лёгкий бег", "long": "длительный бег", "quality": "интенсивная тренировка",
    "race": "забег", "strength": "силовая тренировка",
}
WEEKDAYS = ("пн", "вт", "ср", "чт", "пт", "сб", "вс")
WEEKDAY_FORMS = (
    ("понедельник", "понедельника"), ("вторник", "вторника"), ("среда", "среды", "среду"),
    ("четверг", "четверга"), ("пятница", "пятницы", "пятницу"),
    ("суббота", "субботы", "субботу"), ("воскресенье", "воскресенья"),
)


def is_plan_request(question: str) -> bool:
    words = " ".join(re.findall(r"[а-яё]+", question.casefold()))
    return any(pattern.fullmatch(words) for pattern in (FOLLOW_PLAN, SHOW_PLAN, BUILD_PLAN))


def plan_date(label: str, dates: list[date], today: date) -> date | None:
    value = label.strip(" .()")
    relative = {"сегодня": 0, "завтра": 1, "послезавтра": 2}
    if value in relative:
        return today + timedelta(days=relative[value])
    short = re.fullmatch(r"(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?", value)
    for day in dates:
        weekday = day.weekday()
        if value in (*WEEKDAY_FORMS[weekday], WEEKDAYS[weekday], day.isoformat()):
            return day
        if short:
            day_number, month, year = short.groups()
            if (day.day, day.month, day.year) == (int(day_number), int(month), int(year or day.year)):
                return day
    return None


def plan_move_reply(question: str, plan: dict | None, activities: list[dict], today: date) -> dict | None:
    question = question.casefold()
    if not MOVE_REQUEST.search(question) or not (
        re.search(r"\b(?:трениров\w*|пробеж\w*|бег\w*|заняти\w*|длительн\w*)", question)
        or MOVE_DATES.search(question)
    ):
        return None
    if not plan or plan["sessions"][-1]["date"] < today.isoformat():
        return {"answer": "Сначала подтверди план недели. После этого можно будет переносить занятия."}

    dates = [date.fromisoformat(session["date"]) for session in plan["sessions"]]
    match = MOVE_DATES.search(question)
    from_day, to_day = (
        plan_date(label.removesuffix(" пожалуйста"), dates, today)
        for label in match.groups()
    ) if match else (None, None)
    move = {}
    if from_day and to_day:
        try:
            move_week_session(plan, activities, today, from_day, to_day)
        except ValueError as error:
            return {"answer": str(error), "training_move": move}
        move = {
            "from_date": from_day.isoformat(), "to_date": to_day.isoformat(),
            "plan_id": plan["id"], "revision": plan.get("revision", 0),
        }
        answer = f"Предлагаю перенос с {from_day:%d.%m} на {to_day:%d.%m}. Подтверди его в блоке «План недели»."
    else:
        answer = "Укажи оба дня в «Плане недели» или напиши, например, «перенеси тренировку со среды на четверг»."
    return {"answer": answer, "training_move": move}


def confirmed_plan_reply(plan: dict | None, activities: list[dict], today: date) -> str:
    week = week_context(plan, activities, today)
    if not week or week["expired"]:
        return "Сейчас нет действующего плана. Открой «План недели», проверь доступные дни и подтверди черновик."

    start, end = (date.fromisoformat(day) for day in week["range"])
    lines = [f"Идём по подтверждённому плану на {start:%d.%m}–{end:%d.%m}."]
    today_session = next((day for day in week["days"] if day["date"] == today.isoformat()), None)
    recorded_today = any(str(row.get("start_time") or "")[:10] == today.isoformat() for row in activities)
    next_session = week["next_session"]

    if today_session and today_session["status"] == "matched":
        lines.append("Сегодня Garmin уже записал занятие нужного типа.")
    elif today_session and today_session["kind"] == "rest":
        lines.append("Сегодня по плану отдых от бега.")
    elif recorded_today:
        lines.append("За сегодня уже есть активность в Garmin. Второе занятие автоматически не добавляю.")
        if next_session and next_session["date"] == today.isoformat():
            next_session = next((
                day for day in week["days"]
                if day["kind"] != "rest" and day["date"] > today.isoformat()
            ), None)

    first_future_day = next((day for day in week["days"] if day["date"] > today.isoformat()), None)
    if first_future_day and first_future_day["kind"] == "rest" and not (
        today_session and today_session["kind"] == "rest"
    ):
        rest_day = date.fromisoformat(first_future_day["date"])
        lines.append(f"{rest_day:%d.%m} — отдых от бега.")

    if next_session:
        day = date.fromisoformat(next_session["date"])
        label = SESSION_LABELS.get(next_session["kind"], "занятие")
        distance = next_session.get("distance_km")
        km = f", {distance:g} км".replace(".", ",") if distance else ""
        lines.append(f"Ближайшее занятие: {WEEKDAYS[day.weekday()]} {day:%d.%m}, {label}{km}.")
    else:
        lines.append("Следующих занятий в этом плане пока нет.")
    if week["lighter"] or week["marked_deload"]:
        lines.append("В плане учтена разгрузка.")
    return " ".join(lines)
