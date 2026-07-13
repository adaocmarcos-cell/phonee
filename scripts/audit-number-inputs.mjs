#!/usr/bin/env node
/**
 * Auditoria de campos numéricos fora do padrão NumberInput.
 * Uso: `node scripts/audit-number-inputs.mjs`
 * Sai com código 0 sempre — é um relatório informativo, não um gate.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SEARCH_DIRS = ["src/pages", "src/components"];
const IGNORE = new Set(["NumberInput.tsx", "NumberInput.test.tsx"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !IGNORE.has(name)) out.push(full);
  }
  return out;
}

const findings = [];
const files = SEARCH_DIRS.flatMap((d) => {
  try { return walk(join(ROOT, d)); } catch { return []; }
});

for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

    // 1. Input type="number" nativo
    if (/type\s*=\s*["']number["']/.test(line)) {
      findings.push({ file: f, line: i + 1, kind: "input-type-number", snippet: trimmed });
    }
    // 2. inputMode decimal/numeric em Input não-NumberInput
    if (/inputMode\s*=\s*["'](decimal|numeric)["']/.test(line) && !/NumberInput/.test(line)) {
      // heurística: sinaliza como suspeito
      findings.push({ file: f, line: i + 1, kind: "input-mode-numeric", snippet: trimmed });
    }
    // 3. Math.max(1, ...) em onValueChange de NumberInput = snap-back manual
    if (/onValueChange.*Math\.max\s*\(\s*1\s*,/.test(line)) {
      findings.push({ file: f, line: i + 1, kind: "manual-snap-back", snippet: trimmed });
    }
    // 4. emptyBehavior="min" — legado, revisar caso a caso
    if (/emptyBehavior\s*=\s*["']min["']/.test(line)) {
      findings.push({ file: f, line: i + 1, kind: "empty-behavior-min", snippet: trimmed });
    }
  });
}

const byKind = findings.reduce((acc, f) => {
  (acc[f.kind] ||= []).push(f);
  return acc;
}, {});

const KIND_LABEL = {
  "input-type-number": "❌ Input type=\"number\" (usar NumberInput)",
  "input-mode-numeric": "⚠️  inputMode numeric/decimal fora de NumberInput",
  "manual-snap-back":  "⚠️  Math.max(1, ...) manual em onValueChange (snap-back)",
  "empty-behavior-min": "ℹ️  emptyBehavior=\"min\" (legado, revisar)",
};

console.log("\n📊 Auditoria de campos numéricos — Phonee\n");
console.log(`Arquivos varridos: ${files.length}`);
console.log(`Achados totais: ${findings.length}\n`);

for (const kind of Object.keys(KIND_LABEL)) {
  const items = byKind[kind] ?? [];
  console.log(`${KIND_LABEL[kind]} — ${items.length}`);
  for (const it of items) {
    const rel = relative(ROOT, it.file);
    console.log(`  ${rel}:${it.line}  ${it.snippet.slice(0, 120)}`);
  }
  console.log("");
}

if (findings.length === 0) {
  console.log("✅ Sem achados. Todos os campos numéricos seguem o padrão NumberInput.\n");
}