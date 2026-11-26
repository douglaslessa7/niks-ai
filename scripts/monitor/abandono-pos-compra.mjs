#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Abandono depois da compra (26/nov/2026): por dia e por versão do app, quantas PAGARAM
// (Superwall `transaction_complete`, loja de verdade) e quantas criaram conta (a assinatura
// ligada a uma conta no servidor, `assinaturas_loja.user_id`). Só LÊ.
//
// Uso (na raiz do projeto): node scripts/monitor/abandono-pos-compra.mjs [dias=7]
//   • Superwall: `superwall query` (CLI logada). A tabela de eventos aceita no máximo 7 dias.
//   • Servidor: Management API do Supabase com o token da CLI no Keychain (README, "Migrations").
// Para saber EM QUE TELA elas param: funil no Mixpanel (ver docs/pendencias-pos-compra-v2.md).
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process';

const DIAS = Math.min(7, Math.max(1, Number(process.argv[2]) || 7));
const PROJETO = 'utpljvwmeyeqwrfulbfr';

function superwall(sql) {
  const out = execFileSync('superwall', ['query', sql, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const j = JSON.parse(out);
  if (!j.data) throw new Error(`Superwall: ${out.slice(0, 300)}`);
  return j.data;
}

async function supabase(sql) {
  const tok = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim();
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJETO}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(`Supabase: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

// 1ª compra de cada assinatura (SUBSCRIPTION_START), sem sandbox.
const compras = superwall(`
  SELECT toString(toDate(ts, 'America/Sao_Paulo')) AS dia,
         JSONExtractString(meta, 'appVersion') AS versao,
         JSONExtractString(props, '$original_transaction_identifier') AS otid
  FROM sw.events_rep
  WHERE applicationId = 40128 AND isSandbox = 0 AND name = 'transaction_complete'
    AND ts > toStartOfHour(now() - INTERVAL ${DIAS} DAY) AND ts < now()
    AND JSONExtractString(props, '$transaction_type') = 'SUBSCRIPTION_START'
`).filter((c) => c.otid);

const ids = [...new Set(compras.map((c) => c.otid))];
const comConta = new Set();
for (let i = 0; i < ids.length; i += 500) {
  const lista = ids.slice(i, i + 500).map((id) => `'${id.replace(/[^0-9]/g, '')}'`).join(',');
  const linhas = await supabase(`select original_transaction_id from public.assinaturas_loja where user_id is not null and original_transaction_id in (${lista})`);
  for (const l of linhas) comConta.add(String(l.original_transaction_id));
}

const grupos = new Map();
for (const c of compras) {
  const k = `${c.dia} | ${c.versao || '?'}`;
  const g = grupos.get(k) ?? { compras: new Set(), semConta: new Set() };
  g.compras.add(c.otid);
  if (!comConta.has(c.otid)) g.semConta.add(c.otid);
  grupos.set(k, g);
}

console.log('dia        | versão | pagaram | sem conta | %');
for (const k of [...grupos.keys()].sort()) {
  const g = grupos.get(k);
  const pct = g.compras.size ? ((100 * g.semConta.size) / g.compras.size).toFixed(1) : '0';
  console.log(`${k.padEnd(19)} | ${String(g.compras.size).padStart(7)} | ${String(g.semConta.size).padStart(9)} | ${pct}`);
}
