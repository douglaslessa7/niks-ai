import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { useAppStore, type OnboardingData, type ProtocolResult, type ScanResult } from '../store/onboarding';
import type { AnaliseRapida } from './analiseRapida';

// ─────────────────────────────────────────────────────────────────────────────
// Compra feita, conta ainda não terminada (06/nov/2026). A análise completa só roda DEPOIS
// da compra (`lib/onboardingPrefetch.ts`); entre a compra e o fim da tela de espera
// (`(onboarding)/loading-rotina`) o app pode fechar. Para ela não perder nada, no momento
// em que a compra é CONFIRMADA o app guarda NO APARELHO:
//   • a foto do scan — arquivo na pasta de cache do app (fora do backup do iCloud; o iOS
//     protege os arquivos do app) — e as fotos de LADO do giro, se saíram (10/nov/2026),
//     com o mesmo prefixo: a limpeza abaixo apaga todas juntas;
//   • em AsyncStorage (`onboarding_compra_pendente`): as respostas, a análise rápida, as
//     regiões do mapa do rosto e, quando chegarem, o relatório e a rotina (para não pagar
//     as chamadas de novo).
// `app/index.tsx` retoma ao abrir o app. Tudo é apagado assim que a tela de espera salva a
// conta (a foto vai para o bucket privado `scans`, como sempre) — ou ao abrir o app sem
// compra confirmada.
//
// PRIVACIDADE: ANTES da compra nada disto existe — a foto fica só na memória, como sempre
// (quem não compra não tem foto guardada em lugar nenhum pelo NIKS).
// ─────────────────────────────────────────────────────────────────────────────

const CHAVE = 'onboarding_compra_pendente';
const PREFIXO_FOTO = 'scan-compra-';

export type CompraPendente = {
  v: 1;
  criadaEm: string;
  /** A foto do scan (cache do app). null = não havia foto na memória. */
  fotoUri: string | null;
  /** Fotos de lado do giro (cache do app, prefixo `scan-compra-`), na ordem da tela. Só para a
   *  análise completa; nunca vão para o servidor do NIKS. Ausente = registro antigo ou sem lados. */
  ladosUris?: string[];
  onboarding: OnboardingData;
  analiseRapida: AnaliseRapida | null;
  regioesFoco: string[];
  /** A conta, depois do cadastro (a tela de espera só salva nesta conta). */
  userId: string | null;
  relatorio: ScanResult | null;
  rotina: ProtocolResult | null;
  /** A linha de `skin_scans` já gravada pela tela de espera (retomada não grava de novo). */
  skinScanId?: string | null;
  /** Boas-vindas pós-pagamento (`lib/boasVindas.ts`): foto de partida (cache do app, prefixo
   *  `scan-compra-`, apagada junto) e quando ela selou o pacto. */
  boasVindas?: { fotoUri: string | null; pactoEm: string | null } | null;
  /** Quantas vezes terminar a conta falhou (`lib/concluirCompra.ts`). */
  falhas?: number;
  /** Ela entrou no app sem terminar: a abertura não volta à tela de espera. */
  adiada?: boolean;
  adiadaEm?: string | null;
};

// Escritas em fila: duas atualizações quase juntas (relatório e rotina) não se apagam.
let fila: Promise<unknown> = Promise.resolve();
function emFila<T>(f: () => Promise<T>): Promise<T> {
  const p = fila.then(f, f);
  fila = p.catch(() => {});
  return p;
}

async function ler(): Promise<CompraPendente | null> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE);
    if (!bruto) return null;
    const r = JSON.parse(bruto);
    return r?.v === 1 ? (r as CompraPendente) : null;
  } catch {
    return null;
  }
}

export function lerCompraPendente(): Promise<CompraPendente | null> {
  return emFila(ler);
}

/** Compra confirmada: guarda a foto e o estado do onboarding no aparelho. O registro é
 *  sempre DESTE onboarding: um registro antigo (de outra tentativa) é trocado, com a foto.
 *  Se o registro já é desta foto (confirmou de novo na mesma sessão), mantém o relatório,
 *  a rotina e a conta que ele já tinha. */
export function registrarCompraPendente(): Promise<CompraPendente | null> {
  return emFila(async () => {
    const s = useAppStore.getState();
    const antes = await ler();
    const mesmaFoto = !!antes?.fotoUri && antes.fotoUri === s.skinImageUri && new File(antes.fotoUri).exists;
    let fotoUri = mesmaFoto ? antes!.fotoUri : null;
    let ladosUris: string[] = mesmaFoto && antes!.ladosUris?.every((u) => new File(u).exists) ? antes!.ladosUris : [];
    if (!fotoUri) {
      apagarFotosDeCompra(); // fotos de uma tentativa anterior (frente e lados)
      if (s.skinImageBase64) {
        try {
          const f = new File(Paths.cache, `${PREFIXO_FOTO}${Date.now()}.jpg`);
          f.write(s.skinImageBase64, { encoding: 'base64' });
          fotoUri = f.uri;
        } catch (e) {
          console.warn('[compraPendente] não salvou a foto:', e);
        }
      }
    }
    // Fotos de lado: salvas junto com a frente (só se a frente foi salva), uma vez por foto.
    if (fotoUri && !ladosUris.length && s.skinLadosBase64.length) {
      const t = Date.now();
      s.skinLadosBase64.slice(0, 2).forEach((b64, i) => {
        try {
          const f = new File(Paths.cache, `${PREFIXO_FOTO}${t}-lado${i + 1}.jpg`);
          f.write(b64, { encoding: 'base64' });
          ladosUris.push(f.uri);
        } catch (e) {
          console.warn('[compraPendente] não salvou uma foto de lado:', e);
        }
      });
    }
    // O relatório e a rotina no store só valem se são desta foto.
    const relatorioDaFoto = s.scanResult && s.scanImageUri === s.skinImageUri ? s.scanResult : null;
    const reg: CompraPendente = {
      v: 1,
      criadaEm: mesmaFoto ? antes!.criadaEm : new Date().toISOString(),
      fotoUri,
      ladosUris,
      onboarding: s.onboarding,
      analiseRapida: s.analiseRapida ?? (mesmaFoto ? antes!.analiseRapida : null),
      regioesFoco: s.regioesFoco,
      userId: mesmaFoto ? antes!.userId : null,
      relatorio: relatorioDaFoto ?? (mesmaFoto ? antes!.relatorio : null),
      rotina: (relatorioDaFoto ? s.prefetchedProtocol?.result : null) ?? (mesmaFoto ? antes!.rotina : null),
      skinScanId: mesmaFoto ? antes!.skinScanId ?? null : null,
    };
    try {
      await AsyncStorage.setItem(CHAVE, JSON.stringify(reg));
    } catch (e) {
      console.warn('[compraPendente] não salvou o registro:', e);
      return null;
    }
    return reg;
  });
}

/** Junta `parcial` ao registro (sem registro, não faz nada). */
export function atualizarCompraPendente(parcial: Partial<Omit<CompraPendente, 'v'>>): Promise<void> {
  return emFila(async () => {
    const reg = await ler();
    if (!reg) return;
    try {
      await AsyncStorage.setItem(CHAVE, JSON.stringify({ ...reg, ...parcial }));
    } catch (e) {
      console.warn('[compraPendente] não atualizou o registro:', e);
    }
  });
}

/** Apaga o registro e TODAS as fotos de compra pendente do cache (a do registro e alguma
 *  que tenha sobrado). Chamado quando a conta foi salva, ou sem compra confirmada. */
export function apagarCompraPendente(): Promise<void> {
  return emFila(async () => {
    try { await AsyncStorage.removeItem(CHAVE); } catch { /* segue */ }
    apagarFotosDeCompra();
  });
}

/** Ao abrir o app SEM registro: alguma foto de compra que tenha sobrado é apagada. */
export function apagarFotosDeCompra() {
  try {
    for (const item of new Directory(Paths.cache).list()) {
      if (item instanceof File && item.name.startsWith(PREFIXO_FOTO)) {
        try { item.delete(); } catch { /* segue */ }
      }
    }
  } catch (e) {
    console.warn('[compraPendente] não limpou as fotos:', e);
  }
}

/** Sem a compra confirmada ao reabrir, o registro ainda espera este tempo antes de ser
 *  apagado: uma falha momentânea do RevenueCat não pode jogar fora a foto de quem pagou
 *  (ela refaz o onboarding e o "Restaurar compra" do paywall resolve). Depois disso, apaga. */
export const ESPERA_SEM_CONFIRMACAO_MS = 24 * 60 * 60 * 1000;
export function compraPendenteVencida(reg: CompraPendente, agora = Date.now()): boolean {
  const t = Date.parse(reg.criadaEm);
  return !Number.isFinite(t) || agora - t > ESPERA_SEM_CONFIRMACAO_MS;
}

/** App reaberto com compra pendente: devolve ao store o que o onboarding tinha (respostas,
 *  análise rápida, regiões, foto e, se já chegaram, relatório e rotina). */
export async function restaurarCompraPendente(reg: CompraPendente): Promise<void> {
  let base64: string | null = null;
  if (reg.fotoUri) {
    try {
      const f = new File(reg.fotoUri);
      if (f.exists) base64 = await f.base64();
    } catch (e) {
      console.warn('[compraPendente] não leu a foto:', e);
    }
  }
  // Fotos de lado: as que ainda existem (sem elas, a análise completa vai só com a frente).
  const lados: string[] = [];
  for (const u of base64 ? reg.ladosUris ?? [] : []) {
    try {
      const f = new File(u);
      if (f.exists) lados.push(await f.base64());
    } catch (e) {
      console.warn('[compraPendente] não leu uma foto de lado:', e);
    }
  }
  useAppStore.setState({
    scanSource: 'onboarding',
    onboarding: reg.onboarding,
    analiseRapida: reg.analiseRapida,
    regioesFoco: reg.regioesFoco ?? [],
    cartaChegadaVista: true,
    ...(base64 && reg.fotoUri ? { skinImageBase64: base64, skinImageUri: reg.fotoUri, skinCollagesBase64: [], skinScanLayout: null, skinFaceLandmarks: null, skinLadosBase64: lados } : {}),
    ...(reg.relatorio ? { scanResult: reg.relatorio, scanImageUri: reg.fotoUri } : {}),
  });
}
