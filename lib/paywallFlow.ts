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
