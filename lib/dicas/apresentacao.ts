// ─────────────────────────────────────────────────────────────────────────────
// Dica do dia → formato da tela (designs 56a/56b/56c, NiksTipFlo).
// O catálogo guarda o "porquê" num texto corrido (`corpo`); a tela mostra em
// parágrafos, com o aviso num quadro "ATENÇÃO" e, às vezes, uma frase final em
// destaque. Aqui só se QUEBRA o texto — nenhuma palavra muda e o catálogo não é
// tocado. O campo `fonte` nunca passa por aqui (não é exibido).
// ─────────────────────────────────────────────────────────────────────────────
import { Dica } from './catalogo';

export type DicaTela = {
  receita: boolean;
  titulo: string;
  /** `note` = parêntese final do ingrediente, em cinza no design. */
  ingredientes: { main: string; note: string }[];
  preparo: string[];
  porque: string[];
  atencao: string | null;
  fecho: string | null;
};

// Aviso de segurança no fim do texto → quadro "ATENÇÃO" (do aviso até o fim).
const AVISO = [/^Um aviso importante/, /^Se você está grávida/, /^Se você tem rosácea/];

// Quebras exatas das duas dicas desenhadas (56a = arroz, 56c = sono): quantas
// frases em cada parágrafo e se as frases restantes são a frase final em destaque.
// Se o texto mudar e a conta não fechar, cai na quebra automática.
const QUEBRAS: Record<string, { paragrafos: number[]; fecho?: boolean }> = {
  'Máscara facial de arroz': { paragrafos: [1, 2, 2, 2] },
  'Durma e acorde no mesmo horário, garantindo 7h30 de sono': { paragrafos: [4, 1], fecho: true },
};

/** Frases do texto, sem perder nenhum caractere além dos espaços entre elas. */
function frases(texto: string): string[] {
  const out: string[] = [];
  const re = /[.!?]+\s+(?=[A-ZÀ-ÖØ-Þ])/g;
  let inicio = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    out.push(texto.slice(inicio, m.index + m[0].trimEnd().length));
    inicio = m.index + m[0].length;
  }
  out.push(texto.slice(inicio));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Junta frases em parágrafos de tamanho parecido com os do design (~120–320 letras). */
function agrupar(fs: string[]): string[] {
  const ps: string[] = [];
  let atual = '';
  for (const f of fs) {
    if (atual && atual.length >= 120 && atual.length + f.length > 320) {
      ps.push(atual);
      atual = f;
    } else {
      atual = atual ? `${atual} ${f}` : f;
    }
  }
  // Sobra curtinha no fim (uma frase solta) volta para o parágrafo anterior.
  if (atual && ps.length && atual.length < 90) ps[ps.length - 1] += ` ${atual}`;
  else if (atual) ps.push(atual);
  return ps;
}

export function dicaParaTela(d: Dica): DicaTela {
  let fs = frases(d.corpo);

  let atencao: string | null = null;
  const iAviso = fs.findIndex((f) => AVISO.some((r) => r.test(f)));
  if (iAviso > 0) {
    atencao = fs.slice(iAviso).join(' ');
    fs = fs.slice(0, iAviso);
  }

  let porque: string[] | null = null;
  let fecho: string | null = null;
  const q = QUEBRAS[d.titulo];
  if (q) {
    const usadas = q.paragrafos.reduce((a, b) => a + b, 0);
    const resto = fs.length - usadas;
    if (resto === 0 || (q.fecho && resto > 0)) {
      porque = [];
      let i = 0;
      for (const n of q.paragrafos) { porque.push(fs.slice(i, i + n).join(' ')); i += n; }
      if (q.fecho) fecho = fs.slice(i).join(' ');
    }
  }
  if (!porque) porque = agrupar(fs);

  const ingredientes = (d.ingredientes ?? []).map((t) => {
    const m = t.match(/^(.*\S)\s*(\([^()]*\))$/);
    return m ? { main: `${m[1]} `, note: m[2] } : { main: t, note: '' };
  });

  return {
    receita: !!d.ingredientes?.length,
    titulo: d.titulo,
    ingredientes,
    preparo: d.preparo ?? [],
    porque,
    atencao,
    fecho,
  };
}
