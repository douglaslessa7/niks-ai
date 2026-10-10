// ─────────────────────────────────────────────────────────────────────────────
// Aviso de um produto na rotina DELA (plano da Rotina, Fase 2 — decisão 5):
// - quem decide é ela: qualquer produto em qualquer passo. NUNCA existe aviso de
//   "produto errado para o passo";
// - LEVE (texto pequeno no passo): o produto não é o mais indicado pra pele dela;
// - FORTE (alerta "Escolher outro / Usar mesmo assim"): só risco real — retinoide,
//   hidroquinona ou produto não seguro na gestação para quem está grávida, amamentando
//   ou tentando engravidar; alérgeno apontado pela análise do scan.
// As travas clínicas que BLOQUEIAM continuam só na rotina IDEAL (generate-protocol).
// Detector de retinoide = o mesmo de `isRetinoidStep` (generate-protocol) e de
// `passo_tem_retinoide` (banco): mudou lá, mude aqui.
// ─────────────────────────────────────────────────────────────────────────────

export type NivelAviso = 'nenhum' | 'leve' | 'forte';
export type Aviso = { nivel: NivelAviso; texto: string | null };

/** O que sabemos de um produto candidato a um passo (de qualquer origem). */
export type ProdutoAvaliavel = {
  nome: string | null;
  categoria?: string | null;
  ativos?: string[] | null;          // ativos detectados (scan) ou principais (catálogo)
  veredito?: string | null;          // pode_usar | com_ressalva | evitaria (scan)
  compat?: number | null;            // 0–100
  avisosAnalise?: string[] | null;   // `avisos` da análise do scan
  seguroGestante?: boolean | null;   // catálogo
  tiposPele?: string[] | null;       // catálogo: seca/normal/mista/oleosa
};

/** O que importa da pele dela para os avisos. */
export type PeleParaAviso = { pregnancyStatus: string | null; tipoPele: string | null };

const RETINOID_RE = /(retinol|retinal|retinaldeido|tretinoina|isotretinoina|retinoide|retinoid|retinil|retinyl|adapalen|tazaroten|trifaroten|hidroxipinacolona|hydroxypinacolone|granactive|\bhpr\b)/;
const HIDROQUINONA_RE = /(hidroquinona|hydroquinone)/;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function temRetinoide(texto: string): boolean {
  let t = norm(texto);
  // "bakuchiol (alternativa ao retinol)" não é retinoide.
  if (t.includes('bakuchiol')) t = t.replace(/(alternativa|substitut\w*|similar|parecid\w*)[^,.;()]*?retin\w*/g, ' ');
  return RETINOID_RE.test(t);
}

const FASE: Record<string, string> = {
  pregnant: 'na gravidez',
  breastfeeding: 'na amamentação',
  trying: 'pra quem está tentando engravidar',
};

export function avaliarProduto(p: ProdutoAvaliavel, pele: PeleParaAviso): Aviso {
  const texto = [p.nome, p.categoria, ...(p.ativos ?? [])].filter(Boolean).join(' ');
  const fase = pele.pregnancyStatus ? FASE[pele.pregnancyStatus] : undefined;

  // FORTE — gestação / amamentação / tentando.
  if (fase && (temRetinoide(texto) || HIDROQUINONA_RE.test(norm(texto)) || p.seguroGestante === false)) {
    return { nivel: 'forte', texto: `Não é indicado ${fase}. Confirme com seu obstetra antes de usar.` };
  }
  // FORTE — a análise do scan apontou reação/alergia.
  if (p.veredito === 'evitaria' && (p.avisosAnalise ?? []).some((a) => /alerg|reação|reacao/i.test(a))) {
    return { nivel: 'forte', texto: 'A análise apontou risco de reação na sua pele.' };
  }
  // LEVE — não é o mais indicado pra pele dela.
  if (p.veredito === 'evitaria') return { nivel: 'leve', texto: 'Não é o mais indicado pra sua pele.' };
  if (p.veredito === 'com_ressalva') return { nivel: 'leve', texto: 'Pede um cuidado na sua pele.' };
  if (p.veredito == null && typeof p.compat === 'number' && p.compat < 40) {
    return { nivel: 'leve', texto: 'Pouco compatível com a sua pele.' };
  }
  const tipo = (pele.tipoPele ?? '').toLowerCase();
  if (tipo && Array.isArray(p.tiposPele) && p.tiposPele.length && !p.tiposPele.some((x) => tipo.includes(String(x).toLowerCase()))) {
    return { nivel: 'leve', texto: 'Feito pra outro tipo de pele.' };
  }
  return { nivel: 'nenhum', texto: null };
}
