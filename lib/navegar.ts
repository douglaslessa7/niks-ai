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
import { StackActions } from '@react-navigation/native';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ "A TELA DESCE E FICA UM VÃO EM CIMA" (investigado em 12/nov/2026, reproduzido no 17 Pro).
// A pilha RAIZ é `[(app), (carta) …]`: a carta de raspar é um `transparentModal` POR CIMA do
// app (e `(scan)`/`(onboarding)` também ficam na raiz, fora do app). Navegar para uma tela do
// app enquanto algo está por cima dele (ex.: `router.back()` + `router.push('/caminhada')` no
// mesmo instante — o back não sai da pilha na hora) empilha uma SEGUNDA cópia do app inteiro:
// `[(app), (carta), (app) > [caminhada]]`. Por cima de um modal, o iOS a apresenta como FOLHA
// (pageSheet): cantos arredondados, o resto escurecido atrás e o vão no topo.
// Remédio: `irPara`/`abrirComTrilha` primeiro FECHAM o que está acima do app na pilha raiz e só
// navegam no quadro seguinte, com o app no topo. Dentro do app (nada por cima), nada muda.
// E `vigiarPilha()` (montado no layout raiz) conserta na hora se, por qualquer outro caminho,
// uma 2ª cópia do app aparecer — e registra no Mixpanel (`nav_folha_reparada`).
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// TOQUE DUPLO (12/nov/2026, pedido do produto: "toda vez que eu clico duas vezes no botão, a
// ação é repetida — abre duas vezes"). Guarda única para o app inteiro: uma 2ª ordem de abrir o
// MESMO destino em menos de 800 ms é ignorada. `useRouter()` devolve este mesmo `router`, então
// vale para todos os botões que navegam (cards, abas, "Ver todos"…). Destinos diferentes
// seguem normais (ex.: a trilha de `abrirComTrilha`).
// ─────────────────────────────────────────────────────────────────────────────
const ultimaOrdem = { chave: '', em: 0 };
function semRepetir<F extends (href: any, ...resto: any[]) => any>(original: F): F {
  return ((href: any, ...resto: any[]) => {
    const chave = typeof href === 'string' ? href : JSON.stringify(href);
    const agora = Date.now();
    if (chave === ultimaOrdem.chave && agora - ultimaOrdem.em < 800) return undefined;
    ultimaOrdem.chave = chave;
    ultimaOrdem.em = agora;
    return original(href, ...resto);
  }) as F;
}
const r: any = router;
if (!r.__semRepetir) {
  r.__semRepetir = true;
  r.push = semRepetir(r.push);
  r.navigate = semRepetir(r.navigate);
}

/** A pilha raiz (dentro do `__root` do expo-router). */
function pilhaRaiz(): any {
  const r: any = store.navigationRef.current?.getRootState();
  return r?.routes?.find((x: any) => x.name === '__root')?.state ?? r;
}

/** Quantas telas da pilha raiz estão ACIMA do app (a carta, um scan…). */
export function acimaDoApp(): number {
  const s = pilhaRaiz();
  const i = s?.routes?.findIndex((r: any) => r.name === '(app)') ?? -1;
  return i < 0 ? 0 : s.routes.length - 1 - i;
}

/**
 * Fecha o que está acima do app (a carta…) e, já com o app no topo, roda `entao` (ex.: abrir a
 * Caminhada). Sem nada por cima, roda na hora. Para sair de um modal SEM destino fixo — volta
 * para a tela onde ela estava.
 */
export function sairPorCimaDoApp(entao?: () => void) {
  if (fecharAcimaDoApp()) requestAnimationFrame(() => entao?.());
  else entao?.();
}

/** Fecha o que está acima do app na pilha raiz. Devolve se fechou algo. */
function fecharAcimaDoApp(): boolean {
  const s = pilhaRaiz();
  const n = acimaDoApp();
  if (!n || !s?.key) return false;
  store.navigationRef.current?.dispatch({ ...StackActions.pop(n), target: s.key } as any);
  return true;
}

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

export function irPara(destino: Href, entao?: () => void) {
  // Algo por cima do app (a carta…): fecha primeiro e navega no quadro seguinte, com o app no
  // topo — navegar com o modal ainda em cima empilharia outra cópia do app como folha.
  if (fecharAcimaDoApp()) {
    requestAnimationFrame(() => { irPara(destino); entao?.(); });
    return;
  }
  irParaNoApp(destino);
  entao?.();
}

function irParaNoApp(destino: Href) {
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
  // Algo por cima do app (a carta…): fecha antes de montar a trilha (ver o aviso no topo).
  if (fecharAcimaDoApp()) {
    requestAnimationFrame(() => abrirComTrilha(trilha));
    return;
  }
  let i = trilha.length - 1;
  while (i > 0 && !naPilha(ler(trilha[i]))) i--;
  irPara(trilha[i]);
  for (const t of trilha.slice(i + 1)) router.push(t as any);
}

/**
 * FIM de um fluxo (12/nov/2026): o check-in publicado, a carta raspada depois dele. Destino no
 * grupo → o grupo ENTRA por cima (transição normal, direto do check-in) e, já com ele na tela,
 * as telas de baixo são trocadas em silêncio pela ABA Grupos (sai a lista do skincare, o
 * cronômetro, a câmera do check-in, "Seus grupos"…): o voltar do grupo leva à aba Grupos.
 * ⚠️ Antes: descia até a aba Grupos e só então abria o grupo — a aba ("Perfil") aparecia por um
 * instante entre o check-in e o grupo; e mais antes ainda o grupo abria por cima do fluxo, e o
 * voltar (ou a "Sua caminhada" ao fechar) caía na câmera. Outro destino: `irPara`.
 * `entao` (ex.: abrir a Caminhada) roda com o grupo já na tela e a pilha limpa.
 */
export function irParaFim(destino: Href, entao?: () => void) {
  const d = ler(destino);
  if (d.caminho !== '/grupo') { irPara(destino, entao); return; }
  sairPorCimaDoApp(() => {
    router.push({ pathname: '/grupo', params: d.params } as any);
    // Depois da transição de entrada (~350 ms da pilha nativa).
    setTimeout(() => { deixarSoAbaPorBaixo('grupos'); entao?.(); }, 450);
  });
}

/** A tela do topo fica; por baixo dela, só as abas (na `aba` pedida). Mesmas chaves: nada remonta. */
function deixarSoAbaPorBaixo(aba: string) {
  const ref: any = store.navigationRef.current;
  const acha = (st: any): any => {
    for (const r of st?.routes ?? []) {
      if (r.name === '(app)') return r;
      const dentro = acha(r.state);
      if (dentro) return dentro;
    }
    return null;
  };
  const app = acha(ref?.getRootState());
  const pilhaApp = app?.state;
  if (!pilhaApp?.key || (pilhaApp.routes?.length ?? 0) <= 2) return;
  const abas = pilhaApp.routes.find((r: any) => r.name === '(abas)');
  const topo = pilhaApp.routes[pilhaApp.routes.length - 1];
  if (!abas || topo === abas) return;
  const iAba = abas.state?.routes?.findIndex((r: any) => r.name === aba) ?? -1;
  const abasNa = iAba >= 0 ? { ...abas, state: { ...abas.state, index: iAba } } : abas;
  try {
    ref.dispatch({ type: 'RESET', payload: { ...pilhaApp, index: 1, routes: [abasNa, topo] }, target: pilhaApp.key });
  } catch (e) {
    console.warn('[navegar] não deu para limpar a pilha:', e);
  }
}

export function voltar(planoB: Href) {
  if (pilha().length > 1 && router.canGoBack()) router.back();
  else irPara(planoB);
}

/**
 * Rede de segurança (12/nov/2026): vigia a pilha raiz e, se uma 2ª cópia do app aparecer POR
 * CIMA da carta (o caso da "folha com vão em cima"), conserta na hora: tira a carta e a cópia,
 * e passa as telas da cópia (ex.: a Caminhada) para o app de verdade, no topo. Só age nesse
 * caso; telas do app abertas de dentro de um scan (pilha normal, sem folha) ficam como estão.
 * `aoReparar` recebe as telas movidas (para medir no Mixpanel). Devolve o "parar de vigiar".
 */
export function vigiarPilha(aoReparar?: (telas: string[]) => void): () => void {
  const ref: any = store.navigationRef.current;
  if (!ref?.addListener) return () => {};
  let consertando = false;
  return ref.addListener('state', () => {
    if (consertando) return;
    const s = pilhaRaiz();
    const rotas: any[] = s?.routes ?? [];
    const iApp = rotas.findIndex((r) => r.name === '(app)');
    const iModal = rotas.findIndex((r, i) => i > iApp && r.name === '(carta)');
    if (iApp < 0 || iModal < 0) return;
    const copias = rotas.filter((r, i) => i > iModal && r.name === '(app)');
    if (!copias.length) return;
    // As telas das cópias (sem as abas, que o app de verdade já tem), sem `key`: o navegador
    // cria as próprias ao reidratar o estado (`stale`).
    // A cópia pode ainda não ter montado a própria pilha: aí o destino está só nos params
    // (`{ screen: 'caminhada', params }`).
    const extras = copias.flatMap((c) => (c.state?.routes
      ? c.state.routes.filter((r: any) => r.name !== '(abas)')
      : c.params?.screen && c.params.screen !== '(abas)' ? [{ name: c.params.screen, params: c.params.params }] : []))
      .map(({ key: _k, ...r }: any) => r);
    const app = rotas[iApp];
    const doApp = (app.state?.routes ?? []).map(({ key: _k, ...r }: any) => r);
    const novas = [...doApp, ...extras];
    const novoApp = { name: '(app)', params: app.params, state: { stale: true, index: novas.length - 1, routes: novas } };
    consertando = true;
    try {
      ref.dispatch({ type: 'RESET', payload: { stale: true, index: iApp, routes: [...rotas.slice(0, iApp).map(({ key: _k, ...r }: any) => r), novoApp] }, target: s.key });
      aoReparar?.(extras.map((r: any) => r.name));
    } catch (e) {
      console.warn('[navegar] não deu para consertar a pilha:', e);
    } finally {
      requestAnimationFrame(() => { consertando = false; });
    }
  });
}
