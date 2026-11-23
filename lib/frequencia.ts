// ─────────────────────────────────────────────────────────────────────────────
// Frequência de um passo que NÃO é diário (coluna `dias` da Minha rotina — ex.:
// ["Seg","Qua","Sex"]). Textos do card da Rotina:
//   · selo, no dia em que vale:      "3x por semana · Seg, Qua, Sex"
//   · selo, no dia em que não vale:  "Hoje não · Use só Seg, Qua e Sex"
//   · 1ª linha do card expandido:    "Use só 3 vezes por semana: segunda, quarta e sexta."
// `dias` vazio/null ou com os 7 dias = passo diário (sem selo).
// ─────────────────────────────────────────────────────────────────────────────
import { DIAS_SEMANA } from './minhaRotina';
import { emIngles, t } from './i18n';

const NOME_LONGO: Record<string, string> = {
  Seg: 'segunda', Ter: 'terça', Qua: 'quarta', Qui: 'quinta', Sex: 'sexta', Sáb: 'sábado', Dom: 'domingo',
};

/** Os dias na ordem da semana, sem repetição; null = todo dia. */
export function diasDoPasso(dias: string[] | null | undefined): string[] | null {
  if (!dias?.length) return null;
  const ok = DIAS_SEMANA.filter((d) => dias.includes(d));
  return ok.length && ok.length < 7 ? ok : null;
}

// Inglês: os valores gravados (`Seg`, `Ter`…) só mudam na tela.
const CURTO_EN: Record<string, string> = { Seg: 'Mon', Ter: 'Tue', Qua: 'Wed', Qui: 'Thu', Sex: 'Fri', Sáb: 'Sat', Dom: 'Sun' };
const LONGO_EN: Record<string, string> = { Seg: 'Monday', Ter: 'Tuesday', Qua: 'Wednesday', Qui: 'Thursday', Sex: 'Friday', Sáb: 'Saturday', Dom: 'Sunday' };
/** Dia gravado (`Seg`) → como aparece na tela ("Seg" / "Mon"). */
export const diaCurto = (d: string) => (emIngles ? CURTO_EN[d] ?? d : d);

const juntar = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : t('{{lista}} e {{ultimo}}', { lista: xs.slice(0, -1).join(', '), ultimo: xs[xs.length - 1] }));

/** Texto do selo do card. */
export function seloFrequencia(dias: string[], valeHoje: boolean): string {
  const ds = dias.map(diaCurto);
  return valeHoje ? t('{{n}}x por semana · {{dias}}', { n: dias.length, dias: ds.join(', ') }) : t('Hoje não · Use só {{dias}}', { dias: juntar(ds) });
}

/** 1ª linha (negrito) do card expandido. */
export function fraseFrequencia(dias: string[]): string {
  const n = dias.length;
  const nomes = juntar(dias.map((d) => (emIngles ? LONGO_EN[d] : NOME_LONGO[d]) ?? d));
  return n === 1 ? t('Use só {{n}} vez por semana: {{dias}}.', { n, dias: nomes }) : t('Use só {{n}} vezes por semana: {{dias}}.', { n, dias: nomes });
}
