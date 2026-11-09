import { useAppStore, ScanResult, ProtocolResult, OnboardingData } from '../store/onboarding';
import { fetchProtocol, saveProtocol, generateAndSaveProtocol } from './generateProtocol';
import { chamarAnaliseRapida, escolherPontoForte, escolherProblema, problemasMarcados, TODOS_PROBLEMAS, ultimoErroAnaliseRapida, type AnaliseRapida } from './analiseRapida';
import { atualizarCompraPendente } from './compraPendente';

// Chamadas de IA do ONBOARDING (06/nov/2026 — a análise completa só depois da compra):
//   • ANTES da compra, só a ANÁLISE RÁPIDA (`analise-rapida`, `lib/analiseRapida.ts`) →
//     assim que a foto chega: a intensidade de cada problema que ela marcou em "O que mais
//     te incomoda" e a idade da pele — o que a carta usa. Barata (~US$ 0,002);
//   • DEPOIS da compra confirmada (`iniciarAnaliseCompleta`, chamada pelo paywall ou pela
//     retomada em `app/index.tsx`):
//       – relatório (`analyze-skin`) com a foto + a ÂNCORA da carta (o problema escolhido,
//         a intensidade, a região e a idade), para o relatório não contradizer a carta;
//       – rotina (`generate-protocol`) → assim que o relatório chega.
//     Os dois vão para o registro da compra pendente (`lib/compraPendente.ts`) e são
//     gravados na conta pela tela de espera (`(onboarding)/loading-rotina`).
//   • O antes/depois (`generate-skin-preview`) NÃO roda mais no onboarding (06/nov/2026,
//     aprovado pelo produto): nenhuma tela do fluxo mostrava a imagem, e era a chamada mais
//     cara (~US$ 0,05 e ~34 s). A função continua no ar para versões antigas.
// Motivo: ~93% de quem faz o scan não compra (1–6/nov/2026: 484 análises × 23 contas).
//
// Função de MÓDULO (padrão do `regenerateProtocolInApp`): as chamadas sobrevivem à troca
// de tela. Cada job tem uma CHAVE:
//   • mesma chave → devolve o job existente (guarda contra chamada dupla);
//   • chave mudou → descarta o job e dispara de novo. Resultado de job descartado
//     nunca é escrito (`job === atual`).
// A chave da análise rápida é a foto + os problemas marcados; a do relatório, só a foto
// (foto nova = retake → análise nova). A rotina é o relatório + o onboarding (menos os
// horários, que a função não lê).

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

type Job<T> = {
  key: string;
  status: 'running' | 'ok' | 'failed';
  result: T | null;
  promise: Promise<T | null>;
};

let rapidaJob: Job<AnaliseRapida> | null = null;
let reportJob: Job<ScanResult> | null = null;
let protocolJob: Job<ProtocolResult> | null = null;

// A análise completa e a rotina só rodam depois que a compra é confirmada.
let completaLiberada = false;

// ── Chaves ───────────────────────────────────────────────────────────────────

// Id estável por OBJETO de relatório: a chave da rotina diz "gerada a partir DESTE
// relatório" — o mesmo objeto que está em `scanResult` e que a tela de espera grava.
const scanIds = new WeakMap<object, number>();
let scanSeq = 0;
function scanId(r: ScanResult) {
  let id = scanIds.get(r);
  if (id == null) { id = ++scanSeq; scanIds.set(r, id); }
  return id;
}

function idadeFrom(birthdayVal: string | null): number | null {
  if (!birthdayVal) return null;
  const asNum = Number(birthdayVal);
  if (!isNaN(asNum) && asNum > 0 && asNum < 120) return asNum;
  const d = new Date(birthdayVal);
  if (!isNaN(d.getTime())) return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return null;
}

// O `skinProfile` exato que vai à `analyze-skin`.
function skinProfileOf(o: OnboardingData) {
  return {
    skin_type: o.skin_type,
    concerns: o.concerns,
    genero: o.genero,
    idade: idadeFrom(o.birthday),
    sun_exposure: o.sun_exposure,
    hydration: o.hydration,
    sleep: o.sleep,
  };
}

function photoOf() {
  const { skinImageBase64, skinImageUri } = useAppStore.getState();
  return skinImageBase64 && skinImageUri ? { base64: skinImageBase64, uri: skinImageUri } : null;
}

const rapidaKeyOf = (photoUri: string, concerns: readonly string[]) => `${photoUri}|${concerns.join(',')}`;
const reportKeyOf = (photoUri: string) => photoUri;

// Os horários vêm DEPOIS e a `generate-protocol` não os lê: fora da chave, senão escolher o
// horário jogaria fora a rotina já pronta.
function protocolKeyOf(scanResult: ScanResult, o: OnboardingData) {
  const { rotina_manha_horario, rotina_noite_horario, rotina_fuso, ...rest } = o;
  return `${scanId(scanResult)}|${JSON.stringify(rest)}`;
}

/** A âncora das cartas para a `analyze-skin`: o problema que a carta de alerta mostrou (com a
 *  intensidade e a região que a foto mostrou), a idade da pele e — desde 06/nov/2026 — o
 *  ponto forte da Carta 1 (`ponto_forte`, que o relatório não pode virar problema principal;
 *  a `analyze-skin` anterior ignora o campo). Sem análise rápida → null. */
function ancoraDaCarta() {
  const { analiseRapida, onboarding } = useAppStore.getState();
  if (!analiseRapida?.foto_valida) return null;
  const p = escolherProblema(analiseRapida, onboarding.concerns);
  if (!p) return null;
  const forte = escolherPontoForte(analiseRapida, onboarding.concerns, p.problema);
  return {
    idade_pele: analiseRapida.idade_pele, problema: p.problema, intensidade: p.intensidade, regiao: p.regiao,
    ...(forte ? { ponto_forte: forte.problema } : {}),
  };
}

// ── Chamadas ─────────────────────────────────────────────────────────────────

// Relatório: 1 chamada + 2 retentativas, 2 s entre elas (era o `runAnalysis` do loading).
async function callAnalyzeSkin(base64: string, o: OnboardingData, ancora: ReturnType<typeof ancoraDaCarta>, retry = 0): Promise<ScanResult | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-skin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ imageBase64: base64, skinProfile: skinProfileOf(o), ...(ancora ? { analiseRapida: ancora } : {}) }),
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(JSON.stringify(errBody));
    }
    return (await response.json()) as ScanResult;
  } catch (err) {
    if (retry < 2) {
      await new Promise((r) => setTimeout(r, 2000));
      return callAnalyzeSkin(base64, o, ancora, retry + 1);
    }
    console.warn('[onboardingPrefetch] analyze-skin falhou:', err);
    lastReportError = (err as any)?.message ?? 'unknown';
    return null;
  }
}
let lastReportError = 'unknown';

// ── SÓ TESTE (__DEV__): "Pular scan" da preparação (`lib/dev/scanDeTeste.ts`) ──────
// Uma foto de exemplo + um relatório pronto no lugar da IA. Vale SÓ para aquela foto (pela
// chave = uri): a análise rápida sai do relatório de exemplo, o relatório chega depois de
// alguns segundos e a rotina não é pedida (a tela de espera gera). Um scan real (outra
// foto) segue normal. Em build de release `__DEV__` é false e nada disto roda.
// `// TEMP-PULAR-SCAN`
let scanDeTeste: { uri: string; relatorio: ScanResult } | null = null;
export function usarScanDeTeste(t: { uri: string; relatorio: ScanResult } | null) {
  scanDeTeste = __DEV__ ? t : null;
}
const ehTeste = (photoUri: string) => __DEV__ && scanDeTeste != null && scanDeTeste.uri === photoUri;

// A análise rápida do "Pular scan": a idade do relatório de exemplo, os 9 problemas (como a
// função nova, 06/nov/2026) e o ÚLTIMO marcado como o mais intenso (para o teste mostrar a
// escolha pela intensidade). Os NÃO marcados decidem a Carta 1 (ponto forte) — o caso sai de
// `globalThis.__pontoForteTeste` (pelo depurador do Metro):
//   'zero' (padrão): um deles com 1, os outros com 0 → Carta 1 com o 1º de intensidade 0;
//   'um': todos com 1 → Carta 1 com o 1º de intensidade 1;
//   'nenhum': todos com 2 → sem Carta 1 (vai direto à transição de alerta).
function rapidaDeTeste(concerns: readonly string[]): AnaliseRapida {
  const idade = Number((scanDeTeste?.relatorio as any)?.skin_age) || null;
  const marcados = problemasMarcados(concerns);
  const lista = marcados.length ? marcados : TODOS_PROBLEMAS;
  const caso = (globalThis as any).__pontoForteTeste ?? 'zero';
  const livre = (p: string) => (caso === 'nenhum' ? 2 : caso === 'um' ? 1 : p === 'manchas' ? 1 : 0) as 0 | 1 | 2;
  return {
    foto_valida: true,
    idade_pele: idade,
    problemas: TODOS_PROBLEMAS.map((p) => {
      const i = lista.indexOf(p);
      const intensidade = i < 0 ? livre(p) : i === lista.length - 1 ? 2 : 1;
      return { problema: p, intensidade, regiao: intensidade > 0 ? 'bochechas' : null };
    }),
  };
}

// ── Disparo dos jobs ─────────────────────────────────────────────────────────

function startRapida(key: string, photo: { uri: string; base64: string }, concerns: readonly string[]) {
  const job: Job<AnaliseRapida> = { key, status: 'running', result: null, promise: null as any };
  job.promise = (ehTeste(photo.uri)
    ? new Promise<AnaliseRapida>((res) => setTimeout(() => res(rapidaDeTeste(concerns)), 2500))
    : chamarAnaliseRapida(photo, concerns)
  ).then((r) => {
    job.status = r ? 'ok' : 'failed';
    job.result = r;
    if (r && rapidaJob === job) useAppStore.getState().setAnaliseRapida(r);
    return r;
  });
  rapidaJob = job;
  return job;
}

function startReport(key: string, base64: string, o: OnboardingData) {
  const job: Job<ScanResult> = { key, status: 'running', result: null, promise: null as any };
  const teste = ehTeste(key) ? scanDeTeste!.relatorio : null;
  job.promise = (teste
    ? new Promise<ScanResult>((res) => setTimeout(() => res(teste), 6000))
    : callAnalyzeSkin(base64, o, ancoraDaCarta())
  ).then((r) => {
    job.status = r ? 'ok' : 'failed';
    job.result = r;
    if (r && reportJob === job) {
      // Scan novo dentro do app: o relatório fica no registro da compra, sem trocar o de lá.
      if (useAppStore.getState().scanSource === 'onboarding') useAppStore.getState().setScanResult(r, key);
      void atualizarCompraPendente({ relatorio: r });
      sync(); // relatório pronto → a rotina já pode sair
    }
    return r;
  });
  reportJob = job;
  return job;
}

function startProtocol(key: string, scanResult: ScanResult, o: OnboardingData) {
  const job: Job<ProtocolResult> = { key, status: 'running', result: null, promise: null as any };
  const teste = __DEV__ && scanDeTeste != null && scanDeTeste.relatorio === scanResult;
  job.promise = (teste ? Promise.resolve(null) : fetchProtocol(scanResult, o))
    .catch((e) => { console.warn('[onboardingPrefetch] generate-protocol falhou:', e); return null; })
    .then((p) => {
      job.status = p ? 'ok' : 'failed';
      job.result = p;
      if (p && protocolJob === job) {
        useAppStore.getState().setPrefetchedProtocol({ key, result: p });
        void atualizarCompraPendente({ rotina: p });
      }
      return p;
    });
  protocolJob = job;
  return job;
}

// Confere as chaves contra o estado atual: descarta o que ficou velho e dispara o que já
// pode rodar. Idempotente — chamar à toa não gera chamada nova.
export function syncOnboardingPrefetch() {
  sync();
}

// Fechado quando a conta foi salva (a rotina passou a ser da conta). Reabre quando a foto
// some do store — o `reset()` do logout —, ou seja, num onboarding novo.
let closed = false;

function sync() {
  const s = useAppStore.getState();
  if (closed) return;
  if (s.scanSource !== 'onboarding') return; // scan de dentro do app: nunca
  const photo = photoOf();

  // Análise rápida — assim que há foto. Os problemas marcados vêm antes do scan.
  const rapidaKey = photo ? rapidaKeyOf(photo.uri, s.onboarding.concerns) : null;
  if (rapidaJob && rapidaJob.key !== rapidaKey) rapidaJob = null;
  if (photo && rapidaKey && !rapidaJob) startRapida(rapidaKey, photo, s.onboarding.concerns);

  // Daqui para baixo, só depois da compra confirmada.
  if (!completaLiberada) return;

  // Relatório — com a foto (e a âncora da carta, se a análise rápida já chegou).
  const reportKey = photo ? reportKeyOf(photo.uri) : null;
  if (reportJob && reportJob.key !== reportKey) reportJob = null;
  if (photo && reportKey && !reportJob && !(s.scanResult && s.scanImageUri === reportKey)) startReport(reportKey, photo.base64, s.onboarding);

  // Rotina — relatório pronto (do job ou já no store, ex.: retomada).
  const report = (reportJob?.status === 'ok' ? reportJob.result : null) ?? s.scanResult;
  const protocolKey = report ? protocolKeyOf(report, s.onboarding) : null;
  if (protocolJob && protocolJob.key !== protocolKey) {
    protocolJob = null;
    if (s.prefetchedProtocol && s.prefetchedProtocol.key !== protocolKey) s.setPrefetchedProtocol(null);
  }
  if (report && protocolKey && !protocolJob && s.prefetchedProtocol?.key !== protocolKey) startProtocol(protocolKey, report, s.onboarding);
}

// Ela voltou e mudou uma resposta (ou a foto): reconfere as chaves. Espera 600 ms para
// toques seguidos numa tela de escolha e a digitação da alergia não dispararem várias
// chamadas. Um único ponto de escuta — tela nova de pergunta não precisa lembrar disto.
let syncTimer: ReturnType<typeof setTimeout> | null = null;
useAppStore.subscribe((s, prev) => {
  if (s.onboarding === prev.onboarding && s.skinImageUri === prev.skinImageUri && s.scanSource === prev.scanSource) return;
  if (!s.skinImageUri) { closed = false; completaLiberada = false; }
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; sync(); }, 600);
});

// ── Consumidores ─────────────────────────────────────────────────────────────

/** Loading da foto (`analisando-foto`): aguarda a análise rápida já em andamento. Sem job
 *  para a foto atual, ou o de fundo falhou, dispara de novo. `error` = motivo da última falha
 *  (Mixpanel `scan_failed`). */
export async function aguardarAnaliseRapida(): Promise<{ result: AnaliseRapida | null; error: string }> {
  const photo = photoOf();
  if (!photo) return { result: null, error: 'sem foto' };
  const { onboarding } = useAppStore.getState();
  const key = rapidaKeyOf(photo.uri, onboarding.concerns);
  let job = rapidaJob && rapidaJob.key === key && rapidaJob.status !== 'failed' ? rapidaJob : null;
  const herdado = !!job;
  if (!job) job = startRapida(key, photo, onboarding.concerns);
  let result = await job.promise;
  if (!result && herdado && rapidaJob === job) result = await startRapida(key, photo, onboarding.concerns).promise;
  return { result, error: ultimoErroAnaliseRapida() };
}

/** Compra confirmada (paywall) ou retomada (`app/index.tsx`): libera e dispara a análise
 *  completa e, em seguida, a rotina. Idempotente. */
export function iniciarAnaliseCompleta() {
  completaLiberada = true;
  closed = false;
  sync();
}

/** Retomada (`app/index.tsx`): a análise rápida do registro vale para a foto restaurada —
 *  não chama a `analise-rapida` de novo. Chamar DEPOIS de restaurar o store. */
export function usarAnaliseRapidaRestaurada(r: AnaliseRapida) {
  const photo = photoOf();
  if (!photo) return;
  const key = rapidaKeyOf(photo.uri, useAppStore.getState().onboarding.concerns);
  rapidaJob = { key, status: 'ok', result: r, promise: Promise.resolve(r) };
}

/** Retomada (`app/index.tsx`): a rotina que já tinha sido gerada antes de o app fechar (no
 *  registro da compra pendente) vale para o relatório restaurado — não gera de novo. */
export function usarRotinaRestaurada(rotina: ProtocolResult) {
  const { scanResult, onboarding, setPrefetchedProtocol } = useAppStore.getState();
  if (scanResult) setPrefetchedProtocol({ key: protocolKeyOf(scanResult, onboarding), result: rotina });
}

/** Tela de espera: aguarda o relatório completo (dispara de novo se falhou). null = falhou
 *  nas tentativas. */
export async function aguardarAnaliseCompleta(): Promise<ScanResult | null> {
  iniciarAnaliseCompleta();
  const { scanResult, scanImageUri } = useAppStore.getState();
  const photo = photoOf();
  if (scanResult && (!photo || scanImageUri === photo.uri)) return scanResult;
  if (!photo) return null;
  const key = reportKeyOf(photo.uri);
  let job = reportJob && reportJob.key === key && reportJob.status !== 'failed' ? reportJob : null;
  const herdado = !!job;
  if (!job) job = startReport(key, photo.base64, useAppStore.getState().onboarding);
  let result = await job.promise;
  if (!result && herdado && reportJob === job) result = await startReport(key, photo.base64, useAppStore.getState().onboarding).promise;
  return result;
}

/** Compatibilidade (tela antiga `(scan)/loading.tsx`, fora do fluxo): o relatório completo. */
export async function awaitSkinReport(): Promise<{ result: ScanResult | null; error: string }> {
  const result = await aguardarAnaliseCompleta();
  return { result, error: lastReportError };
}

/** O antes/depois saiu do onboarding (06/nov/2026). Mantida para a tela antiga
 *  `(scan)/loading.tsx` (fora do fluxo) compilar; não chama nada. */
export function ensureSkinPreview() {}

/** A rotina para o relatório e as respostas de AGORA. Sem relatório (antes da compra) →
 *  null. Sem job (ou o de fundo falhou) → dispara. */
export async function awaitRoutine(): Promise<ProtocolResult | null> {
  const { scanResult, onboarding, prefetchedProtocol } = useAppStore.getState();
  if (!scanResult) return null;
  const key = protocolKeyOf(scanResult, onboarding);
  if (prefetchedProtocol?.key === key) return prefetchedProtocol.result;
  let job = protocolJob && protocolJob.key === key && protocolJob.status !== 'failed' ? protocolJob : null;
  if (!job) job = startProtocol(key, scanResult, onboarding);
  return job.promise;
}

// Tela de espera: grava a rotina e encadeia `recomendar-produtos`, agora com o user_id.
// Rotina pré-gerada com a MESMA chave (relatório + respostas de agora) → só grava.
// Ainda em andamento → aguarda. Faltando, velha ou falha → gera como sempre
// (`generateAndSaveProtocol`, mesmas tentativas). Termina quando a rotina foi gravada
// (ou falhou de vez).
export async function saveOnboardingProtocol({
  scanResult,
  onboardingData,
  userId,
  skinScanId,
  onSuccess,
  onFinally,
}: {
  scanResult: ScanResult;
  onboardingData: OnboardingData;
  userId: string;
  skinScanId: string | null;
  onSuccess: (result: ProtocolResult) => void;
  onFinally: () => void;
}) {
  const key = protocolKeyOf(scanResult, onboardingData);
  let ready: ProtocolResult | null = null;
  try {
    const stored = useAppStore.getState().prefetchedProtocol;
    if (stored?.key === key) ready = stored.result;
    else if (protocolJob?.key === key && protocolJob.status === 'running') ready = await protocolJob.promise;
  } catch {
    ready = null;
  }
  clearOnboardingPrefetch(); // a partir daqui a rotina é da conta
  closed = true;

  // Não salvou: quem chamou precisa saber, para tentar de novo. A rotina já gerada fica
  // guardada, e a próxima tentativa só grava, sem pagar a IA outra vez.
  const guardar = (result: ProtocolResult | null) => {
    if (result) useAppStore.getState().setPrefetchedProtocol({ key, result });
  };

  if (!ready) {
    let gerada = null as ProtocolResult | null;
    const salvou = await generateAndSaveProtocol({
      scanResult, onboardingData, skinScanId, userId, onFinally,
      onSuccess: (r) => { gerada = r; onSuccess(r); },
    });
    if (!salvou) {
      guardar(gerada);
      throw new Error('rotina não foi salva');
    }
    return;
  }
  try {
    onSuccess(ready);
    await saveProtocol({ data: ready, userId, skinScanId });
  } catch (err) {
    console.error('[onboardingPrefetch] falha ao gravar a rotina pré-gerada:', err);
    guardar(ready);
    throw err;
  } finally {
    onFinally();
  }
}

// Descarta os jobs (resultados atrasados deixam de ser escritos).
export function clearOnboardingPrefetch() {
  rapidaJob = null;
  reportJob = null;
  protocolJob = null;
  completaLiberada = false;
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  useAppStore.getState().setPrefetchedProtocol(null);
}
