// ─────────────────────────────────────────────────────────────────────────────
// Frequência de um passo que NÃO é diário (coluna `dias` da Minha rotina — ex.:
// ["Seg","Qua","Sex"]). Textos do card da Rotina:
//   · selo, no dia em que vale:      "3x por semana · Seg, Qua, Sex"
//   · selo, no dia em que não vale:  "Hoje não · Use só Seg, Qua e Sex"
//   · 1ª linha do card expandido:    "Use só 3 vezes por semana: segunda, quarta e sexta."
// `dias` vazio/null ou com os 7 dias = passo diário (sem selo).
// ─────────────────────────────────────────────────────────────────────────────
import { DIAS_SEMANA } from './minhaRotina';

const NOME_LONGO: Record<string, string> = {
  Seg: 'segunda', Ter: 'terça', Qua: 'quarta', Qui: 'quinta', Sex: 'sexta', Sáb: 'sábado', Dom: 'domingo',
};

/** Os dias na ordem da semana, sem repetição; null = todo dia. */
export function diasDoPasso(dias: string[] | null | undefined): string[] | null {
  if (!dias?.length) return null;
  const ok = DIAS_SEMANA.filter((d) => dias.includes(d));
  return ok.length && ok.length < 7 ? ok : null;
}

const juntar = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/** Texto do selo do card. */
export function seloFrequencia(dias: string[], valeHoje: boolean): string {
  return valeHoje ? `${dias.length}x por semana · ${dias.join(', ')}` : `Hoje não · Use só ${juntar(dias)}`;
}

/** 1ª linha (negrito) do card expandido. */
export function fraseFrequencia(dias: string[]): string {
  const n = dias.length;
  return `Use só ${n} ${n === 1 ? 'vez' : 'vezes'} por semana: ${juntar(dias.map((d) => NOME_LONGO[d] ?? d))}.`;
}
