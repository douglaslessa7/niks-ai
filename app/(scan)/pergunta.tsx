import { useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { OB, ObChoiceScreen, ObHeader, ObPillButton, ObScreen, ObTitle, useObFrame } from '../../components/onboarding/kit';
import { PERGUNTAS, PRIMEIRA, PerguntaId, depoisDe, ehPergunta } from '../../components/onboarding/personalizacao';
import { useObPassoVisto } from '../../components/onboarding/passo';
import { ORDEM } from '../../components/onboarding/personalizacao';
import { OB_STEPS } from '../../components/onboarding/kit';

// Onboarding — uma pergunta da personalização da rotina (`?q=<id>`; ordem, textos e opções em
// `components/onboarding/personalizacao.ts`). Como as telas antigas de pergunta: uma tela por
// pergunta, `ObChoiceScreen` do kit (voltar, título, opções, "Continuar"), a próxima entrando
// deslizando (`push`) — sem barra de progresso, sem animação extra e sem telas entre as
// perguntas (04/nov/2026, pedido do produto). A resposta é gravada no "Continuar"; a última
// (água) segue para o resultado do scan. A 1ª pergunta não tem voltar (antes dela vêm a
// transição rosa e o "Seu caminho", que não têm volta). Sem passo no Mixpanel.
export default function PerguntaPersonalizacao() {
  const router = useRouter();
  const { q: param } = useLocalSearchParams<{ q?: string }>();
  const q: PerguntaId = ehPergunta(param) ? param : PRIMEIRA;
  const onboarding = useAppStore((s) => s.onboarding);
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);
  const primeira = q === PRIMEIRA;
  // Funil v2: 17 + posição em ORDEM (17 a 23); a condicional ("Qual ativo…") fica fora.
  const posicao = (ORDEM as readonly string[]).indexOf(q);
  useObPassoVisto(posicao >= 0 ? OB_STEPS.pergunta + posicao : 0, `Pergunta: ${q}`);

  useEffect(() => {
    if (!primeira) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [primeira]);

  const seguir = (v: string) => {
    const prox = depoisDe(q, v);
    // Depois da água: a demonstração do scan de produto — a transição rosa (`(scan)/demo-transicao`)
    // e o scan de exemplo (`(scan)/demo-scan`), que segue para o resultado do scan (04/nov/2026).
    if (prox === 'fim') router.push('/(scan)/demo-transicao' as any);
    else router.push({ pathname: '/(scan)/pergunta', params: { q: prox } } as any);
  };
  const voltar = primeira ? undefined : () => router.back();

  if (q === 'alergiaQual') return <AlergiaQual onContinue={seguir} onBack={() => router.back()} />;

  const p = PERGUNTAS[q];
  const atual = onboarding[p.campo];
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />{/* onboarding: só a setinha volta (12/nov/2026) */}
      <ObChoiceScreen<string>
        title={p.titulo}
        options={p.opcoes}
        initial={typeof atual === 'string' && p.opcoes.some((o) => o.value === atual) ? atual : null}
        centerOptions
        onBack={voltar}
        onSelect={() => {}}
        onContinue={(v) => {
          setOnboardingField(p.campo, v as never);
          if (q === 'alergia' && v !== 'reaction') setOnboardingField('allergy_description', null);
          seguir(v);
        }}
      />
    </>
  );
}

/** "Qual ativo ou produto causou?" — só para quem já teve reação. Mesmo layout da tela antiga
 *  `allergies-detail.tsx`: bloco centrado acima do teclado (título → 21 → campo → 39 → botão). */
function AlergiaQual({ onContinue, onBack }: { onContinue: (v: string) => void; onBack: () => void }) {
  const { y } = useObFrame();
  const inicial = useAppStore((s) => s.onboarding.allergy_description);
  const setOnboardingField = useAppStore((s) => s.setOnboardingField);
  const [texto, setTexto] = useState(inicial ?? '');
  const ativo = texto.trim().length >= 2;

  const continuar = () => {
    if (!ativo) return;
    haptics.action();
    setOnboardingField('allergy_description', texto.trim());
    onContinue(texto.trim());
  };

  return (
    <ObScreen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, paddingTop: y(90), justifyContent: 'center' }}
      >
        <View>
          <ObTitle>Qual ativo ou produto causou?</ObTitle>
          <View style={{ marginTop: 21, marginHorizontal: 17, minHeight: 57, borderRadius: 12, backgroundColor: OB.option, justifyContent: 'center' }}>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              autoFocus
              multiline
              maxLength={60}
              placeholder="Ex: retinol, ácido glicólico, protetor solar X..."
              placeholderTextColor={OB.sub}
              selectionColor={OB.pink}
              cursorColor={OB.pink}
              // ⚠️ multiline: sem `height` fixo (decisão 17 do README), só maxHeight.
              style={{ maxHeight: 120, fontSize: 17, lineHeight: 23, color: OB.ink, paddingHorizontal: 16, paddingTop: 17, paddingBottom: 17 }}
            />
          </View>
          <ObPillButton onPress={continuar} disabled={!ativo} style={{ marginTop: 39 }} />
        </View>
      </KeyboardAvoidingView>
      <ObHeader onBack={onBack} />
    </ObScreen>
  );
}
