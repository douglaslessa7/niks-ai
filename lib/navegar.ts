// Navegação com a pilha nativa de `(app)` (10/nov/2026).
// Embaixo da pilha ficam as 6 ABAS (`app/(app)/(abas)`); por cima, as telas secundárias
// (Caminhada, Grupo, Progresso…), que têm o "deslizar para voltar" do iOS.
//
//   • `irPara(destino)` — ir a uma ABA, ou a uma tela secundária SEM empilhar de novo se ela
//     já está na pilha (desce até ela). Fora da pilha, abre por cima. Use na navbar, no fim de
//     um fluxo (check-in, carta) e no tutorial.
//   • `voltar(planoB)` — o botão de voltar: a tela de trás, igual ao gesto. O plano B (o
//     destino fixo de antes) só vale quando não há tela de trás.
// Para ABRIR uma tela secundária a partir de outra, continue usando `router.push`.
//
// ⚠️ Não use `router.dismissTo` direto para tela secundária: se ela NÃO está na pilha, ele
// troca a tela do topo — e, com as abas no topo, as abas somem da pilha (testado 10/nov/2026).
import { router, type Href } from 'expo-router';
import { store } from 'expo-router/build/global-state/router-store';

export const ABAS = new Set(['/home', '/recomendacao-produtos', '/protocolo', '/niks-chat', '/perfil', '/grupos']);

type Destino = { caminho: string; params: Record<string, string> };

function ler(destino: Href): Destino {
  if (typeof destino === 'string') {
    const [p, q] = destino.split('?');
    const params: Record<string, string> = {};
    new URLSearchParams(q ?? '').forEach((v, k) => { params[k] = v; });
    return { caminho: limpar(p), params };
  }
  const o = destino as { pathname: string; params?: Record<string, unknown> };
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.params ?? {})) if (v != null) params[k] = String(v);
  return { caminho: limpar(o.pathname), params };
}

const limpar = (p: string) => p.replace('/(app)/(abas)', '').replace('/(app)', '') || '/';

export const ehAba = (destino: Href) => ABAS.has(ler(destino).caminho);

/** Telas da pilha de `(app)` (nome + params), de baixo para cima. */
function pilha(): { name: string; params?: Record<string, unknown> }[] {
  // Estado VIVO do navegador (o `store.state` não acompanha cada navegação).
  const acha = (st: any): any => {
    for (const r of st?.routes ?? []) {
      if (r.name === '(app)') return r;
      const dentro = acha(r.state);
      if (dentro) return dentro;
    }
    return null;
  };
  return acha(store.navigationRef.current?.getRootState())?.state?.routes ?? [];
}

/** A tela (mesmo nome e, se tiver, mesmo `id`) já está na pilha? */
function naPilha(d: Destino): boolean {
  const nome = d.caminho.slice(1);
  return pilha().some((r) => r.name === nome && (d.params.id == null || String(r.params?.id ?? '') === d.params.id));
}

export function irPara(destino: Href) {
  const d = ler(destino);
  if (ABAS.has(d.caminho)) {
    // Com telas por cima, desce até as abas e troca de aba; só as abas: troca de aba.
    if (pilha().length > 1) router.dismissTo(destino as any);
    else router.navigate(destino as any);
    return;
  }
  // Mesma tela e mesmo `id` (grupo): desce até ela. Senão, abre por cima.
  if (naPilha(d)) router.dismissTo(destino as any);
  else router.push(destino as any);
}

/**
 * Abrir "de fora" (toque num push, tutorial, abertura do app): monta a trilha, para o voltar
 * levar ao destino fixo de antes. `trilha[0]` é uma ABA; as demais ficam por cima, na ordem.
 * Reaproveita o que já está na pilha: desce até a tela mais funda da trilha que já está lá e
 * empilha só o resto. Ex.: `abrirComTrilha(['/grupos', '/seus-grupos', { pathname: '/grupo', params: { id } }])`.
 */
export function abrirComTrilha(trilha: Href[]) {
  let i = trilha.length - 1;
  while (i > 0 && !naPilha(ler(trilha[i]))) i--;
  irPara(trilha[i]);
  for (const t of trilha.slice(i + 1)) router.push(t as any);
}

export function voltar(planoB: Href) {
  if (pilha().length > 1 && router.canGoBack()) router.back();
  else irPara(planoB);
}
