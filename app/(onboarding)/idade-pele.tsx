import { useEffect, useRef, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObTitle, ObSubtitle, ObPillButton, NIKS_LOGO,
  useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';

// Tela 9 do fluxo completo — "Sua pele tem N anos. Você tem M." Nota do design: SÓ
// aparece quando a idade da pele no scan (`skin_age`) é MAIOR que a idade informada
// na tela 3 — quem decide é o resultado do scan (8).
//
// VISUAL = o da tela "Com × Sem NIKS" (`social-proof.tsx`, a 22 do design), a pedido
// do produto: fundo rosado, card branco com as duas barras (cinza = a idade dela, com
// o número dentro; rosa em degradê = a idade da pele, também com o número dentro), rótulos
// em caixa alta embaixo, título e subtítulo centralizados abaixo do card.
//
// Animação (UMA vez, mesma conta da social-proof): a barra cinza sobe até a altura
// dela aos 500 ms (ease-out) e o número (dentro dela) aparece com fade; a rosa vai até o topo e
// termina aos 1,1 s com um leve quique, contando da idade dela até a da pele.
// Alturas: a rosa é sempre a cheia (200); a cinza é proporcional a partir de um eixo
// que começa 8 anos abaixo da idade dela — com eixo em zero, 24 × 27 anos dariam
// barras quase iguais e a diferença sumiria. A cinza nunca fica abaixo de 110 pt, para
// o número caber dentro.
const STEP = OB_STEPS.idadePele;
const STEP_NAME = 'Idade da Pele';
const TOTAL_MS = 1200;
const FULL_H = 200;
const AXIS_GAP = 8;
const MIN_AGE_H = 110;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const back = (x: number) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export default function IdadePele() {
  const router = useRouter();
  const { track } = useMixpanel();
  const scanResult = useAppStore((s) => s.scanResult);
  const birthday = useAppStore((s) => s.onboarding.birthday);
  const { y, buttonBottom } = useObFrame();
  const [t, setT] = useState(0);
  const raf = useRef<number | null>(null);

  const age = Number(birthday) || 0;
  const skinAge = Math.round(scanResult?.skin_age ?? scanResult?.envelhecimento?.skin_age ?? age);

  useOnMount(() => track('onboarding_step_viewed', { ...obStep(STEP, STEP_NAME), idade: age, idade_pele: skinAge }));

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

  // Mínimo de 110 pt: o número (40 pt + "anos") cabe dentro da barra cinza.
  const ageH = Math.max(MIN_AGE_H, FULL_H * (AXIS_GAP / Math.max(AXIS_GAP, skinAge - age + AXIS_GAP)));
  const h0 = ageH * easeOut(clamp(t / 500));
  const num0 = clamp((t - 350) / 250);
  const h1 = Math.max(0, FULL_H * back(clamp(t / 1100)));
  const txt = clamp((h1 - 100) / 40);
  const count = Math.round(age + (skinAge - age) * easeOut(clamp((t - 400) / 700)));
  const news = clamp((t - 900) / 300);

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/transicao-rotina');
  };

  return (
    <ObScreen variant="blush">
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={{
        position: 'absolute', left: 17, right: 17, top: y(100), height: 330, borderRadius: 20,
        backgroundColor: '#FFFFFF',
        shadowColor: OB.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 12,
      }}>
        {/* Você — número DENTRO da barra, no mesmo lugar e tamanho do da pele */}
        <View style={{ position: 'absolute', left: 56, width: 110, bottom: 68, alignItems: 'center' }}>
          <View style={{ width: 110, height: h0, borderRadius: 14, overflow: 'hidden', backgroundColor: OB.track }}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 22, alignItems: 'center', gap: 2, opacity: num0 }}>
              <Text style={{ fontSize: 40, lineHeight: 44, fontWeight: '700', color: OB.ink, fontVariant: ['tabular-nums'] }}>{age}</Text>
              <Text style={{ fontSize: 13, lineHeight: 16, color: OB.sub }}>anos</Text>
            </View>
          </View>
        </View>

        {/* Sua pele */}
        <View style={{ position: 'absolute', right: 56, width: 110, bottom: 68, alignItems: 'center' }}>
          <View style={{ width: 110, height: h1, borderRadius: 14, overflow: 'hidden' }}>
            <LinearGradient colors={['#FFC4DA', OB.pink]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <View style={{ position: 'absolute', left: 0, right: 0, top: 22, alignItems: 'center', gap: 2, opacity: txt }}>
              <Text style={{ fontSize: 40, lineHeight: 44, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] }}>{count}</Text>
              <Text style={{ fontSize: 13, lineHeight: 16, color: '#FFFFFF' }}>anos</Text>
            </View>
          </View>
        </View>

        <Text style={{ position: 'absolute', left: 56, width: 110, bottom: 36, textAlign: 'center', fontSize: 11, fontWeight: '600', letterSpacing: 1, color: OB.sub }}>
          VOCÊ
        </Text>
        <View style={{ position: 'absolute', right: 46, width: 130, bottom: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Image source={NIKS_LOGO} style={{ width: 13, height: 13, tintColor: OB.pink }} />
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1, color: OB.ink }}>SUA PELE</Text>
        </View>
      </View>

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(462) }}>
        <ObTitle>{`Sua pele tem ${skinAge} anos.\nVocê tem ${age}.`}</ObTitle>
      </View>
      <ObSubtitle style={{ position: 'absolute', left: 30, right: 30, top: y(580), marginHorizontal: 0, lineHeight: 24, opacity: news }}>
        <Text style={{ color: OB.ink, fontWeight: '600' }}>A boa notícia: </Text>
        a pele responde rápido a cuidado diário, seguindo a rotina certa.
      </ObSubtitle>

      <ObHeader onBack={() => router.back()} />
      <ObPillButton onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
