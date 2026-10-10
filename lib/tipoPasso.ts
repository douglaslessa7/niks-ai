// ─────────────────────────────────────────────────────────────────────────────
// Categoria de um passo da rotina (limpeza, tônico, sérum, hidratante, protetor,
// olhos), pelo texto. Usada no ícone do passo sem produto (components/rotina/StepIcon)
// e na cobertura da rotina ideal (lib/rotinaIdeal).
//
// Pelo NOME do passo primeiro (é o que diz o que o passo é: "Hidratante Leve" com
// ácido hialurônico no ingrediente é hidratante, não sérum); só se o nome não disser
// nada, pelo ingrediente. Sem categoria reconhecível → null (ícone genérico).
// ─────────────────────────────────────────────────────────────────────────────

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
  return null;
}

export function tipoDoPasso(name: string, ing: string): TipoPasso | null {
  return tipoPorTexto(name) ?? tipoPorTexto(ing);
}
