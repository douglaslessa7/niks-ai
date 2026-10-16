// Estado EM MEMÓRIA do fluxo de cupom no paywall de onboarding.
//
// ⚠️ NUNCA persistir nada daqui. Se a usuária fechar o app, voltar depois, ou se
// algo falhar no meio, tudo isto some sozinho e o comportamento volta ao normal
// (fail closed) — o guard de assinatura de (app)/_layout.tsx reapresenta o paywall.
// Um flag que ficasse preso em ligado seria uma brecha para escapar do paywall.

// ── Supressão de USO ÚNICO da reapresentação automática do paywall ───────────
// Só existe para o fechamento causado pelo botão "TENHO CUPOM": quando fechamos o
// paywall do Superwall à mão para mostrar a tela de cupom, o onDismiss do paywall
// tentaria reapresentar. Esta supressão pula ESSA reapresentação, uma única vez.
// É consumida (lida e resetada) na próxima vez que o onDismiss rodar.
let _suppressReapresentar = false;

export function armSuppressReapresentar(): void {
  _suppressReapresentar = true;
}

/** Lê e reseta (uso único). true = a reapresentação deve ser pulada desta vez. */
export function consumeSuppressReapresentar(): boolean {
  const armed = _suppressReapresentar;
  _suppressReapresentar = false;
  return armed;
}

// ── Downsell: UMA vez por sessão ────────────────────────────────────────────
// A usuária que sai do paywall sem assinar ganha UMA segunda chance (placement
// `paywall_downsell`) — seja fechando o paywall no X, seja cancelando a folha de
// pagamento da Apple. Depois disso ela volta ao `paywall_onboarding` de sempre.
//
// ⚠️ EM MEMÓRIA, como todo o resto deste arquivo: é "uma vez por sessão", não
// "uma vez na vida". Persistir isto inverteria o risco — um flag preso em ligado
// deixaria alguém sem a oferta; e, pior, qualquer estado de paywall gravado em
// disco vira brecha para escapar do bloqueio.
//
// Não usamos o placement `transaction_abandon` do Superwall (é pago) — o
// cancelamento da folha da Apple é detectado no onPurchase do
// CustomPurchaseController (userCancelled) e cai aqui.
let _downsellShown = false;

/** true = o downsell ainda não apareceu nesta sessão. */
export function canShowDownsell(): boolean {
  return !_downsellShown;
}

export function markDownsellShown(): void {
  _downsellShown = true;
}

/**
 * O placement a registrar quando a usuária sai do paywall SEM assinar.
 * Primeira saída da sessão → downsell (e marca o flag); daí em diante, o normal.
 */
export function nextPaywallPlacement(): string {
  if (canShowDownsell()) {
    markDownsellShown();
    return 'paywall_downsell';
  }
  return 'paywall_onboarding';
}

// ── Ponte: quem detecta o cancelamento NÃO é quem sabe registrar placement ──
// O cancelamento da folha da Apple é visto no CustomPurchaseController (módulo,
// em `app/_layout.tsx`), que não tem acesso ao `registerPlacement` do
// `usePlacement` — e é esse hook que carrega os callbacks de fail closed
// (onSkip/onError → paywall_onboarding). Por isso o controller apenas PEDE o
// downsell; quem registra é a `paywall-soft`, que está inscrita aqui.
// Sem inscrito (paywall-soft desmontada), o pedido é descartado — e o guard de
// assinatura de (app)/_layout.tsx continua sendo a rede de segurança.
type DownsellListener = () => void;
let _downsellListener: DownsellListener | null = null;

export function subscribeDownsellRequest(listener: DownsellListener): () => void {
  _downsellListener = listener;
  return () => {
    if (_downsellListener === listener) _downsellListener = null;
  };
}

export function requestDownsell(): void {
  _downsellListener?.();
}

// ── Qual placement o paywall-soft registra ao reganhar o foco ────────────────
// Setado pela tela de cupom antes de voltar: 'paywall_cupom' (cupom válido, mostra
// o plano com desconto) ou 'paywall_onboarding' (voltar/descartar, paywall normal).
// null → paywall-soft registra o padrão ('paywall_onboarding').
let _nextPlacement: string | null = null;

export function setNextPlacement(placement: string): void {
  _nextPlacement = placement;
}

/** Lê e reseta. null se nada pendente. */
export function consumeNextPlacement(): string | null {
  const p = _nextPlacement;
  _nextPlacement = null;
  return p;
}
