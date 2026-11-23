// ─────────────────────────────────────────────────────────────────────────────
// Categoria de um passo da rotina (limpeza, tônico, sérum, hidratante, protetor,
// olhos), pelo texto. Usada no ícone do passo sem produto (components/rotina/StepIcon)
// e na cobertura da rotina ideal (lib/rotinaIdeal).
//
// Pelo NOME do passo primeiro (é o que diz o que o passo é: "Hidratante Leve" com
// ácido hialurônico no ingrediente é hidratante, não sérum); só se o nome não disser
// nada, pelo ingrediente. Sem categoria reconhecível → null (ícone genérico).
// ─────────────────────────────────────────────────────────────────────────────

import { emIngles, t } from './i18n';

export type TipoPasso = 'protetor' | 'limpeza' | 'olhos' | 'tonico' | 'serum' | 'hidratante';

export const ROTULO_TIPO: Record<TipoPasso, string> = {
  protetor: 'Proteção', limpeza: 'Limpeza', olhos: 'Olhos', tonico: 'Tônico', serum: 'Sérum', hidratante: 'Hidratação',
};

export const normTexto = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function tipoPorTexto(texto: string): TipoPasso | null {
  const t = normTexto(texto);
  const has = (...k: string[]) => k.some((x) => t.includes(x));
  if (has('protetor', 'fps', 'spf', 'solar')) return 'protetor';
  if (has('limp', 'demaquil', 'sabonete', 'cleanser', 'micelar', 'espuma')) return 'limpeza';
  if (has('olho', 'olheira', 'periocular')) return 'olhos';
  if (has('tonico', 'toner', 'essencia')) return 'tonico';
  // Palavras que dizem o TIPO do produto vêm antes dos ativos: "Sérum hidratante" é
  // sérum, "Hidratante com niacinamida" é hidratante.
  if (has('serum', 'ampola', 'booster')) return 'serum';
  if (has('hidrat', 'creme', 'gel-creme', 'barreira', 'ceramid', 'oclusiv', 'emoliente', 'moistur')) return 'hidratante';
  if (has('tratamento', 'acido', 'retin', 'niacinamid', 'vitamina c', 'azelaic')) return 'serum';
  // 16/nov/2026: AHA e os ácidos dele pelo nome curto ("AHA Noite", "Lático 10%").
  if (/\baha\b|latico|lactico|glicolico|mandelico/.test(t)) return 'serum';
  return emIngles ? tipoPorTextoEn(t) : null;
}

// Texto da IA em inglês (etapa 3 da tradução): só quando nenhuma regra acima reconheceu e o
// celular está em inglês — em português o resultado é exatamente o de antes.
function tipoPorTextoEn(t: string): TipoPasso | null {
  const has = (...k: string[]) => k.some((x) => t.includes(x));
  if (has('sunscreen', 'sunblock', 'sun protection', 'sun cream')) return 'protetor';
  if (has('cleansing', 'face wash', 'facial wash', 'makeup remover', 'micellar', 'foam', 'wash')) return 'limpeza';
  if (has('eye cream', 'eye gel', 'eye serum', 'under-eye', 'under eye', 'eye area', 'dark circle', 'eye')) return 'olhos';
  if (has('essence', 'tonic', 'mist')) return 'tonico';
  if (has('ampoule')) return 'serum';
  if (has('cream', 'lotion', 'barrier', 'emollient', 'occlusive', 'balm')) return 'hidratante';
  if (has('treatment', 'acid', 'retinal', 'niacinamide', 'vitamin c', 'exfoliant', 'peel', 'salicylic', 'glycolic', 'lactic', 'mandelic', 'bha')) return 'serum';
  return null;
}

export function tipoDoPasso(name: string, ing: string): TipoPasso | null {
  return tipoPorTexto(name) ?? tipoPorTexto(ing);
}

// Título do período na Rotina, tirado dos passos (16/nov/2026, pedido do produto — antes era
// fixo: "Proteção & antioxidação" / "Reparação & barreira", mesmo sem antioxidante na rotina).
// Ex.: só básicos de manhã → "Limpeza, hidratação e proteção".
const FUNCAO: Record<TipoPasso, string> = {
  limpeza: 'limpeza', tonico: 'tônico', serum: 'tratamento', olhos: 'área dos olhos', hidratante: 'hidratação', protetor: 'proteção',
};
const ORDEM_FUNCAO: TipoPasso[] = ['limpeza', 'tonico', 'serum', 'olhos', 'hidratante', 'protetor'];
export function focoDoPeriodo(tipos: (TipoPasso | null)[]): string {
  const f = ORDEM_FUNCAO.filter((x) => tipos.includes(x)).map((x) => t(FUNCAO[x]));
  if (!f.length) return '';
  const s = f.length === 1 ? f[0] : t('{{lista}} e {{ultimo}}', { lista: f.slice(0, -1).join(', '), ultimo: f[f.length - 1] });
  return s[0].toUpperCase() + s.slice(1);
}
