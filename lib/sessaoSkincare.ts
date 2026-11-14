// ─────────────────────────────────────────────────────────────────────────────
// Sessão de skincare (12/nov/2026, build 1.62): o que a lista do "Iniciar skincare"
// (`(app)/skincare`) passa para a tela do cronômetro (`(app)/skincare-sessao`) — o período,
// os passos daquele skincare e a hora em que ela começou. Viaja por aqui, não por parâmetro
// de rota. O início também fica no aparelho: se o app fechar no meio, tocar em "Iniciar
// skincare" de novo (mesmo período, mesmo dia, até 3 h depois) retoma o mesmo cronômetro.
// No fim, `descricaoDoCheckin` monta a descrição automática do Novo check-in.
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dateKey, sessionDate, type RoutinePeriod, type StepKey } from './routineProgress';
import type { TipoPasso } from './tipoPasso';
import type { RefProduto } from './minhaRotina';

export type PassoSessao = {
  id: StepKey;
  /** Nome do passo ("Limpeza"); pode faltar quando o passo é só o produto. */
  nome: string | null;
  /** Marca e nome do produto do passo; os dois null sem produto. */
  marca: string | null;
  produto: string | null;
  /** Foto do produto (recorte sem fundo quando pronto) para a lista da sessão. */
  img: string | null;
  /** Ícone do passo sem produto (o mesmo da lista). */
  tipo: TipoPasso | null;
  /** O que a aba Rotina mostra ao abrir o passo: a instrução (ou o "como usar" junto), os
   *  dias do passo não diário e a observação da IA sobre o produto. Opcionais: uma sessão
   *  salva antes deles (12/nov/2026) vem sem. */
  instrucao?: string | null;
  dias?: string[] | null;
  aviso?: { nivel: 'leve' | 'forte'; texto: string } | null;
  /** O produto na estante/catálogo/scan: vai nas estatísticas do check-in (o servidor resolve a foto). */
  ref?: RefProduto | null;
};

/** "CeraVe Gel de Limpeza" (sem "·": na descrição o "·" separa os passos). */
const produtoPorExtenso = (p: PassoSessao) => [p.marca, p.produto].filter(Boolean).join(' ') || null;

export type Sessao = {
  periodo: RoutinePeriod;
  /** Dia da sessão (vira às 04:00), `AAAA-MM-DD`. */
  dia: string;
  /** `Date.now()` do início: o cronômetro é sempre agora − início. */
  inicio: number;
  passos: PassoSessao[];
};

const CHAVE = 'skincare:sessao';
const RETOMAR_ATE_MS = 3 * 60 * 60 * 1000;

let atual: Sessao | null = null;

/** Começa (ou retoma) a sessão do período. */
export async function comecarSessao(periodo: RoutinePeriod, passos: PassoSessao[], agora = Date.now()): Promise<Sessao> {
  const dia = dateKey(sessionDate(new Date(agora)));
  const salva = atual ?? (await lerSalva());
  const retoma = salva && salva.periodo === periodo && salva.dia === dia && agora - salva.inicio < RETOMAR_ATE_MS && agora >= salva.inicio;
  atual = { periodo, dia, inicio: retoma ? salva!.inicio : agora, passos };
  await AsyncStorage.setItem(CHAVE, JSON.stringify(atual)).catch(() => {});
  return atual;
}

export function sessaoAtual(): Sessao | null {
  return atual;
}

/** Concluiu ou desistiu: some da memória e do aparelho. */
export async function encerrarSessao(): Promise<void> {
  atual = null;
  await AsyncStorage.removeItem(CHAVE).catch(() => {});
}

/** O skincare que ACABOU de ser concluído: vira as estatísticas do check-in (prévia e publicar). */
export type SkincareConcluido = { periodo: RoutinePeriod; duracao_s: number; passos: PassoSessao[]; em: number };
let ultimo: SkincareConcluido | null = null;
export function guardarUltimoSkincare(s: Omit<SkincareConcluido, 'em'>) { ultimo = { ...s, em: Date.now() }; }
/** Qualquer skincare concluído há menos de 3 h que ainda não virou check-in (ex.: ela não tinha grupo). */
export function skincareSemCheckin(): SkincareConcluido | null {
  return ultimo && Date.now() - ultimo.em < RETOMAR_ATE_MS ? ultimo : null;
}

/** Virou check-in (ou ela dispensou): não oferece de novo. */
export function limparUltimoSkincare() { ultimo = null; }

/** O último skincare concluído do período, se foi há menos de 3 h. */
export function ultimoSkincare(periodo: RoutinePeriod): SkincareConcluido | null {
  return ultimo && ultimo.periodo === periodo && Date.now() - ultimo.em < RETOMAR_ATE_MS ? ultimo : null;
}

/** O X da câmera do check-in (fluxo do skincare) devolve à comemoração (90a): a sessão lê ao voltar. */
let voltouDoCheckin = false;
export function marcarVoltaDoCheckin() { voltouDoCheckin = true; }
export function consumirVoltaDoCheckin(): boolean { const v = voltouDoCheckin; voltouDoCheckin = false; return v; }

async function lerSalva(): Promise<Sessao | null> {
  try {
    const raw = await AsyncStorage.getItem(CHAVE);
    const s = raw ? JSON.parse(raw) : null;
    return s && typeof s.inicio === 'number' && (s.periodo === 'am' || s.periodo === 'pm') && Array.isArray(s.passos) ? s : null;
  } catch {
    return null;
  }
}

/** Cronômetro: `mm:ss`; depois de 1 h, `h:mm:ss`. */
export function formatarCronometro(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dois = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}

/** "12 min", "1 h 05 min"; abaixo de 1 minuto, "menos de 1 min". */
export function duracaoPorExtenso(ms: number): string {
  const min = Math.round(Math.max(0, ms) / 60000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

const LIMITE_DESCRICAO = 280; // o mesmo do campo e do servidor (`grupos`, ação `checkin`)

/**
 * Descrição automática do Novo check-in: o tempo e a rotina usada, em uma linha.
 * "Skincare noturno em 12 min · 1. Limpeza: CeraVe Gel Espuma · 2. Sérum: …"
 * Passo sem produto vai só com o nome. Passa de 280 caracteres: corta no último passo
 * inteiro e termina em "…".
 */
export function descricaoDoCheckin(s: Sessao, duracaoMs: number): string {
  const cabeca = `${s.periodo === 'am' ? 'Skincare matinal' : 'Skincare noturno'} em ${duracaoPorExtenso(duracaoMs)}`;
  const partes = s.passos.map((p, i) => {
    const nome = p.nome?.trim() || '';
    const prod = produtoPorExtenso(p);
    const corpo = nome && prod ? `${nome}: ${prod}` : nome || prod || 'Passo';
    return `${i + 1}. ${corpo}`;
  });
  let texto = cabeca;
  for (const parte of partes) {
    const proximo = `${texto} · ${parte}`;
    if (proximo.length > LIMITE_DESCRICAO - 2) return `${texto} · …`;
    texto = proximo;
  }
  return texto;
}
