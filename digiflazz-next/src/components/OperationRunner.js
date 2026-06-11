"use client";

import { useEffect, useRef } from "react";
import { Play, Loader2, Terminal, Square, Trash } from "lucide-react";
import { useRunner } from "@/components/RunnerContext";

const LEVEL_STYLE = {
  ok: "text-emerald-400",
  info: "text-sky-300",
  warn: "text-amber-300",
  error: "text-red-400",
};

export default function OperationRunner({ action, title, description, children, getPayload }) {
  const { logs, running, summary, run, stop, clear } = useRunner(action);
  const consoleRef = useRef(null);
  const autoScroll = useRef(true);

  // auto-scroll to bottom when new logs arrive (unless user scrolled up)
  useEffect(() => {
    if (autoScroll.current && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  function onScroll() {
    const el = consoleRef.current;
    if (!el) return;
    autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  function handleRun() {
    const payload = getPayload ? getPayload() : {};
    autoScroll.current = true;
    run(payload);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-900 dark:text-slate-100">{title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card space-y-4">
          {children}
          <div className="flex gap-2">
            <button onClick={handleRun} className="btn-primary flex-1" disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? "Sedang berjalan" : "Jalankan"}
            </button>
            {running && (
              <button onClick={stop} className="btn-danger" title="Hentikan">
                <Square className="h-4 w-4" /> Stop
              </button>
            )}
          </div>
        </div>

        <div className="card flex flex-col">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <Terminal className="h-4 w-4" /> Log Proses
            {running && (
              <span className="flex items-center gap-1 text-xs font-normal text-emerald-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> berjalan
              </span>
            )}
            {logs.length > 0 && !running && (
              <button
                onClick={clear}
                className="ml-auto flex items-center gap-1 text-xs font-normal text-slate-400 hover:text-red-500"
                title="Bersihkan log"
              >
                <Trash className="h-3.5 w-3.5" /> Bersihkan
              </button>
            )}
          </div>
          <div
            ref={consoleRef}
            onScroll={onScroll}
            className="h-80 overflow-y-auto rounded-lg bg-brand-950 p-3 font-mono text-xs leading-relaxed"
          >
            {logs.length === 0 ? (
              <p className="text-slate-500">Belum ada log. Klik Jalankan untuk memulai.</p>
            ) : (
              logs.map((l, i) => (
                <div key={i} className={LEVEL_STYLE[l.level] || "text-slate-300"}>
                  {l.msg}
                </div>
              ))
            )}
          </div>
          {summary ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              {Object.entries(summary).map(([k, v]) => (
                <span key={k} className="mr-4">
                  <strong>{k}:</strong> {String(v)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
