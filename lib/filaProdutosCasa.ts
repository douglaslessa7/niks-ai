// ─────────────────────────────────────────────────────────────────────────────
// Fila dos PRODUTOS DE CASA do pós-compra v2 (26/nov/2026, decisão do produto). Ela escaneia
// os produtos ANTES de ter conta (`(scan)/pc-camera`); esse scan substitui o que a aba Rotina
// pede no primeiro acesso. As fotos não podem se perder: ficam NO APARELHO até o lote
// "Montar minha rotina" ser enviado de verdade — o mesmo envio da Rotina (`enviarLote` +
// `iniciarLote`, função `montar-rotina-com-produtos`), sem backend novo.
//
//   • Onde: `Documents/produtos-casa/` (a pasta que o iOS não limpa sozinho). Pode entrar no
//     backup do iCloud — aceito pelo produto: são fotos de produto, no máximo 7 dias, apagadas
//     depois do envio. Fora do registro da compra (lib/compraPendente.ts): a limpeza dele não
//     toca aqui. Guarda só o NOME de cada arquivo: o caminho absoluto do app muda quando ele é
//     atualizado no iOS.
//   • De quem: a fila nasce sem conta e é LIGADA à conta dela no cadastro / no login de quem
//     já tinha conta (lib/concluirCompra.ts) ou na saída da ex-convidada
//     (components/boasVindas/sairDasBoasVindas.ts). Outra conta no aparelho → a fila é apagada,
//     nunca enviada para ela.
//   • Quando envia: com a conta ligada E a rotina base gravada (`protocolos`), porque o servidor
//     monta a rotina final a partir dela. Tenta na tela de espera, a cada abertura/volta do app
//     ((app)/_layout), ao abrir a aba Rotina e quando o scan novo da ex-convidada grava a rotina
//     base (lib/generateProtocol.ts).
//       – deu certo → `users.rotina_intro_status = 'escanear'` (a Rotina não pede o scan de novo)
//         e a fila é apagada;
//       – falhou → fica, com o número de tentativas, e tenta de novo na próxima vez;
//       – teto do dia (ela já montou a rotina pela aba Rotina hoje) → a da Rotina vale, a fila
//         é apagada (se o lote recusado era o NOSSO, já enviado antes de o app fechar, conta
//         como enviado).
//   • Validade: 7 dias (como a compra adiada). Passou disso, apaga — a Rotina volta a pedir o
//     scan normalmente (`rotina_intro_status` continua null).
// Enquanto há fila desta conta, a aba Rotina mostra "Estamos montando sua rotina com os seus
// produtos" (components/rotina/MontandoComProdutos.tsx) no lugar da pergunta de 1º acesso.
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { create } from 'zustand';
import { supabase } from './supabase';
import { invalidateCache } from './cache';
import { trackFora } from './mixpanel/MixpanelProvider';
import { BUCKET_LOTES, MAX_PRODUTOS_LOTE, enviarLote, type ProdutoLote } from './loteProdutos';
import { iniciarLote, TetoDoDiaError } from './rotinaLotes';

const CHAVE = 'pos_compra_produtos_casa';
const PASTA = 'produtos-casa';
export const VALIDADE_FILA_MS = 7 * 24 * 60 * 60 * 1000;

type ProdutoNaFila = { combinada: string; frente: string | null };
type Fila = {
  v: 1;
  criadaEm: string;
  /** A conta dela (null = ainda sem conta: antes do cadastro). */
  userId: string | null;
  produtos: ProdutoNaFila[];
  tentativas: number;
  ultimaFalhaEm: string | null;
  /** Lote já criado no servidor (o app pode fechar antes de apagar a fila). */
  loteId: string | null;
  /** Ex-convidada: só envia com uma rotina base gravada DEPOIS disto (a do scan novo que ela
   *  faz ao sair das boas-vindas), não com a antiga da conta. */
  rotinaDepoisDe?: string | null;
};

/** Estado para a tela (aba Rotina): há fila pendente, e de qual conta. */
export const useFilaCasa = create<{ carregada: boolean; pendente: boolean; userId: string | null; miniaturas: string[] }>(() => ({
  carregada: false, pendente: false, userId: null, miniaturas: [],
}));
function publicar(f: Fila | null) {
  const miniaturas: string[] = [];
  for (const p of f?.produtos ?? []) {
    try {
      const a = arquivo(p.frente ?? p.combinada);
      if (a.exists) miniaturas.push(a.uri);
    } catch { /* segue */ }
  }
  useFilaCasa.setState({ carregada: true, pendente: !!f, userId: f?.userId ?? null, miniaturas });
}

// Escritas em fila (como lib/compraPendente.ts): duas atualizações juntas não se apagam.
let ordem: Promise<unknown> = Promise.resolve();
function emOrdem<T>(f: () => Promise<T>): Promise<T> {
  const p = ordem.then(f, f);
  ordem = p.catch(() => {});
  return p;
}

function pasta(): Directory {
  const d = new Directory(Paths.document, PASTA);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}
const arquivo = (nome: string) => new File(pasta(), nome);

async function ler(): Promise<Fila | null> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE);
    const f = bruto ? JSON.parse(bruto) : null;
    return f?.v === 1 ? (f as Fila) : null;
  } catch {
    return null;
  }
}
async function gravar(f: Fila): Promise<void> {
  await AsyncStorage.setItem(CHAVE, JSON.stringify(f));
  publicar(f);
}
async function apagar(): Promise<void> {
  try { await AsyncStorage.removeItem(CHAVE); } catch { /* segue */ }
  try {
    const d = new Directory(Paths.document, PASTA);
    if (d.exists) d.delete();
  } catch (e) {
    console.warn('[filaProdutosCasa] não apagou a pasta:', e);
  }
  publicar(null);
}

/** Lê o estado guardado (para a tela saber se há fila). */
export function carregarFila(): Promise<void> {
  return emOrdem(async () => { publicar(await ler()); });
}

/** "Concluir" na câmera do pós-compra: guarda as imagens do lote na fila (troca uma anterior). */
export function guardarNaFila(lote: ProdutoLote[]): Promise<number> {
  return emOrdem(async () => {
    await apagar();
    const t = Date.now();
    const copiar = (uri: string | null | undefined, nome: string): string | null => {
      if (!uri) return null;
      try {
        new File(uri).copy(arquivo(nome));
        return nome;
      } catch (e) {
        console.warn('[filaProdutosCasa] não copiou a imagem:', e);
        return null;
      }
    };
    const produtos: ProdutoNaFila[] = [];
    lote.slice(0, MAX_PRODUTOS_LOTE).forEach((p, i) => {
      const combinada = copiar(p.combinadaUri, `${t}-${i + 1}.jpg`);
      if (combinada) produtos.push({ combinada, frente: copiar(p.frenteJpgUri, `${t}-${i + 1}-frente.jpg`) });
    });
    if (!produtos.length) return 0;
    await gravar({ v: 1, criadaEm: new Date(t).toISOString(), userId: null, produtos, tentativas: 0, ultimaFalhaEm: null, loteId: null });
    return produtos.length;
  });
}

/** "Não tenho produtos agora" (ou o fluxo de sempre): não há fila. */
export function descartarFila(): Promise<void> {
  return emOrdem(apagar);
}

/** Liga a fila à conta dela. Fila de OUTRA conta → apagada (nunca vai para esta).
 *  `esperarRotinaNova` (ex-convidada): só envia com a rotina base gravada a partir de agora. */
export function ligarFilaAConta(uid: string, opcoes?: { esperarRotinaNova?: boolean }): Promise<void> {
  return emOrdem(async () => {
    const f = await ler();
    if (!f) return;
    if (!f.userId) {
      await gravar({ ...f, userId: uid, rotinaDepoisDe: opcoes?.esperarRotinaNova ? new Date().toISOString() : null });
      return;
    }
    if (f.userId !== uid) {
      trackFora('produtos_casa_descartados', { motivo: 'outra_conta' });
      await apagar();
    }
  });
}

async function temRotinaBase(uid: string, depoisDe?: string | null): Promise<boolean> {
  let q = supabase.from('protocolos').select('id').eq('user_id', uid);
  if (depoisDe) q = q.gte('updated_at', depoisDe);
  const { data, error } = await q.limit(1);
  if (error) throw error;
  return !!data?.length;
}

async function marcarEscaneou(uid: string): Promise<void> {
  const { error } = await supabase.from('users').update({ rotina_intro_status: 'escanear' })
    .eq('id', uid).is('rotina_intro_status', null);
  if (error) console.warn('[filaProdutosCasa] rotina_intro_status não gravou:', error.message);
  invalidateCache(`lotehoje:${uid}`);
  invalidateCache(`rotinaintro:${uid}`);
}

export type ResultadoFila = 'sem_fila' | 'sem_conta' | 'sem_rotina_base' | 'enviada' | 'falhou' | 'vencida' | 'teto_do_dia';

let emAndamento: Promise<ResultadoFila> | null = null;

/** Tenta enviar a fila desta conta (uma tentativa por vez). Nunca lança. */
export function tentarEnviarFila(uidConhecido?: string | null): Promise<ResultadoFila> {
  if (!emAndamento) {
    const p = enviar(uidConhecido).finally(() => { if (emAndamento === p) emAndamento = null; });
    emAndamento = p;
  }
  return emAndamento;
}

async function enviar(uidConhecido?: string | null): Promise<ResultadoFila> {
  try {
    const f = await emOrdem(ler);
    publicar(f);
    if (!f) return 'sem_fila';
    const uid = uidConhecido ?? (await supabase.auth.getSession()).data.session?.user?.id ?? null;
    if (!uid || !f.userId) return 'sem_conta';
    if (f.userId !== uid) {
      trackFora('produtos_casa_descartados', { motivo: 'outra_conta' });
      await emOrdem(apagar);
      return 'sem_conta';
    }
    if (Date.now() - Date.parse(f.criadaEm) > VALIDADE_FILA_MS) {
      trackFora('produtos_casa_descartados', { motivo: 'vencida', tentativas: f.tentativas });
      await emOrdem(apagar);
      return 'vencida';
    }
    // O lote já tinha sido criado (o app fechou antes de apagar a fila): não envia de novo.
    if (f.loteId) {
      await marcarEscaneou(uid);
      await emOrdem(apagar);
      return 'enviada';
    }
    if (!(await temRotinaBase(uid, f.rotinaDepoisDe))) return 'sem_rotina_base';

    const produtos: ProdutoLote[] = f.produtos
      .filter((p) => { try { return arquivo(p.combinada).exists; } catch { return false; } })
      .map((p, i) => {
        const combinadaUri = arquivo(p.combinada).uri;
        const frente = p.frente && arquivo(p.frente).exists ? arquivo(p.frente).uri : null;
        return { id: `casa${i + 1}`, frenteUri: frente ?? combinadaUri, rotuloUri: null, combinadaUri, frenteJpgUri: frente ?? undefined };
      });
    if (!produtos.length) {
      trackFora('produtos_casa_descartados', { motivo: 'sem_arquivos' });
      await emOrdem(apagar);
      return 'sem_fila';
    }

    // SÓ __DEV__: `Documents/niks-dev-falhar-envio-produtos` simula o envio falhando (para testar
    // a fila voltando na próxima abertura). Em Release não existe.
    if (__DEV__ && new File(Paths.document, 'niks-dev-falhar-envio-produtos').exists) {
      throw new Error('falha simulada (dev)');
    }
    let enviados: string[] = [];
    try {
      const { caminhos } = await enviarLote(uid, produtos);
      enviados = caminhos;
      const loteId = await iniciarLote(caminhos, produtos.map(() => false));
      await emOrdem(async () => { const g = await ler(); if (g) await gravar({ ...g, loteId }); });
      await marcarEscaneou(uid);
      trackFora('lote_enviado', { qtd_produtos: produtos.length, com_rotulo: 0, origem: 'pos_compra_v2', tentativa: f.tentativas + 1 });
      await emOrdem(apagar);
      return 'enviada';
    } catch (e) {
      const todas = enviados.flatMap((c) => [c, c.replace(/\.jpg$/, '-frente.jpg')]);
      if (todas.length) void supabase.storage.from(BUCKET_LOTES).remove(todas);
      if (e instanceof TetoDoDiaError) {
        // Lote de hoje já existe. Se o nosso já tinha sido criado (o app fechou antes de apagar a
        // fila), ela está enviada; senão, ela montou pela aba Rotina e aquele vale.
        if (f.loteId) await marcarEscaneou(uid);
        trackFora(f.loteId ? 'lote_enviado' : 'lote_erro', f.loteId
          ? { qtd_produtos: produtos.length, com_rotulo: 0, origem: 'pos_compra_v2', retomado: true }
          : { qtd_produtos: produtos.length, etapa: 'teto_do_dia', origem: 'pos_compra_v2' });
        await emOrdem(apagar);
        return f.loteId ? 'enviada' : 'teto_do_dia';
      }
      throw e;
    }
  } catch (e) {
    console.warn('[filaProdutosCasa] envio falhou (fica para a próxima):', e);
    await emOrdem(async () => {
      const g = await ler();
      if (g) await gravar({ ...g, tentativas: g.tentativas + 1, ultimaFalhaEm: new Date().toISOString() });
    });
    trackFora('lote_erro', { etapa: 'envio', origem: 'pos_compra_v2' });
    return 'falhou';
  }
}
