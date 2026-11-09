// ─────────────────────────────────────────────────────────────────────────────
// MEDALHAS e MOLDURAS dos níveis (08/nov/2026, pedido do produto) — cópia LITERAL do gerador
// do Claude Design (projeto "NIKS home redesign", arquivo `NiksMolduras.dc.html`, script do
// fim: M2 / LG / SM / MED / RIB, grads, roseG, leafG, frame2, medal2, medal3). Só o que mudou:
// devolve o TEXTO do SVG (o app desenha com o `SvgXml` do react-native-svg) em vez de uma
// data URI. Usa só degradês, caminhos e círculos (nada de filtro), que o react-native-svg
// desenha. Mudou o desenho no Claude Design → copie de novo, não ajuste à mão.
//
//   • `medalhaSvg(material, etapa)` — a medalha da seção 3a ("A rosa dentro da medalha"):
//     etapa 1/2/3 = as pétalas nas laterais do aro; o NIKS (no design, "Rosa") tem etapa única.
//   • `molduraSvg(material, pequena)` — a moldura do perfil (2a, "1. Molduras no perfil") e a
//     do avatar de lista (2a, "2. Avatar de lista", `pequena`). As etapas NÃO aparecem na
//     moldura, só o material. Posição da foto dentro dela: `FOTO_NA_MOLDURA`.
// ─────────────────────────────────────────────────────────────────────────────

export type Material = 'bronze' | 'prata' | 'ouro' | 'diamante' | 'rosa';

type M = {
  pL: string[]; pD: string[]; pIn: string[]; edge: string; ew: number; hi: string; hiO: number;
  leaf: string[]; stem: string[]; ring: string[]; rg?: string[]; W: number;
  polish?: 1; spec?: 1; outer?: 1; facet?: 1; pave?: 1; enamel?: 1; glow?: 1;
};

const rad = (a: number) => a * Math.PI / 180;
const f = (n: number) => Math.round(n * 100) / 100;

const M2: Record<Material, M> = {
  bronze:   { pL:['#F6D3AE','#D39866','#8F552E'], pD:['#C98A58','#7E4624'], pIn:['#7A4322','#4A240E'], edge:'#5E3017', ew:.45, hi:'#FFE9D2', hiO:.5, leaf:['#E3B387','#8C532B'], stem:['#C27E4C','#5E3017'], ring:['#F0C9A2','#CC8C58','#9A5B30','#E3B58B','#A86A3D'], W:4 },
  prata:    { pL:['#FFFFFF','#E1E4E8','#8A919C'], pD:['#C9CDD3','#767D88'], pIn:['#6B727D','#40454D'], edge:'#4F5560', ew:.45, hi:'#FFFFFF', hiO:1, leaf:['#F4F5F7','#868D98'], stem:['#D2D6DB','#4F5560'], ring:['#FFFFFF','#B5BAC2','#7A818C','#FFFFFF','#959CA6'], W:4.6, polish:1 },
  ouro:     { pL:['#FFF8D8','#F5CB5A','#A26A0C'], pD:['#E5B13C','#875A0B'], pIn:['#8A5A0C','#4F3204'], edge:'#6B470C', ew:.45, hi:'#FFFFFF', hiO:1, leaf:['#FAE08E','#A06C14'], stem:['#EBBD4E','#6B470C'], ring:['#FFF7D6','#F3C64F','#9C650E','#FFEAA6','#C08A22'], W:5.6, spec:1, outer:1 },
  diamante: { pL:['#FFFFFF','#CDEBFF','#EAD3FF','#FFEAC8','#CBF3E2','#E3E9FF'], pD:['#EEF3FB','#B4C4DD'], pIn:['#A9BAD6','#7E92B6'], edge:'#7F96B8', ew:.4, hi:'#FFFFFF', hiO:1, leaf:['#FFFFFF','#D3F0FF','#F0DBFF','#C2D3EA'], stem:['#E4EBF5','#7F96B8'], ring:['#EAF5FF','#9CCBFA','#D2B3F5','#FFE1A3','#A6E6CB','#92BBF5'], W:6, facet:1, pave:1, spec:1 },
  rosa:     { pL:['#FFD3E7','#FF7DB8','#E2408A'], pD:['#FF68AE','#B92A6E'], pIn:['#A82262','#6E1240'], edge:'#D99A7C', ew:.7, hi:'#FFFFFF', hiO:.85, leaf:['#FCE6DA','#D3906F'], stem:['#EFC1A8','#A8654C'], ring:['#FFE4F0','#FF8EC4','#FF5EA8','#FFC9E2','#F06AA9'], rg:['#FFF0E6','#EDB79C','#B9735A','#F7D2BE'], W:7, enamel:1, spec:1, glow:1 },
};
type Frame = { stems: number[][]; leaves?: number[][]; thorns?: number[]; roses: number[][]; stars?: number[][] };
const LG: Record<Material, Frame> = {
  bronze:   { stems:[[130,176]], leaves:[[143,40,1],[163,72,.75]], thorns:[152,169], roses:[[176,42,0,1.2]] },
  prata:    { stems:[[122,198]], leaves:[[135,38,1.05],[158,66,.8],[181,32,.85]], thorns:[147,170,189], roses:[[198,46,1,1.15]] },
  ouro:     { stems:[[110,226]], leaves:[[121,36,1.05],[146,62,.85],[180,30,1],[204,66,.8]], thorns:[133,192,214], roses:[[163,-18,0,.85],[226,36,2,1.05]] },
  diamante: { stems:[[92,262]], leaves:[[103,36,1],[124,62,.85],[154,30,1.05],[184,58,.85],[214,26,.95],[240,62,.8]], thorns:[115,170,200,228], roses:[[138,-22,1,.8],[196,-2,3,.98],[262,40,3,.92]], stars:[[180,30,1],[10,150,.8],[196,176,.6]] },
  rosa:     { stems:[[70,318],[22,70]], leaves:[[82,36,.9],[100,28,1],[138,56,.85],[184,30,.9],[236,42,.9],[284,52,.8],[52,-40,.85],[34,-60,.7]], thorns:[90,126,172,224,292,60], roses:[[118,-18,0,.75],[160,-2,4,.95],[212,-4,4,1.05],[264,2,4,1.1],[304,34,1,.8],[322,52,0,.7],[22,-30,1,.75]], stars:[[188,24,1.2],[196,120,.8],[20,196,.9],[160,200,.7],[200,60,.6]] },
};
const SM: Record<Material, Frame> = {
  bronze:   { stems:[[134,180]], leaves:[[152,50,1.25]], roses:[[180,40,0,1.55]] },
  prata:    { stems:[[128,196]], leaves:[[148,46,1.2]], roses:[[196,44,1,1.45]] },
  ouro:     { stems:[[116,224]], leaves:[[136,46,1.15]], roses:[[168,-14,0,1.05],[224,38,2,1.25]] },
  diamante: { stems:[[100,256]], leaves:[[122,46,1.1]], roses:[[178,-6,3,1.05],[252,36,3,1.1]] },
  rosa:     { stems:[[84,312]], leaves:[[104,40,1.1]], roses:[[142,-10,4,.92],[206,-4,4,1.05],[270,10,4,1.15]], stars:[[190,30,1.6]] },
};
type Med = { st: number; s: number; twig?: number[]; twig2?: 1; stars?: number[][] };
const MED: Record<Material, Med> = {
  bronze:   { st:0, s:3.7 },
  prata:    { st:1, s:3.3 },
  ouro:     { st:2, s:2.85, twig:[1, 0, 1.7] },
  diamante: { st:3, s:2.7, twig:[1, 1, 1.7], stars:[[40,52,1.5],[166,90,1.1],[56,150,.9]] },
  rosa:     { st:4, s:2.55, twig:[1, 1, 1.6], twig2:1, stars:[[34,40,1.6],[170,36,1.2],[178,150,.9],[22,128,.8]] },
};

function grads(m: M) {
  const st = (arr: string[], offs?: number[]) => arr.map((c, i) => '<stop offset="' + (offs ? offs[i] : (arr.length === 1 ? 0 : i / (arr.length - 1))) + '" stop-color="' + c + '"/>').join('');
  let d = '<defs>';
  d += '<linearGradient id="pL" x1="0" y1="0" x2=".35" y2="1">' + st(m.pL) + '</linearGradient>';
  d += '<linearGradient id="pD" x1="0" y1="0" x2=".3" y2="1">' + st(m.pD) + '</linearGradient>';
  d += '<radialGradient id="pIn" cx=".5" cy=".7" r=".7">' + st(m.pIn) + '</radialGradient>';
  d += '<linearGradient id="lf" x1="0" y1="0" x2=".6" y2="1">' + st(m.leaf) + '</linearGradient>';
  d += '<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">' + st(m.ring) + '</linearGradient>';
  if (m.rg) d += '<linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">' + st(m.rg) + '</linearGradient>';
  d += '<radialGradient id="glow"><stop offset=".55" stop-color="#FF5EA8" stop-opacity="0"/><stop offset=".78" stop-color="#FF5EA8" stop-opacity=".2"/><stop offset="1" stop-color="#FF5EA8" stop-opacity="0"/></radialGradient>';
  return d + '</defs>';
}

function roseG(stage: number, m: M, small?: boolean) {
  const E = 'stroke="' + m.edge + '" stroke-width="' + m.ew + '" stroke-linejoin="round"';
  const P = (d: string, fl: string) => '<path d="' + d + '" fill="url(#' + fl + ')" ' + E + '/>';
  const H = (d: string) => '<path d="' + d + '" fill="none" stroke="' + m.hi + '" stroke-width=".75" stroke-linecap="round" opacity="' + m.hiO + '"/>';
  const V = (d: string) => small ? '' : '<path d="' + d + '" fill="none" stroke="' + m.edge + '" stroke-width=".32" stroke-linecap="round" opacity=".55"/>';
  const FX = (d: string) => m.facet ? '<path d="' + d + '" fill="none" stroke="#fff" stroke-width=".45" stroke-linejoin="round" opacity=".95"/>' : '';
  const SEP_UP = P('M0,11 C-4,10 -7,6 -8,-1 C-5,3 -3,6 0,9Z', 'lf') + P('M0,11 C4,10 7,6 7.5,0 C5,4 3,7 0,9Z', 'lf') + P('M0,11 C-1,6 0,2 -1.5,-2 C1.5,2 1.5,7 0,11Z', 'lf');
  const SEP_DN = P('M0,11 C-4,11 -8,13 -11,16 C-7,13.6 -3,12.6 0,12.2Z', 'lf') + P('M0,11 C4,11 8,13 11,16 C7,13.6 3,12.6 0,12.2Z', 'lf');
  const REC = '<ellipse cx="0" cy="12" rx="2.6" ry="1.9" fill="url(#lf)" ' + E + '/>';
  let g = '';
  if (stage === 0) {
    g += P('M0,11 C-6,10 -7,2 -5,-3 C-3,-8 -1,-10 1,-13 C3,-8 6,-4 6,1 C6,7 4,10 0,11Z', 'pD');
    g += V('M1,-13 C0,-9 -1,-6 -2,-3');
    g += P('M-5,-2 C-2,1 3,-1 5.5,-5 C6.5,1 5,8 0,11 C-4,10 -6,5 -5,-2Z', 'pL');
    g += H('M-5,-2 C-2,1 3,-1 5.5,-5') + FX('M-4,0 L0,5 L4,-2 M0,5 L0,10');
    g += SEP_UP + REC;
  } else if (stage === 1) {
    g += P('M0,11 C-8,10 -12,2 -11,-7 C-8,-4 -5,-2 -3,2 C-2,6 -1,9 0,11Z', 'pD');
    g += P('M0,11 C8,10 12,2 11,-6 C8,-3 5,-1 3,3 C2,7 1,9 0,11Z', 'pD');
    g += H('M-11,-7 C-10,-4.5 -8.5,-3.4 -7,-3') + H('M11,-6 C10,-3.6 8.6,-2.6 7,-2.2');
    g += P('M0,11 C-6,10 -7,2 -6,-4 C-4,-9 4,-9 6,-4 C7,2 6,10 0,11Z', 'pL');
    g += P('M-6,-4 C-4,-7 4,-7 6,-4 C3,-2 -3,-2 -6,-4Z', 'pIn');
    g += '<path d="M-3,-4.6 C-1,-6.2 2,-6.2 2.6,-4.6 C1,-3.6 -1,-3.7 -1,-4.8" fill="none" stroke="' + m.hi + '" stroke-width=".6" opacity="' + m.hiO + '"/>';
    g += P('M-6,-3 C-3,0 3,0 6,-3 C6,4 4,10 0,11 C-4,10 -6,4 -6,-3Z', 'pL');
    g += H('M-6,-3 C-3,0 3,0 6,-3') + V('M-1,1 C-1.5,5 -1,8 0,11') + FX('M-5,-1 L-1,4 L4,-1 M-1,4 L0,10');
    g += SEP_DN + REC;
  } else {
    if (stage >= 3) {
      const fan = stage === 4
        ? [[160,11.5,6.8,4.6],[20,11.5,6.8,4.6],[-172,13.5,8.4,5.6],[-8,13.5,8.4,5.6],[-132,12.5,7.6,5.4],[-48,12.5,7.6,5.4]]
        : [[-168,12.5,7.6,5.2],[-12,12.5,7.6,5.2],[160,10.5,6,4.2],[20,10.5,6,4.2]];
      fan.forEach(([a, d, rx, ry]) => {
        const x = Math.cos(rad(a)) * d, y = -2 + Math.sin(rad(a)) * d;
        g += '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + rx + '" ry="' + ry + '" transform="rotate(' + (a + 90) + ' ' + f(x) + ' ' + f(y) + ')" fill="url(#pD)" ' + E + '/>';
        const hx = Math.cos(rad(a)) * (d + ry * .55), hy = -2 + Math.sin(rad(a)) * (d + ry * .55);
        g += '<path d="M' + f(hx + Math.cos(rad(a + 90)) * -4) + ',' + f(hy + Math.sin(rad(a + 90)) * -4) + ' Q' + f(hx + Math.cos(rad(a)) * 1.2) + ',' + f(hy + Math.sin(rad(a)) * 1.2) + ' ' + f(hx + Math.cos(rad(a + 90)) * 4) + ',' + f(hy + Math.sin(rad(a + 90)) * 4) + '" fill="none" stroke="' + m.hi + '" stroke-width=".7" stroke-linecap="round" opacity="' + m.hiO * .8 + '"/>';
      });
    }
    g += P('M-14,-1 C-16,-8 -12,-14 -6,-13 C-4,-17 4,-17 6,-13 C12,-14 16,-8 14,-1Z', 'pD');
    g += V('M-6,-13 C-5,-9 -4,-7 -3,-5') + V('M6,-13 C5,-9 4,-7 3,-5');
    g += H('M-12,-11 C-10,-13.5 -7.5,-13.6 -6,-13') + H('M-4,-15.6 C-1,-17 2,-17 4,-15.6');
    g += P('M-11,-3 C-11,-9 11,-9 11,-3 C11,1 -11,1 -11,-3Z', 'pIn');
    g += P('M-11,-2 C-12,-8 -6,-11 -1,-9.5 C-5,-8 -7.5,-5 -7,0Z', 'pL') + H('M-11,-2 C-12,-8 -6,-11 -1,-9.5');
    g += P('M11,-1.5 C12,-8 6,-11 1,-9.6 C5,-8 7.5,-5 7,.5Z', 'pD') + H('M10.5,-4 C10.5,-7.5 7,-9.8 2,-9.6');
    g += P('M-6.5,-2 C-7,-6.5 -2,-8.5 2.5,-7 C-1,-6.2 -3.5,-4.5 -3.5,-1.5Z', 'pL') + H('M-6.5,-2.5 C-6.6,-6.2 -2.2,-8.2 2.2,-7.1');
    g += P('M6.5,-1.8 C7,-6 3,-8 -1.5,-6.8 C2,-5.6 3.6,-4 3.6,-1.2Z', 'pD');
    g += P('M-3,-2.5 C-3,-5.5 3,-5.5 3,-2.5 C1.5,-1.4 -1.5,-1.4 -3,-2.5Z', 'pL');
    g += '<path d="M-1.6,-3.4 C-.6,-4.6 1.4,-4.4 1.4,-3.1" fill="none" stroke="' + m.edge + '" stroke-width=".5" stroke-linecap="round"/>';
    g += P('M-13,-2 C-13,7 -6,12 0,12 C6,12 13,7 13,-2 C9,1.5 4,2 0,2 C-4,2 -9,1.5 -13,-2Z', 'pL');
    g += P('M0,12 C-7,12 -14,7 -15,-1 C-15.5,-4 -13.5,-4.5 -12,-2.5 C-9,.5 -5,1.8 -1,1.6 C-1,6 -.5,9 0,12Z', 'pL');
    g += P('M0,12 C6,12 13,8 14.5,1 C15,-2 13,-2.5 11.5,-.5 C8.5,1.8 5,2.6 1.5,2.4 C1,7 .5,10 0,12Z', 'pL');
    g += H('M-15,-1 C-15.5,-4 -13.5,-4.5 -12,-2.5 C-9,.5 -5,1.8 -1,1.6') + H('M14.5,1 C15,-2 13,-2.5 11.5,-.5 C8.5,1.8 5,2.6 1.5,2.4');
    g += V('M-2,10 C-5,8 -8,5 -10,1') + V('M-3,11.4 C-7,9.6 -10,7 -12.4,3') + V('M2,10.4 C5,8.4 8,5.6 10,2.4') + V('M3,11.4 C7,9.8 10,7.4 12.4,4');
    g += FX('M-13,-1 L-7,4.5 L-1,3.5 L4,5 L12,1 M-7,4.5 L-3,11 M4,5 L3,11 M-8,-6 L0,-3 L8,-6');
    g += SEP_DN + REC;
  }
  return '<g transform="translate(0 -12)">' + g + '</g>';
}

function leafG(m: M, crystal: boolean, small?: boolean) {
  const N = 8, Lg = 16, w = (t: number) => 5.4 * Math.pow(Math.sin(Math.PI * t), .8) * (1 - .3 * t);
  let d = 'M0,0';
  for (let i = 1; i <= N; i++) { const t = i / N, tp = (i - .45) / N; if (!small && i < N) d += ' L' + f(Lg * tp) + ',' + f(-w(tp) - .8); d += ' L' + f(Lg * t) + ',' + f(-w(t)); }
  for (let i = N - 1; i >= 0; i--) { const t = i / N, tp = (i + .55) / N; if (!small && i < N - 1) d += ' L' + f(Lg * tp) + ',' + f(w(tp) + .8); d += ' L' + f(Lg * t) + ',' + f(w(t)); }
  let g = '<path d="M-3.5,0 L0,0" stroke="' + m.stem[1] + '" stroke-width="1" stroke-linecap="round"/>';
  g += '<path d="' + d + 'Z" fill="url(#lf)" stroke="' + m.edge + '" stroke-width="' + m.ew + '" stroke-linejoin="round"/>';
  g += '<path d="M.5,0 L14.5,0" stroke="' + m.edge + '" stroke-width=".45" opacity=".8"/>';
  if (!small) [.25, .45, .65].forEach((t) => { const x = Lg * t; g += '<path d="M' + f(x) + ',0 L' + f(x + 2.8) + ',' + f(-w(t) * .72) + ' M' + f(x) + ',0 L' + f(x + 2.8) + ',' + f(w(t) * .72) + '" stroke="' + m.edge + '" stroke-width=".3" opacity=".6"/>'; });
  g += '<path d="M2,-.7 L12,-.7" stroke="' + m.hi + '" stroke-width=".5" opacity="' + m.hiO * .7 + '"/>';
  if (crystal) [[6.5,-2.3,1.5],[10.5,1.8,1.2],[13,-1,.9]].forEach(([x, y, k]) => { g += '<path d="M' + x + ',' + f(y - 1.4 * k) + ' L' + f(x + k) + ',' + y + ' L' + x + ',' + f(y + 1.4 * k) + ' L' + f(x - k) + ',' + y + 'Z" fill="#fff" stroke="#A58BE8" stroke-width=".3"/>'; });
  return g;
}
const thornG = (m: M) => '<path d="M-1.3,.4 L1.3,.4 L.5,-3.4Z" fill="' + m.stem[1] + '"/>';
const starG = (x: number, y: number, s: number, c: string) => '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><path d="M0,-6 C.6,-1 1,-.6 6,0 C1,.6 .6,1 0,6 C-.6,1 -1,.6 -6,0 C-1,-.6 -.6,-1 0,-6Z" fill="#fff" stroke="' + c + '" stroke-width=".55"/></g>';
const T = (x: number, y: number, r: number, s: number, inner: string) => '<g transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(r) + ') scale(' + s + ')">' + inner + '</g>';
const stemStroke = (d: string, m: M, sw: number) => '<path d="' + d + '" fill="none" stroke="' + m.stem[1] + '" stroke-width="' + (sw + 1.1) + '" stroke-linecap="round"/><path d="' + d + '" fill="none" stroke="' + m.stem[0] + '" stroke-width="' + sw + '" stroke-linecap="round"/>';

/** Moldura do perfil (`pequena` = a do avatar de lista). viewBox −12…212 (224). */
function frame2(tier: Material, small: boolean) {
  const m = M2[tier], C = (small ? SM : LG)[tier];
  const W = m.W * (small ? 1.7 : 1), R = small ? 68 : 66, Rs = R + W / 2 + (small ? 3 : 2.6), sw = small ? 2.8 : 1.7;
  const pt = (a: number, r: number) => [100 + r * Math.cos(rad(a)), 100 + r * Math.sin(rad(a))];
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 224 224">' + grads(m);
  if (m.glow) s += '<circle cx="100" cy="100" r="112" fill="url(#glow)"/>';
  if (m.outer) s += '<circle cx="100" cy="100" r="' + (R + W / 2 + 2.2) + '" fill="none" stroke="url(#ring)" stroke-width="' + (small ? 1.6 : .9) + '"/>';
  if (m.enamel) {
    s += '<circle cx="100" cy="100" r="' + R + '" fill="none" stroke="url(#rg)" stroke-width="' + W + '"/>';
    s += '<circle cx="100" cy="100" r="' + R + '" fill="none" stroke="url(#ring)" stroke-width="' + f(W * .5) + '"/>';
    if (!small) for (let a = 0; a < 360; a += 12) { const [x, y] = pt(a, R); s += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r=".8" fill="#FFF3EA" opacity=".9"/>'; }
  } else {
    s += '<circle cx="100" cy="100" r="' + R + '" fill="none" stroke="url(#ring)" stroke-width="' + W + '"/>';
  }
  s += '<circle cx="100" cy="100" r="' + (R + W / 2) + '" fill="none" stroke="' + m.edge + '" stroke-width=".5" opacity=".55"/><circle cx="100" cy="100" r="' + (R - W / 2) + '" fill="none" stroke="' + m.edge + '" stroke-width=".5" opacity=".55"/>';
  if (m.polish) s += '<circle cx="100" cy="100" r="' + f(R - W * .18) + '" fill="none" stroke="#fff" stroke-width="' + f(W * .22) + '" opacity=".95"/>';
  if (m.pave) for (let a = 0; a < 360; a += small ? 10 : 6) { const [x, y] = pt(a, R); s += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(W * .27) + '" fill="#fff" stroke="#A9B9D3" stroke-width=".35"/>'; }
  if (m.spec) { const [x0, y0] = pt(196, R), [x1, y1] = pt(246, R); s += '<path d="M' + f(x0) + ',' + f(y0) + ' A' + R + ' ' + R + ' 0 0 1 ' + f(x1) + ',' + f(y1) + '" fill="none" stroke="#fff" stroke-width="' + f(W * .32) + '" stroke-linecap="round" opacity=".9"/>'; }
  C.stems.forEach(([a0, a1]) => {
    const [sx, sy] = pt(a0 - 10, R), [qx, qy] = pt(a0 - 3.5, Rs), [x0, y0] = pt(a0, Rs), [x1, y1] = pt(a1, Rs);
    s += stemStroke('M' + f(sx) + ',' + f(sy) + ' Q' + f(qx) + ',' + f(qy) + ' ' + f(x0) + ',' + f(y0) + ' A' + f(Rs) + ' ' + f(Rs) + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + f(x1) + ',' + f(y1), m, sw);
  });
  if (!small) (C.thorns || []).forEach((a) => { const [x, y] = pt(a, Rs); s += T(x, y, a + 115, 1, thornG(m)); });
  (C.leaves || []).forEach(([a, o, k]) => { const [x, y] = pt(a, Rs); s += T(x, y, a + o, k, leafG(m, !!m.facet, small)); });
  C.roses.forEach(([a, o, st, k]) => { const [x, y] = pt(a, Rs); s += T(x, y, a + o + 90, k, roseG(st, m, small)); });
  (C.stars || []).forEach(([x, y, k]) => { s += starG(x, y, k, tier === 'rosa' ? '#E6A889' : '#A58BE8'); });
  return s + '</svg>';
}

function medal2(tier: Material, raw: boolean) {
  const m = M2[tier], C = MED[tier];
  let s = raw ? '' : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' + grads(m);
  if (m.glow && !raw) s += '<circle cx="100" cy="100" r="100" fill="url(#glow)"/>';
  if (C.twig) s += stemStroke('M101,162 C116,156 128,146 138,128', m, 3);
  if (C.twig2) s += stemStroke('M99,174 C84,170 70,160 62,146', m, 3);
  s += stemStroke('M102,192 C94,172 106,150 100,' + (C.st < 2 ? 136 : 130), m, 3.6);
  s += T(101, 180, -15, 2, thornG(m)) + T(99, 146, 205, 2, thornG(m));
  s += T(99, 166, 200, 2.3, leafG(m, !!m.facet)) + T(103, 150, -28, 1.9, leafG(m, !!m.facet));
  if (C.twig) s += T(138, 128, 34, C.twig[2], roseG(C.twig[1], m));
  if (C.twig2) s += T(62, 146, -36, 1.5, roseG(0, m));
  s += T(100, C.st < 2 ? 136 : 130, 0, C.s, roseG(C.st, m));
  (raw ? [] : C.stars || []).forEach(([x, y, k]) => { s += starG(x, y, k, tier === 'rosa' ? '#E6A889' : '#A58BE8'); });
  return raw ? s : s + '</svg>';
}

const RIB: Record<Material, string[]> = { bronze:['#F0C6B0','#B5694F'], prata:['#ECEAF2','#9894AA'], ouro:['#FFEBC8','#D49A4C'], diamante:['#EDE5FF','#9A86DB'], rosa:['#FF9CC8','#D93A82'] };

/** Medalha da seção 3a. `sub` = etapa 1/2/3 (pétalas nas laterais); 0 = a etapa única do NIKS.
 *  viewBox −16…216 (232). */
function medal3(tier: Material, sub: number) {
  const m = M2[tier], R = 72, W = m.W * 1.9, rb = RIB[tier];
  const pt = (a: number, r: number) => [100 + r * Math.cos(rad(a)), 100 + r * Math.sin(rad(a))];
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-16 -16 232 232">' + grads(m);
  s += '<defs><radialGradient id="field" cx=".5" cy=".38" r=".62"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="' + m.pL[0] + '"/></radialGradient>';
  s += '<linearGradient id="rib" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + rb[1] + '"/><stop offset=".45" stop-color="' + rb[0] + '"/><stop offset="1" stop-color="' + rb[1] + '"/></linearGradient></defs>';
  const PET = ({ 1: [186], 2: [176, 199], 3: [165, 187, 209], 0: [150, 170, 191, 212, 233] } as Record<number, number[]>)[sub] || [];
  const petal = (a: number, dir: number, k: number) => {
    const [x, y] = pt(a, R + W / 2 - 5), d = a + dir * 44;
    let p = '<g transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(d + 90) + ') scale(' + k + ')">';
    p += '<path d="M0,0 C-6,-3 -8.5,-11 -6.5,-17 C-4.6,-21.5 -1.6,-20.5 0,-18.2 C1.6,-20.5 4.6,-21.5 6.5,-17 C8.5,-11 6,-3 0,0Z" fill="url(#pL)" stroke="' + m.edge + '" stroke-width="' + m.ew + '" stroke-linejoin="round"/>';
    p += '<path d="M0,-2 C-.6,-7 -.4,-12 0,-17" fill="none" stroke="' + m.edge + '" stroke-width=".4" opacity=".6"/>';
    p += '<path d="M-5.6,-16 C-4.4,-19.4 -2,-19.6 -.6,-17.6" fill="none" stroke="' + m.hi + '" stroke-width=".8" stroke-linecap="round" opacity="' + m.hiO + '"/>';
    if (m.facet) p += '<path d="M-6,-10 L0,-6 L6,-11 M0,-6 L0,-1" fill="none" stroke="#fff" stroke-width=".5" opacity=".9"/>';
    return p + '</g>';
  };
  PET.slice().reverse().forEach((a, i) => { const k = 1.62 - i * .1; s += petal(a, 1, k) + petal(180 - a, -1, k); });
  s += '<circle cx="100" cy="100" r="' + (R - W / 2) + '" fill="url(#field)"/>';
  s += '<circle cx="100" cy="100" r="' + (R - W / 2 - 4) + '" fill="none" stroke="' + m.edge + '" stroke-width=".5" opacity=".35"/>';
  if (m.outer || m.enamel || m.pave) s += '<circle cx="100" cy="100" r="' + (R + W / 2 + 3) + '" fill="none" stroke="url(#ring)" stroke-width="1.6"/>';
  if (m.enamel) {
    s += '<circle cx="100" cy="100" r="' + R + '" fill="none" stroke="url(#rg)" stroke-width="' + W + '"/><circle cx="100" cy="100" r="' + R + '" fill="none" stroke="url(#ring)" stroke-width="' + f(W * .52) + '"/>';
    for (let a = 0; a < 360; a += 10) { const [x, y] = pt(a, R); s += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="1" fill="#FFF3EA"/>'; }
  } else s += '<circle cx="100" cy="100" r="' + R + '" fill="none" stroke="url(#ring)" stroke-width="' + W + '"/>';
  s += '<circle cx="100" cy="100" r="' + (R + W / 2) + '" fill="none" stroke="' + m.edge + '" stroke-width=".7" opacity=".6"/><circle cx="100" cy="100" r="' + (R - W / 2) + '" fill="none" stroke="' + m.edge + '" stroke-width=".7" opacity=".6"/>';
  if (m.polish) s += '<circle cx="100" cy="100" r="' + f(R - W * .18) + '" fill="none" stroke="#fff" stroke-width="' + f(W * .22) + '" opacity=".95"/>';
  if (m.pave) for (let a = 0; a < 360; a += 7) { const [x, y] = pt(a, R); s += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(W * .26) + '" fill="#fff" stroke="#A9B9D3" stroke-width=".4"/>'; }
  if (m.outer && !m.pave) for (let a = 0; a < 360; a += 15) { const [x, y] = pt(a, R + W / 2 + 3); s += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="1.8" fill="' + m.ring[0] + '" stroke="' + m.edge + '" stroke-width=".5"/>'; }
  if (m.enamel) for (let a = 0; a < 360; a += 12) { const [x, y] = pt(a, R + W / 2 + 3); s += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="2.3" fill="#fff" stroke="#E6A889" stroke-width=".7"/>'; }
  if (m.spec) { const [x0, y0] = pt(198, R), [x1, y1] = pt(248, R); s += '<path d="M' + f(x0) + ',' + f(y0) + ' A' + R + ' ' + R + ' 0 0 1 ' + f(x1) + ',' + f(y1) + '" fill="none" stroke="#fff" stroke-width="' + f(W * .3) + '" stroke-linecap="round" opacity=".9"/>'; }
  s += '<g transform="translate(100 100) scale(.76) translate(-100 -120)">' + medal2(tier, true) + '</g>';
  return s + '</svg>';
}

// Cache: o texto de cada medalha/moldura é montado UMA vez (o gerador faz centenas de caminhos).
const cache = new Map<string, string>();
const lembrar = (k: string, gera: () => string) => {
  let v = cache.get(k);
  if (!v) { v = gera(); cache.set(k, v); }
  return v;
};

export const medalhaSvg = (material: Material, etapa: number) => lembrar(`m:${material}:${etapa}`, () => medal3(material, etapa));
export const molduraSvg = (material: Material, pequena: boolean) => lembrar(`f:${material}:${pequena ? 1 : 0}`, () => frame2(material, pequena));

/** Onde a foto fica dentro da moldura (fração do lado), copiado do design (2a). A foto
 *  dentro do círculo vai ampliada em 14% (`scale(1.14)`). */
export const FOTO_NA_MOLDURA = {
  grande: { inicio: 0.2188, lado: 0.5625 },   // "1. Molduras no perfil"
  pequena: { inicio: 0.2098, lado: 0.5804 },  // "2. Avatar de lista"
};
