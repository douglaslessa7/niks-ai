// ─────────────────────────────────────────────────────────────────────────────
// Cliente da Edge Function `grupos` (fase 3 — grupos de verdade, design NiksGrupoV2).
// O banco não tem política para o app: tudo passa pela função, que confere o JWT e
// devolve as fotos (check-in, banner) como URLs assinadas de 1 h. Fetch direto com o
// token da sessão (padrão do app, como lib/cartasServidor.ts).
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackFora } from './mixpanel/MixpanelProvider';
import { useCallback } from 'react';
import { supabase } from './supabase';
import { useCachedQuery, invalidateCache } from './cache';
import { getUserId, useUserId } from './currentUser';
import type { PontosGanhos } from './cartasServidor';
import type { RefProduto } from './minhaRotina';
import { ajustarMedalhas } from './niveis';

const FN_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/grupos`;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Uma integrante como o grupo a vê (nome curto, foto, nível INDIVIDUAL). */
export type Perfil = {
  user_id: string;
  nome: string;
  foto: string | null;
  pontos: number;
  nivel: number;
  titulo: string;
};

export type Integrante = Perfil & { papel: 'criadora' | 'integrante'; fez_hoje: boolean; voce: boolean };

export type GrupoResumo = {
  id: string;
  nome: string;
  descricao: string | null;
  banner: string;
  banner_path: string | null;
  banner_url: string | null;
  criado_em: string;
  seu_papel: 'criadora' | 'integrante';
  seu_tipo: 'assinante' | 'convidada';
  integrantes: Integrante[];
  feitos_hoje: number;
  total: number;
  sua_posicao_semana: number | null;
  lider_jornada: string | null;
  /** Check-ins do grupo nesta semana (segunda→domingo). */
  checkins_semana: number;
  /** Último check-in de outra integrante (ponto rosa de novidade). */
  ultimo_checkin_outra: string | null;
};

/** Estatísticas do skincare do check-in (migration 20261205120000): tempo, passos e produtos.
 *  `img` já vem como link (catálogo: público; estante/escaneado: assinado pela função). */
export type EstatisticasCheckin = {
  v?: number;
  periodo?: 'am' | 'pm';
  duracao_s?: number;
  n_passos?: number;
  n_produtos?: number;
  passos?: { nome?: string; marca?: string; produto?: string; img?: { url: string } }[];
};

export type ItemMural = {
  /** Check-in (conta no ranking) ou produto compartilhado do scan (3.6, só no mural). */
  tipo: 'checkin' | 'produto';
  id: string;
  checkin_id: string | null;
  compartilhamento_id: string | null;
  user_id: string;
  rotina: 'am' | 'pm' | null;
  dia: string;
  /** Check-in: o título dela ou, sem título, "Rotina da manhã/noite". Produto: o nome dele. */
  titulo: string;
  descricao: string | null;
  hora_exibida: string;
  foto_url: string | null;
  voce: boolean;
  autora: Perfil;
  /** Check-in do fluxo do skincare (1.62); null/ausente nos antigos. */
  estatisticas?: EstatisticasCheckin | null;
};

export type Periodo = 'semana' | 'mes' | 'ano' | 'geral';
export type LinhaRanking = Perfil & { posicao: number; checkins: number; semanas_vencidas: number; voce: boolean };
export type LinhaJornada = Perfil & { voce: boolean };

export type PerfilGrupos = Perfil & {
  checkins: number;
  dias_ativos: number;
  /** Dias de sessão seguidos com check-in (terminando hoje ou ontem). */
  dias_seguidos: number;
  grupos: number;
  /** Check-ins no mês pedido (até 2 por dia) — "18 check-ins" do 81a/81b. Ausente antes da migration 20261111120000. */
  checkins_mes?: number;
  /** Mês do 1º check-in ('AAAA-MM-01') — até onde a seta volta. */
  primeiro_mes: string | null;
  mes: string;
  /** `checkins`: os do dia (manhã/noite), para abrir o detalhe. Ausente antes da migration 20261201120000. */
  dias: { dia: string; foto_url: string | null; checkins?: { id: string; rotina: 'am' | 'pm' }[] }[];
};

/** Um check-in para a tela de detalhes (migration 20261201120000, ação `checkin_detalhe`). */
export type CheckinDetalhe = {
  checkin_id: string;
  user_id: string;
  rotina: 'am' | 'pm';
  dia: string;
  titulo: string;
  descricao: string | null;
  hora_exibida: string;
  foto_url: string | null;
  voce: boolean;
  /** Um grupo em comum (a denúncia precisa dele); null no próprio check-in sem grupo. */
  grupo_id: string | null;
  autora: Perfil;
  estatisticas?: EstatisticasCheckin | null;
};

export type ConviteInfo = {
  valido: boolean;
  grupo_id?: string;
  nome?: string;
  banner?: string;
  banner_url?: string | null;
  convidou?: string;
};

export type Recusa = { ok: false; motivo: string };

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('sem sessão');
  const resp = await fetch(FN_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error ?? `HTTP ${resp.status}`);
  if (json?.motivo === 'filtro') trackFora('foto_bloqueada_filtro', { categoria: json.categoria });
  return ajustarMedalhas(json) as T;   // níveis = medalhas, mesmo antes da migration (lib/niveis.ts)
}

// ── Leituras ────────────────────────────────────────────────────────────────────
export const meusGrupos = () => chamar<{ grupos: GrupoResumo[] }>({ acao: 'meus_grupos' }).then((r) => r.grupos);
// Detalhe de check-in em memória (12/nov/2026, "abrir o check-in tem que ser instantâneo"):
// o mural do grupo já traz tudo o que a tela de detalhes mostra, então quem toca no item
// semeia aqui e a tela abre pronta; a leitura do servidor só confere/atualiza por baixo.
// Também no disco (12/nov/2026, "ao fechar e abrir o NIKS a foto demora"): a memória zerava a
// cada abertura do app; agora volta do AsyncStorage (os últimos 120). O link da foto pode ter
// vencido (1 h), mas a foto sai do cache do expo-image pela chave estável (lib/fotosRapidas) e a
// leitura do servidor traz o link novo.
const detalhesEmMemoria = new Map<string, CheckinDetalhe>();
const CHAVE_DETALHES = 'grupos:detalhes:v1';
const MAX_DETALHES = 120;
let gravar: ReturnType<typeof setTimeout> | null = null;
function guardarDetalhes() {
  if (gravar) clearTimeout(gravar);
  gravar = setTimeout(() => {
    gravar = null;
    const lista = [...detalhesEmMemoria.values()].slice(-MAX_DETALHES);
    AsyncStorage.setItem(CHAVE_DETALHES, JSON.stringify(lista)).catch(() => {});
  }, 800);
}
function lembrarDetalhe(c: CheckinDetalhe) {
  detalhesEmMemoria.delete(c.checkin_id);   // vai para o fim (mais recente)
  detalhesEmMemoria.set(c.checkin_id, c);
  if (detalhesEmMemoria.size > MAX_DETALHES) detalhesEmMemoria.delete(detalhesEmMemoria.keys().next().value as string);
  guardarDetalhes();
}
AsyncStorage.getItem(CHAVE_DETALHES).then((t) => {
  if (!t) return;
  for (const c of JSON.parse(t) as CheckinDetalhe[]) if (c?.checkin_id && !detalhesEmMemoria.has(c.checkin_id)) detalhesEmMemoria.set(c.checkin_id, c);
}).catch(() => {});
export const checkinDetalheEmMemoria = (checkinId: string) => detalhesEmMemoria.get(checkinId) ?? null;

// A foto de um check-in que ainda não está na memória (o calendário só tem a foto): o detalhe
// abre já mostrando a foto, e o resto entra quando o servidor responde.
const fotosConhecidas = new Map<string, string>();
export const lembrarFotoDoCheckin = (checkinId: string, url: string | null | undefined) => { if (url) fotosConhecidas.set(checkinId, url); };
export const fotoConhecidaDoCheckin = (checkinId: string) => fotosConhecidas.get(checkinId) ?? null;

/** Busca por baixo os detalhes que faltam (3 de cada vez), para o toque abrir pronto. */
const buscando = new Set<string>();
export async function preaquecerDetalhes(ids: string[]) {
  const faltam = ids.filter((id) => !detalhesEmMemoria.has(id) && !buscando.has(id));
  faltam.forEach((id) => buscando.add(id));
  const fila = [...faltam];
  const um = async () => {
    for (let id = fila.shift(); id; id = fila.shift()) {
      await checkinDetalhe(id).catch(() => null);
      buscando.delete(id);
    }
  };
  await Promise.all([um(), um(), um()]);
}
/** Um item do mural vira o detalhe dele (mesmos campos; o grupo é o do mural). */
export function semearCheckinDetalhe(it: ItemMural, grupoId: string) {
  if (it.tipo !== 'checkin' || !it.checkin_id || detalhesEmMemoria.has(it.checkin_id)) return;
  lembrarDetalhe({
    checkin_id: it.checkin_id, user_id: it.user_id, rotina: it.rotina ?? 'am', dia: it.dia,
    titulo: it.titulo, descricao: it.descricao, hora_exibida: it.hora_exibida, foto_url: it.foto_url,
    voce: it.voce, grupo_id: grupoId, autora: it.autora, estatisticas: it.estatisticas ?? null,
  });
}
/** null = não existe mais ou ela não pode ver (moderação, bloqueio, saiu do grupo). */
export const checkinDetalhe = (checkinId: string) =>
  chamar<{ checkin: CheckinDetalhe }>({ acao: 'checkin_detalhe', checkin_id: checkinId })
    .then((r) => { lembrarDetalhe(r.checkin); return r.checkin; })
    .catch((e: Error) => {
      if (/não encontrado|HTTP 404/.test(e.message)) { detalhesEmMemoria.delete(checkinId); guardarDetalhes(); return null; }
      throw e;
    });
export const grupoDetalhe = (grupoId: string) => chamar<{ grupo: GrupoResumo }>({ acao: 'grupo', grupo_id: grupoId }).then((r) => r.grupo);
export const muralGrupo = (grupoId: string, antes?: string) =>
  chamar<{ itens: ItemMural[] }>({ acao: 'mural', grupo_id: grupoId, antes }).then((r) => r.itens);
export const rankingGrupo = (grupoId: string, periodo: Periodo) =>
  chamar<{ lista: LinhaRanking[] }>({ acao: 'ranking', grupo_id: grupoId, periodo }).then((r) => r.lista);
export const jornadaGrupo = (grupoId: string) =>
  chamar<{ lista: LinhaJornada[]; niveis: { n: number; titulo: string; pontos: number }[] | null; icone: { passo: number; incremento: number } | null }>(
    { acao: 'jornada', grupo_id: grupoId });
/** `mes` = 'AAAA-MM-01'. */
export const perfilGrupos = (mes?: string) => chamar<{ perfil: PerfilGrupos }>({ acao: 'perfil', mes }).then((r) => r.perfil);
export const validarConvite = (token: string) => chamar<ConviteInfo>({ acao: 'validar_convite', token });

// ── Ações ───────────────────────────────────────────────────────────────────────
export const criarGrupo = (p: { nome: string; descricao?: string; banner?: string; banner_path?: string | null }) =>
  chamar<{ ok: true; grupo_id: string } | Recusa>({ acao: 'criar', ...p });
export const conviteDoGrupo = (grupoId: string) =>
  chamar<{ ok: true; token: string; codigo: string; link: string } | Recusa>({ acao: 'convite', grupo_id: grupoId });
export const entrarNoGrupo = (token: string) =>
  chamar<{ ok: true; grupo_id: string; nome?: string; ja_era?: boolean } | Recusa>({ acao: 'entrar', token });
async function semLogin<T>(body: Record<string, unknown>, tetoMs: number, token?: string): Promise<T | null> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tetoMs);
  try {
    const resp = await fetch(FN_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ANON_KEY}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controle.signal,
    });
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(relogio);
  }
}
/** Sem login. `null` = sem resposta. */
export const validarCodigo = (codigo: string) =>
  semLogin<{ valido: boolean; nome?: string; convidou?: string; cheio?: boolean; motivo?: string }>({ acao: 'validar_codigo', codigo }, 8000);
/** Sem login. Sem resposta conta como desligada: a tela de código não aparece. */
export const statusApp = () => semLogin<{ ligada: boolean; versao_minima: string | null }>({ acao: 'convidada_status' }, 3000);

// Fase 9: conta da lista de teste vê o modo convidada. Sem sessão o servidor não sabe quem é,
// então o aparelho lembra, para o onboarding de uma conta nova. Só muda o que aparece na tela.
const APARELHO_DE_TESTE = 'niks_convidada_aparelho_teste';

export async function convidadaLigada(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await semLogin<{ ligada: boolean; teste?: boolean }>({ acao: 'convidada_status' }, 3000, session?.access_token);
  if (session && r) {
    if (r.teste) await AsyncStorage.setItem(APARELHO_DE_TESTE, '1').catch(() => {});
    else await AsyncStorage.removeItem(APARELHO_DE_TESTE).catch(() => {});
  }
  if (r?.ligada) return true;
  if (session) return false;
  return (await AsyncStorage.getItem(APARELHO_DE_TESTE).catch(() => null)) === '1';
}
export const estadoAcesso = () =>
  chamar<{ estado: 'assinante' | 'convidada' | 'sem_acesso' }>({ acao: 'estado' }).then((r) => r.estado);
export const entrarComCodigo = (codigo: string) =>
  chamar<{ ok: true; grupo_id: string; nome?: string; ja_era?: boolean } | Recusa>({ acao: 'entrar_codigo', codigo });
export const sairDoGrupo = (grupoId: string) => chamar<{ ok: boolean; motivo?: string }>({ acao: 'sair', grupo_id: grupoId });
export const removerIntegrante = (grupoId: string, userId: string) =>
  chamar<{ ok: boolean; motivo?: string }>({ acao: 'remover', grupo_id: grupoId, user_id: userId });
export const bloquear = (userId: string, sim = true) => chamar<{ ok: boolean }>({ acao: 'bloquear', user_id: userId, bloquear: sim });
export const denunciar = (p: { tipo: 'foto' | 'integrante'; grupo_id: string; user_id?: string; checkin_id?: string; compartilhamento_id?: string; motivo?: string }) =>
  chamar<{ ok: boolean; motivo?: string }>({ acao: 'denunciar', ...p });

/** Sobe uma foto (jpeg em base64) para o bucket privado por URL assinada; devolve o caminho. */
export async function subirFoto(tipo: 'checkin' | 'banner', base64: string): Promise<string> {
  const u = await chamar<{ path: string; token: string }>({ acao: 'upload_url', tipo });
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const { error } = await supabase.storage.from('grupos').uploadToSignedUrl(u.path, u.token, bytes.buffer, { contentType: 'image/jpeg' });
  if (error) throw error;
  return u.path;
}

// Regras novas das cartas (05/nov/2026): o check-in registra o skincare do período (a
// carta do dia, se for o 1º skincare de hoje → `carta_id`) e dá os pontos sem carta
// (`pontos`: o do skincare sem carta e o do check-in, 1/dia).
export const publicarCheckin = (p: { foto_path: string; rotina: 'am' | 'pm'; grupos: string[]; hora_exibida?: string; titulo?: string; descricao?: string;
  /** Do fluxo do skincare: tempo e passos, com a REFERÊNCIA de cada produto (o banco resolve a foto). */
  estatisticas?: { duracao_s: number; passos: { nome: string | null; marca: string | null; produto: string | null; ref: RefProduto | null }[] } }) =>
  chamar<{ ok: true; checkin_id: string; dia: string; grupos: string[]; carta_id: string | null; pontos?: PontosGanhos[] } | Recusa>({ acao: 'checkin', ...p });

/** Produto do scan no mural dos grupos escolhidos (80o). `carta_id`: a do produto_grupo, 1 por dia. */
export const compartilharProduto = (productScanId: string, grupos: string[]) =>
  chamar<{ ok: true; grupos: string[]; novos: number; carta_id: string | null; pontos?: PontosGanhos | null } | Recusa>({ acao: 'compartilhar', product_scan_id: productScanId, grupos });

// ── Cache (revalida a cada foco) ────────────────────────────────────────────────
export const chaveMeusGrupos = (uid: string) => `grupos:meus:${uid}`;
export const chavePerfilGrupos = (uid: string, mes: string) => `grupos:perfil:${uid}:${mes}`;
export const chaveGrupo = (uid: string, gid: string) => `grupos:grupo:${uid}:${gid}`;

export function useMeusGrupos() {
  const uid = useUserId();
  const fetcher = useCallback(() => meusGrupos(), []);
  return useCachedQuery<GrupoResumo[]>(uid ? chaveMeusGrupos(uid) : null, fetcher, { staleMs: 0, enabled: Boolean(uid) });
}

/** Depois de criar/entrar/sair/check-in: as telas de grupo relêem no próximo foco. */
export async function invalidarGrupos(gid?: string) {
  const uid = await getUserId();
  if (!uid) return;
  invalidateCache(chaveMeusGrupos(uid));
  if (gid) invalidateCache(chaveGrupo(uid, gid));
}

// ── Moderação (Parte B, Fase 2) ──────────────────────────────────────────────────
export type DenunciaAberta = {
  id: string; tipo: 'foto' | 'integrante'; motivo: string | null; criado_em: string; grupo: string | null;
  denunciante: string | null; alvo: string | null; foto_url: string | null;
};
export type DecisaoDenuncia = 'manter' | 'apagar' | 'remover_usuaria';

export const produtoCompartilhado = (grupoId: string, compartilhamentoId: string) =>
  chamar<{ ok: true; resultado: Record<string, unknown>; foto_url: string | null } | Recusa>({ acao: 'produto_compartilhado', grupo_id: grupoId, compartilhamento_id: compartilhamentoId });
export const moderarFotoPerfil = (base64: string) =>
  chamar<{ ok: true } | Recusa>({ acao: 'moderar_perfil', base64 });
export const denunciasAbertas = () =>
  chamar<{ ok: true; denuncias: DenunciaAberta[] } | Recusa>({ acao: 'denuncias' });
export const revisarDenuncia = (denunciaId: string, decisao: DecisaoDenuncia) =>
  chamar<{ ok: true } | Recusa>({ acao: 'revisar_denuncia', denuncia_id: denunciaId, decisao });
