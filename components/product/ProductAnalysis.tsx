import { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Image, Pressable, useWindowDimensions, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import {
  Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold,
  Nunito_500Medium, Nunito_400Regular,
} from '@expo-google-fonts/nunito';
import { Lato_900Black } from '@expo-google-fonts/lato';
import Svg, { Path } from 'react-native-svg';
import {
  Sparkles, FlaskConical, ScanFace, Flower2, TriangleAlert, Atom,
} from 'lucide-react-native';
import { getScoreTheme } from '../../lib/scoreTheme';
import { haptics } from '../../lib/haptics';

// Análise de um produto escaneado — réplica do Figma "Novo design app NIKS" (node 136:126).
//
// FONTE ÚNICA da tela de resultado: usada tanto pela tela do fluxo de scan
// (`app/(scan)/product-result.tsx`, logo após a IA responder) quanto pelo detalhe da aba
// "Escaneados" (`app/(app)/recomendacao-produtos.tsx`, lendo `product_scans.resultado`).
// Os dois já divergiram uma vez (o modal ficou com o layout antigo) — qualquer mudança
// de layout entra AQUI, nunca duplicada nos dois arquivos.
//
// Estrutura: sparkle + `compatibilidade` como número grande + rótulo + foto no anel e o
// resto da análise em cards (título + ícone + texto). TUDO é colorido pela FAIXA da
// compatibilidade, via `getScoreTheme` (a mesma lógica da home): número, anel, gradiente
// E TAMBÉM os títulos/ícones/chips dos cards — a tela inteira fica numa cor só.
// Única exceção: o botão de escanear, que é o CTA da marca e fica sempre rosa `#FF9D9D`
// (igual ao botão "Escanear" da home, constante em todos os temas).
//
// ⚠️ Scans ANTIGOS não têm `compatibilidade` → número vira "—" e o tema cai no rosa
// (nunca "NaN%").

const PAGE_BG = '#f9f9f9';
const WHITE = '#ffffff';
const INK = '#121212';
const INK_BODY = '#3d3d3d';
const INK_MUTE = '#818181';
const ROTINA_PINK = '#ff9d9d'; // cor da marca — só o CTA (botão de escanear), que é constante
const CARD_BORDER = '#e3e3e6';
const HAIRLINE = 'rgba(18,18,18,0.06)';
const PHOTO_BG = '#f4f4f4';
const WARN_FG = '#c67c1e';
const WARN_BG = '#fff8ec';

// Deriva tons translúcidos da cor do tema (wash do ícone, fundo/borda do card de destaque,
// chips) — assim títulos, ícones e acentos acompanham a faixa da compatibilidade.
const hexToRgba = (hex: string, alpha: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const VEREDITO: Record<string, { label: string; fg: string; bg: string }> = {
  pode_usar:    { label: 'Pode usar',        fg: '#1E9E63', bg: 'rgba(30,158,99,0.12)' },
  com_ressalva: { label: 'Use com ressalva', fg: '#C67C1E', bg: 'rgba(232,161,60,0.15)' },
  evitaria:     { label: 'Eu evitaria',      fg: '#D8483F', bg: 'rgba(216,72,63,0.12)' },
};

const ROTINA_TIPO: Record<string, string> = {
  adicionar: 'Vale adicionar à sua rotina',
  substituir: 'Vale substituir um passo',
  manter_rotina: 'Sua rotina já resolve isso',
};

type Props = {
  /** Objeto da análise (resposta da `analisar-produto` / `product_scans.resultado`). */
  result: any;
  /** Foto que a usuária tirou: data URI (fluxo de scan) ou URL assinada (histórico). */
  photoUri: string | null;
  /** Fecha a análise (voltar da tela / fechar o modal). */
  onClose: () => void;
  /** Ação do botão de escanear. Sem ela, o botão não aparece. */
  onRescan?: () => void;
  /** Rótulo do botão de escanear. */
  rescanLabel?: string;
};

export default function ProductAnalysis({ result: r, photoUri, onClose, onRescan, rescanLabel = 'Escanear outro produto' }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const S = width / 393;
  const s = (n: number) => n * S;

  // Medidas do Figma (node 136:126), escaladas pela largura da tela:
  const LOGO = Math.round(width * (49 / 393));   // sparkle do topo (mesmo da home)
  const RING = Math.round(width * (228 / 393));  // círculo do anel (Ellipse 24)
  const PHOTO = Math.round(width * (217 / 393)); // círculo da foto (Ellipse 23)
  // O asset do anel cobre um frame de 265 unidades cujo círculo interno = 228. Renderizado
  // em RING·265/228, o traço cai exatamente sobre a borda do círculo da foto.
  const RING_IMG = RING * (265.005 / 228);
  const CARD_OVERLAP = Math.round(width * (28 / 393)); // cards sobem 28px sobre a foto

  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold,
    Nunito_500Medium, Nunito_400Regular, Lato_900Black,
  });
  const f8 = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const f7 = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const f6 = fontsLoaded ? 'Nunito_600SemiBold' : undefined;
  const f5 = fontsLoaded ? 'Nunito_500Medium' : undefined;
  const f4 = fontsLoaded ? 'Nunito_400Regular' : undefined;
  const fLato = fontsLoaded ? 'Lato_900Black' : undefined; // títulos dos cards (Lato Black)

  // ── Tema de cor pela faixa da compatibilidade (a MESMA lógica da home) ──────────
  // Calculado antes dos early returns porque o Card usa a cor do tema no título/ícone.
  // `compatibilidade` ausente OU null (scans antigos) → null → tema rosa e número "—".
  // ⚠️ `Number(null)` é 0 (viraria vermelho), por isso o null é tratado antes da conversão.
  const rawCompat = r?.compatibilidade;
  const compatNum = rawCompat == null ? NaN : Number(rawCompat);
  const compat = Number.isFinite(compatNum)
    ? Math.max(0, Math.min(100, Math.round(compatNum)))
    : null;
  const theme = getScoreTheme(compat);
  const ACCENT = theme.score;                       // título + ícone dos cards
  const WASH = hexToRgba(ACCENT, 0.14);             // chip do ícone / chips de texto
  const ACCENT_BG = hexToRgba(ACCENT, 0.05);        // fundo do card de destaque (rotina)
  const ACCENT_BORDER = hexToRgba(ACCENT, 0.32);    // borda do card de destaque

  // Entrada dos cards: fade + slide escalonado. Os Animated.Value vivem aqui (não dentro
  // do Card) para não reiniciarem a cada re-render.
  const anims = useRef(Array.from({ length: 6 }, () => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      70,
      anims.map((a) => Animated.timing(a, { toValue: 1, duration: 380, useNativeDriver: true })),
    ).start();
  }, [anims]);

  const IconClose = ({ size = 17 }: { size?: number }) => (
    <Svg width={s(size)} height={s(size)} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M18 6L6 18M6 6l12 12" /></Svg>
  );
  const IconWarn = ({ color = WARN_FG }: { color?: string }) => (
    <Svg width={s(16)} height={s(16)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <Path d="M12 9v4M12 17h.01" />
    </Svg>
  );

  const CloseButton = () => (
    <Pressable
      onPress={() => {
        haptics.tap();
        onClose();
      }}
      style={{
        position: 'absolute', zIndex: 10,
        top: insets.top + s(8), right: s(16),
        width: s(40), height: s(40), borderRadius: s(20),
        backgroundColor: WHITE, borderWidth: 1, borderColor: CARD_BORDER,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <IconClose size={17} />
    </Pressable>
  );

  const RescanButton = () =>
    onRescan ? (
      <Pressable
        onPress={() => {
          haptics.tap();
          onRescan();
        }}
        style={{
          marginTop: s(28), marginHorizontal: s(10),
          height: s(52), borderRadius: s(16),
          backgroundColor: ROTINA_PINK,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: ROTINA_PINK, shadowOffset: { width: 0, height: s(6) },
          shadowOpacity: 0.35, shadowRadius: s(12), elevation: 6,
        }}
      >
        <Text style={{ fontFamily: f7, fontSize: s(16), color: WHITE }}>{rescanLabel}</Text>
      </Pressable>
    ) : null;

  // Card do design (374×auto, radius 16, borda #E3E3E6) — título e ícone na COR DO TEMA
  // (faixa da compatibilidade), sombra suave e entrada animada. `header` entra ANTES do
  // título (identidade do produto no card "O que significa?"); `accent` tinge o card com o
  // tom do tema (card da rotina).
  const Card = ({ title, icon: Icon, index, header, first, accent, children }: {
    title: string;
    icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
    index: number;
    header?: React.ReactNode;
    first?: boolean;
    accent?: boolean;
    children: React.ReactNode;
  }) => {
    const a = anims[Math.min(index, anims.length - 1)];
    return (
      <Animated.View
        style={{
          marginHorizontal: s(10),
          marginTop: first ? 0 : s(16),
          backgroundColor: accent ? ACCENT_BG : WHITE,
          borderWidth: 1, borderColor: accent ? ACCENT_BORDER : CARD_BORDER,
          borderRadius: s(16),
          paddingHorizontal: s(21), paddingTop: s(17), paddingBottom: s(19),
          shadowColor: '#000', shadowOffset: { width: 0, height: s(3) },
          shadowOpacity: 0.05, shadowRadius: s(12), elevation: 2,
          opacity: a,
          transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [s(14), 0] }) }],
        }}
      >
        {header}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
          <View style={{
            width: s(32), height: s(32), borderRadius: s(10),
            backgroundColor: accent ? WHITE : WASH,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={s(17)} color={ACCENT} strokeWidth={2.3} />
          </View>
          <Text style={{ flex: 1, fontFamily: fLato, fontSize: s(16), letterSpacing: s(-0.32), color: ACCENT }}>{title}</Text>
        </View>
        {children}
      </Animated.View>
    );
  };
  const Body = ({ children, top = 13 }: { children: React.ReactNode; top?: number }) => (
    <Text style={{ fontFamily: f4, fontSize: s(14.5), lineHeight: s(14.5) * 1.6, color: INK_BODY, marginTop: s(top) }}>{children}</Text>
  );
  const Chip = ({ label, fg = INK_MUTE, bg = '#f0f0f0' }: { label: string; fg?: string; bg?: string }) => (
    <Text style={{ fontFamily: f6, fontSize: s(11), paddingVertical: s(5), paddingHorizontal: s(12), borderRadius: s(100), backgroundColor: bg, color: fg, overflow: 'hidden' }}>{label}</Text>
  );

  // ── Sem resultado (fallback) ───────────────────────────────────────────────
  if (!r) {
    return (
      <View style={{ flex: 1, backgroundColor: WHITE }}>
        <CloseButton />
        <View style={{ paddingTop: insets.top + s(80), paddingHorizontal: s(24) }}>
          <Text style={{ fontFamily: f8, fontSize: s(20), color: INK }}>Não recebemos a análise</Text>
          <Text style={{ fontFamily: f4, fontSize: s(14), color: INK_MUTE, marginTop: s(8), lineHeight: s(14) * 1.5 }}>Tente escanear o produto de novo.</Text>
          <RescanButton />
        </View>
      </View>
    );
  }

  // ── Precisa de foto dos ingredientes ───────────────────────────────────────
  if (r.status === 'precisa_foto') {
    return (
      <View style={{ flex: 1, backgroundColor: WHITE }}>
        <CloseButton />
        <View style={{ height: s(300) + insets.top, backgroundColor: PHOTO_BG, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {photoUri ? <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
        </View>
        <View style={{ paddingTop: s(24), paddingHorizontal: s(20) }}>
          <Text style={{ fontFamily: f8, fontSize: s(23), lineHeight: s(23) * 1.18, color: INK }}>Preciso ver os ingredientes</Text>
          <Text style={{ fontFamily: f4, fontSize: s(14.5), lineHeight: s(14.5) * 1.6, color: INK_BODY, marginTop: s(12) }}>
            {r.mensagem || 'Não consegui identificar o produto pela foto. Me manda uma foto da lista de ingredientes que eu analiso pra você.'}
          </Text>
          <RescanButton />
        </View>
      </View>
    );
  }

  // ── Resultado da análise (status ok) ───────────────────────────────────────
  const produto = r.produto ?? {};
  const veredito = VEREDITO[r.veredito] ?? null;
  const decisao = r.decisao_rotina ?? {};
  const avisos: string[] = Array.isArray(r.avisos) ? r.avisos : [];
  const ativos: string[] = Array.isArray(produto.ativos_detectados) ? produto.ativos_detectados : [];
  const isEvitaria = r.veredito === 'evitaria';
  const periodoLabel = decisao.periodo === 'am' ? 'Manhã' : decisao.periodo === 'pm' ? 'Noite' : decisao.periodo === 'am+pm' ? 'Manhã e noite' : null;

  return (
    <View style={{ flex: 1, backgroundColor: PAGE_BG }}>
      <CloseButton />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(48) }} showsVerticalScrollIndicator={false}>
        {/* Fundo gradiente branco → tom da faixa de compatibilidade (igual à home) */}
        <LinearGradient
          colors={['#FFFFFF', '#FFFFFF', theme.heroSoft, theme.heroMed, PAGE_BG]}
          locations={[0, 0.5, 0.72, 0.82, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: s(520) }}
          pointerEvents="none"
        />

        <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
          {/* ── Score de compatibilidade ────────────────────────────────── */}
          <View style={{ alignItems: 'center', paddingTop: s(2) }}>
            <Image
              source={theme.logo}
              style={{ width: LOGO, height: Math.round(LOGO * (199 / 196)), resizeMode: 'contain' }}
            />
            <Text style={{ fontFamily: f8, fontSize: s(72), letterSpacing: s(-2.88), color: theme.score, marginTop: s(2) }}>
              {compat != null ? `${compat}%` : '—'}
            </Text>
            <Text style={{ fontFamily: f8, fontSize: s(20), letterSpacing: s(-0.4), color: INK, marginTop: s(-14) }}>
              Compatibilidade de pele
            </Text>
          </View>

          {/* ── Foto do produto no anel colorido pela faixa (Ellipse 23 + 24) ── */}
          <View style={{ alignItems: 'center', marginTop: s(36), zIndex: 1 }}>
            <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: PHOTO, height: PHOTO, borderRadius: PHOTO / 2, backgroundColor: WHITE, overflow: 'hidden' }}>
                {photoUri
                  ? <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <View style={{ flex: 1, backgroundColor: PHOTO_BG }} />}
              </View>
              <Image
                source={theme.ringImg}
                style={{
                  position: 'absolute',
                  width: RING_IMG, height: RING_IMG,
                  left: (RING - RING_IMG) / 2, top: (RING - RING_IMG) / 2,
                }}
              />
            </View>
          </View>
        </SafeAreaView>

        {/* ── Cards (sobem 28px sobre a foto, como no Figma) ─────────────── */}
        <View style={{ marginTop: -CARD_OVERLAP, zIndex: 2 }}>
          {/* O que significa? — identidade do produto (header) + título + manchete */}
          <Card
            title="O que significa?"
            icon={Sparkles}
            index={0}
            first
            header={
              <>
                <View>
                  {!!produto.marca && (
                    <Text style={{ fontFamily: f7, fontSize: s(11), letterSpacing: s(11) * 0.14, textTransform: 'uppercase', color: INK_MUTE, marginBottom: s(3) }}>{produto.marca}</Text>
                  )}
                  <Text style={{ fontFamily: f8, fontSize: s(18), lineHeight: s(18) * 1.25, letterSpacing: s(18) * -0.02, color: INK }}>
                    {produto.nome || produto.categoria || 'Produto'}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s(7), marginTop: s(10) }}>
                    {!!veredito && <Chip label={veredito.label} fg={veredito.fg} bg={veredito.bg} />}
                    {r.confianca === 'media' && <Chip label="Confiança média" />}
                  </View>
                </View>
                <View style={{ height: 1, backgroundColor: HAIRLINE, marginTop: s(15), marginBottom: s(15) }} />
              </>
            }
          >
            {!!r.resumo && (
              <Text style={{ fontFamily: f7, fontSize: s(15.5), lineHeight: s(15.5) * 1.4, color: INK, marginTop: s(10) }}>{r.resumo}</Text>
            )}
            {!!r.explicacao && <Body top={r.resumo ? 8 : 10}>{r.explicacao}</Body>}
          </Card>

          {/* Momento 1 — o produto (o que é, como age e o que costuma entregar).
              ⚠️ O card "O que costuma entregar" (`resultado_esperado_geral`) foi REMOVIDO:
              o campo saiu do prompt por ser redundante com o `o_que_faz`, que agora cobre
              o Momento 1 inteiro. Scans antigos ainda têm o campo no jsonb — a tela ignora. */}
          {!!r.o_que_faz && (
            <Card title="O que é" icon={FlaskConical} index={1}><Body>{r.o_que_faz}</Body></Card>
          )}

          {/* Momento 2 — na pele dela (some quando "evitaria") */}
          {!isEvitaria && !!r.resultado_esperado_para_voce && (
            <Card title="Na sua pele" icon={ScanFace} index={2}><Body>{r.resultado_esperado_para_voce}</Body></Card>
          )}

          {/* Decisão de rotina — Camada 2, independente da compatibilidade.
              Card de DESTAQUE (rosa claro): é a conclusão prática da tela. */}
          {!isEvitaria && !!decisao.tipo && (
            <Card title="Sobre a sua rotina" icon={Flower2} index={3} accent>
              <Text style={{ fontFamily: f8, fontSize: s(15.5), lineHeight: s(15.5) * 1.35, color: INK, marginTop: s(13) }}>
                {ROTINA_TIPO[decisao.tipo] ?? 'Sobre a sua rotina'}
              </Text>
              {(!!decisao.passo || !!periodoLabel) && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(7), marginTop: s(10) }}>
                  {!!decisao.passo && <Chip label={decisao.passo} fg={ACCENT} bg={WHITE} />}
                  {!!periodoLabel && <Chip label={periodoLabel} fg={ACCENT} bg={WHITE} />}
                </View>
              )}
              {!!decisao.produto_substituivel && (
                <Text style={{ fontFamily: f5, fontSize: s(12.5), color: INK_MUTE, marginTop: s(8) }}>No lugar de: {decisao.produto_substituivel}</Text>
              )}
              {!!decisao.justificativa && <Body top={8}>{decisao.justificativa}</Body>}
            </Card>
          )}

          {/* Avisos — cada um numa linha âmbar */}
          {avisos.length > 0 && (
            <Card title="Fique de olho" icon={TriangleAlert} index={4}>
              <View style={{ marginTop: s(13) }}>
                {avisos.map((a, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row', gap: s(10), alignItems: 'flex-start',
                      backgroundColor: WARN_BG, borderRadius: s(12),
                      paddingVertical: s(11), paddingHorizontal: s(12),
                      marginBottom: i === avisos.length - 1 ? 0 : s(8),
                    }}
                  >
                    <View style={{ marginTop: s(1) }}><IconWarn /></View>
                    <Text style={{ flex: 1, fontFamily: f4, fontSize: s(13.5), lineHeight: s(13.5) * 1.5, color: INK_BODY }}>{a}</Text>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Ativos detectados */}
          {ativos.length > 0 && (
            <Card title="Ativos detectados" icon={Atom} index={5}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(7), marginTop: s(13) }}>
                {ativos.map((t, i) => <Chip key={i} label={t} fg={ACCENT} bg={WASH} />)}
              </View>
            </Card>
          )}

          {/* Nota (confiança média) */}
          {!!r.nota && (
            <Text style={{ fontFamily: f4, fontSize: s(12.5), lineHeight: s(12.5) * 1.55, color: INK_MUTE, marginTop: s(18), marginHorizontal: s(21), fontStyle: 'italic' }}>{r.nota}</Text>
          )}

          <RescanButton />
        </View>
      </ScrollView>
    </View>
  );
}
