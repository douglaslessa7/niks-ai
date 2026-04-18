import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft, Sun, Sparkles, User, Glasses } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { CTAButton } from '../../components/ui/CTAButton';
import { AIConsentModal } from '../../components/ui/AIConsentModal';
import { useAIConsent } from '../../hooks/useAIConsent';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useAppStore } from '../../store/onboarding';
import { Colors } from '../../constants/colors';

const instructions = [
  { Icon: Sun, text: 'Boa iluminação natural' },
  { Icon: Sparkles, text: 'Rosto limpo, sem maquiagem' },
  { Icon: User, text: 'Cabelo preso para trás' },
  { Icon: Glasses, text: 'Retire óculos e acessórios do rosto' },
];

export default function ScanPrep() {
  const router = useRouter();
  const { consentModalVisible, requestConsent, handleAccept, handleDecline } = useAIConsent();
  const { track } = useMixpanel();
  const { scanSource } = useAppStore();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 13, step_name: 'Análise com IA', step_total: 23 });
  }, []);

  const handleOpenCamera = () => {
    track('onboarding_step_completed', { step_number: 13, step_name: 'Análise com IA', step_total: 23 });
    requestConsent(() => router.push('/(scan)/camera' as any));
  };

  const backButton = (
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
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ChevronLeft size={20} color="#6B7280" />
    </TouchableOpacity>
  );

  const content = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 18, paddingTop: 40, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={{
        fontSize: 11,
        fontWeight: '700',
        color: Colors.scanBtn,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 8,
      }}>
        Análise da pele
      </Text>

      <Text style={{
        fontSize: 26,
        fontWeight: '800',
        color: Colors.tabActive,
        lineHeight: 31,
        marginBottom: 8,
      }}>
        Agora vamos analisar sua pele por foto
      </Text>

      <Text style={{
        fontSize: 13,
        color: Colors.gray,
        lineHeight: 20,
        marginBottom: 28,
      }}>
        Para melhores resultados:
      </Text>

      <View style={{ gap: 20, marginBottom: 0 }}>
        {instructions.map(({ Icon, text }, index) => (
          <View
            key={index}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <View style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: Colors.scanBtn,
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon size={20} color={Colors.white} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '500', color: Colors.tabActive }}>
              {text}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flex: 1 }} />

      <TouchableOpacity
        onPress={handleOpenCamera}
        activeOpacity={0.8}
        style={{
          backgroundColor: Colors.scanBtn,
          borderRadius: 100,
          paddingVertical: 16,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>
          Abrir câmera
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <>
      <LinearGradient
        colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
        locations={[0, 0.4, 0.7, 1]}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

            <View style={{ paddingTop: 16, paddingHorizontal: 18 }}>
              {backButton}
              {scanSource !== 'app' && (
                <View style={{ marginTop: 16 }}>
                  <View style={{ height: 2, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 1 }}>
                    <View style={{ height: 2, width: '68%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
                  </View>
                </View>
              )}
            </View>

            {content}

          </View>
        </SafeAreaView>
      </LinearGradient>
      <AIConsentModal visible={consentModalVisible} onAccept={handleAccept} onDecline={handleDecline} />
    </>
  );
}
