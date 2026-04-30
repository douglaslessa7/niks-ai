import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

type PainContent = {
  emoji: string;
  title: string;
  subtitle: string;
  badge: string;
};

const DEFAULT_CONTENT: PainContent = {
  emoji: '💙',
  title: 'Acne não é falta de cuidado',
  subtitle: 'É uma condição inflamatória que afeta 85% dos brasileiros. O que falta é o protocolo certo para o SEU tipo de pele.',
  badge: '🔬 Estudos mostram que protocolos personalizados reduzem acne em até 74% em 8 semanas',
};

const PAIN_CONTENT: Record<string, PainContent> = {
  'Acne': {
    emoji: '💙',
    title: 'Acne não é falta de cuidado',
    subtitle: 'É uma condição inflamatória que afeta 85% dos brasileiros em algum momento da vida. O que falta é o protocolo certo para o SEU tipo de pele.',
    badge: '🔬 Estudos mostram que protocolos personalizados reduzem acne em até 74% em 8 semanas',
  },
  'Manchas': {
    emoji: '✨',
    title: 'Manchas não somem com qualquer creme',
    subtitle: 'Elas precisam de ativos específicos, aplicados na ordem certa e no horário certo. Sem isso, você pode até piorar.',
    badge: '🔬 O uso correto de vitamina C e ácidos clareadores reduz manchas em até 68% em 6 semanas',
  },
  'Oleosidade': {
    emoji: '💧',
    title: 'Pele oleosa não é culpa sua',
    subtitle: 'É genética e hormonal. Mas com os ativos certos — e sem exagerar na limpeza — dá para controlar completamente.',
    badge: '🔬 Protocolos específicos para pele oleosa reduzem a produção de sebo em até 60% em 4 semanas',
  },
  'Rugas': {
    emoji: '🌟',
    title: 'Rugas aparecem cedo quando a pele não é tratada',
    subtitle: 'A boa notícia: muito do que já apareceu dá para amenizar. E o que ainda vai aparecer dá para prevenir com os ativos certos.',
    badge: '🔬 Retinol e peptídeos reduzem linhas finas em até 45% em 12 semanas de uso consistente',
  },
  'Poros dilatados': {
    emoji: '🫧',
    title: 'Poros dilatados têm solução',
    subtitle: 'Eles não fecham do dia para a noite, mas com os ácidos certos e uma rotina consistente ficam visivelmente menores em semanas.',
    badge: '🔬 Ácido salicílico reduz aparência de poros em até 52% em 6 semanas de uso regular',
  },
  'Olheiras': {
    emoji: '🌙',
    title: 'Olheiras são mais complexas do que parecem',
    subtitle: 'Podem ser genéticas, vasculares ou por perda de volume. Saber a causa muda tudo no tratamento — e é exatamente o que vamos descobrir.',
    badge: '🔬 Protocolos combinando vitamina K e cafeína reduzem olheiras em até 58% em 8 semanas',
  },
  'Ressecamento': {
    emoji: '🍯',
    title: 'Pele ressecada está pedindo socorro',
    subtitle: 'Ela não precisa de mais hidratante — precisa do hidratante certo, na camada certa, com os ingredientes que a sua pele consegue absorver.',
    badge: '🔬 Hidratantes com ceramidas e ácido hialurônico aumentam hidratação da pele em até 70% em 2 semanas',
  },
  'Textura irregular': {
    emoji: '🪄',
    title: 'Textura irregular é tratável',
    subtitle: 'Ela aparece por acúmulo de células mortas, cicatrizes ou produção irregular de sebo. Com os esfoliantes certos no ritmo certo, a pele fica lisa de novo.',
    badge: '🔬 Esfoliação química regular melhora textura da pele em até 63% em 6 semanas',
  },
};

export default function PainValidation() {
  const concerns = useAppStore((s) => s.onboarding.concerns) ?? [];
  const primaryConcern = concerns[0] ?? 'Acne';
  const content = PAIN_CONTENT[primaryConcern] ?? DEFAULT_CONTENT;

  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', {
      step_number: 15,
      step_name: 'Pain Validation',
      step_total: 28,
      primary_concern: primaryConcern,
    });
  }, []);

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    track('onboarding_step_completed', {
      step_number: 15,
      step_name: 'Pain Validation',
      step_total: 28,
      primary_concern: primaryConcern,
    });
    router.push('/(onboarding)/emotional-goal');
  };

  return (
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.4, 0.7, 1]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* Header */}
          <View style={{ paddingTop: 24, paddingHorizontal: 18 }}>
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

            <View style={{ marginTop: 16 }}>
              <View style={{ height: 2, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 1 }}>
                <View style={{ height: 2, width: '68%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
              </View>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >

            {/* Visual element */}
            <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 28 }}>
              <View style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: 'rgba(251,123,107,0.12)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 40 }}>{content.emoji}</Text>
              </View>
            </View>

            {/* Label */}
            <Text style={{
              fontSize: 11,
              fontWeight: '700',
              color: Colors.scanBtn,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              marginBottom: 12,
              textAlign: 'center',
            }}>
              Nós entendemos
            </Text>

            {/* Title */}
            <Text style={{
              fontSize: 26,
              fontWeight: '800',
              color: Colors.tabActive,
              lineHeight: 32,
              textAlign: 'center',
              marginBottom: 12,
            }}>
              {content.title}
            </Text>

            {/* Subtitle */}
            <Text style={{
              fontSize: 15,
              color: Colors.gray,
              lineHeight: 24,
              textAlign: 'center',
              marginBottom: 24,
            }}>
              {content.subtitle}
            </Text>

            {/* Scientific badge */}
            <View style={{
              backgroundColor: Colors.white,
              borderRadius: 16,
              padding: 14,
              marginBottom: 40,
              shadowColor: Colors.black,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 8,
              elevation: 2,
            }}>
              <Text style={{
                fontSize: 13,
                color: Colors.tabActive,
                lineHeight: 20,
                fontWeight: '500',
              }}>
                {content.badge}
              </Text>
            </View>

          </ScrollView>

          {/* CTA */}
          <View style={{ paddingHorizontal: 18, paddingBottom: 32, paddingTop: 8 }}>
            <TouchableOpacity
              onPress={handleContinue}
              activeOpacity={0.85}
              style={{
                backgroundColor: Colors.scanBtn,
                borderRadius: 100,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>
                Continuar
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
