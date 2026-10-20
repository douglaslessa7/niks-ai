import { PWDIAG_LINK, ligarDiagnostico } from '../lib/paywallDebug';

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
// ⚠️ PENDENTE (fora desta mudança): os links para as telas de `(scan)`, `(share)` e
// `(foto)` continuam abrindo direto, sem guard — ver "Guard de assinatura" no README.
const CADASTRO = /^\/?(?:\(onboarding\)\/)?signup(?:[/?#]|$)/i;
// Link secreto do diagnóstico do paywall (lib/paywallDebug.ts): liga/desliga e não
// navega para lugar nenhum.
const DIAGNOSTICO = new RegExp(`^/?${PWDIAG_LINK}(-off)?(?:[/?#]|$)`, 'i');

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  if (path.includes('dataUrl=')) {
    return initial ? '/' : null;
  }
  const diag = pathSemScheme(path).match(DIAGNOSTICO);
  if (diag) {
    ligarDiagnostico(!diag[1]);
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
