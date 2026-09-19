/**
 * Gera o ícone da Action Extension ("Escanear no NIKS", a linha de baixo do share sheet)
 * a partir do ícone do app, `assets/icon-niks.png`.
 *
 *     node assets/action-extension/gerar-icone.js
 *
 * O QUE ELE FAZ — uma inversão com o topo dobrado:
 *   rosa do fundo      →  transparente
 *   branco da flor     →  preto
 *   branco MAIS claro  →  volta a clarear (o miolo)
 *
 * Nenhuma forma nova, nenhum redesenho: a flor sai com a geometria e os degradês
 * exatos do ícone do app.
 *
 * ⚠️ POR QUE O TOPO DOBRA (`PICO`) — o miolo tem que sair BRANCO. Na inversão reta,
 * `alpha = brilho`, a parte mais clara do logo vira a mais opaca do ícone: a estrela
 * do miolo, que no logo do app é o branco mais puro, virava a **mancha mais preta**
 * do ícone. A leitura ficava invertida em relação à marca, e no share sheet o NIKS
 * lia como um borrão escuro (alpha médio 112/255 ≈ cinza #8F8F8F) ao lado de ícones
 * nativos de traço fino. Acima de `PICO` o alpha volta a cair até zero, então o miolo
 * abre em branco como no logo. Abaixo de `PICO` **nada muda** — as pétalas saem
 * pixel a pixel iguais às da versão anterior, que é o que foi pedido.
 *
 * ⚠️ O DEGRADÊ DAS PÉTALAS É INTENCIONAL — NÃO "CONSERTE". Como o ícone é template
 * (o iOS usa só o canal alpha), o degradê vira alpha parcial, e as bordas externas
 * das pétalas ficam acinzentadas em vez de pretas como os ícones nativos ao lado.
 * Isso foi visto, discutido e **escolhido assim**. Já foram testadas e descartadas:
 * versão binarizada (preto chapado), versão binarizada com a estrela vazada, contorno
 * da silhueta, contorno dos quatro círculos, várias flores redesenhadas em geometria
 * limpa, e — na rodada do `PICO` — uma variante que também escurecia as pétalas para
 * preto chapado (`alpha^0.6`, alpha médio 153): foi vista lado a lado e recusada, a
 * escolhida foi a mais clara. Se for mexer, converse antes — não é falta de
 * alternativa, é decisão.
 *
 * ⚠️ O MAPA É APLICADO POR PIXEL DA ORIGEM, ANTES DA MÉDIA DE ÁREA. Com a inversão
 * reta tanto fazia (função linear comuta com média); com o dobrão no topo, não: fazer
 * a média do brilho primeiro e dobrar depois borraria o miolo. Não inverta a ordem.
 *
 * ⚠️ POR QUE O CANAL VERDE: o rosa do NIKS é `#FF9D9D` — o vermelho já está saturado
 * em 255 no fundo E na flor, então não distingue nada. Quem varia é o verde (e o azul,
 * igual a ele): 157 no fundo, 249 no ponto mais claro da flor. A normalização usa
 * exatamente esses dois valores, medidos do arquivo.
 *
 * ⚠️ O FUNDO É LIDO NA BORDA, não pelo mínimo global: dentro da flor existem pixels
 * mais escuros que o fundo (o degradê das pétalas chega a 148), e normalizar pelo
 * mínimo global deslocaria a escala inteira, deixando o fundo levemente opaco.
 *
 * ⚠️ AO TROCAR O ÍCONE DO APP: rode este script de novo. Ele avisa se o rosa do fundo
 * ou o ponto mais claro mudarem.
 */

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const ORIGEM = path.join(__dirname, '..', 'icon-niks.png');
const DESTINO = path.join(__dirname, 'AppIcon.appiconset');

const FUNDO = 157; // verde do rosa de fundo (#FF9D9D)
const MAX = 249; // verde do ponto mais claro da flor

// Brilho normalizado (0 = fundo, 1 = ponto mais claro) onde o alpha é máximo. Acima
// daqui ele volta a cair até zero — é o que deixa o miolo branco. 0.62 foi escolhido
// olhando a prévia em 87px: mais baixo come a barriga das pétalas, mais alto deixa
// um caroço escuro no centro.
const PICO = 0.62;

/** Brilho do logo (0..1) → alpha do ícone (0..1). Ver o cabeçalho. */
const alphaDe = (b) => (b <= PICO ? b : PICO * (1 - (b - PICO) / (1 - PICO)));

const TAMANHOS = [
  [20, 2], [20, 3], [29, 2], [29, 3], [40, 2], [40, 3], [60, 2], [60, 3],
];

const origem = PNG.sync.read(fs.readFileSync(ORIGEM));
const N = origem.width;
const verde = (x, y) => origem.data[(y * N + x) * 4 + 1];

// Confere que o arquivo é mesmo o que este script espera.
let bordaMin = 255;
let bordaMax = 0;
for (let i = 0; i < N; i++) {
  for (const v of [verde(i, 0), verde(i, N - 1), verde(0, i), verde(N - 1, i)]) {
    if (v < bordaMin) bordaMin = v;
    if (v > bordaMax) bordaMax = v;
  }
}
let vmax = 0;
for (let i = 0; i < N * origem.height; i++) {
  const v = origem.data[i * 4 + 1];
  if (v > vmax) vmax = v;
}
if (bordaMin !== bordaMax) {
  console.warn(`[aviso] o fundo não é uniforme (${bordaMin}..${bordaMax} na borda).`);
}
if (Math.abs(bordaMax - FUNDO) > 2 || Math.abs(vmax - MAX) > 2) {
  console.warn(
    `[aviso] o ícone de origem mudou: fundo ${bordaMax}, mais claro ${vmax}, ` +
      `mas este script assume ${FUNDO} e ${MAX}. Ajuste FUNDO/MAX.`,
  );
}

/** Média de área: cada pixel do destino é a média da região correspondente na origem. */
function reamostra(size) {
  const png = new PNG({ width: size, height: size });
  for (let py = 0; py < size; py++) {
    const y0 = Math.floor((py * N) / size);
    const y1 = Math.max(y0 + 1, Math.floor(((py + 1) * N) / size));
    for (let px = 0; px < size; px++) {
      const x0 = Math.floor((px * N) / size);
      const x1 = Math.max(x0 + 1, Math.floor(((px + 1) * N) / size));
      let soma = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          // a inversão: quanto mais branco no logo, mais opaco no ícone — até o
          // `PICO`, de onde o branco do miolo volta a abrir. Clampa ANTES do mapa:
          // sem isso os pixels da flor mais escuros que o fundo (o degradê chega a
          // 148) entrariam negativos e o dobrão os leria como "quase o pico".
          soma += alphaDe(Math.max(0, Math.min(1, (verde(x, y) - FUNDO) / (MAX - FUNDO))));
          n++;
        }
      }
      const a = Math.max(0, Math.min(1, soma / n));
      const i = (py * size + px) * 4;
      // O iOS usa só o alpha (ícone template); o RGB preto evita franja clara
      // caso algum contexto componha o PNG sem máscara.
      png.data[i] = 0;
      png.data[i + 1] = 0;
      png.data[i + 2] = 0;
      png.data[i + 3] = Math.round(255 * a);
    }
  }
  return PNG.sync.write(png);
}

for (const [pt, escala] of TAMANHOS) {
  const arquivo = path.join(DESTINO, `niks-action-${pt}@${escala}x.png`);
  fs.writeFileSync(arquivo, reamostra(pt * escala));
  console.log(`${path.basename(arquivo)}  ${pt * escala}px`);
}
