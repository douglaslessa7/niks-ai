import { useAppStore, ScanResult, ProtocolResult, OnboardingData } from '../store/onboarding';
import { fetchProtocol, saveProtocol, generateAndSaveProtocol } from './generateProtocol';

// Pré-carregamento das 3 chamadas de IA do ONBOARDING (fluxo completo, out/2026):
//   • antes/depois (`generate-skin-preview`) → assim que a foto chega (tela 7);
//   • relatório (`analyze-skin`)             → TAMBÉM assim que a foto chega: o
//     resultado do scan (tela 8) vem logo depois da câmera, ANTES das perguntas de
//     sol/água/sono. A função recebe o que já foi respondido (idade + o que te
//     incomoda); sol/água/sono passam a alimentar só a rotina;
//   • rotina (`generate-protocol`)           → quando há relatório E o objetivo (18)
//     foi respondido — a função recebe o `onboarding` INTEIRO. Sem conta ainda: o
//     resultado fica no store (`prefetchedProtocol`) e só é gravado em `protocolos`
//     no signup, com o user_id.
//
// Função de MÓDULO (padrão do `regenerateProtocolInApp`): as chamadas sobrevivem à troca
// de tela. Cada job tem uma CHAVE:
//   • mesma chave → devolve o job existente (guarda contra chamada dupla);
//   • chave mudou → descarta o job e dispara de novo. Resultado de job descartado
//     nunca é escrito (`job === atual`).
// ⚠️ A chave do RELATÓRIO é só a foto: depois que o resultado da tela 8 foi mostrado,
// mudar uma resposta (ex.: voltar à tela 4) não pode refazer a análise por baixo — a tela 8 e o signup leriam relatórios diferentes. Foto nova (retake) →
// análise nova. As respostas mudadas chegam à ROTINA, cuja chave é o relatório + o
// onboarding (menos os horários da tela 20, que a função não lê).
// Falha não se repete sozinha: quem precisa do resultado (loading da foto, loading
// da rotina, signup) dispara de novo, com as mesmas tentativas de sempre.

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

type Job<T> = {
  key: string;
  status: 'running' | 'ok' | 'failed';
  result: T | null;
  promise: Promise<T | null>;
};

let previewJob: Job<string> | null = null;
let reportJob: Job<ScanResult> | null = null;
let protocolJob: Job<ProtocolResult> | null = null;

// ── Chaves ───────────────────────────────────────────────────────────────────

// Id estável por OBJETO de relatório: a chave da rotina diz "gerada a partir DESTE
// relatório" — o mesmo objeto que a tela 18 põe em `scanResult` e o signup lê.
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

function reportKeyOf(photoUri: string) {
  return photoUri;
}

// Os horários (tela 20) vêm DEPOIS do objetivo e a `generate-protocol` não os lê:
// fora da chave, senão escolher o horário jogaria fora a rotina já pronta.
function protocolKeyOf(scanResult: ScanResult, o: OnboardingData) {
  const { rotina_manha_horario, rotina_noite_horario, rotina_fuso, ...rest } = o;
  return `${scanId(scanResult)}|${JSON.stringify(rest)}`;
}

// ── Chamadas (mesmas tentativas das telas de antes) ──────────────────────────

// Antes/depois: 100 s por tentativa, até 3 tentativas (era o `runSkinPreview` do loading).
async function callSkinPreview(base64: string, attempt = 0): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 100_000);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-skin-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ image: base64 }),
      signal: controller.signal,
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.preview_url) return data.preview_url as string;
    }
    throw new Error(`preview failed: ${response.status}`);
  } catch (e) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000));
      return callSkinPreview(base64, attempt + 1);
    }
    console.warn('Skin preview generation failed (non-blocking):', e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Relatório: 1 chamada + 2 retentativas, 2 s entre elas (era o `runAnalysis` do loading).
async function callAnalyzeSkin(base64: string, o: OnboardingData, retry = 0): Promise<ScanResult | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-skin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ imageBase64: base64, skinProfile: skinProfileOf(o) }),
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(JSON.stringify(errBody));
    }
    return (await response.json()) as ScanResult;
  } catch (err) {
    if (retry < 2) {
      await new Promise((r) => setTimeout(r, 2000));
      return callAnalyzeSkin(base64, o, retry + 1);
    }
    console.warn('[onboardingPrefetch] analyze-skin falhou:', err);
    lastReportError = (err as any)?.message ?? 'unknown';
    return null;
  }
}
let lastReportError = 'unknown';

// ── Disparo dos jobs ─────────────────────────────────────────────────────────

function startPreview(key: string, base64: string) {
  const job: Job<string> = { key, status: 'running', result: null, promise: null as any };
  job.promise = callSkinPreview(base64).then((url) => {
    job.status = url ? 'ok' : 'failed';
    job.result = url;
    if (url && previewJob === job) useAppStore.getState().setSkinPreviewUrl(url);
    return url;
  });
  previewJob = job;
  return job;
}

function startReport(key: string, base64: string, o: OnboardingData) {
  const job: Job<ScanResult> = { key, status: 'running', result: null, promise: null as any };
  job.promise = callAnalyzeSkin(base64, o).then((r) => {
    job.status = r ? 'ok' : 'failed';
    job.result = r;
    if (r && reportJob === job) sync(); // relatório pronto → talvez já dê para a rotina
    return r;
  });
  reportJob = job;
  return job;
}

function startProtocol(key: string, scanResult: ScanResult, o: OnboardingData) {
  const job: Job<ProtocolResult> = { key, status: 'running', result: null, promise: null as any };
  job.promise = fetchProtocol(scanResult, o)
    .catch((e) => { console.warn('[onboardingPrefetch] generate-protocol falhou:', e); return null; })
    .then((p) => {
      job.status = p ? 'ok' : 'failed';
      job.result = p;
      if (p && protocolJob === job) useAppStore.getState().setPrefetchedProtocol({ key, result: p });
      return p;
    });
  protocolJob = job;
  return job;
}

// Confere as 3 chaves contra o estado atual: descarta o que ficou velho e dispara o
// que já pode rodar. Idempotente — chamar à toa não gera chamada nova.
export function syncOnboardingPrefetch() {
  sync();
}

// Fechado no signup (a rotina passou a ser da conta). Reabre quando a foto some do
// store — o `reset()` do logout —, ou seja, num onboarding novo.
let closed = false;

function sync() {
  const s = useAppStore.getState();
  if (closed) return;
  if (s.scanSource !== 'onboarding') return; // scan de dentro do app: nunca (nem preview)
  const photo = photoOf();

  // Antes/depois — só precisa da foto.
  const previewKey = photo?.uri ?? null;
  if (previewJob && previewJob.key !== previewKey) {
    previewJob = null;
    if (s.skinPreviewUrl) s.setSkinPreviewUrl(null); // preview de outra foto
  }
  if (photo && !previewJob) startPreview(photo.uri, photo.base64);

  // Relatório — assim que há foto (as respostas de então vão junto, ver o topo).
  const reportKey = photo ? reportKeyOf(photo.uri) : null;
  if (reportJob && reportJob.key !== reportKey) reportJob = null;
  if (photo && reportKey && !reportJob) startReport(reportKey, photo.base64, s.onboarding);

  // Rotina — relatório pronto + objetivo respondido.
  const report = reportJob?.status === 'ok' ? reportJob.result : null;
  const protocolKey = report && s.onboarding.goal_desire != null ? protocolKeyOf(report, s.onboarding) : null;
  if (protocolJob && protocolJob.key !== protocolKey) {
    protocolJob = null;
    if (s.prefetchedProtocol) s.setPrefetchedProtocol(null);
  }
  if (report && protocolKey && !protocolJob) startProtocol(protocolKey, report, s.onboarding);
}

// Ela voltou e mudou uma resposta (ou a foto): reconfere as chaves. Espera 600 ms para
// toques seguidos numa tela de escolha e a digitação da alergia não dispararem várias
// chamadas. Um único ponto de escuta — tela nova de pergunta não precisa lembrar disto.
let syncTimer: ReturnType<typeof setTimeout> | null = null;
useAppStore.subscribe((s, prev) => {
  if (s.onboarding === prev.onboarding && s.skinImageUri === prev.skinImageUri && s.scanSource === prev.scanSource) return;
  if (!s.skinImageUri) closed = false;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; sync(); }, 600);
});

// ── Consumidores ─────────────────────────────────────────────────────────────

// Garante o antes/depois (se o de fundo falhou, dispara de novo).
export function ensureSkinPreview() {
  const photo = photoOf();
  if (!photo) return;
  if (!previewJob || previewJob.key !== photo.uri || previewJob.status === 'failed') {
    startPreview(photo.uri, photo.base64);
  }
}

// Loading da foto (tela 7 → 8): aguarda o relatório já em andamento (sem chamar de
// novo). Se não há job para a foto atual, ou o de fundo falhou, dispara com as
// tentativas completas. Se um job de FUNDO falhar enquanto ela espera, dispara mais
// uma vez — as tentativas dele não eram as da tela. `error` = motivo da última falha
// (Mixpanel `scan_failed`).
export async function awaitSkinReport(): Promise<{ result: ScanResult | null; error: string }> {
  const photo = photoOf();
  if (!photo) return { result: null, error: 'sem foto' };
  const { onboarding } = useAppStore.getState();
  const key = reportKeyOf(photo.uri);

  let job = reportJob && reportJob.key === key && reportJob.status !== 'failed' ? reportJob : null;
  const inherited = !!job;
  if (!job) job = startReport(key, photo.base64, onboarding);

  let result = await job.promise;
  if (!result && inherited && reportJob === job) {
    result = await startReport(key, photo.base64, onboarding).promise;
  }
  return { result, error: lastReportError };
}

// Loading da rotina (tela 23): aguarda a rotina pré-gerada para o relatório e as
// respostas de AGORA. Sem job (ou o de fundo falhou) → dispara. Devolve null se falhar:
// a tela segue mesmo assim e o signup gera de novo (`saveOnboardingProtocol`).
export async function awaitRoutine(): Promise<ProtocolResult | null> {
  const { scanResult, onboarding, prefetchedProtocol } = useAppStore.getState();
  if (!scanResult) return null;
  const key = protocolKeyOf(scanResult, onboarding);
  if (prefetchedProtocol?.key === key) return prefetchedProtocol.result;
  let job = protocolJob && protocolJob.key === key && protocolJob.status !== 'failed' ? protocolJob : null;
  if (!job) job = startProtocol(key, scanResult, onboarding);
  return job.promise;
}

// Signup: grava a rotina e encadeia `recomendar-produtos`, agora com o user_id.
// Rotina pré-gerada com a MESMA chave (relatório + respostas de agora) → só grava.
// Ainda em andamento → aguarda (em segundo plano: o signup não espera). Faltando,
// velha ou falha → gera como sempre (`generateAndSaveProtocol`, mesmas tentativas).
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

  if (!ready) {
    generateAndSaveProtocol({ scanResult, onboardingData, skinScanId, userId, onSuccess, onFinally });
    return;
  }
  try {
    onSuccess(ready);
    await saveProtocol({ data: ready, userId, skinScanId });
  } catch (err) {
    console.error('[onboardingPrefetch] falha ao gravar a rotina pré-gerada:', err);
  } finally {
    onFinally();
  }
}

// Descarta os jobs (resultados atrasados deixam de ser escritos).
export function clearOnboardingPrefetch() {
  previewJob = null;
  reportJob = null;
  protocolJob = null;
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  useAppStore.getState().setPrefetchedProtocol(null);
}
