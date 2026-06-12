"use client";

import { createContext, useContext, useRef, useState, useCallback } from "react";

const RunnerContext = createContext(null);

const MAX_LOGS = 2000;

function emptyState() {
  return { logs: [], running: false, paused: false, jobId: null, summary: null, startedAt: null, finishedAt: null };
}

export function RunnerProvider({ children }) {
  // map: action -> { logs, running, summary, startedAt, finishedAt }
  const [byAction, setByAction] = useState({});
  // keep abort controllers per action so we can stop
  const controllers = useRef({});
  // keep current jobId per action so we can send control commands
  const jobIds = useRef({});

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

  // Kirim perintah kontrol (pause/resume/stop) ke server untuk job action ini.
const sendControl = useCallback(async (action, command) => {
    const jobId = jobIds.current[action];
    if (!jobId) return;
    try {
      await fetch("/api/run/control", {
   method: "POST",
        headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ jobId, command }),
      });
    } catch {
      /* kontrol best-effort */
    }
  }, []);

  const pause = useCallback(
(action) => {
      patch(action, { paused: true });
      sendControl(action, "pause");
    },
    [patch, sendControl]
  );

  const resume = useCallback(
    (action) => {
      patch(action, { paused: false });
      sendControl(action, "resume");
    },
    [patch, sendControl]
  );

  const stop = useCallback(
    (action) => {
      // Minta server menghentikan job dengan rapi, lalu putuskan stream.
      sendControl(action, "stop");
      const c = controllers.current[action];
      if (c) c.abort();
    },
    [sendControl]
  );

  const run = useCallback(
    async (action, payload) => {
 // prevent double-run
      const existing = byAction[action];
      if (existing && existing.running) return;

   const controller = new AbortController();
      controllers.current[action] = controller;
      // jobId dibuat klien agar kontrol bisa dipakai sejak awal.
      const jobId = `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
jobIds.current[action] = jobId;

      patch(action, {
        logs: [],
        summary: null,
        running: true,
    paused: false,
        jobId,
   startedAt: Date.now(),
        finishedAt: null,
      });

      try {
        const res = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, jobId, ...payload }),
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
           if (entry.type === "job") jobIds.current[action] = entry.jobId;
    else if (entry.type === "summary") patch(action, { summary: entry.data });
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
        delete jobIds.current[action];
      patch(action, { running: false, paused: false, finishedAt: Date.now() });
      }
    },
  [byAction, patch, pushLog]
  );

  return (
    <RunnerContext.Provider value={{ getState, run, stop, pause, resume, clear }}>
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
    pause: () => ctx.pause(action),
  resume: () => ctx.resume(action),
    clear: () => ctx.clear(action),
  };
}
