// ─────────────────────────────────────────────────────────────────────────────
// Nível individual por NIKS Points — a MESMA regra da função SQL `nivel_de`
// (migration 20261115120000_medalhas.sql). O servidor é a verdade (estado.pontos); aqui só
// para a "Sua caminhada" animar uma subida que atravessa vários níveis. Mudou lá, mude aqui.
//
// MEDALHAS (08/nov/2026, pedido do produto): os 11 nomes antigos ("Cara Lavada"… "Ícone")
// saíram. São 13 níveis: Bronze 1–3 (1–3) · Prata 1–3 (4–6) · Ouro 1–3 (7–9) ·
// Diamante 1–3 (10–12) · NIKS (13, o último). Depois do NIKS os pontos continuam somando,
// mas não existe nível acima (sem "Ícone II, III…"): no NIKS, `teto === piso`.
// O desenho de cada medalha/moldura: `lib/medalhas.ts`.
// ─────────────────────────────────────────────────────────────────────────────
import type { NivelTabela } from './cartasServidor';
import type { Material } from './medalhas';

export type Nivel = { nivel: number; titulo: string; piso: number; teto: number; tituloProximo: string };

/** A curva (pontos acumulados para CHEGAR a cada nível) — espelho de `cartas_config.pontos`
 *  no servidor, que é quem manda. Fácil de ajustar: mude a migration E aqui. Subidas:
 *  100 · 150 · 200 · 250 · 300 · 400 · 500 · 600 · 800 · 1000 · 1300 · 1800 (total 7.400). */
export const CURVA_NIVEIS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3300, 4300, 5600, 7400];
export const NOMES_NIVEIS = [
  'Bronze 1', 'Bronze 2', 'Bronze 3', 'Prata 1', 'Prata 2', 'Prata 3',
  'Ouro 1', 'Ouro 2', 'Ouro 3', 'Diamante 1', 'Diamante 2', 'Diamante 3', 'NIKS',
];
export const NIVEL_MAXIMO = CURVA_NIVEIS.length;   // 13

/** A tabela local, para quando o estado do servidor ainda não chegou. */
export const TABELA_NIVEIS: NivelTabela[] = CURVA_NIVEIS.map((pontos, i) => ({ n: i + 1, titulo: NOMES_NIVEIS[i], pontos }));

/** Cor do nome de cada material (a do design, 3a). */
export const COR_MATERIAL: Record<Material, string> = {
  bronze: '#9A5B2E', prata: '#69707C', ouro: '#9A6E10', diamante: '#3F79BD', rosa: '#FF5EA8',
};

/** A medalha de um nível: material (o "Rosa" do design = NIKS), etapa (1–3; 0 no NIKS), nome e cor. */
export function medalhaDoNivel(nivel: number): { material: Material; etapa: number; nome: string; cor: string } {
  const n = Math.max(1, Math.min(NIVEL_MAXIMO, Math.round(nivel) || 1));
  if (n >= NIVEL_MAXIMO) return { material: 'rosa', etapa: 0, nome: 'NIKS', cor: COR_MATERIAL.rosa };
  const material = (['bronze', 'prata', 'ouro', 'diamante'] as const)[Math.floor((n - 1) / 3)];
  return { material, etapa: ((n - 1) % 3) + 1, nome: NOMES_NIVEIS[n - 1], cor: COR_MATERIAL[material] };
}

/** Nível de um total de pontos. Do NIKS em diante: o NIKS, com `teto === piso` (barra cheia).
 *  `_icone` sobrou da regra antiga ("Ícone II…") e é ignorado. */
export function nivelDe(total: number, niveis: NivelTabela[], _icone?: { passo: number; incremento: number }): Nivel {
  const tab = niveis?.length ? niveis : TABELA_NIVEIS;
  const t = Math.max(0, total);
  const qtd = tab.length;
  let n = 1;
  tab.forEach((l, i) => { if (t >= l.pontos) n = i + 1; });
  if (n < qtd) {
    return { nivel: n, titulo: tab[n - 1].titulo, piso: tab[n - 1].pontos, teto: tab[n].pontos, tituloProximo: tab[n].titulo };
  }
  const piso = tab[qtd - 1].pontos;
  return { nivel: qtd, titulo: tab[qtd - 1].titulo, piso, teto: piso, tituloProximo: '' };
}

/** Fração da barra até o próximo nível (1 no último). */
export function fracaoNivel(total: number, piso: number, teto: number): number {
  if (teto <= piso) return 1;
  return Math.max(0, Math.min(1, (total - piso) / (teto - piso)));
}

/** Ajusta a resposta do servidor (funções `cartas` e `grupos`) às MEDALHAS, pela curva do app
 *  (08/nov/2026). Enquanto a migration `20261115120000_medalhas.sql` não está aplicada, o
 *  servidor ainda manda os 11 níveis antigos ("Cara Lavada"…) — e as telas mostravam esses
 *  nomes. Aqui, em QUALQUER objeto da resposta:
 *   - `niveis: [{ n, titulo, pontos }]` → a tabela das medalhas (`TABELA_NIVEIS`);
 *   - `{ total, nivel, titulo }` (pontos dela) → nível, título, piso, teto e próximo pelo total;
 *     `nivel_antes` pelo `total_antes`, se vier;
 *   - `{ pontos, nivel, titulo }` (integrante de grupo) → nível e título pelos pontos.
 *  Depois da migration o servidor manda o mesmo, e isto não muda nada (idempotente). */
export function ajustarMedalhas<T>(x: T): T {
  const visto = new Set<unknown>();
  const anda = (o: any) => {
    if (!o || typeof o !== 'object' || visto.has(o)) return;
    visto.add(o);
    if (Array.isArray(o)) { o.forEach(anda); return; }
    if (Array.isArray(o.niveis) && o.niveis.length && typeof o.niveis[0]?.pontos === 'number') {
      o.niveis = TABELA_NIVEIS.map((l) => ({ ...l }));
    }
    if (typeof o.nivel === 'number' && typeof o.titulo === 'string') {
      const base = typeof o.total === 'number' ? o.total : typeof o.pontos === 'number' ? o.pontos : null;
      if (base != null) {
        const n = nivelDe(base, TABELA_NIVEIS);
        o.nivel = n.nivel;
        o.titulo = n.titulo;
        if ('piso' in o) o.piso = n.piso;
        if ('teto' in o) o.teto = n.teto;
        if ('titulo_proximo' in o) o.titulo_proximo = n.tituloProximo;
        if (typeof o.total_antes === 'number' && typeof o.nivel_antes === 'number') {
          o.nivel_antes = nivelDe(o.total_antes, TABELA_NIVEIS).nivel;
        }
      }
    }
    for (const k of Object.keys(o)) if (k !== 'niveis') anda(o[k]);
  };
  anda(x);
  return x;
}
