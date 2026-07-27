import { View, Text, Image } from 'react-native';
import { getScoreTheme } from '../lib/scoreTheme';
import { metricColor } from '../lib/metricColor';
import { useStickerFonts } from '../lib/stickerFonts';
import { cardLayout, cellOrigin, COL_W, ROW_H, PAD_X, PAD_B, FOOTER_H } from '../lib/stickerCardLayout';
import type { StickerSpec } from '../lib/stickerSpec';
import type { StickerMetric } from './NiksSticker';

// ── Adesivo em CARD — réplica do card de métricas da home, para o Story ────────
// Irmão retangular do `NiksSticker` (circular). Existe porque o círculo só comporta
// 3 métricas: de 4 em diante o texto não cabe na corda. Componente PURO — só props.
//
// Fidelidade deliberada ao card da home (node 1:63): fundo branco, borda #E3E3E6,
// rótulo em Lato, valor em Exo 2 Bold PRETO (não colorido — a cor vive na barra),
// trilho #F3F3F4 com preenchimento em `metricColor`. A usuária tem que reconhecer
// na foto o mesmo card que ela vê na home.
//
// ⚠️ A altura é IMPOSTA por `cardLayout` (`baseH`), nunca derivada do conteúdo — o
// `clampPose` de share-preview precisa da proporção antes do render. Por isso cada
// célula é posicionada de forma absoluta em caixa de altura fixa, e o rótulo de duas
// linhas ("Linhas de\nexpressão") não empurra nada.

type Props = {
  skinScore: number | null;
  metrics: StickerMetric[];
  showScore: boolean;
  /** Largura em pontos. A altura sai de `baseH * u` — não passar altura. */
  width: number;
};

const INK = '#121212';
const WHITE = '#FFFFFF';
const CARD_BD = '#E3E3E6';
const TRACK = '#F3F3F4';

export default function NiksStickerCard({ skinScore, metrics, showScore, width }: Props) {
  const { fXBold, fExo, fLato } = useStickerFonts();
  const theme = getScoreTheme(skinScore); // null → tema rosa (cor da marca)

  // Spec reconstruído a partir das métricas já resolvidas: `cardLayout` só olha para a
  // QUANTIDADE de chaves e para `showScore`.
  // ⚠️ INVARIANTE de que isto depende: quem chama passa um spec NORMALIZADO (sem chaves
  // sem dado), então `metrics.length === spec.keys.length`. Se uma chave sem número
  // sobrevivesse até aqui, o container reservaria uma altura e o card desenharia outra
  // — e a imagem exportada sairia diferente do preview. Ver `normalizeSpec`.
  const spec: StickerSpec = { showScore, keys: metrics.map((m) => m.key) };
  const { baseW, baseH } = cardLayout(spec);

  const u = (n: number) => (n * width) / baseW;
  const height = baseH * (width / baseW);

  return (
    <View
      style={{
        width,
        height,
        backgroundColor: WHITE,
        borderRadius: u(22),
        // ⚠️ A borda TEM de escalar com `u()`. Com `borderWidth: 1` fixo o traço saía
        // mais grosso no preview (que desenha em `baseW` e amplia por `transform`) do
        // que no export (que desenha nativamente no tamanho final) — e, pior, como o
        // Yoga posiciona filhos absolutos a partir da PADDING box, o 1pt não escalado
        // deslocava todo o conteúdo interno entre preview e export.
        borderWidth: u(1),
        borderColor: CARD_BD,
        // `overflow: 'visible'` de propósito: nada precisa ser recortado, e
        // `overflow: 'hidden'` já bloqueou toque no New Architecture neste projeto.
        overflow: 'visible',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: u(4) },
        shadowOpacity: 0.18,
        shadowRadius: u(10),
        elevation: 6,
      }}
    >
      {/* ── Cabeçalho do score (só quando pedido) ──────────────────────────────
          Ocupa exatamente SCORE_BLOCK; as células já começam depois dele. */}
      {/* `left/right: 0` (e não `width`): dentro da border-box a largura útil é
          `width − 2·borda`, então usar a largura TOTAL jogaria o conteúdo fora do
          centro real do card. */}
      {showScore && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: u(14), alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: fExo, fontSize: u(40), lineHeight: u(42),
              color: theme.score, letterSpacing: u(-1.6),
            }}
          >
            {skinScore != null ? skinScore : '—'}
          </Text>
          <Text
            style={{
              fontFamily: fXBold, fontSize: u(12), color: INK,
              letterSpacing: u(-0.4), marginTop: u(1),
            }}
          >
            Niks score
          </Text>
          <View
            style={{
              width: width - u(PAD_X * 2), height: u(1),
              backgroundColor: TRACK, marginTop: u(10),
            }}
          />
        </View>
      )}

      {/* ── Células de métrica — grade absoluta, altura fixa ──────────────────── */}
      {metrics.map((m, i) => {
        const { left, top } = cellOrigin(spec, i);
        return (
          <View
            key={m.key}
            style={{
              position: 'absolute',
              left: u(left), top: u(top),
              width: u(COL_W), height: u(ROW_H),
            }}
          >
            {/* Caixa de rótulo de altura FIXA (2 linhas), ancorada ao topo: o rótulo
                de 2 linhas não pode empurrar o valor para baixo. */}
            <View style={{ height: u(28), justifyContent: 'flex-start' }}>
              <Text
                numberOfLines={2}
                style={{
                  fontFamily: fLato, fontSize: u(11), lineHeight: u(13),
                  color: '#000000', letterSpacing: u(-0.22),
                }}
              >
                {m.label}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: fExo, fontSize: u(26), lineHeight: u(29),
                color: '#000000', letterSpacing: u(-0.52),
              }}
            >
              {m.value}
            </Text>
            <View
              style={{
                width: u(COL_W * 0.9), height: u(5), borderRadius: u(40),
                backgroundColor: TRACK, marginTop: u(4), overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${Math.max(0, Math.min(100, m.value))}%`,
                  borderRadius: u(40),
                  backgroundColor: metricColor(m.value, m.positive),
                }}
              />
            </View>
          </View>
        );
      })}

      {/* ── Marca — o MESMO lockup do adesivo circular. Obrigatória. ──────────── */}
      <View
        style={{
          position: 'absolute', left: 0, right: 0, bottom: u(PAD_B),
          height: u(FOOTER_H),
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Image
          source={require('../assets/home/niks-logo.png')}
          style={{ width: u(13), height: u(13), resizeMode: 'contain', tintColor: theme.score }}
        />
        <Text
          style={{
            fontFamily: fXBold, fontSize: u(12), color: INK,
            marginLeft: u(4), letterSpacing: u(0.7),
          }}
        >
          NIKS
        </Text>
      </View>
    </View>
  );
}
