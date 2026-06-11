export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function groupDelay(client, isLast) {
  const ms = client.groupDelayMs || 0;
  if (ms <= 0 || isLast) return;
  let waited = 0;
  while (waited < ms) {
    const step = Math.min(250, ms - waited);
    await sleep(step);
    waited += step;
  }
}

export async function runPool(items, concurrency, worker) {
  const n = Math.max(1, Math.min(10, Number(concurrency) || 1));
  let cursor = 0;

  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        await worker(items[index], index);
      } catch {
        /* per-item errors handled inside worker */
      }
    }
  }

  const runners = [];
  for (let i = 0; i < Math.min(n, items.length); i++) runners.push(runner());
  await Promise.all(runners);
}
