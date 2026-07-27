import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, Pressable, Animated, ScrollView, TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold } from '@expo-google-fonts/nunito';
import { X } from 'lucide-react-native';
import StickerThumb from './StickerThumb';
import { haptics } from '../../lib/haptics';
import { MetricKey } from '../../lib/metricColor';
import { METRIC_DEFS, Metricas, availableKeys, hasMetrics } from '../../lib/metricDefs';
import {
  StickerSpec, StickerShape, specEq, sortKeys, feasibleShapes, stickerShape,
} from '../../lib/stickerSpec';
import { usablePresets } from '../../lib/stickerPresets';

// ── Bandeja de adesivos (estilo bandeja de figurinhas do Instagram) ───────────
// Duas abas: "Sugestões" (14 presets prontos, cada um desenhado com os NÚMEROS REAIS
// da usuária) e "Montar o meu" (chips liga/desliga → qualquer uma das 128 combinações
// de score + 6 métricas). Escolher um adesivo SUBSTITUI o atual — um por vez.
//
// ⚠️ NADA de react-native-gesture-handler aqui dentro. No Android o <Modal> é outra
// janela e não é coberto pelo `GestureHandlerRootView` de `app/_layout.tsx`. Por isso
// a bandeja NÃO tem arrastar-para-fechar: fecha pelo backdrop, pelo X e pelo botão.
// O ScrollView do próprio RN funciona normalmente.
//
// Casca (animação, raio, handle, paddings) copiada de `components/scan/ScanModal.tsx`,
// que é o bottom sheet de referência do projeto.

const WHITE = '#FFFFFF';
const INK = '#121212';
const INK_MUTE = '#818181';
const CORAL = '#FF9D9D';
const CORAL_WASH = '#FFF1F1';
const CARD_BD = '#E3E3E6';
const BACKDROP = 'rgba(0,0,0,0.45)';

type Tab = 'sugestoes' | 'montar';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (spec: StickerSpec) => void;
  selected: StickerSpec;
  skinScore: number | null;
  metricas: Metricas;
};

export default function StickerSheet({
  visible, onClose, onPick, selected, skinScore, metricas,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(800)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const [fontsLoaded] = useFonts({ Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold });
  const f8 = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const f7 = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const f6 = fontsLoaded ? 'Nunito_600SemiBold' : undefined;

  const [tab, setTab] = useState<Tab>('sugestoes');
  // Rascunho da aba "Montar o meu". Semeado a partir do adesivo atual sempre que a
  // bandeja abre — quem escolheu um preset e voltou para ajustar continua de onde parou.
  const [draft, setDraft] = useState<StickerSpec>(selected);

  const avail = availableKeys(metricas);
  const temMetricas = hasMetrics(metricas);
  const presets = usablePresets(metricas);

  useEffect(() => {
    if (visible) {
      setDraft(selected);
      setTab('sugestoes');
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, friction: 9, tension: 65, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 800, duration: 280, useNativeDriver: true }),
      ]).start();
    }
    // `selected` de propósito FORA das deps: semear o rascunho é um evento de abertura,
    // não uma sincronização contínua — senão trocar de adesivo apagaria o rascunho.
  }, [visible]);

  const sheetH = Math.min(height * 0.78, 660);
  const innerW = width - 40;              // padding horizontal 20 de cada lado
  const colGap = 12;
  const boxW = (innerW - colGap) / 2;     // grade de 2 colunas

  const pick = (spec: StickerSpec) => {
    onPick(spec);
    onClose();
  };

  const toggleScore = () => {
    haptics.select();
    setDraft((d) => ({ ...d, showScore: !d.showScore }));
  };

  const toggleKey = (key: MetricKey) => {
    haptics.select();
    setDraft((d) => {
      const keys = d.keys.includes(key)
        ? d.keys.filter((k) => k !== key)
        : sortKeys([...d.keys, key]);
      // Se a forma escolhida deixou de ser viável (ex.: estava em círculo e passou de
      // 4 métricas), volta para o automático — o preview não pode ficar num estado impossível.
      const next: StickerSpec = { ...d, keys };
      if (next.shape && !feasibleShapes(next).includes(next.shape)) next.shape = undefined;
      return next;
    });
  };

  const chooseShape = (shape: StickerShape) => {
    haptics.select();
    setDraft((d) => ({ ...d, shape }));
  };

  const draftVazio = !draft.showScore && draft.keys.length === 0;
  // Só oferecemos o seletor de formato quando há mais de uma forma possível — com 0
  // métricas (só score) o círculo é a única opção.
  const shapes = feasibleShapes(draft);
  const showShapeToggle = draft.keys.length >= 1 && shapes.length > 1;
  const currentShape = stickerShape(draft);

  const Chip = ({
    label, on, disabled, onPress,
  }: { label: string; on: boolean; disabled?: boolean; onPress: () => void }) => (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      style={{
        paddingHorizontal: 14, height: 38, borderRadius: 100,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: on ? CORAL_WASH : WHITE,
        borderWidth: on ? 1.5 : 1,
        borderColor: on ? CORAL : CARD_BD,
        marginRight: 8, marginBottom: 8,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontFamily: on ? f7 : f6, fontSize: 13.5, color: on ? INK : INK_MUTE }}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={{ flex: 1, opacity }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: BACKDROP }} />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: sheetH,
          backgroundColor: WHITE,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingTop: 12, paddingHorizontal: 20,
          paddingBottom: insets.bottom > 0 ? insets.bottom + 12 : 24,
          transform: [{ translateY }],
          shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08, shadowRadius: 24, elevation: 24,
        }}
      >
        {/* Handle — decorativo. Sem arrastar-para-fechar (ver nota do topo). */}
        <View style={{ width: 40, height: 5, borderRadius: 100, backgroundColor: CARD_BD, alignSelf: 'center', marginBottom: 14 }} />

        {/* Cabeçalho */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ flex: 1, fontFamily: f8, fontSize: 19, color: INK, letterSpacing: -0.5 }}>
            Escolha seu adesivo
          </Text>
          <TouchableOpacity
            onPress={() => { haptics.tap(); onClose(); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            style={{
              width: 32, height: 32, borderRadius: 100,
              borderWidth: 1, borderColor: CARD_BD,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} color={INK} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {/* Abas */}
        <View
          style={{
            flexDirection: 'row', backgroundColor: '#F5F5F6',
            borderRadius: 100, padding: 4, marginBottom: 16,
          }}
        >
          {([['sugestoes', 'Sugestões'], ['montar', 'Montar o meu']] as const).map(([key, label]) => {
            const on = tab === key;
            return (
              <TouchableOpacity
                key={key}
                activeOpacity={0.85}
                onPress={() => { haptics.select(); setTab(key); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{
                  flex: 1, height: 36, borderRadius: 100,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: on ? WHITE : 'transparent',
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: on ? 0.06 : 0, shadowRadius: 3,
                }}
              >
                <Text style={{ fontFamily: on ? f8 : f6, fontSize: 14, color: on ? INK : INK_MUTE }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Aba SUGESTÕES ──────────────────────────────────────────────────── */}
        {tab === 'sugestoes' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {presets.map((p) => (
                <View key={p.id} style={{ width: boxW, marginBottom: 22, alignItems: 'center' }}>
                  <StickerThumb
                    spec={p.spec}
                    skinScore={skinScore}
                    metricas={metricas}
                    boxW={boxW - 16}
                    selected={specEq(p.spec, selected)}
                    onPress={() => pick(p.spec)}
                  />
                  <Text
                    numberOfLines={1}
                    style={{ fontFamily: f6, fontSize: 11.5, color: INK_MUTE, marginTop: 10 }}
                  >
                    {p.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Scan legado: tem score, mas o `full_result` é anterior às 6 métricas.
                A grade colapsa para um item só — explicar em vez de mostrar zeros. */}
            {!temMetricas && (
              <View
                style={{
                  backgroundColor: CORAL_WASH, borderRadius: 16,
                  padding: 16, marginTop: 4, marginBottom: 12,
                }}
              >
                <Text style={{ fontFamily: f7, fontSize: 14, color: INK, marginBottom: 4 }}>
                  Aprimoramos a análise de pele.
                </Text>
                <Text style={{ fontFamily: f6, fontSize: 13, color: INK_MUTE, lineHeight: 18 }}>
                  Faça um novo scan para desbloquear suas 6 métricas e todos os adesivos.
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* ── Aba MONTAR O MEU ───────────────────────────────────────────────── */}
        {tab === 'montar' && (
          <View style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
              {/* Preview ao vivo do adesivo montado. */}
              <View style={{ alignItems: 'center', marginBottom: 16, minHeight: 150 }}>
                {draftVazio ? (
                  <View style={{ height: 150, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: f6, fontSize: 13, color: INK_MUTE }}>
                      Escolha pelo menos um item abaixo
                    </Text>
                  </View>
                ) : (
                  <StickerThumb
                    spec={draft}
                    skinScore={skinScore}
                    metricas={metricas}
                    boxW={Math.min(200, innerW * 0.62)}
                  />
                )}
              </View>

              {/* Seletor de FORMATO — só aparece quando há mais de uma forma viável
                  (com métrica de sobra). Deixa escolher círculo ou card livremente. */}
              {showShapeToggle && (
                <View
                  style={{
                    flexDirection: 'row', alignSelf: 'center',
                    backgroundColor: '#F5F5F6', borderRadius: 100, padding: 4, marginBottom: 18,
                  }}
                >
                  {([['circle', 'Círculo'], ['card', 'Card']] as const).map(([sh, label]) => {
                    const on = currentShape === sh;
                    const can = shapes.includes(sh as StickerShape);
                    return (
                      <TouchableOpacity
                        key={sh}
                        activeOpacity={0.85}
                        disabled={!can}
                        onPress={() => chooseShape(sh as StickerShape)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on, disabled: !can }}
                        style={{
                          minWidth: 96, height: 34, borderRadius: 100,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: on ? WHITE : 'transparent',
                          opacity: can ? 1 : 0.4,
                          shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: on ? 0.06 : 0, shadowRadius: 3,
                        }}
                      >
                        <Text style={{ fontFamily: on ? f8 : f6, fontSize: 13.5, color: on ? INK : INK_MUTE }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Chip label="Niks score" on={draft.showScore} onPress={toggleScore} />
                {METRIC_DEFS.map((m) => (
                  <Chip
                    key={m.key}
                    label={m.label.replace('\n', ' ')}
                    on={draft.keys.includes(m.key)}
                    disabled={!avail.has(m.key)}
                    onPress={() => toggleKey(m.key)}
                  />
                ))}
              </View>

              {!temMetricas && (
                <Text style={{ fontFamily: f6, fontSize: 12.5, color: INK_MUTE, marginTop: 8, lineHeight: 17 }}>
                  Faça um novo scan para desbloquear suas 6 métricas.
                </Text>
              )}
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={draftVazio}
              onPress={() => { haptics.action(); pick(draft); }}
              accessibilityRole="button"
              style={{
                height: 50, borderRadius: 100, backgroundColor: CORAL,
                alignItems: 'center', justifyContent: 'center',
                marginTop: 8, opacity: draftVazio ? 0.45 : 1,
              }}
            >
              <Text style={{ fontFamily: f8, fontSize: 16, color: WHITE }}>Usar adesivo</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}
