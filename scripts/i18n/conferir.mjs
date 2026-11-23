#!/usr/bin/env node
// Confere as traduções (só leitura): toda chave usada em t('…') precisa existir em
// locales/en/*.json, e toda tradução precisa ser usada. Uso: node scripts/i18n/conferir.mjs [--extra x.json …]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PASTAS = ['app', 'components', 'lib', 'hooks', 'store', 'constants'];
const arquivos = [];
const andar = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? andar(p) : /\.(tsx?|jsx?)$/.test(n) && arquivos.push(p); } };
PASTAS.forEach(andar);

const en = {};
for (const f of readdirSync('locales/en')) Object.assign(en, JSON.parse(readFileSync(join('locales/en', f), 'utf8')));
// --extra a.json b.json: soma traduções ainda fora de locales/en (rascunho)
const iExtra = process.argv.indexOf('--extra');
if (iExtra >= 0) for (const f of process.argv.slice(iExtra + 1)) Object.assign(en, JSON.parse(readFileSync(f, 'utf8')));

// t('…'), t("…") ou t(`…`) sem ${}: a chave tem que ser um texto fixo.
const RE = /\bt\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\$]|\\.)*`)\s*[,)]/g;
const usadas = new Map();
let dinamicas = [];
for (const f of arquivos) {
  const src = readFileSync(f, 'utf8');
  if (!/from '[./]*lib\/i18n'|from '\.\/i18n'/.test(src)) continue;
  for (const m of src.matchAll(RE)) {
    const chave = Function(`return ${m[1]}`)();
    if (!usadas.has(chave)) usadas.set(chave, []);
    usadas.get(chave).push(f);
  }
  for (const m of src.matchAll(/\bt\(\s*(?!['"`])([^,)]{1,60})/g)) dinamicas.push(`${f}: t(${m[1]}`);
}
const faltam = [...usadas.keys()].filter((k) => !(k in en));
const sobram = Object.keys(en).filter((k) => !usadas.has(k));
const vazias = Object.entries(en).filter(([, v]) => !String(v).trim()).map(([k]) => k);
const vars = Object.entries(en).filter(([k, v]) => JSON.stringify((k.match(/\{\{\w+\}\}/g) || []).sort()) !== JSON.stringify((String(v).match(/\{\{\w+\}\}/g) || []).sort())).map(([k]) => k);

console.log(`Chaves usadas: ${usadas.size} · traduções: ${Object.keys(en).length}`);
console.log(`\nSEM tradução (aparecem em português no inglês): ${faltam.length}`);
faltam.forEach((k) => console.log(`  ${JSON.stringify(k)}  ← ${usadas.get(k)[0]}`));
console.log(`\nTraduções sem uso: ${sobram.length}`); sobram.forEach((k) => console.log(`  ${JSON.stringify(k)}`));
console.log(`\nTraduções vazias: ${vazias.length}`); vazias.forEach((k) => console.log(`  ${JSON.stringify(k)}`));
console.log(`\nVariáveis {{…}} diferentes entre pt e en: ${vars.length}`); vars.forEach((k) => console.log(`  ${JSON.stringify(k)}`));
console.log(`\nt() com chave vinda de variável (conferir à mão que o valor está no en): ${dinamicas.length}`); dinamicas.forEach((l) => console.log(`  ${l}`));
process.exitCode = faltam.length || vazias.length || vars.length ? 1 : 0;
