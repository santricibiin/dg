"use client";

import { createContext, useContext, useRef, useState, useCallback } from "react";

const RunnerContext = createContext(null);

const MAX_LOGS = 2000;

function emptyState() {
  return { logs: [], running: false, summary: null, startedAt: null, finishedAt: null };
}

export function RunnerProvider({ children }) {
  // map: action -> { logs, running, summary, startedAt, finishedAt }
  const [byAction, setByAction] = useState({});
  // keep abort controllers per action so we can stop
  const controllers = useRef({});

  const getState = useCallback(
    (action) => byAction[action] || emptyState(),
    [byAction]
  );

  const patch = useCallback((action, updater) => {
    setByAction((prev) => {
      const cur = prev[action] || emptyState();
      const next = typeof updater === "function" ? updater(cur) : updater;
      return { ...prev, [action]: { ...cur, ...next } };
    });
  }, []);

  const pushLog = useCallback((action, entry) => {
    setByAction((prev) => {
      const cur = prev[action] || emptyState();
      const logs = cur.logs.length >= MAX_LOGS
        ? [...cur.logs.slice(-MAX_LOGS + 1), entry]
        : [...cur.logs, entry];
      return { ...prev, [action]: { ...cur, logs } };
    });
  }, []);

  const clear = useCallback((action) => {
    setByAction((prev) => ({ ...prev, [action]: emptyState() }));
  }, []);

  const stop = useCallback((action) => {
    const c = controllers.current[action];
    if (c) c.abort();
  }, []);

  const run = useCallback(
    async (action, payload) => {
      // prevent double-run
      const existing = byAction[action];
      if (existing && existing.running) return;

      const controller = new AbortController();
      controllers.current[action] = controller;

      patch(action, {
        logs: [],
        summary: null,
        running: true,
        startedAt: Date.now(),
        finishedAt: null,
      });

      try {
        const res = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
          signal: controller.signal,
        });

        if (!res.ok && !res.body) {
          const data = await res.json().catch(() => ({}));
          pushLog(action, { level: "error", msg: data.error || "Permintaan gagal." });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const entry = JSON.parse(line);
              if (entry.type === "summary") patch(action, { summary: entry.data });
              else pushLog(action, entry);
            } catch {
              /* ignore malformed line */
            }
          }
        }
      } catch (e) {
        if (e.name === "AbortError") {
          pushLog(action, { level: "warn", msg: "Dihentikan oleh pengguna." });
        } else {
          pushLog(action, { level: "error", msg: `Kesalahan jaringan: ${e.message}` });
        }
      } finally {
        delete controllers.current[action];
        patch(action, { running: false, finishedAt: Date.now() });
      }
    },
    [byAction, patch, pushLog]
  );

  return (
    <RunnerContext.Provider value={{ getState, run, stop, clear }}>
      {children}
    </RunnerContext.Provider>
  );
}

export function useRunner(action) {
  const ctx = useContext(RunnerContext);
  if (!ctx) throw new Error("useRunner must be used within RunnerProvider");
  const state = ctx.getState(action);
  return {
    ...state,
    run: (payload) => ctx.run(action, payload),
    stop: () => ctx.stop(action),
    clear: () => ctx.clear(action),
  };
}
