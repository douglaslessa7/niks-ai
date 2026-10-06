// Achados do resultado do scan (tela 8 do fluxo completo): a lista "Análise da
// pele", os chips de filtro e os pinos sobre o rosto.
//
// Fonte: `region_insights` da `analyze-skin` (uma entrada por região com condição
// relevante: testa, zona T, bochechas, queixo, olhos). Cada entrada vira um item
// com a região (etiqueta rosa), o título (`main_finding`), o texto (`consequence`) e
// uma intensidade lida do campo clínico da mesma categoria. Sem posição na foto: a
// IA não devolve coordenadas, então os pinos ficam em pontos FIXOS de cada região
// (decisão do produto, "pinos por região").
import type { ScanResult } from '../../store/onboarding';

export type Region = 'testa' | 'nariz_zona_t' | 'bochechas' | 'queixo_mandibula' | 'area_periocular';
export type Level = 'Leve' | 'Moderada' | 'Intensa';
export type Finding = {
  key: string;
  region: Region | null;
  zone: string;           // etiqueta rosa ("Zona T")
  category: string;       // chip de filtro ("Oleosidade")
  level: Level | null;    // selo; null = sem selo (categoria sem medida clínica)
  title: string;
  text: string;
};

// Pinos e âncora da miniatura de cada região, no quadro da FOTO do design (393 ×
// 487, a foto vai de −20 a 467 no frame). São os pontos do protótipo (`scanDotSpots`)
// + queixo e olhos, que o protótipo não desenha. Valem porque a tela enquadra o oval
// da câmera no mesmo lugar do rosto do design (ver `faceFit` na tela).
export const REGION_INFO: Record<Region, { zone: string; dots: [number, number][]; anchor: [number, number] }> = {
  testa: { zone: 'Testa', dots: [[178, 132], [204, 120], [222, 146], [190, 154], [212, 166]], anchor: [196, 140] },
  nariz_zona_t: { zone: 'Zona T', dots: [[186, 320], [206, 332], [196, 350]], anchor: [196, 320] },
  bochechas: { zone: 'Bochechas', dots: [[98, 320], [116, 340], [130, 316], [282, 320], [298, 340], [270, 338]], anchor: [110, 330] },
  queixo_mandibula: { zone: 'Queixo', dots: [[184, 404], [208, 410], [196, 396]], anchor: [196, 405] },
  // Olheiras: abaixo dos olhos (os olhos ficam em y ~266 neste quadro).
  area_periocular: { zone: 'Olhos', dots: [[136, 282], [152, 290], [242, 290], [258, 282]], anchor: [150, 278] },
};

// Categoria pelo título do achado (palavras do próprio prompt da `analyze-skin`).
// A ordem importa: "Oleosidade e poros dilatados" é Oleosidade.
const CATEGORY_RULES: [RegExp, string][] = [
  [/oleos|brilho|seb[aá]c/i, 'Oleosidade'],
  [/acne|espinha|p[aá]pula|p[uú]stula|comed|cravo|les[aã]o|lesões|inflamat/i, 'Acne'],
  [/mancha|pigment|melasma|lentigo|efélide|efelide|\bPIE\b|\bHPI\b|tom/i, 'Manchas'],
  [/poro/i, 'Poros'],
  [/olheira|bolsa|p[aá]lpebra|periocular/i, 'Olheiras'],
  [/linha|ruga|envelhec|firmeza|flacidez|el[aá]stic/i, 'Linhas'],
  [/textura|aspere|irregular|cicatriz/i, 'Textura'],
  [/vermelh|ros[aá]cea|eritema|sensib|barreira|irrita/i, 'Vermelhidão'],
  [/desidrat|ressec|seca/i, 'Ressecamento'],
];

function categoryOf(title: string): string {
  return CATEGORY_RULES.find(([re]) => re.test(title))?.[1] ?? 'Outros';
}

const byScore = (v: number | null | undefined, mid: number, high: number): Level | null =>
  v == null ? null : v >= high ? 'Intensa' : v >= mid ? 'Moderada' : 'Leve';

// Intensidade a partir do campo clínico da categoria. ⚠️ Campo ausente → sem selo
// (nunca inventar "Moderada" para um campo que a IA não devolveu — ver a nota do
// README sobre relatórios cortados).
function levelOf(category: string, r: ScanResult): Level | null {
  const m = (r as any).metricas as Record<string, number | null> | undefined;
  switch (category) {
    case 'Acne': {
      const s = r.acne?.severity;
      if (s === 'leve') return 'Leve';
      if (s === 'moderada') return 'Moderada';
      if (s === 'grave') return 'Intensa';
      return byScore(m?.acne, 35, 65);
    }
    case 'Manchas': {
      const s = r.pigmentacao?.intensity_score;
      return s == null ? null : s >= 4 ? 'Intensa' : s >= 3 ? 'Moderada' : 'Leve';
    }
    case 'Oleosidade': return byScore(m?.oleosidade, 40, 70);
    case 'Linhas': return byScore(m?.linhas_expressao, 35, 65);
    case 'Poros': {
      const v = r.textura_poros?.pore_visibility?.toLowerCase();
      if (!v) return null;
      if (/muito|acentuad|intens|alta/.test(v)) return 'Intensa';
      if (/moderad|vis[ií]ve|dilatad/.test(v)) return 'Moderada';
      return 'Leve';
    }
    default: return null;
  }
}

export function buildFindings(r: ScanResult | null): Finding[] {
  if (!r) return [];
  const insights = r.region_insights ?? [];
  if (insights.length > 0) {
    return insights
      .filter((ri) => ri && REGION_INFO[ri.region as Region])
      .map((ri, i) => {
        const category = categoryOf(ri.main_finding ?? '');
        return {
          key: `${ri.region}-${i}`,
          region: ri.region as Region,
          zone: REGION_INFO[ri.region as Region].zone,
          category,
          level: levelOf(category, r),
          title: ri.main_finding,
          text: ri.consequence,
        };
      });
  }
  // Relatório sem regiões (raro): as áreas de atenção, sem pino nem miniatura.
  return (r.pontos_fracos ?? []).map((t, i) => ({
    key: `pf-${i}`, region: null, zone: 'Rosto', category: categoryOf(t), level: null, title: t, text: '',
  }));
}

/** Chips de filtro: "Todos" + as categorias presentes, na ordem em que aparecem. */
export function findingChips(list: Finding[]): string[] {
  const cats: string[] = [];
  for (const f of list) if (!cats.includes(f.category)) cats.push(f.category);
  return ['Todos', ...cats];
}
