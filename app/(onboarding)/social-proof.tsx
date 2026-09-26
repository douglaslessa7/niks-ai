import { useEffect, useRef, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useAppStore } from '../../store/onboarding';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObPillButton, NIKS_LOGO,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 17 do onboarding novo — Com × Sem NIKS (Gráfico B "3x mais rápido",
// modelo 6b do design). Tela de valor: só o voltar, fundo rosado.
//
// Animação (roda UMA vez; mesma conta do `tickG` do design): as duas barras
// crescem juntas de baixo para cima. "Sem o NIKS" para em 25% da altura aos
// 500 ms (ease-out) e o "22% eficácia" aparece com fade. "Com o NIKS" vai até 100%
// e termina aos 1,1 s com um leve quique (passa ~4% e volta). O "3x" aparece quando
// a barra passa da metade e conta de 1,0x a 3x entre 0,4 e 1,1 s.
//
// Depois daqui vem o LOADING (tela 18) — é lá que a `analyze-skin` roda, porque
// ela usa tipo de pele / sol / sono, respondidos depois da foto.
const STEP = OB_STEPS.comSemNiks;
const STEP_NAME = 'Com x Sem NIKS';
const TOTAL_MS = 1200;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const back = (x: number) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export default function SocialProof() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { scanSource, setScanSource } = useAppStore();
  const { y, buttonBottom } = useObFrame();
  const [t, setT] = useState(0);
  const raf = useRef<number | null>(null);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  useEffect(() => {
    const t0 = Date.now();
    const loop = () => {
      const now = Date.now() - t0;
      setT(Math.min(now, TOTAL_MS));
      if (now < TOTAL_MS) raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current); };
  }, []);

  const h0 = 50 * easeOut(clamp(t / 500));
  const num0 = clamp((t - 350) / 250);
  const h1 = Math.max(0, 200 * back(clamp(t / 1100)));
  const txt = clamp((h1 - 100) / 40);
  const v = 1 + 2 * easeOut(clamp((t - 400) / 700));
  const count = v >= 2.995 ? '3x' : `${v.toFixed(1).replace('.', ',')}x`;

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    // Ramo herdado da antiga "Avalie-nos": só o onboarding passa por aqui hoje.
    if (scanSource === 'app') {
      setScanSource('onboarding');
      router.replace('/(app)/skin-result' as any);
    } else {
      router.push('/(scan)/loading' as any);
    }
  };

  return (
    <ObScreen variant="blush">
      <View style={{
        position: 'absolute', left: 17, right: 17, top: y(100), height: 330, borderRadius: 20,
        backgroundColor: '#FFFFFF',
        shadowColor: OB.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12,
      }}>
        {/* Sem o NIKS */}
        <View style={{ position: 'absolute', left: 56, width: 110, bottom: 68, alignItems: 'center', gap: 10 }}>
          <View style={{ alignItems: 'center', gap: 2, opacity: num0 }}>
            <Text style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', color: OB.ink }}>22%</Text>
            <Text style={{ fontSize: 13, lineHeight: 16, color: OB.sub }}>eficácia</Text>
          </View>
          <View style={{ width: 110, height: h0, borderRadius: 14, backgroundColor: OB.track }} />
        </View>

        {/* Com o NIKS */}
        <View style={{ position: 'absolute', right: 56, width: 110, bottom: 68, alignItems: 'center' }}>
          <View style={{ width: 110, height: h1, borderRadius: 14, overflow: 'hidden' }}>
            <LinearGradient colors={['#FFC4DA', OB.pink]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <View style={{ position: 'absolute', left: 0, right: 0, top: 22, alignItems: 'center', gap: 2, opacity: txt }}>
              <Text style={{ fontSize: 40, lineHeight: 44, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] }}>{count}</Text>
              <Text style={{ fontSize: 13, lineHeight: 16, color: '#FFFFFF' }}>mais resultado</Text>
            </View>
          </View>
        </View>

        <Text style={{ position: 'absolute', left: 56, width: 110, bottom: 36, textAlign: 'center', fontSize: 11, fontWeight: '600', letterSpacing: 1, color: OB.sub }}>
          SEM O NIKS
        </Text>
        <View style={{ position: 'absolute', right: 46, width: 130, bottom: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Image source={NIKS_LOGO} style={{ width: 13, height: 13, tintColor: OB.pink }} />
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1, color: OB.ink }}>COM O NIKS</Text>
        </View>
      </View>

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(462) }}>
        <ObTitle>Com o NIKS, você chega lá 3x mais rápido.</ObTitle>
      </View>
      <ObSubtitle style={{ position: 'absolute', left: 30, right: 30, top: y(580), marginHorizontal: 0, lineHeight: 24 }}>
        O NIKS monta o skincare exato para o seu objetivo, sem tentativa e erro.
      </ObSubtitle>

      <ObHeader onBack={() => router.back()} />
      <ObPillButton onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
