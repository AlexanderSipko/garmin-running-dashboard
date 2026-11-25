import { useEffect, useState } from "react";
import { Database } from "lucide-react";

const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export default function AdminDatabaseSize({ request }) {
  const [size, setSize] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    request("/admin/database-size", { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setSize(result); })
      .catch(() => { if (!controller.signal.aborted) setUnavailable(true); });
    return () => controller.abort();
  }, [request]);

  return (
    <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-[#1b262c] px-3 py-2 text-sm">
      <h3 className="flex items-center gap-2 font-semibold"><Database size={16} aria-hidden="true" /> Размер базы данных</h3>
      <span role="status" className="text-slate-300">
        {size ? <><b className="tabular-nums text-[#ffc988]">{number.format(size.bytes / 1_000_000)} МБ</b> · {size.engine}</>
          : unavailable ? "Не удалось получить размер" : "Загружаю…"}
      </span>
    </section>
  );
}
