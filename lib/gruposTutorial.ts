// ─────────────────────────────────────────────────────────────────────────────
// Tutorial dos Grupos (08/nov/2026). Obrigatório (sem "Pular"), mesmo visual do tour, e passa
// por até 3 telas: aba Grupos (Perfil) → Seus grupos → tela do grupo. O overlay mora no
// `(app)/_layout.tsx`; aqui ficam as paradas, a decisão de mostrar e o progresso.
//
// Variantes:
//   · `sem`: Perfil + Seus grupos vazio;
//   · `com`: Perfil + Seus grupos + tela do grupo (o primeiro da lista, ou o que está aberto);
//   · `so_grupo`: só a tela do grupo, para quem fez a `sem` e depois entrou em um.
//
// Onde fica salvo:
//   · o "já viu" é da CONTA: `users.grupos_tutorial_visto_em` (tutorial inicial) e
//     `users.grupos_tutorial_grupo_visto_em` (parte da tela do grupo);
//   · a parada atual é do aparelho, por conta. Fechou no meio: ao reabrir, volta sozinho para
//     a tela da parada. Reinstalou no meio: recomeça.
//
// Sem as colunas no banco (erro 42703), o tutorial não aparece e nada quebra.
// Fora do tour inicial: só começa quando ela abre uma tela de grupo por conta própria.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TutStop } from '../components/coach/TutorialOverlay';
import type { CoachStage } from './coachMarks';
import { getUserId } from './currentUser';
import { meusGrupos, muralGrupo } from './gruposServidor';
import { supabase } from './supabase';

export type RotaGrupos = '/grupos' | '/seus-grupos' | '/grupo';
type Variante = 'sem' | 'com' | 'so_grupo';
type Bloco = { rota: RotaGrupos; stage: CoachStage; stops: TutStop[] };

// Textos aprovados pelo produto em 08/nov/2026.
const PERFIL: Bloco = {
  rota: '/grupos',
  stage: 'grupos',
  stops: [
    { t: 'Sua foto usa a moldura da sua medalha. Suba de nível para conquistar molduras novas.', a: { u: ['perfil-foto'], pad: 0, r: 'pill' } },
    { t: 'Seus grupos ficam aqui.', a: { u: ['perfil-seus-grupos'], pad: 4, r: 'pill' } },
  ],
};
const LISTA_SEM: Bloco = {
  rota: '/seus-grupos',
  stage: 'seusGrupos',
  stops: [
    { t: 'No grupo, vocês fazem skincare juntas e veem quem é mais constante.', a: { u: ['lista-vazio'], pad: 8, r: 24 } },
    { t: 'Crie o seu aqui: dê um nome e convide as amigas pelo link.', a: { u: ['lista-criar'], pad: 4, r: 'pill' } },
    { t: 'Recebeu o link de uma amiga? Toque nele para entrar no grupo dela.', a: { u: ['lista-vazio'], pad: 8, r: 24 } },
    { t: 'Quando você entrar em um grupo, mostramos como ele funciona.', a: { u: ['lista-vazio'], pad: 8, r: 24 } },
  ],
};
const LISTA_COM: Bloco = {
  rota: '/seus-grupos',
  stage: 'seusGrupos',
  stops: [
    { t: 'Cada grupo mostra quem já fez o skincare hoje e sua posição na semana.', a: { u: ['lista-card'], pad: 4, r: 20 } },
    { t: 'Crie outro grupo aqui ou entre em um pelo link de uma amiga.', a: { u: ['lista-criar'], pad: 6, r: 'pill' } },
  ],
};
const PARADAS_GRUPO: TutStop[] = [
  { t: 'Estas são as integrantes. Cada foto tem a moldura da medalha dela.', a: { u: ['grupo-membros'], pad: 8, r: 18 } },
  { t: 'Aqui você convida amigas, denuncia, bloqueia ou sai do grupo.', a: { u: ['grupo-menu'], pad: 8, r: 'pill' } },
  { t: 'Quem faz mais check-ins na semana lidera e fica com a coroa.', a: { u: ['grupo-duelo'], pad: 10, r: 18 } },
  { t: 'Tire uma foto depois do skincare. Só as integrantes veem, e o check-in dá NIKS Points.', a: { u: ['grupo-checkin'], pad: 4, r: 'pill' } },
  { t: 'Valem até 2 check-ins por dia. Quem vence a semana ganha uma carta rara.', a: { u: ['grupo-ranking'], pad: 4, r: 20 } },
  { t: 'Na Jornada, vocês comparam os NIKS Points e o nível de cada uma.', a: { u: ['grupo-jornada'], pad: 4, r: 20 } },
];
const PARADA_MURAL: TutStop = {
  t: 'Check-ins e produtos escaneados aparecem aqui. Compartilhar um produto também dá NIKS Points, uma vez por dia.',
  a: { u: ['grupo-mural', 'grupo-mural-item'], pad: 8, r: 20 },
  scroll: 'mural',
};

type Progresso = {
  uid: string;
  variante: Variante;
  bloco: number;
  parada: number;
  grupoId: string | null;
  temMural: boolean;
  /** Ela já viu ao menos uma parada (13/nov/2026): tutorial visto não volta. */
  mostrado?: boolean;
};

export type EtapaTutorial = {
  /** Muda a cada bloco: remonta o overlay e leva à tela. */
  chave: string;
  rota: RotaGrupos;
  stage: CoachStage;
  grupoId: string | null;
  stops: TutStop[];
  /** Quantas paradas vieram antes deste trecho (para o "N de M"). */
  antes: number;
  total: number;
};

function blocos(p: Pick<Progresso, 'variante' | 'temMural'>): Bloco[] {
  const grupo: Bloco = { rota: '/grupo', stage: 'grupo', stops: p.temMural ? [...PARADAS_GRUPO, PARADA_MURAL] : PARADAS_GRUPO };
  if (p.variante === 'sem') return [PERFIL, LISTA_SEM];
  if (p.variante === 'com') return [PERFIL, LISTA_COM, grupo];
  return [grupo];
}

function montarEtapa(p: Progresso): EtapaTutorial | null {
  const lista = blocos(p);
  const b = lista[p.bloco];
  if (!b) return null;
  const total = lista.reduce((n, x) => n + x.stops.length, 0);
  const anteriores = lista.slice(0, p.bloco).reduce((n, x) => n + x.stops.length, 0);
  return {
    chave: `${p.variante}:${p.bloco}:${p.grupoId ?? ''}`,
    rota: b.rota,
    stage: b.stage,
    grupoId: p.grupoId,
    stops: b.stops.slice(p.parada),
    antes: anteriores + p.parada,
    total,
  };
}

// ── Estado de módulo: só um tutorial por vez, e as telas só leem a etapa ─────────
let progresso: Progresso | null = null;
let etapa: EtapaTutorial | null = null;
let ocupado = false;
let pedidoNaFila: { rota: RotaGrupos; gidAberto?: string } | null = null;
type Colunas = { visto: boolean; grupoVisto: boolean };
const colunas = new Map<string, Colunas>();
const subs = new Set<() => void>();

const definirEtapa = (e: EtapaTutorial | null) => { etapa = e; subs.forEach((f) => f()); };
const chaveLocal = (uid: string) => `grupos_tutorial_progresso_${uid}`;

async function salvar(p: Progresso) {
  try { await AsyncStorage.setItem(chaveLocal(p.uid), JSON.stringify(p)); } catch {}
}
async function apagar(uid: string) {
  try { await AsyncStorage.removeItem(chaveLocal(uid)); } catch {}
}
async function ler(uid: string): Promise<Progresso | null> {
  try {
    const bruto = await AsyncStorage.getItem(chaveLocal(uid));
    return bruto ? (JSON.parse(bruto) as Progresso) : null;
  } catch {
    return null;
  }
}

/** null = sem resposta (tenta depois); 'ausente' = a migration ainda não está no banco. */
async function lerColunas(uid: string): Promise<Colunas | 'ausente' | null> {
  const guardadas = colunas.get(uid);
  if (guardadas) return guardadas;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('grupos_tutorial_visto_em, grupos_tutorial_grupo_visto_em')
      .eq('id', uid)
      .maybeSingle();
    if (error) return error.code === '42703' ? 'ausente' : null;
    if (!data) return null;
    const c = { visto: data.grupos_tutorial_visto_em != null, grupoVisto: data.grupos_tutorial_grupo_visto_em != null };
    colunas.set(uid, c);
    return c;
  } catch {
    return null;
  }
}

function comecar(p: Progresso) {
  progresso = p;
  void salvar(p);
  definirEtapa(montarEtapa(p));
}

async function temPublicacao(grupoId: string): Promise<boolean> {
  try {
    return (await muralGrupo(grupoId)).length > 0;
  } catch {
    return true; // Sem resposta, o motor pula a parada se o mural não estiver na tela.
  }
}

async function montarCompleto(uid: string, rota: RotaGrupos, gidAberto?: string): Promise<Progresso> {
  const grupos = await meusGrupos();
  const grupoId = rota === '/grupo' && gidAberto ? gidAberto : grupos[0]?.id ?? null;
  if (!grupoId) return { uid, variante: 'sem', bloco: 0, parada: 0, grupoId: null, temMural: false };
  return { uid, variante: 'com', bloco: 0, parada: 0, grupoId, temMural: await temPublicacao(grupoId) };
}

const jaFeito = (v: Variante, c: Colunas) => (v === 'so_grupo' ? c.grupoVisto : v === 'sem' ? c.visto : c.visto && c.grupoVisto);

/** O grupo salvo pode não existir mais (ela saiu) enquanto o app estava fechado. */
async function revalidarGrupo(p: Progresso): Promise<Progresso | null> {
  if (!p.grupoId) return p;
  const grupos = await meusGrupos();
  if (grupos.some((g) => g.id === p.grupoId)) return p;
  if (!grupos[0]) return null;
  return { ...p, grupoId: grupos[0].id, temMural: await temPublicacao(grupos[0].id) };
}

async function decidir(rota: RotaGrupos | null, gidAberto?: string) {
  // Uma tela abriu durante outra verificação: o pedido espera a vez, não se perde.
  if (ocupado) {
    if (rota) pedidoNaFila = { rota, gidAberto };
    return;
  }
  ocupado = true;
  try {
    const uid = await getUserId();
    if (!uid) return;
    if (progresso?.uid === uid) return;
    // Trocou de conta (ou o tour perdeu o dono): a parada na tela sai junto. Antes só o
    // `progresso` era zerado e a `etapa` ficava — o overlay seguia aparecendo, sem dono:
    // "Toque para continuar" não avançava nada, nada era gravado e ele voltava em "1 de 10"
    // toda vez que ela entrava no Perfil (vídeo do produto, 13/nov/2026).
    progresso = null;
    if (etapa) definirEtapa(null);

    const salvo = await ler(uid);
    if (!rota && !salvo) return; // Abertura do app sem tutorial pela metade.
    const conhecidas = colunas.get(uid);
    if (!salvo && conhecidas?.visto && (conhecidas.grupoVisto || rota !== '/grupo')) return;

    const c = await lerColunas(uid);
    if (c === null) return; // Sem rede: tenta na próxima abertura ou no próximo foco.
    if (c === 'ausente') {
      await apagar(uid);
      return;
    }

    if (salvo) {
      if (jaFeito(salvo.variante, c)) {
        await apagar(uid);
        return;
      }
      // Fechou o app no meio de um tutorial que ela já estava vendo: conta como visto.
      // Cada tutorial aparece uma vez só — não recomeça na abertura seguinte.
      if (salvo.mostrado) {
        await concluir(salvo);
        return;
      }
      const valido = await revalidarGrupo(salvo);
      if (valido) { comecar(valido); return; }
      // Era `com` e ela ficou sem grupo: conta o tutorial inicial como visto.
      await marcar(uid, { grupos_tutorial_visto_em: new Date().toISOString() });
      await apagar(uid);
      return;
    }

    let nova: Progresso | null = null;
    if (rota && !c.visto) nova = await montarCompleto(uid, rota, gidAberto);
    else if (rota === '/grupo' && gidAberto && !c.grupoVisto) {
      nova = { uid, variante: 'so_grupo', bloco: 0, parada: 0, grupoId: gidAberto, temMural: await temPublicacao(gidAberto) };
    }
    if (nova) comecar(nova);
  } catch (e) {
    console.warn('[gruposTutorial] não deu para decidir agora:', e);
  } finally {
    ocupado = false;
    if (pedidoNaFila) {
      const proximo = pedidoNaFila;
      pedidoNaFila = null;
      void decidir(proximo.rota, proximo.gidAberto);
    }
  }
}

/** Grava como visto o que ela começou a ver e encerra (sem recomeçar depois). A parte da
 *  tela do grupo só conta se ela chegou nela; senão, aparece uma vez quando ela abrir um grupo. */
async function concluir(p: Progresso) {
  const naTelaDoGrupo = blocos(p)[p.bloco]?.rota === '/grupo';
  const agora = new Date().toISOString();
  const campos: Record<string, string> =
    p.variante === 'so_grupo' ? { grupos_tutorial_grupo_visto_em: agora }
      : naTelaDoGrupo
        ? { grupos_tutorial_visto_em: agora, grupos_tutorial_grupo_visto_em: agora }
        : { grupos_tutorial_visto_em: agora };
  if (progresso === p) progresso = null;
  definirEtapa(null);
  await apagar(p.uid);
  await marcar(p.uid, campos);
}

async function marcar(uid: string, campos: Record<string, string | null>) {
  const antes = colunas.get(uid);
  if (antes) {
    colunas.set(uid, {
      visto: 'grupos_tutorial_visto_em' in campos ? campos.grupos_tutorial_visto_em != null : antes.visto,
      grupoVisto: 'grupos_tutorial_grupo_visto_em' in campos ? campos.grupos_tutorial_grupo_visto_em != null : antes.grupoVisto,
    });
  }
  try {
    const { error } = await supabase.from('users').update(campos).eq('id', uid);
    if (error) throw error;
  } catch (e) {
    console.warn('[gruposTutorial] não consegui marcar como visto no servidor:', e);
  }
}

// ── Chamadas das telas e do layout ───────────────────────────────────────────
/** As três telas de grupo chamam ao ganhar foco. */
export function verificarTutorialGrupos(rota: RotaGrupos, gidAberto?: string) {
  void decidir(rota, gidAberto);
}

/** O app abriu: se há tutorial pela metade, ele volta. */
export function retomarTutorialGrupos() {
  void decidir(null);
}

/** O overlay mostrou uma parada: `indice` é a posição dela no trecho desta etapa. */
export function registrarParada(indice: number) {
  if (!progresso || !etapa) return;
  const lista = blocos(progresso);
  const antesDoBloco = lista.slice(0, progresso.bloco).reduce((n, x) => n + x.stops.length, 0);
  const inicio = etapa.antes - antesDoBloco;
  if (progresso.parada === inicio + indice && progresso.mostrado) return;
  progresso.parada = inicio + indice;
  progresso.mostrado = true;
  void salvar(progresso);
}

/** Terminou o trecho desta tela: vai ao próximo ou conclui. */
export async function avancarTutorialGrupos() {
  const p = progresso;
  // Sem dono (não deveria acontecer): tira a parada da tela em vez de deixá-la presa.
  if (!p) { definirEtapa(null); return; }
  if (p.bloco + 1 < blocos(p).length) {
    p.bloco += 1;
    p.parada = 0;
    void salvar(p);
    definirEtapa(montarEtapa(p));
    return;
  }
  progresso = null;
  definirEtapa(null);
  const agora = new Date().toISOString();
  const campos: Record<string, string> =
    p.variante === 'so_grupo' ? { grupos_tutorial_grupo_visto_em: agora }
      : p.variante === 'sem' ? { grupos_tutorial_visto_em: agora }
        : { grupos_tutorial_visto_em: agora, grupos_tutorial_grupo_visto_em: agora };
  void apagar(p.uid);
  void marcar(p.uid, campos);
}

/** Ela saiu da tela do trecho no meio dele (sem concluir): se foi para a tela do próximo
 *  trecho, segue o tour; para qualquer outro lugar, o tutorial conta como visto. */
export function saiuDaTelaDoTutorialGrupos(rotaAtual: string) {
  const p = progresso;
  if (!p) { definirEtapa(null); return; }
  if (blocos(p)[p.bloco + 1]?.rota === rotaAtual) { void avancarTutorialGrupos(); return; }
  void concluir(p);
}

/** Só para o atalho de desenvolvimento do Perfil. */
export async function reverTutorialGrupos() {
  const uid = await getUserId();
  if (!uid) return;
  progresso = null;
  definirEtapa(null);
  colunas.delete(uid);
  await apagar(uid);
  const { error } = await supabase
    .from('users')
    .update({ grupos_tutorial_visto_em: null, grupos_tutorial_grupo_visto_em: null })
    .eq('id', uid);
  if (error) throw error;
}

export function useEtapaTutorialGrupos(): EtapaTutorial | null {
  const [v, setV] = useState(etapa);
  useEffect(() => {
    const f = () => setV(etapa);
    subs.add(f);
    f();
    return () => { subs.delete(f); };
  }, []);
  return v;
}
