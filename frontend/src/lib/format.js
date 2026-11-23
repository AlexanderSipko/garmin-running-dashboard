const fmtDate = (value, options = { day: "numeric", month: "short" }) =>
  value ? new Date(value).toLocaleDateString("ru-RU", options) : "—";
const fmtPace = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
};
const fmtDuration = (seconds) => {
  const n = Math.round(seconds / 60);
  return n >= 60 ? `${Math.floor(n / 60)} ч ${n % 60} мин` : `${n} мин`;
};

export { fmtDate, fmtPace, fmtDuration };
