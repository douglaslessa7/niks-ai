import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { haptics } from '../../lib/haptics';
import { useAIConsent } from '../../hooks/useAIConsent';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObPillButton,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { ConsentSheet } from '../../components/onboarding/ConsentSheet';

// Tela 6 do onboarding novo — preparação do scan (modelo 8a do design): título
// centralizado sem eyebrow, os 5 cuidados num card branco com divisórias #F0EDEB e
// ícone branco em círculo #FF5EA8, botão "Abrir câmera".
//
// Consentimento de IA (modelo 8b): ao tocar em "Abrir câmera", quem ainda não
// aceitou vê a folha "Antes de continuar" POR CIMA desta tela. Aceitar grava
// `ai_consent_accepted` e abre a câmera; "Cancelar" fecha a folha e fica aqui.
// ⚠️ A câmera continua com o `useScanConsentGate` (trava única do README, seção
// 14) — aqui só antecipamos o pedido; quem já aceitou não vê nada em lugar nenhum.
//
// Só o onboarding passa por esta tela (o app usa `scan-prep-app`).
const STEP = OB_STEPS.prepScan;
const STEP_NAME = 'Análise com IA';

const ICON_PROPS = { fill: 'none', stroke: '#FFFFFF', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const TIPS: { label: string; icon: React.ReactNode }[] = [
  {
    label: 'Local com boa iluminação',
    icon: (<>
      <Circle cx={12} cy={12} r={4} {...ICON_PROPS} />
      <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" {...ICON_PROPS} />
    </>),
  },
  {
    label: 'Rosto limpo, sem maquiagem',
    icon: (<>
      <Path d="M11 3l1.8 4.9L17.7 9.7l-4.9 1.8L11 16.4l-1.8-4.9L4.3 9.7l4.9-1.8z" {...ICON_PROPS} />
      <Path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" {...ICON_PROPS} />
    </>),
  },
  {
    label: 'Cabelo preso',
    icon: (<>
      <Circle cx={12} cy={8} r={4} {...ICON_PROPS} />
      <Path d="M4.5 20.5c0-3.9 3.4-6.3 7.5-6.3s7.5 2.4 7.5 6.3" {...ICON_PROPS} />
    </>),
  },
  {
    label: 'Sem óculos',
    icon: (<>
      <Circle cx={6.5} cy={14.5} r={3.5} {...ICON_PROPS} />
      <Circle cx={17.5} cy={14.5} r={3.5} {...ICON_PROPS} />
      <Path d="M10 14.5c1.3-1 2.7-1 4 0M3 14.5L4.8 8M21 14.5L19.2 8" {...ICON_PROPS} />
    </>),
  },
  {
    label: 'Expressão neutra na foto',
    icon: (<>
      <Circle cx={12} cy={12} r={9} {...ICON_PROPS} />
      <Path d="M8.5 14.2c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2" {...ICON_PROPS} />
      <Path d="M9 9.5h.01M15 9.5h.01" {...ICON_PROPS} strokeWidth={2.6} />
    </>),
  },
];

export default function ScanPrep() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { y, buttonBottom } = useObFrame();
  const { consentModalVisible, requestConsent, handleAccept, handleDecline } = useAIConsent();

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const openCamera = () => {
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(scan)/camera' as any);
  };

  return (
    <ObScreen variant="blush">
      <View style={{ position: 'absolute', left: 0, right: 0, top: y(112) }}>
        <ObTitle>Agora vamos analisar sua pele por foto.</ObTitle>
      </View>
      <ObSubtitle style={{ position: 'absolute', left: 0, right: 0, top: y(189) }}>
        Para uma análise mais precisa, se certifique:
      </ObSubtitle>

      <View style={{
        position: 'absolute', left: 17, right: 17, top: y(236), borderRadius: 20, backgroundColor: '#FFFFFF',
        shadowColor: OB.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12,
      }}>
        {TIPS.map((tip, i) => (
          <View key={tip.label} style={{
            height: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18,
            borderBottomWidth: i < TIPS.length - 1 ? 1 : 0, borderBottomColor: OB.divider,
          }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={22} height={22} viewBox="0 0 24 24">{tip.icon}</Svg>
            </View>
            <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '500', color: OB.ink }}>{tip.label}</Text>
          </View>
        ))}
      </View>

      <ObHeader step={STEP} onBack={() => router.back()} />
      <ObPillButton
        label="Abrir câmera"
        bottom={buttonBottom}
        onPress={() => { haptics.action(); requestConsent(openCamera); }}
      />

      <ConsentSheet visible={consentModalVisible} onAccept={handleAccept} onDecline={handleDecline} />
    </ObScreen>
  );
}
