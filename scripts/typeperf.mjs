#!/usr/bin/env node

/**
 * Type-level performance benchmark for Paths and Get.
 *
 * Runs `tsc --extendedDiagnostics` against an isolated tsconfig that only
 * includes the benchmark file, then formats the results as a table. When a
 * saved baseline exists, shows a side-by-side comparison with % change.
 *
 * Usage:
 *   npm run typeperf              Run benchmark (compare to baseline if saved)
 *   npm run typeperf -- --save    Save current results as the new baseline
 *   npm run typeperf -- --clear   Delete the saved baseline
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BASELINE_PATH = resolve(ROOT, ".typeperf-baseline.json");
const TSCONFIG = resolve(ROOT, "tsconfig.typeperf.json");
const TSC = resolve(ROOT, "node_modules", ".bin", "tsc");

const METRICS = ["Types", "Instantiations", "Check time", "Total time"];

// ── Benchmark runner ─────────────────────────────────────

function collectMetrics() {
  /** tsc prints diagnostics to stdout; type errors go to stderr. */
  let output;
  try {
    output = execFileSync(TSC, [
      "--noEmit",
      "--extendedDiagnostics",
      "-p",
      TSCONFIG,
    ], {
      encoding: "utf8",
      cwd: ROOT,
    });
  } catch (err) {
    // tsc exits non-zero on type errors but still prints diagnostics
    output = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
    const errors = (err.stderr ?? "").trim();
    if (errors) {
      console.error("\n⚠  tsc reported errors:\n");
      console.error(errors);
      console.error();
    }
  }

  const result = {};
  for (const line of output.split("\n")) {
    for (const metric of METRICS) {
      if (line.startsWith(`${metric}:`)) {
        result[metric] = line.slice(metric.length + 1).trim();
      }
    }
  }
  return result;
}

// ── Formatting helpers ───────────────────────────────────

function parseNumeric(str) {
  return parseFloat(str.replace(/[^\d.]/g, ""));
}

function fmtValue(str) {
  if (!str) return "N/A";
  const n = parseNumeric(str);
  return str.endsWith("s") ? `${n.toFixed(2)}s` : n.toLocaleString("en-US");
}

function fmtChange(current, baseline) {
  const c = parseNumeric(current);
  const b = parseNumeric(baseline);
  if (b === 0) return "N/A";
  const pct = ((c - b) / b) * 100;
  const sign = pct <= 0 ? "" : "+";
  return `${sign}${pct.toFixed(1)}%`;
}

function pad(str, width, align = "right") {
  const s = String(str);
  if (align === "left") return s.padEnd(width);
  return s.padStart(width);
}

// ── Table renderer ───────────────────────────────────────

function printTable(current, baseline) {
  const has = baseline !== null;

  const W = { metric: 16, val: 14, pct: 12 };

  const hr = (l, m, r) => {
    let s = `${l}${"─".repeat(W.metric + 2)}${m}${"─".repeat(W.val + 2)}`;
    if (has) s += `${m}${"─".repeat(W.val + 2)}${m}${"─".repeat(W.pct + 2)}`;
    return `${s}${r}`;
  };

  const row = (metric, cur, base, change) => {
    let s = `│ ${pad(metric, W.metric, "left")} │ ${pad(cur, W.val)} `;
    if (has) s += `│ ${pad(base ?? "", W.val)} │ ${pad(change ?? "", W.pct)} `;
    return `${s}│`;
  };

  console.log();
  console.log(hr("┌", "┬", "┐"));
  console.log(
    has
      ? row("Metric", "Current", "Baseline", "Change")
      : row("Metric", "Current"),
  );
  console.log(hr("├", "┼", "┤"));

  for (const m of METRICS) {
    const c = fmtValue(current[m]);
    if (has && baseline[m]) {
      console.log(row(m, c, fmtValue(baseline[m]), fmtChange(current[m], baseline[m])));
    } else {
      console.log(row(m, c));
    }
  }

  console.log(hr("└", "┴", "┘"));
  console.log();
}

// ── CLI ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const wantSave = args.includes("--save");
const wantClear = args.includes("--clear");

if (wantClear) {
  if (existsSync(BASELINE_PATH)) {
    unlinkSync(BASELINE_PATH);
    console.log("Baseline cleared.");
  } else {
    console.log("No baseline to clear.");
  }
  process.exit(0);
}

console.log("Running type-level benchmark…");
const current = collectMetrics();

if (Object.keys(current).length === 0) {
  console.error("Failed to collect metrics — is tsconfig.typeperf.json valid?");
  process.exit(1);
}

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : null;

printTable(current, baseline);

if (wantSave) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Baseline saved → ${BASELINE_PATH}`);
  console.log();
}

if (!baseline && !wantSave) {
  console.log("Tip: run with --save to store these as the baseline for future comparisons.");
  console.log();
}
