import { View, Text, Image } from 'react-native';
import { getScoreTheme } from '../lib/scoreTheme';
import { metricScoreColor, MetricKey } from '../lib/metricColor';
import { useStickerFonts } from '../lib/stickerFonts';

// ── Adesivo do Niks score (vai por cima da colagem no Story) ───────────────────
// Componente PURO de apresentação: só props → desenho. Sem estado, sem navegação,
// sem Supabase, sem gestos. Quem chama decide QUAIS métricas entram; ele só desenha.
//
// Tudo escala a partir de `size` (nada hardcoded em px). As medidas foram desenhadas
// no tamanho REAL de uso — 130pt sobre a colagem — e `u()` reescala a partir daí.

export type StickerMetric = {
  key: MetricKey;
  label: string;
  value: number;
  positive: boolean; // false = quanto menor, melhor (oleosidade/acne/linhas)
};

type Props = {
  skinScore: number | null;
  metrics: StickerMetric[]; // 0 a 3 itens, já escolhidos por quem chama
  showScore: boolean;
  size: number;             // diâmetro do adesivo, em pontos
};

const INK      = '#121212';
const INK_MUTE = '#818181';
const WHITE    = '#FFFFFF';

export default function NiksSticker({ skinScore, metrics, showScore, size }: Props) {
  const { fXBold, fSemi, fExo } = useStickerFonts();

  const theme = getScoreTheme(skinScore); // null → tema rosa (cor da marca)

  // Escala: desenhado para 130pt, reescalado proporcionalmente para qualquer `size`.
  const u = (n: number) => (n * size) / 130;

  // Largura útil das linhas de métrica. Dois limites, e vale o MENOR:
  //  (1) a caixa: diâmetro − borda(2×3.5) − padding(2×9) = size − 25;
  //  (2) a CURVA: a linha de métrica mais baixa fica ~39pt abaixo do centro, e a
  //      corda do círculo ali já é só ~104pt (a 130) — mais estreita que a caixa.
  // `size − 30` respeita os dois com folga. Por isso as linhas largas moram no meio
  // do círculo (onde a corda é maior) e só a marca (curta) desce para a parte estreita.
  const CONTENT_W = size - u(30);

  // Até 4 métricas cabem no círculo (decisão do usuário). Acima disso é o card.
  const items = metrics.slice(0, 4);
  const hasMetrics = items.length > 0;

  // Cor do ADESIVO (anel + marca): acompanha o número "manchete". Com score, é a cor
  // do score (rosa p/ 84). Sem score (adesivo de métrica isolada), é a cor da 1ª
  // métrica — assim o adesivo de Oleosidade com o 42 amarelo tem o anel amarelo, e não
  // rosa: número e adesivo na MESMA cor.
  const stickerColor =
    showScore || !hasMetrics
      ? theme.score
      : metricScoreColor(items[0].value, items[0].positive);

  // Densidade: com 4 linhas o círculo aperta, então encolhe um tico fonte e gaps das
  // linhas de métrica. Só afeta as linhas — o número grande e a marca ficam iguais.
  const dense = items.length >= 4;
  const rowLabel = dense ? 8 : 9;
  const rowValue = dense ? 12.5 : 14;
  const rowGap = dense ? 2 : 3;

  // Métrica isolada (sem score, 1 item) → réplica exata do adesivo de score.
  const solo = !showScore && items.length === 1;

  // Marca — SEMPRE presente, em qualquer combinação de props. Sem prop para desligar.
  const Brand = (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: u(6) }}>
      <Image
        source={require('../assets/home/niks-logo.png')}
        style={{ width: u(10), height: u(10), resizeMode: 'contain' }}
        tintColor={stickerColor}
      />
      <Text
        style={{
          // "NIKS" em caixa alta pede mais corpo/peso que o "niks.ai" antigo para
          // manter a legibilidade a 130pt: ExtraBold 10 + letter-spacing positivo.
          fontFamily: fXBold, fontSize: u(10), color: INK,
          marginLeft: u(3.5), letterSpacing: u(0.6),
        }}
      >
        NIKS
      </Text>
    </View>
  );

  // Linha compacta de métrica: rótulo à esquerda (ocupa a sobra), valor à direita.
  // O rótulo leva `flex: 1` + `numberOfLines={1}`: se um rótulo longo ("Linhas de
  // expressão") não couber, ele reticencia em vez de empurrar o valor para fora.
  const MetricRow = (m: StickerMetric, i: number) => (
    <View
      key={m.key}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        width: CONTENT_W,
        marginTop: i === 0 ? 0 : u(rowGap),
      }}
    >
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: fSemi, fontSize: u(rowLabel), color: INK_MUTE }}>
        {m.label}
      </Text>
      <Text
        style={{
          // Cor pela FAIXA DO SCORE (não pelo semáforo) — mesma lógica do Niks score.
          fontFamily: fExo, fontSize: u(rowValue), color: metricScoreColor(m.value, m.positive),
          marginLeft: u(6), letterSpacing: u(-0.3),
        }}
      >
        {m.value}
      </Text>
    </View>
  );

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: WHITE,
        borderWidth: u(3.5),
        borderColor: stickerColor, // anel na cor da manchete (score, ou 1ª métrica)
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: u(9),
        // sombra suave — o adesivo precisa "descolar" da foto embaixo
        shadowColor: '#000',
        shadowOffset: { width: 0, height: u(3) },
        shadowOpacity: 0.18,
        shadowRadius: u(8),
        elevation: 6,
      }}
    >
      {/* ── Variante A — só o score: número GIGANTE ───────────────────────────── */}
      {showScore && !hasMetrics && (
        <>
          <Text
            style={{
              fontFamily: fExo, fontSize: u(52), lineHeight: u(54),
              color: theme.score, letterSpacing: u(-2),
            }}
          >
            {skinScore != null ? skinScore : '—'}
          </Text>
          <Text
            style={{
              fontFamily: fXBold, fontSize: u(11), color: INK,
              letterSpacing: u(-0.4), marginTop: u(1),
            }}
          >
            Niks score
          </Text>
        </>
      )}

      {/* ── Variante B — score + 1 a 3 métricas (a mais densa) ─────────────────
          LEGIBILIDADE: aqui eu CORTO hierarquia em vez de espremer fonte. O rótulo
          "Niks score" (que existe na variante A) é REMOVIDO: com o número grande na
          cor do tema + a marca no rodapé, ele é redundante — e a linha que ele
          ocuparia é exatamente a que as métricas precisam para respirar. Assim os
          rótulos ficam em 9pt e os valores em 14pt (em vez de ~7pt espremidos). */}
      {showScore && hasMetrics && (
        <>
          <Text
            style={{
              fontFamily: fExo, fontSize: u(30), lineHeight: u(31),
              color: theme.score, letterSpacing: u(-1.2),
            }}
          >
            {skinScore != null ? skinScore : '—'}
          </Text>
          <View style={{ marginTop: u(5) }}>{items.map(MetricRow)}</View>
        </>
      )}

      {/* ── Variante C — sem score: as métricas mandam, a primeira maior ─────────
          ⚠️ Métrica ISOLADA (1 item) = réplica EXATA do adesivo de score: número
          gigante u(52) + rótulo completo. Com 2+ métricas o número da manchete
          encolhe para u(30) e as demais viram linhas. */}
      {!showScore && hasMetrics && (
        <>
          <Text
            style={{
              fontFamily: fExo,
              fontSize: u(solo ? 52 : 30), lineHeight: u(solo ? 54 : 31),
              color: metricScoreColor(items[0].value, items[0].positive),
              letterSpacing: u(solo ? -2 : -1.2),
            }}
          >
            {items[0].value}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              // Negrito e escuro, IGUAL ao rótulo "Niks score" do adesivo de score.
              fontFamily: fXBold, fontSize: u(11), color: INK, textAlign: 'center',
              letterSpacing: u(-0.4), maxWidth: CONTENT_W, marginTop: u(1),
            }}
          >
            {items[0].label}
          </Text>
          {items.length > 1 && (
            <View style={{ marginTop: u(6) }}>{items.slice(1).map(MetricRow)}</View>
          )}
        </>
      )}

      {Brand}
    </View>
  );
}
