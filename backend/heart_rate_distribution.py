"""Group recorded seconds by heart rate and apply the runner's current zones."""

from collections import Counter


def seconds_by_bpm(points, *, max_gap=15):
    seconds = Counter()
    for previous, current in zip(points, points[1:]):
        bpm = previous.get("heart_rate_bpm")
        start, end = previous.get("elapsed_seconds"), current.get("elapsed_seconds")
        if not bpm or not current.get("heart_rate_bpm") or start is None or end is None:
            continue
        duration = end - start
        if 0 < duration <= max_gap:
            seconds[str(bpm)] += duration
    return dict(seconds)


def running_zone_times(detail, zones):
    if not detail or not zones:
        return None
    histogram = detail.get("heart_rate_seconds_by_bpm")
    source = "fit_samples"
    if histogram is None:
        histogram = seconds_by_bpm(detail.get("points") or [])
        source = "sampled_fit_estimate"
    if not histogram:
        return None
    times = {zone: 0 for zone in zones}
    for bpm, seconds in histogram.items():
        for zone, bounds in zones.items():
            if int(bpm) >= bounds["min_inclusive"] and (
                bounds["max_inclusive"] is None or int(bpm) <= bounds["max_inclusive"]
            ):
                times[zone] += seconds
                break
    recorded = sum(histogram.values())
    return {"source": source, "seconds_by_zone": times,
            "covered_seconds": recorded, "outside_zone_seconds": recorded - sum(times.values())}
