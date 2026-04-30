import { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  CheckCircle,
  Calendar,
  Camera,
  Utensils,
  Sun,
  TrendingUp,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

const GREEN = '#2E7D32';
const POINT_BORDER = '#C8C8CC';

const HOW_TO_ITEMS = [
  { Icon: Camera, text: 'Use seu Skin Score para acompanhar a evolução' },
  { Icon: Utensils, text: 'Escaneie suas refeições e veja o impacto na pele' },
  { Icon: Sun, text: 'Siga seu protocolo matinal e noturno' },
  { Icon: TrendingUp, text: 'Acompanhe seu progresso semana a semana' },
];

const FACE_BEFORE = 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=600&q=70&sat=-30';
const FACE_AFTER = 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=600&q=80';

const CHIPS = ['Baseado no seu scan', 'Protocolo personalizado'];

export default function PlanPreview() {
  const scanResult = useAppStore((s) => s.scanResult);
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 21, step_name: 'Protocolo Pronto', step_total: 23 });
  }, []);

  const currentScore = scanResult?.skin_score ?? 0;

  const scoreProjetado = useMemo(() => {
    const base = Math.floor(Math.random() * 6) + 90;
    return Math.min(Math.max(base, (scanResult?.skin_score ?? 60) + 20), 95);
  }, []);

  const delta = Math.max(scoreProjetado - currentScore, 0);

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    track('onboarding_step_completed', { step_number: 21, step_name: 'Protocolo Pronto', step_total: 23 });
    router.push('/(onboarding)/signup');
  };

  return (
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.4, 0.7, 1]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* Header — back + progress inline */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingTop: 14,
            paddingHorizontal: 18,
          }}>
            <TouchableOpacity
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              activeOpacity={0.7}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.85)',
                borderWidth: 0.5,
                borderColor: 'rgba(0,0,0,0.08)',
                shadowColor: Colors.black,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.04,
                shadowRadius: 8,
                elevation: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={18} color="#6B7280" strokeWidth={2} />
            </TouchableOpacity>
            <View style={{ flex: 1, height: 2, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 1, overflow: 'hidden' }}>
              <View style={{ width: '92%', height: '100%', backgroundColor: Colors.scanBtn }} />
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >

            {/* BeforeAfter hero — height 210 */}
            <View style={{ paddingHorizontal: 18, paddingTop: 20 }}>
              <View style={{
                position: 'relative',
                height: 210,
                borderRadius: 20,
                overflow: 'hidden',
                flexDirection: 'row',
                backgroundColor: '#000',
                shadowColor: Colors.black,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.12,
                shadowRadius: 16,
                elevation: 6,
              }}>
                {/* Antes */}
                <View style={{ flex: 1, position: 'relative' }}>
                  <Image source={{ uri: FACE_BEFORE }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  {/* Mute overlay (RN equivalent of saturate/brightness filter) */}
                  <View style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.18)',
                  }} />
                  <View style={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 100,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.white, letterSpacing: 0.2 }}>
                      antes
                    </Text>
                  </View>
                </View>

                {/* Gap divider — black 2px gap from row, plus white center line */}
                <View style={{ width: 2, backgroundColor: '#000' }} />

                {/* Depois */}
                <View style={{ flex: 1, position: 'relative' }}>
                  <Image source={{ uri: FACE_AFTER }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  <View style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 100,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.white, letterSpacing: 0.2 }}>
                      depois
                    </Text>
                  </View>
                  {/* +delta corner badge */}
                  <View style={{
                    position: 'absolute',
                    bottom: 12,
                    right: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 10,
                    backgroundColor: Colors.scanBtn,
                  }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.white, lineHeight: 14 }}>
                      +{delta}
                    </Text>
                  </View>
                </View>

                {/* White center divider with glow */}
                <View style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: '50%',
                  width: 2,
                  marginLeft: -1,
                  backgroundColor: '#fff',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.3,
                  shadowRadius: 10,
                  elevation: 4,
                }} />
              </View>
            </View>

            {/* Body */}
            <View style={{ paddingHorizontal: 18, paddingTop: 20 }}>

              {/* CelebrationHeader — row layout */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                <CheckCircle size={36} color={Colors.scanBtn} strokeWidth={2} />
                <Text style={{
                  flex: 1,
                  fontSize: 22,
                  lineHeight: 28,
                  fontWeight: '800',
                  color: Colors.tabActive,
                  letterSpacing: -0.2,
                }}>
                  {'Parabéns! Seu protocolo\nestá pronto!'}
                </Text>
              </View>

              {/* Chips — coral filled, white text, ✦ prefix */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                {CHIPS.map((label) => (
                  <View
                    key={label}
                    style={{
                      backgroundColor: Colors.scanBtn,
                      borderRadius: 100,
                      paddingHorizontal: 11,
                      paddingVertical: 5,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Text style={{ fontSize: 10, color: Colors.white }}>✦</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: Colors.white }}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>

              {/* ScoreTimeline card */}
              <View style={{
                backgroundColor: Colors.white,
                borderRadius: 16,
                padding: 16,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 2,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <Calendar size={14} color={Colors.scanBtn} strokeWidth={2} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.tabActive }}>
                    Linha do tempo do seu progresso
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                  <View style={{
                    borderWidth: 1,
                    borderColor: Colors.scanBtn,
                    borderRadius: 100,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: Colors.tabActive, letterSpacing: 0.3 }}>
                      SCORE ATUAL
                    </Text>
                  </View>
                  <View style={{
                    borderWidth: 1,
                    borderColor: Colors.scanBtn,
                    borderRadius: 100,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: Colors.tabActive, letterSpacing: 0.3 }}>
                      SEU POTENCIAL
                    </Text>
                  </View>
                </View>

                <View style={{ position: 'relative', height: 24, alignItems: 'center', justifyContent: 'center', marginVertical: 8 }}>
                  <View style={{
                    position: 'absolute',
                    left: 10,
                    width: '50%',
                    height: 2,
                    backgroundColor: Colors.scanBtn,
                  }} />
                  <View style={{
                    position: 'absolute',
                    right: 10,
                    width: '50%',
                    height: 2,
                    backgroundColor: 'rgba(0,0,0,0.12)',
                  }} />
                  {/* Left point — coral filled with white inner ring + 1px coral outer ring + glow */}
                  <View style={{
                    position: 'absolute',
                    left: -1,
                    top: 1,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: Colors.scanBtn,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: Colors.scanBtn,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.4,
                    shadowRadius: 6,
                    elevation: 4,
                  }}>
                    <View style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: Colors.scanBtn,
                      borderWidth: 3,
                      borderColor: Colors.white,
                    }} />
                  </View>
                  <View style={{
                    position: 'absolute',
                    right: 0,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: Colors.white,
                    borderWidth: 2,
                    borderColor: POINT_BORDER,
                  }} />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <View>
                    <Text style={{ fontSize: 28, fontWeight: '800', color: Colors.tabActive, lineHeight: 32 }}>
                      {currentScore}
                    </Text>
                    <Text style={{ fontSize: 11, color: Colors.gray, marginTop: 2 }}>pontos hoje</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 28, fontWeight: '800', color: GREEN, lineHeight: 32 }}>
                      {scoreProjetado}
                    </Text>
                    <Text style={{ fontSize: 11, color: GREEN, marginTop: 2 }}>em 3 meses</Text>
                  </View>
                </View>
              </View>

              {/* HowToCard */}
              <View style={{
                backgroundColor: Colors.white,
                borderRadius: 16,
                padding: 16,
                marginTop: 12,
                borderWidth: 0.5,
                borderColor: 'rgba(0,0,0,0.06)',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 2,
              }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.tabActive, marginBottom: 14 }}>
                  Como alcançar seus objetivos
                </Text>
                <View style={{ gap: 12 }}>
                  {HOW_TO_ITEMS.map(({ Icon, text }, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        backgroundColor: Colors.scanBtn,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Icon size={18} color={Colors.white} strokeWidth={2} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: Colors.tabActive }}>
                        {text}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Disclaimer */}
              <Text style={{
                fontSize: 10,
                lineHeight: 14,
                color: Colors.gray,
                textAlign: 'center',
                marginTop: 12,
                marginBottom: 16,
              }}>
                Plano baseado em: Journal of Dermatology, Nutrition Research, SBD
              </Text>

            </View>
          </ScrollView>

          {/* CTA */}
          <View style={{ paddingHorizontal: 18, paddingBottom: 34, paddingTop: 8 }}>
            <TouchableOpacity
              onPress={handleContinue}
              activeOpacity={0.85}
              style={{
                backgroundColor: Colors.scanBtn,
                borderRadius: 100,
                height: 58,
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: Colors.scanBtn,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.4,
                shadowRadius: 24,
                elevation: 8,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>
                Vamos começar!
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
