#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Importa cartas para o catálogo (`cartas_catalogo`) a partir de um CSV — upsert por
// `codigo`: reimportar o mesmo arquivo ATUALIZA as cartas, não duplica.
//
// Dois jeitos:
//   1. SEM chave (pela CLI do Supabase já logada) — gera os arquivos e você roda:
//        node scripts/cartas/importar.mjs cartas.csv [pasta-das-artes] --sql <pasta-de-saida>
//        bash <pasta-de-saida>/subir-artes.sh                       # storage cp de cada arte
//        supabase db query --linked -f <pasta-de-saida>/cartas-series.sql
//        supabase db query --linked -f <pasta-de-saida>/cartas-catalogo.sql
//   2. COM a chave service role (direto pela API):
//        SUPABASE_SERVICE_ROLE_KEY=… node scripts/cartas/importar.mjs cartas.csv [pasta-das-artes]
//      A chave vem SÓ da variável de ambiente; nunca grave em arquivo. A URL vem de
//      EXPO_PUBLIC_SUPABASE_URL (lido do .env).
//
// Colunas do CSV (cabeçalho obrigatório, separador vírgula, aspas para textos com vírgula):
//   codigo        único, minúsculas-com-hífen (ex.: rosa-de-damasco)
//   familia       colecionavel | conhecimento | poder
//   subtipo       vazio (colecionável) · educativa | pessoal | momento (conhecimento) ·
//                 scan_antecipado | carta_extra | protecao_sequencia | sequencia_dobro | xp_grupo_dobro (poder)
//   serie         código da série (só colecionável; ex.: flores-do-niks)
//   serie_nome    nome da série — cria a série se ela ainda não existir
//   nome          nome da carta
//   raridade      normal | rara (rara só em colecionável)
//   arte          arquivo da arte dentro da pasta (png/jpg/webp, até 2 MB) — opcional
//   texto         texto da carta (nas 'momento' pode ter {uv}, {cidade}…)
//   efeito        JSON do poder, ex.: {"dias":2} — opcional
//   ativa         sim | nao (padrão sim)
//   apenas_teste  sim | nao (padrão nao) — só os testers recebem
//
// A arte sobe para o bucket público `cartas` em `<serie ou familia>/<codigo>.<ext>`.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const args = process.argv.slice(2);
const iSql = args.indexOf('--sql');
const saidaSql = iSql >= 0 ? args[iSql + 1] : null;
if (iSql >= 0) args.splice(iSql, 2);
const [csvPath, artesDir] = args;
if (!csvPath || (iSql >= 0 && !saidaSql)) {
  console.error('Uso: node scripts/cartas/importar.mjs cartas.csv [pasta-das-artes] --sql <pasta-de-saida>');
  console.error('  ou: SUPABASE_SERVICE_ROLE_KEY=… node scripts/cartas/importar.mjs cartas.csv [pasta-das-artes]');
  process.exit(1);
}

function envDoArquivo(nome) {
  if (process.env[nome]) return process.env[nome];
  if (!existsSync('.env')) return '';
  const linha = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith(`${nome}=`));
  return linha ? linha.slice(nome.length + 1).trim().replace(/^["']|["']$/g, '') : '';
}

const URL_BASE = envDoArquivo('SUPABASE_URL') || envDoArquivo('EXPO_PUBLIC_SUPABASE_URL');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!saidaSql && (!URL_BASE || !KEY)) {
  console.error('Faltou EXPO_PUBLIC_SUPABASE_URL (.env) ou SUPABASE_SERVICE_ROLE_KEY (variável de ambiente).');
  process.exit(1);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// CSV com aspas ("" = aspas literais), vírgulas e quebras de linha dentro de aspas.
function lerCsv(texto) {
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ',') { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  linha.push(campo);
  if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
  const [cab, ...resto] = linhas;
  const chaves = cab.map((c) => c.trim().replace(/^﻿/, ''));
  return resto.map((l) => Object.fromEntries(chaves.map((k, i) => [k, (l[i] ?? '').trim()])));
}

const sim = (v, padrao) => (v === '' || v == null ? padrao : /^(sim|s|true|1|yes)$/i.test(v));
const vazio = (v) => (v === '' ? null : v);
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

async function req(metodo, caminho, corpo, extra = {}) {
  const r = await fetch(`${URL_BASE}${caminho}`, { method: metodo, headers: { ...headers, ...extra }, body: corpo });
  if (!r.ok) throw new Error(`${metodo} ${caminho} → ${r.status} ${await r.text()}`);
  return r;
}

const linhas = lerCsv(readFileSync(csvPath, 'utf8'));
console.log(`${linhas.length} cartas no CSV.`);

// Só colecionável pode ser rara (o banco também recusa: cartas_catalogo_rara_so_colecionavel).
for (const [i, l] of linhas.entries()) {
  if ((l.raridade || 'normal') === 'rara' && l.familia !== 'colecionavel') {
    console.error(`Linha ${i + 2} (${l.codigo}): só colecionável pode ser rara — dicas e poderes são sempre normais.`);
    process.exit(1);
  }
}

// Modo sem chave: gera o SQL de upsert e os comandos `storage cp` (CLI logada).
if (saidaSql) {
  const q = (v) => (v == null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
  mkdirSync(saidaSql, { recursive: true });
  const series = new Map();
  for (const l of linhas) if (l.serie) series.set(l.serie, l.serie_nome || l.serie);
  if (series.size) {
    writeFileSync(join(saidaSql, 'cartas-series.sql'),
      `insert into public.cartas_series (codigo, nome) values\n  ${[...series].map(([c, n]) => `(${q(c)}, ${q(n)})`).join(',\n  ')}\n` +
      'on conflict (codigo) do update set nome = excluded.nome;\n');
  }
  const cp = ['#!/usr/bin/env bash', 'set -euo pipefail'];
  const vals = linhas.map((l, i) => {
    if (!l.codigo || !l.familia || !l.nome) throw new Error(`Linha ${i + 2}: codigo, familia e nome são obrigatórios.`);
    let arte = null;
    if (l.arte) {
      if (!artesDir) throw new Error(`Linha ${i + 2}: tem arte mas faltou a pasta das artes.`);
      const arquivo = resolve(artesDir, l.arte);
      const ext = extname(arquivo).toLowerCase();
      if (!existsSync(arquivo) || !MIME[ext]) throw new Error(`Linha ${i + 2}: arte não encontrada ou formato inválido (${arquivo}).`);
      arte = `${l.serie || l.familia}/${l.codigo}${ext}`;
      cp.push(`supabase storage cp '${arquivo.replace(/'/g, "'\\''")}' 'ss:///cartas/${arte}' --linked --experimental --content-type ${MIME[ext]}`);
    }
    const efeito = l.efeito ? `${q(JSON.stringify(JSON.parse(l.efeito)))}::jsonb` : 'null';
    return `(${[q(l.codigo), q(l.familia), q(l.subtipo), q(l.serie), q(l.nome), q(l.raridade || 'normal'), q(arte), q(l.texto),
      efeito, sim(l.ativa, true), sim(l.apenas_teste, false), i].join(', ')})`;
  });
  writeFileSync(join(saidaSql, 'cartas-catalogo.sql'),
    'insert into public.cartas_catalogo (codigo, familia, subtipo, serie, nome, raridade, arte_path, texto, efeito, ativa, apenas_teste, ordem) values\n  ' +
    vals.join(',\n  ') +
    '\non conflict (codigo) do update set familia = excluded.familia, subtipo = excluded.subtipo, serie = excluded.serie, nome = excluded.nome,' +
    ' raridade = excluded.raridade, arte_path = coalesce(excluded.arte_path, cartas_catalogo.arte_path), texto = excluded.texto, efeito = excluded.efeito,' +
    ' ativa = excluded.ativa, apenas_teste = excluded.apenas_teste, ordem = excluded.ordem, atualizada_em = now();\n');
  writeFileSync(join(saidaSql, 'subir-artes.sh'), cp.join('\n') + '\n');
  console.log(`Gerado em ${saidaSql}: ${series.size ? 'cartas-series.sql, ' : ''}cartas-catalogo.sql e subir-artes.sh (${cp.length - 2} artes).`);
  console.log('Ordem: bash subir-artes.sh → db query -f cartas-series.sql → db query -f cartas-catalogo.sql');
  process.exit(0);
}

// 1. Séries novas.
const series = new Map();
for (const l of linhas) if (l.serie) series.set(l.serie, l.serie_nome || l.serie);
if (series.size) {
  const corpo = [...series].map(([codigo, nome]) => ({ codigo, nome }));
  await req('POST', '/rest/v1/cartas_series?on_conflict=codigo', JSON.stringify(corpo), {
    'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates',
  });
  console.log(`Séries conferidas: ${[...series.keys()].join(', ')}`);
}

// 2. Artes + cartas.
const cartas = [];
for (const [i, l] of linhas.entries()) {
  if (!l.codigo || !l.familia || !l.nome) throw new Error(`Linha ${i + 2}: codigo, familia e nome são obrigatórios.`);
  let arte_path = null;
  if (l.arte) {
    if (!artesDir) throw new Error(`Linha ${i + 2}: tem arte mas faltou a pasta das artes.`);
    const arquivo = join(artesDir, l.arte);
    const ext = extname(arquivo).toLowerCase();
    if (!existsSync(arquivo) || !MIME[ext]) throw new Error(`Linha ${i + 2}: arte não encontrada ou formato inválido (${arquivo}).`);
    arte_path = `${l.serie || l.familia}/${l.codigo}${ext}`;
    await req('POST', `/storage/v1/object/cartas/${arte_path}`, readFileSync(arquivo), {
      'Content-Type': MIME[ext], 'x-upsert': 'true', 'Cache-Control': 'max-age=3600',
    });
  }
  cartas.push({
    codigo: l.codigo,
    familia: l.familia,
    subtipo: vazio(l.subtipo),
    serie: vazio(l.serie),
    nome: l.nome,
    raridade: l.raridade || 'normal',
    ...(arte_path ? { arte_path } : {}),
    texto: vazio(l.texto),
    efeito: l.efeito ? JSON.parse(l.efeito) : null,
    ativa: sim(l.ativa, true),
    apenas_teste: sim(l.apenas_teste, false),
    ordem: i,
    atualizada_em: new Date().toISOString(),
  });
}

// Upsert em blocos (PostgREST exige as mesmas chaves em todas as linhas do bloco).
const comArte = cartas.filter((c) => 'arte_path' in c);
const semArte = cartas.filter((c) => !('arte_path' in c));
for (const grupo of [comArte, semArte]) {
  for (let i = 0; i < grupo.length; i += 200) {
    await req('POST', '/rest/v1/cartas_catalogo?on_conflict=codigo', JSON.stringify(grupo.slice(i, i + 200)), {
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }
}
console.log(`Pronto: ${cartas.length} cartas importadas (${comArte.length} com arte).`);
