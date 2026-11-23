#!/usr/bin/env node
// Aplica os preços por país do NIKS na App Store Connect (assinaturas).
//
// Uso (na raiz do projeto):
//   export ASC_ISSUER_ID="..."  ASC_KEY_ID="..."  ASC_KEY_PATH="$HOME/.appstoreconnect/AuthKey_XXXX.p8"
//   node scripts/store/aplicar-precos.mjs                          # SIMULAÇÃO (não muda nada)
//   node scripts/store/aplicar-precos.mjs --paises USA             # simula só os EUA
//   node scripts/store/aplicar-precos.mjs --paises USA --aplicar   # aplica só nos EUA
//   node scripts/store/aplicar-precos.mjs --aplicar                # aplica em todos
// Opções: --produtos anual,downsell,mensal   --arquivo caminho/precos-alvo.json
//
// Regras:
// - Brasil (BRA) nunca é alterado.
// - Quem já assina continua no preço atual (preserveCurrentPrice = true).
// - A Apple só aceita os valores da tabela dela: o script escolhe o mais próximo do alvo.
// - Sem dependências: Node 18+ (fetch e crypto nativos).

import { readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUNDLE_ID = 'br.com.niksai.app';
const API = 'https://api.appstoreconnect.apple.com';
const AQUI = dirname(fileURLToPath(import.meta.url));

// ---------- argumentos ----------
const args = process.argv.slice(2);
const opt = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
const APLICAR = args.includes('--aplicar');
const ARQUIVO = opt('--arquivo') || join(AQUI, 'precos-alvo.json');
const FILTRO_PAISES = opt('--paises')?.split(',').map((s) => s.trim().toUpperCase());
const FILTRO_PRODUTOS = opt('--produtos')?.split(',').map((s) => s.trim());

const { ASC_ISSUER_ID, ASC_KEY_ID, ASC_KEY_PATH } = process.env;
if (!ASC_ISSUER_ID || !ASC_KEY_ID || !ASC_KEY_PATH) {
  console.error('Faltam variáveis: ASC_ISSUER_ID, ASC_KEY_ID e ASC_KEY_PATH (caminho do .p8).');
  process.exit(1);
}
const chave = createPrivateKey(readFileSync(ASC_KEY_PATH, 'utf8'));

// ---------- token (JWT ES256, renovado a cada 15 min) ----------
let token = null, tokenAte = 0;
const b64url = (b) => Buffer.from(b).toString('base64url');
function getToken() {
  const agora = Math.floor(Date.now() / 1000);
  if (token && agora < tokenAte - 60) return token;
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: ASC_ISSUER_ID, iat: agora, exp: agora + 15 * 60, aud: 'appstoreconnect-v1' }));
  const assinatura = sign('sha256', Buffer.from(`${header}.${payload}`), { key: chave, dsaEncoding: 'ieee-p1363' });
  token = `${header}.${payload}.${b64url(assinatura)}`;
  tokenAte = agora + 15 * 60;
  return token;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// Data de início das mudanças de preço (YYYY-MM-DD): amanhã.
const AMANHA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
async function api(metodo, caminho, corpo) {
  const url = caminho.startsWith('http') ? caminho : API + caminho;
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    const res = await fetch(url, {
      method: metodo,
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    if (res.status === 429 || res.status >= 500) {
      const espera = Number(res.headers.get('retry-after') || 0) * 1000 || 20000 * tentativa;
      console.warn(`  … ${res.status}, tentando de novo em ${Math.round(espera / 1000)}s`);
      await esperar(espera);
      continue;
    }
    const texto = await res.text();
    const json = texto ? JSON.parse(texto) : {};
    if (!res.ok) {
      const det = json.errors?.map((e) => `${e.code}: ${e.detail || e.title}`).join(' | ') || texto;
      const err = new Error(`${metodo} ${caminho} → ${res.status} ${det}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }
  throw new Error(`${metodo} ${caminho}: muitas tentativas`);
}

// lista paginada (segue links.next), juntando data e included
async function listar(caminho) {
  let url = caminho, data = [], included = [];
  while (url) {
    const r = await api('GET', url);
    data = data.concat(r.data || []);
    included = included.concat(r.included || []);
    url = r.links?.next;
  }
  return { data, included };
}

// ---------- 1. achar o app e as assinaturas ----------
const alvo = JSON.parse(readFileSync(ARQUIVO, 'utf8'));
const produtos = Object.entries(alvo.produtos).filter(([k]) => !FILTRO_PRODUTOS || FILTRO_PRODUTOS.includes(k));
let linhas = alvo.precos.filter((p) => p.territorio !== 'BRA');
if (FILTRO_PAISES) linhas = linhas.filter((p) => FILTRO_PAISES.includes(p.territorio));

console.log(APLICAR ? '\n⚠️  MODO APLICAR — os preços vão mudar de verdade.\n' : '\nSIMULAÇÃO — nada será alterado. Use --aplicar para valer.\n');

const apps = await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`);
const app = apps.data?.[0];
if (!app) throw new Error(`App ${BUNDLE_ID} não encontrado nesta conta.`);

const grupos = await listar(`/v1/apps/${app.id}/subscriptionGroups?limit=50`);
const assinaturas = {};
for (const g of grupos.data) {
  const subs = await listar(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=50`);
  for (const s of subs.data) assinaturas[s.attributes.productId] = s.id;
}
for (const [nome, productId] of produtos) {
  if (!assinaturas[productId]) throw new Error(`Assinatura ${productId} (${nome}) não encontrada. Existentes: ${Object.keys(assinaturas).join(', ')}`);
}
console.log(`App ${app.attributes.name} · ${produtos.length} produto(s) · ${linhas.length} país(es)\n`);

// ---------- 2. para cada produto e país ----------
const fmt = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const relatorio = [['produto', 'territorio', 'pais', 'moeda', 'alvo', 'escolhido', 'diferenca_%', 'atual', 'status']];
let mudou = 0, iguais = 0, erros = 0;

for (const [nome, productId] of produtos) {
  const subId = assinaturas[productId];
  console.log(`=== ${nome} (${productId}) ===`);
  for (const p of linhas) {
    const valorAlvo = p[nome];
    let escolhido = '', atual = '', status = '', dif = '';
    try {
      // pontos de preço da Apple nesse país
      const pts = await listar(`/v1/subscriptions/${subId}/pricePoints?filter[territory]=${p.territorio}&include=territory&limit=200`);
      const moedaApple = pts.included.find((i) => i.type === 'territories')?.attributes?.currency;
      if (!pts.data.length) throw new Error('sem pontos de preço (país indisponível para a assinatura?)');
      const ponto = pts.data.reduce((melhor, pt) => {
        const d = Math.abs(Number(pt.attributes.customerPrice) - valorAlvo);
        return !melhor || d < melhor.d || (d === melhor.d && Number(pt.attributes.customerPrice) < Number(melhor.pt.attributes.customerPrice)) ? { pt, d } : melhor;
      }, null).pt;
      escolhido = Number(ponto.attributes.customerPrice);
      dif = ((escolhido / valorAlvo - 1) * 100).toFixed(1);

      // preço atual (para mostrar) e o mais recente, INCLUINDO os agendados (startDate no
      // futuro): se o mais recente já é o ponto escolhido, não aplica de novo.
      try {
        const pr = await listar(`/v1/subscriptions/${subId}/prices?filter[territory]=${p.territorio}&include=subscriptionPricePoint&limit=50`);
        const hoje = new Date().toISOString().slice(0, 10);
        const porData = [...pr.data].sort((a, b) => (a.attributes.startDate || '').localeCompare(b.attributes.startDate || ''));
        const vigente = porData.filter((x) => !x.attributes.startDate || x.attributes.startDate <= hoje).pop();
        const ptId = vigente?.relationships?.subscriptionPricePoint?.data?.id;
        const ptAtual = pr.included.find((i) => i.id === ptId);
        atual = ptAtual ? Number(ptAtual.attributes.customerPrice) : '';
        const ultimo = porData[porData.length - 1];
        const ptUltimo = ultimo?.relationships?.subscriptionPricePoint?.data?.id;
        if (ptUltimo && ptUltimo === ponto.id) {
          const desde = ultimo.attributes.startDate;
          status = desde && desde > hoje ? `já está (a partir de ${desde})` : 'já está';
        }
      } catch { atual = '?'; }

      const aviso = moedaApple && moedaApple !== p.moeda ? ` ⚠️ moeda na Apple: ${moedaApple}` : '';
      if (status.startsWith('já está')) {
        iguais++;
      } else if (APLICAR) {
        const criar = (startDate) => api('POST', '/v1/subscriptionPrices', {
          data: {
            type: 'subscriptionPrices',
            // Assinatura já aprovada: mudança de preço precisa de data de início (null = preço
            // inicial, que a Apple recusa depois da aprovação).
            attributes: { startDate, preserveCurrentPrice: true },
            relationships: {
              subscription: { data: { type: 'subscriptions', id: subId } },
              subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: ponto.id } },
              territory: { data: { type: 'territories', id: p.territorio } },
            },
          },
        });
        // Tenta amanhã; se a Apple pedir mais antecedência ("must be on or after AAAA-MM-DD"),
        // tenta UMA vez com a data que ela indica.
        let inicio = AMANHA;
        try {
          await criar(inicio);
        } catch (e) {
          const minima = String(e.message).match(/on or after (\d{4}-\d{2}-\d{2})/)?.[1];
          if (!minima) throw e;
          inicio = minima;
          await criar(inicio);
        }
        status = `aplicado (a partir de ${inicio})`; mudou++;
      } else {
        status = 'vai mudar'; mudou++;
      }
      console.log(`  ${p.territorio} ${p.pais.padEnd(24)} ${p.moeda} ${fmt(atual || 0).padStart(9)} → ${fmt(escolhido).padStart(9)}  (alvo ${fmt(valorAlvo)}, ${dif}%) ${status}${aviso}`);
    } catch (e) {
      erros++; status = 'ERRO: ' + e.message;
      console.log(`  ${p.territorio} ${p.pais.padEnd(24)} ❌ ${e.message}`);
    }
    relatorio.push([nome, p.territorio, p.pais, p.moeda, valorAlvo, escolhido, dif, atual, status]);
  }
}

const saida = join(AQUI, `relatorio-precos-${APLICAR ? 'aplicado' : 'simulacao'}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`);
writeFileSync(saida, relatorio.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));
console.log(`\n${APLICAR ? 'Aplicados' : 'Vão mudar'}: ${mudou} · Já estavam certos: ${iguais} · Erros: ${erros}`);
console.log(`Relatório: ${saida}\n`);
