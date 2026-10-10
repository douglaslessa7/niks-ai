// ─────────────────────────────────────────────────────────────────────────────
// Rotina ideal visível (plano da Rotina, Fase 4 — decisões 7 e 8).
//
// A ROTINA IDEAL (`protocolos`, a linha mais recente) é só referência: esta lib só a
// LÊ. Ela alimenta, na aba Rotina:
//   · o card "Faltam N passos pra sua pele: … · Ver rotina ideal ›" (ou "Sua rotina
//     cobre tudo o que sua pele precisa ✓");
//   · a folha da ideal (components/rotina/RotinaIdealSheet) — ✓ no que ela já cobre e
//     "Adicionar à minha rotina" no que falta;
//   · o aviso "Sua rotina ideal mudou com o novo scan · Ver o que mudou ›".
//
// COBERTURA ("esse passo da ideal já está na rotina dela") é calculada pelo TEXTO, não
// pelo índice guardado em `passo_ideal`: depois de um scan novo a ideal é outra linha e
// os índices antigos perdem o sentido. Casamento um-para-um (cada passo dela cobre no
// máximo um da ideal), em três níveis, do mais certo ao mais aproximado:
//   1. mesmo nome (o nome do passo dela ou o do passo da ideal de onde ele veio);
//   2. um ativo em comum (niacinamida, vitamina C, ácido azelaico…);
//   3. a mesma categoria (lib/tipoPasso: limpeza, sérum, hidratante, protetor…).
// É aproximado de propósito (risco 5 do plano): produto multifunção pode errar.
//
// Grávida, amamentando ou tentando engravidar: passos com retinoide da ideal NÃO
// aparecem (nem "faltam", nem "Adicionar") — a mesma regra da cópia
// (`criar_minha_rotina`) e da trava do generate-protocol.
//
// "A ideal mudou": só o 1º scan de pele DENTRO do app troca a ideal
// (`users.inapp_protocol_regenerated_at`, lib/regenerateProtocolInApp). O aviso aparece
// quando essa troca é POSTERIOR à criação da Minha rotina (`minha_rotina_criada_em`) e
// ela ainda não abriu a ideal depois disso. O "já vi" fica no aparelho (AsyncStorage):
// em outro celular o aviso aparece uma vez a mais — aceitável, e não exige mudança no
// banco. Os passos que não existiam na ideal anterior (linha anterior de `protocolos`)
// ganham o selo "Novo".
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { temRetinoide } from './avisoProduto';
import { tipoDoPasso, tipoPorTexto, normTexto, type TipoPasso } from './tipoPasso';
import { reordenarPassos, type Periodo, type PassoRotina } from './minhaRotina';

export type PassoIdeal = {
  periodo: Periodo;
  indice: number;             // posição na ideal (0…)
  id: unknown;                // `id` do passo cru, quando houver
  nome: string;
  ingrediente: string;
  instrucao: string | null;
  comoUsar: string[] | null;
  tempoEspera: string | null;
  cor: string | null;
  tipo: TipoPasso | null;
  novo: boolean;              // não existia na ideal anterior (só depois do scan novo)
};

export type RotinaIdeal = {
  am: PassoIdeal[];
  pm: PassoIdeal[];
  mudou: boolean;             // mostrar "Sua rotina ideal mudou com o novo scan"
  regeneradaEm: string | null;
};

const SEM_RETINOIDE = ['pregnant', 'breastfeeding', 'trying'];
const vistaKey = (uid: string) => `rotina_ideal_vista:${uid}`;

const norm = (s: string | null | undefined) => normTexto(s ?? '').replace(/\s+/g, ' ').trim();

function mapIdeal(raw: unknown, periodo: Periodo, semRetinoide: boolean, nomesAnteriores: Set<string> | null): PassoIdeal[] {
  if (!Array.isArray(raw)) return [];
  const out: PassoIdeal[] = [];
  raw.forEach((e: any, indice) => {
    if (!e || typeof e !== 'object') return;
    const nome = String(e.name ?? '').trim() || 'Passo';
    const ingrediente = String(e.ingredient ?? '').trim();
    if (semRetinoide && temRetinoide(`${nome} ${ingrediente}`)) return;
    out.push({
      periodo, indice, id: e.id ?? null, nome, ingrediente,
      instrucao: typeof e.instruction === 'string' ? e.instruction : null,
      comoUsar: Array.isArray(e.steps) ? e.steps.map(String) : null,
      tempoEspera: typeof e.waitTime === 'string' ? e.waitTime : null,
      cor: typeof e.color === 'string' ? e.color : null,
      tipo: tipoDoPasso(nome, ingrediente),
      novo: !!nomesAnteriores && !nomesAnteriores.has(norm(nome)),
    });
  });
  return out;
}

/** A rotina ideal mais recente + se ela mudou com o scan novo (e o que é novo). */
export async function carregarRotinaIdeal(uid: string): Promise<RotinaIdeal> {
  const [protoRes, userRes, vista] = await Promise.all([
    supabase.from('protocolos').select('rotina_am, rotina_pm')
      .eq('user_id', uid).order('updated_at', { ascending: false }).limit(2),
    supabase.from('users').select('pregnancy_status, inapp_protocol_regenerated_at, minha_rotina_criada_em')
      .eq('id', uid).maybeSingle(),
    AsyncStorage.getItem(vistaKey(uid)).catch(() => null),
  ]);
  if (protoRes.error) throw protoRes.error;
  const [atual, anterior] = protoRes.data ?? [];
  const u = userRes.data;
  const semRetinoide = SEM_RETINOIDE.includes(u?.pregnancy_status ?? '');

  // A ideal foi trocada pelo scan DEPOIS de a Minha rotina nascer (antes disso, a
  // cópia já veio da ideal nova — não há o que avisar).
  const regen: string | null = u?.inapp_protocol_regenerated_at ?? null;
  const criada: string | null = u?.minha_rotina_criada_em ?? null;
  const trocadaDepois = !!regen && !!criada && Date.parse(regen) > Date.parse(criada);
  const mudou = trocadaDepois && !(vista && Date.parse(vista) >= Date.parse(regen!));

  const nomes = (raw: unknown) => new Set(Array.isArray(raw) ? raw.map((e: any) => norm(e?.name)) : []);
  const comparar = trocadaDepois && !!anterior;
  return {
    am: mapIdeal(atual?.rotina_am, 'am', semRetinoide, comparar ? nomes(anterior.rotina_am) : null),
    pm: mapIdeal(atual?.rotina_pm, 'pm', semRetinoide, comparar ? nomes(anterior.rotina_pm) : null),
    mudou,
    regeneradaEm: regen,
  };
}

/** Ela abriu a ideal: o aviso "mudou" some (neste aparelho). */
export async function marcarIdealVista(uid: string): Promise<void> {
  await AsyncStorage.setItem(vistaKey(uid), new Date().toISOString()).catch(() => {});
}

// ── Cobertura ────────────────────────────────────────────────────────────────
const ATIVOS = [
  'niacinamid', 'vitamina c', 'ascorb', 'azelaic', 'salicil', 'glicol', 'lactic', 'mandel',
  'hialuron', 'ceramid', 'peptid', 'centella', 'bakuchiol', 'retin', 'adapalen', 'tranexam',
  'arbutin', 'pantenol', 'zinco', 'acido kojic', 'resveratrol',
];
const ativosDe = (texto: string) => { const t = norm(texto); return ATIVOS.filter((a) => t.includes(a)); };

function textoDoPasso(p: PassoRotina): string {
  return [p.nome, p.passoIdealNome, p.ingrediente, p.produto?.marca, p.produto?.nome].filter(Boolean).join(' ');
}
function tipoDoPassoDela(p: PassoRotina): TipoPasso | null {
  return tipoPorTexto(p.nome ?? '') ?? tipoPorTexto(p.passoIdealNome ?? '')
    ?? tipoPorTexto([p.produto?.nome, p.produto?.marca].filter(Boolean).join(' ')) ?? tipoPorTexto(p.ingrediente ?? '');
}

/** Índice do passo da ideal → id do passo dela que o cobre (só os cobertos). */
export function calcularCobertura(ideais: PassoIdeal[], dela: PassoRotina[]): Map<number, string> {
  const cobre = new Map<number, string>();
  const livres = new Set(dela.map((p) => p.id));
  const niveis: ((i: PassoIdeal, p: PassoRotina) => boolean)[] = [
    (i, p) => { const n = norm(i.nome); return n === norm(p.nome) || n === norm(p.passoIdealNome); },
    (i, p) => { const a = ativosDe(`${i.nome} ${i.ingrediente}`); if (!a.length) return false; const b = ativosDe(textoDoPasso(p)); return a.some((x) => b.includes(x)); },
    (i, p) => !!i.tipo && i.tipo === tipoDoPassoDela(p),
  ];
  for (const casa of niveis) {
    for (const i of ideais) {
      if (cobre.has(i.indice)) continue;
      const p = dela.find((x) => livres.has(x.id) && casa(i, x));
      if (p) { cobre.set(i.indice, p.id); livres.delete(p.id); }
    }
  }
  return cobre;
}

/**
 * "Adicionar à minha rotina": copia o passo da ideal para a Minha rotina, na posição
 * que respeita a ordem da ideal — logo depois do passo dela que cobre o passo anterior
 * da ideal (ou antes do que cobre o seguinte; sem referência, no fim). A ideal não muda.
 */
export async function adicionarPassoIdeal(
  uid: string, ideal: PassoIdeal, dela: PassoRotina[], cobertura: Map<number, string>,
): Promise<void> {
  let depois = -1;
  let antes = Infinity;
  cobertura.forEach((pid, indice) => {
    const k = dela.findIndex((p) => p.id === pid);
    if (k < 0) return;
    if (indice < ideal.indice) depois = Math.max(depois, k);
    else if (indice > ideal.indice) antes = Math.min(antes, k);
  });
  const pos = depois >= 0 ? depois + 1 : (antes !== Infinity ? antes : dela.length);

  // Dias da semana lidos do ingrediente ("(Ter/Qui/Sáb)"), pela MESMA função do banco
  // usada na cópia. Falhou → todo dia.
  const { data: dias } = await supabase.rpc('dias_do_ingrediente', { ingrediente: ideal.ingrediente });

  const { data, error } = await supabase
    .from('minha_rotina_passos')
    .insert({
      user_id: uid, periodo: ideal.periodo, ordem: dela.length + 1,
      nome: ideal.nome, ingrediente: ideal.ingrediente || null, instrucao: ideal.instrucao,
      como_usar: ideal.comoUsar, tempo_espera: ideal.tempoEspera, cor: ideal.cor,
      dias: Array.isArray(dias) && dias.length ? dias : null,
      origem: 'ideal',
      passo_ideal: { periodo: ideal.periodo, indice: ideal.indice, id: ideal.id ?? null, nome: ideal.nome },
    })
    .select('id')
    .single();
  if (error) throw error;
  const ids = dela.map((p) => p.id);
  ids.splice(pos, 0, data.id);
  await reordenarPassos(ids);
}
