#!/usr/bin/env node
// Importação ÚNICA do histórico de eventos de loja do Superwall (ClickHouse, desde
// 01/04/2026) para `assinaturas_loja` — passa cada evento, em ordem, pela MESMA função
// do webhook (`registrar_evento_loja`, origem 'importacao'). Idempotente: rodar de novo
// não duplica (o id do evento é a chave).
//
// Uso (da raiz do projeto, com o `superwall` CLI logado no projeto NIKS AI):
//   node scripts/assinaturas/importar-superwall.mjs <pasta-de-saída>
//   for f in <pasta>/eventos-*.sql; do supabase db query --linked -f "$f"; done
//
// Gera arquivos de até 300 eventos (o `db query -f` manda o arquivo inteiro numa
// requisição). Só o app iOS (40128) e o Android (40129); sem `subscriber_attributes`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
if (!OUT) { console.error('uso: importar-superwall.mjs <pasta-de-saída>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const TIPOS = "('initial_purchase','renewal','cancellation','uncancellation','expiration','billing_issue','product_change','non_renewing_purchase')";
const POR_ARQUIVO = 300;
const PAGINA = 1000;

function query(sql) {
  const raw = execFileSync('superwall', ['query', '--json', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  return json.data ?? [];
}

const eventos = [];
for (let off = 0; ; off += PAGINA) {
  const rows = query(`SELECT applicationId, name, toUnixTimestamp64Milli(ts) AS ms, props FROM sw.events_rep
    WHERE applicationId IN (40128, 40129) AND name IN ${TIPOS}
    ORDER BY ts, id LIMIT ${PAGINA} OFFSET ${off}`);
  for (const r of rows) {
    let p;
    try { p = JSON.parse(r.props); } catch { continue; }
    delete p.subscriber_attributes;
    if (!p.id || !p.original_transaction_id) continue;
    if (!p.type) p.type = String(r.name).toUpperCase();
    if (!p.event_timestamp_ms) p.event_timestamp_ms = String(r.ms);
    eventos.push(p);
  }
  if (rows.length < PAGINA) break;
}

const tag = (s) => { let t = 'ev'; while (s.includes(`$${t}$`)) t += 'x'; return `$${t}$`; };
let arquivos = 0;
for (let i = 0; i < eventos.length; i += POR_ARQUIVO) {
  const bloco = eventos.slice(i, i + POR_ARQUIVO).map((e) => {
    const j = JSON.stringify(e), d = tag(j);
    return `select public.registrar_evento_loja(${d}${j}${d}::jsonb, 'importacao');`;
  });
  fs.writeFileSync(path.join(OUT, `eventos-${String(++arquivos).padStart(3, '0')}.sql`), bloco.join('\n') + '\n');
}
console.log(`${eventos.length} eventos em ${arquivos} arquivo(s) em ${OUT}`);
