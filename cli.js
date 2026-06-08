#!/usr/bin/env node
// CLI Digiflazz fetch-tool
// Penggunaan:
//   node cli.js ping
//   node cli.js delete  [--only "Pulsa,Data"] [--skip "Games"] [--dry-run]
//   node cli.js add     --threshold 20 [--op gte|lte|eq] [--only ...] [--skip ...] [--dry-run]
//   node cli.js seller  [--multi Ya|Tidak] [--rating 3.5] [--cheapest] [--overwrite]
//                       [--prefix TSEL] [--code-len 8] [--only ...] [--skip ...] [--dry-run]
import { log } from "./src/logger.js";
import { loadConfig, buildClient } from "./src/bootstrap.js";
import { runDeleteAll } from "./modules/delete.js";
import { runAddAll } from "./modules/add.js";
import { runSellerAll } from "./modules/seller.js";

// ---------- argv parsing ----------
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

const splitList = (v) =>
  typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

function help() {
  console.log(`
Digiflazz Fetch Tool

  node cli.js ping
  node cli.js delete  [--only "Pulsa,Data"] [--skip "Games"] [--dry-run]
  node cli.js add     --threshold 20 [--op gte|lte|eq] [--only ...] [--skip ...] [--dry-run]
  node cli.js seller  [--multi Ya|Tidak] [--rating 3.5] [--cheapest] [--overwrite]
                      [--prefix TSEL] [--code-len 8] [--only ...] [--skip ...] [--dry-run]

Opsi global di config.json: speed, proxy, geoip, userAgent.
Untuk versi web: node server.js
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === "help" || cmd === "--help") {
    help();
    return;
  }

  const cfg = loadConfig();
  const concurrency =
    args.concurrency != null && args.concurrency !== true
      ? parseInt(args.concurrency, 10)
      : undefined;
  const groupDelayMs =
    args["group-delay"] != null && args["group-delay"] !== true
      ? Math.round(parseFloat(args["group-delay"]) * 1000)
      : undefined;
  const { client } = await buildClient(cfg, { strict: true, concurrency, groupDelayMs });

  // verifikasi sesi
  try {
    const n = await client.ping();
    log.ok(`Sesi valid. ${n} kategori terbaca.`);
  } catch (e) {
    log.error(`Sesi tidak valid: ${e.message}`);
    process.exit(1);
  }

  const dryRun = !!args["dry-run"];
  const only = splitList(args.only);
  const skip = splitList(args.skip);

  if (cmd === "ping") {
    log.ok("Ping selesai.");
    return;
  }

  if (cmd === "delete") {
    await runDeleteAll(client, { only, skip, dryRun });
    return;
  }

  if (cmd === "add") {
    await runAddAll(client, {
      op: args.op || "gte",
      threshold: args.threshold,
      only,
      skip,
      dryRun,
      generateSku: true,
    });
    return;
  }

  if (cmd === "seller") {
    await runSellerAll(client, {
      multi: typeof args.multi === "string" ? args.multi : "",
      rating: args.rating != null && args.rating !== true ? parseFloat(args.rating) : null,
      cheapest: !!args.cheapest,
      skipExisting: !args.overwrite,
      codePrefix: typeof args.prefix === "string" ? args.prefix : "",
      codeLen: args["code-len"] ? parseInt(args["code-len"], 10) : 8,
      only,
      skip,
      dryRun,
    });
    return;
  }

  log.error(`Perintah tidak dikenal: ${cmd}`);
  help();
  process.exit(1);
}

main().catch((e) => {
  log.error(e.stack || e.message);
  process.exit(1);
});
