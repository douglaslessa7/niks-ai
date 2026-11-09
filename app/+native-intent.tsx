import { PWDIAG_LINK, ligarDiagnostico } from '../lib/paywallDebug';
import { guardarConvite } from '../lib/convitePendente';

// Links do sistema que o expo-router NÃO deve tentar rotear.
//
// A Share Extension ("Compartilhar com o NIKS") abre o app com
// `niks-ai://dataUrl=niks-aiShareKey#…` — não é uma rota. O conteúdo é lido pelo
// `ShareIntentBridge` (app/_layout.tsx) e consumido pelo guard do (app)/_layout.
//   • cold start → '/' (index decide: sessão → home → guard; sem sessão → welcome)
//   • app aberto → null (fica na tela atual; o guard do (app) assume)
//
// O cadastro (`signup`) também não abre por link: ele é o passo seguinte a uma
// compra confirmada, e um `niks-ai://signup` digitado no Safari o abria direto,
// sem paywall. A própria tela tem trava (`lib/subscriptionGate.ts`); este desvio é
// a camada de fora. Mesma saída do link do share.
const CADASTRO = /^\/?(?:\(onboarding\)\/)?signup(?:[/?#]|$)/i;
// Link secreto do diagnóstico do paywall (lib/paywallDebug.ts): liga/desliga e não
// navega para lugar nenhum.
const DIAGNOSTICO = new RegExp(`^/?${PWDIAG_LINK}(-off)?(?:[/?#]|$)`, 'i');
// Convite de grupo (niks-ai://convite/<token>, vindo da função `convite`): não é rota.
// O token fica guardado e o `ConvitePendente` do (app)/_layout trata depois do guard
// de assinatura — o link nunca pula o paywall.
const CONVITE = /^\/?convite\/([A-Za-z0-9_-]{16,64})(?:[/?#]|$)/i;

// Parte B, Fase 8: telas de câmera, compartilhamento e foto só abrem por dentro do app. Um link
// externo não pode pular o portão de assinatura.
const SEM_LINK = /^\/?(?:\((?:scan|share|foto)\)\/)?(?:analisando-foto|camera|camera-multi|demo-scan|demo-transicao|food-camera|food-report|loading|loading-dentro-app|lote-camera|lote-montando|lote-resultado|lote-revisao|pergunta|personalizar|product-camera|product-loading|product-result|rate-us|resultado-scan|results|scan-prep|scan-prep-app|seu-caminho|share-product-loading|solucao|sos-camera|sos-loading|sos-resultado|share-capture|share-preview|ajustar-foto)(?:[/?#]|$)/i;

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  if (path.includes('dataUrl=')) {
    return initial ? '/' : null;
  }
  const diag = pathSemScheme(path).match(DIAGNOSTICO);
  if (diag) {
    ligarDiagnostico(!diag[1]);
    return initial ? '/' : null;
  }
  const convite = pathSemScheme(path).match(CONVITE);
  if (convite) {
    guardarConvite(convite[1]);
    return initial ? '/' : null;
  }
  if (SEM_LINK.test(pathSemScheme(path))) {
    return initial ? '/' : null;
  }
  if (CADASTRO.test(pathSemScheme(path))) {
    console.log('[PWGUARD] link direto para o cadastro bloqueado:', path); // TEMP-PWGUARD
    return initial ? '/' : null;
  }
  return path;
}

// `path` pode chegar como caminho ("/signup") ou como URL inteira
// ("niks-ai://signup", "niks-ai:///signup"); o host da URL também é rota.
function pathSemScheme(path: string): string {
  return path.replace(/^[a-z][a-z0-9+.-]*:\/\/\/?/i, '/');
}
