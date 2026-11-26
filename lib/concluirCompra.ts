// ─────────────────────────────────────────────────────────────────────────────
// Termina a conta de quem pagou (09/nov/2026): análise completa, perfil + scan, rotina e
// boas-vindas. Saiu de dentro da tela de espera para poder continuar em segundo plano.
// Depois de 3 falhas ela pode entrar no app (`adiarCompraPendente`); a abertura do app
// não volta mais para a tela de espera nesse caso e tenta de novo por trás.
// O registro continua no aparelho até dar certo, ou por 7 dias depois de adiar.
// ─────────────────────────────────────────────────────────────────────────────
import { useAppStore } from '../store/onboarding';
import { supabase } from './supabase';
import { invalidateCache } from './cache';
import { trackFora } from './mixpanel/MixpanelProvider';
import {
  aguardarAnaliseCompleta, iniciarAnaliseCompleta, saveOnboardingProtocol, usarAnaliseRapidaRestaurada, usarRotinaRestaurada,
} from './onboardingPrefetch';
import { concluirBoasVindas } from './boasVindas';
import { limparPosCompraV2 } from './posCompraV2';
import { ligarFilaAConta, tentarEnviarFila } from './filaProdutosCasa';
import { comprovantesApple, dataDaCompraMaisRecente } from './comprovanteApple';
import {
  apagarCompraPendente, atualizarCompraPendente, lerCompraPendente, restaurarCompraPendente, type CompraPendente,
} from './compraPendente';

export const FALHAS_PARA_ENTRAR = 3;
export const ESPERA_SEGUNDO_PLANO_MS = 2 * 60 * 1000;
const TENTATIVAS_POR_ABERTURA = 2;
const VALIDADE_ADIADA_MS = 7 * 24 * 60 * 60 * 1000;

export type FimDaCompra = { status: 'ok' | 'sem_sessao' | 'falhou' | 'interrompida'; falhas: number };

// Uma execução por vez: a tela e o segundo plano nunca salvam juntos.
let emAndamento: Promise<FimDaCompra> | null = null;
// Geração (18/nov/2026): a tela de espera abandona uma execução que estourou o teto
// (`abandonarExecucao`, lib/esperaDaRotina.ts). A abandonada não grava mais nada; a próxima
// começa do zero.
let geracao = 0;
// Sem registro no aparelho, o scan já salvo e as falhas ficam só na memória.
let scanSalvoMem: string | null = null;
let rotinaSalvaMem = false;
let falhasMem = 0;

async function executar(): Promise<FimDaCompra> {
  const minha = geracao;
  const abandonada = () => minha !== geracao;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return { status: 'sem_sessao', falhas: 0 };
    const reg = await lerCompraPendente();
    // Registro de OUTRA conta (trocou de conta no meio): não grava nesta.
    if (reg?.userId && reg.userId !== uid) {
      await apagarCompraPendente();
      return { status: 'ok', falhas: 0 };
    }
    if (reg && !reg.userId) void atualizarCompraPendente({ userId: uid });
    let scanSalvo = reg?.skinScanId ?? scanSalvoMem;

    // O store guarda UM scan por vez. Se ela começou um scan novo dentro do app, a foto e o
    // relatório de lá não são desta compra: para sem gravar e sem contar falha. A próxima
    // abertura restaura a compra do registro e termina.
    const st = useAppStore.getState();
    const fotoDaCompra = st.skinImageUri;
    const scanNovo = () => {
      const agora = useAppStore.getState();
      return agora.scanSource !== 'onboarding' || agora.skinImageUri !== fotoDaCompra;
    };
    const interrompida: FimDaCompra = { status: 'interrompida', falhas: reg?.falhas ?? falhasMem };
    if (scanNovo() || abandonada()) return interrompida;

    // 1. O relatório completo (só se houve scan neste onboarding).
    const temScan = !!st.skinImageBase64 || !!st.scanResult;
    const relatorio = temScan ? await aguardarAnaliseCompleta() : null;
    if (scanNovo() || abandonada()) return interrompida;
    if (temScan && !relatorio) throw new Error('análise completa falhou');

    // 2. Perfil + scan na conta (o scan uma vez só, mesmo tentando de novo ou retomando).
    if (scanSalvo) useAppStore.setState({ skinScanId: scanSalvo });
    await useAppStore.getState().saveToSupabase(uid, { scan: !scanSalvo });
    const skinScanId = useAppStore.getState().skinScanId;
    if (relatorio && skinScanId && !scanSalvo) {
      scanSalvo = skinScanId;
      scanSalvoMem = skinScanId;
      await atualizarCompraPendente({ skinScanId });
    }

    if (scanNovo() || abandonada()) return interrompida;

    // 3. A rotina (a pré-gerada desde a compra, ou gera agora) + recomendações.
    // Uma vez só (16/nov/2026): se o app fechou/reiniciou depois de gravar a rotina, a retomada
    // não grava outra por cima (no teste, a 2ª gravação passou a ser a "ideal" da conta). A
    // recomendação já foi pedida ao servidor junto com a 1ª; se não chegou, a aba Rotina refaz.
    const rotinaSalva = reg?.rotinaSalva || rotinaSalvaMem;
    if (relatorio && !rotinaSalva) {
      const { onboarding: o, setProtocolResult, setProtocolGenerating } = useAppStore.getState();
      setProtocolGenerating(true);
      await saveOnboardingProtocol({
        scanResult: relatorio,
        onboardingData: o,
        userId: uid,
        skinScanId: scanSalvo,
        onSuccess: (r) => { if (!scanNovo()) setProtocolResult(r); },
        onFinally: () => setProtocolGenerating(false),
        aoGravar: async () => {
          rotinaSalvaMem = true;
          await atualizarCompraPendente({ rotinaSalva: true });
        },
      });
    }

    if (abandonada()) return interrompida;
    // 3a. Pós-compra v2 (lib/posCompraV2.ts): os produtos de casa que ela
    // fotografou (fila no aparelho, lib/filaProdutosCasa.ts) ficam ligados a esta conta e vão
    // para o lote "Montar minha rotina", agora que há conta e rotina base. Sem fila, não faz
    // nada. Falhou → a fila fica e o app tenta de novo depois. Nunca lança.
    await ligarFilaAConta(uid);
    await tentarEnviarFila(uid);

    if (abandonada()) return interrompida;
    // 3b. Boas-vindas pós-pagamento (se ela selou o pacto). Nunca segura a tela.
    await concluirBoasVindas(uid, await lerCompraPendente());

    // 4. Nada fica no aparelho.
    await apagarCompraPendente();
    invalidateCache(`home:${uid}`);
    scanSalvoMem = null;
    rotinaSalvaMem = false;
    falhasMem = 0;
    limparPosCompraV2();
    return { status: 'ok', falhas: 0 };
  } catch (e) {
    console.warn('[concluirCompra] não terminou:', e);
    if (abandonada()) return { status: 'interrompida', falhas: falhasMem };
    const reg = await lerCompraPendente();
    const falhas = (reg?.falhas ?? falhasMem) + 1;
    falhasMem = falhas;
    await atualizarCompraPendente({ falhas });
    trackFora('rotina_nao_salva', { tentativa: falhas });
    return { status: 'falhou', falhas };
  }
}

export function concluirCompraPendente(): Promise<FimDaCompra> {
  if (!emAndamento) {
    const p: Promise<FimDaCompra> = executar().finally(() => { if (emAndamento === p) emAndamento = null; });
    emAndamento = p;
  }
  return emAndamento;
}

/** A tentativa atual estourou o teto da tela: ela não grava mais nada e a próxima começa do zero. */
export function abandonarExecucao(): void {
  geracao++;
  emAndamento = null;
}

/** Devolve o onboarding da compra ao store e dispara o que faltar (relatório, rotina). */
export async function retomarCompraPendente(reg: CompraPendente): Promise<void> {
  await restaurarCompraPendente(reg);
  if (reg.analiseRapida) usarAnaliseRapidaRestaurada(reg.analiseRapida);
  if (reg.rotina) usarRotinaRestaurada(reg.rotina);
  iniciarAnaliseCompleta();
}

const TETO_DATA_APPLE_MS = 5000;

/** A data da compra no relógio da Apple; sem resposta a tempo, `null`. */
function dataDaCompraNaApple(): Promise<number | null> {
  return Promise.race([
    comprovantesApple().then(dataDaCompraMaisRecente).catch(() => null),
    new Promise<null>((resolve) => { setTimeout(() => resolve(null), TETO_DATA_APPLE_MS); }),
  ]);
}

/** A compra pendente é desta conta? Só a conta criada para ela. O cadastro grava o `userId`;
 *  sem ele, vale só conta criada DEPOIS da compra (o app fechou antes de gravar). As duas
 *  datas vêm de servidores: conta no Supabase, compra na Apple. Sem a da Apple (Android,
 *  sem comprovante), usa a hora do aparelho em que a compra foi registrada. */
export async function compraDestaConta(reg: CompraPendente, conta: { id: string; created_at: string }): Promise<boolean> {
  if (reg.userId) return reg.userId === conta.id;
  const compra = (await dataDaCompraNaApple()) ?? Date.parse(reg.criadaEm);
  const criada = Date.parse(conta.created_at);
  return Number.isFinite(compra) && Number.isFinite(criada) && criada >= compra;
}

/** O que a abertura do app faz com uma compra pendente desta conta. */
export function destinoDaCompra(reg: CompraPendente, agora = Date.now()): 'espera' | 'segundo_plano' | 'vencida' {
  if (!reg.adiada && (reg.falhas ?? 0) < FALHAS_PARA_ENTRAR) return 'espera';
  const desde = Date.parse(reg.adiadaEm ?? reg.criadaEm);
  return !Number.isFinite(desde) || agora - desde > VALIDADE_ADIADA_MS ? 'vencida' : 'segundo_plano';
}

/** Ela entra no app sem a rotina pronta: daqui em diante, só em segundo plano. */
export async function adiarCompraPendente(falhas: number): Promise<void> {
  await atualizarCompraPendente({ adiada: true, adiadaEm: new Date().toISOString() });
  trackFora('rotina_adiada', { falhas });
}

// Poucas tentativas por abertura: cada uma pode chamar a análise de IA de novo.
let agendado = false;

export function tentarEmSegundoPlano(atrasoMs = 0): void {
  if (agendado) return;
  agendado = true;
  const tentar = async (n: number) => {
    // Scan novo feito dentro do app: o store não é mais o desta compra. A próxima abertura retoma.
    if (useAppStore.getState().scanSource !== 'onboarding') { agendado = false; return; }
    const r = await concluirCompraPendente();
    if (r.status === 'falhou' && n < TENTATIVAS_POR_ABERTURA) {
      setTimeout(() => { void tentar(n + 1); }, ESPERA_SEGUNDO_PLANO_MS);
      return;
    }
    agendado = false;
    if (r.status === 'ok') trackFora('rotina_recuperada', {});
  };
  setTimeout(() => { void tentar(1); }, atrasoMs);
}
