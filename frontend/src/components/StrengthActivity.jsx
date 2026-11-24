import { Dumbbell } from "lucide-react";
import { fmtDuration } from "../lib/format";
import RefreshActivityButton from "./RefreshActivityButton";

export default function StrengthActivity({ activity, onActivityUpdated }) {
  const duration = Number(activity.moving_duration_seconds || activity.duration_seconds || 0);
  const description = activity.description?.trim();

  return (
    <article className="grid gap-3 rounded-xl border border-[#415157] bg-[#1b272e] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs text-[#b7c4ff]">
            <Dumbbell size={15} aria-hidden="true" />
            Силовая{duration > 0 && ` · ${fmtDuration(duration)}`}
          </p>
          <h4 className="mt-1 break-words text-base font-semibold">{activity.name || "Силовая тренировка"}</h4>
        </div>
        <RefreshActivityButton activityId={activity.id} strength onActivityUpdated={onActivityUpdated} />
      </div>
      {description && (
        <div className="grid gap-1 border-t border-[#415157] pt-2">
          <h5 className="text-xs font-semibold text-slate-400">Описание из Garmin</h5>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{description}</p>
        </div>
      )}
    </article>
  );
}
