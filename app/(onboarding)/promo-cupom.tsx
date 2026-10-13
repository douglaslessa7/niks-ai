// Tela de digitar o cupom de influenciadora.
//
// ⚠️ SEGURANÇA: esta tela NÃO pode virar rota de fuga do paywall. Ela vive só no
// grupo (onboarding) e NÃO tem nenhuma navegação para dentro do app. As únicas saídas
// são: voltar para o paywall com desconto (cupom válido) ou para o paywall normal
// (botão voltar). Quem não assinou não entra no app por aqui.
//
// A usuária ainda não tem sessão neste momento (o paywall vem antes do signup) e o
// RevenueCat está anônimo. Validamos via Edge Function `validar-cupom` (fetch + apikey,
// nunca supabase.functions.invoke) e guardamos o cupom localmente para ligar ao user_id
// no signup depois.
//
// Visual do kit do onboarding (out/2026), textos e lógica da versão B intactos.

import { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Purchases from 'react-native-purchases';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { setNextPlacement } from '../../lib/paywallFlow';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, ObScreen, ObHeader, ObTitle, ObSubtitle, ObPillButton, useObFrame,
} from '../../components/onboarding/kit';

// Edge Function `validar-cupom` — fetch direto + apikey (padrão do projeto, nunca invoke).
const FUNCTION_URL = 'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/validar-cupom';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cGxqdndtZXllcXdyZnVsYmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc4MTUsImV4cCI6MjA4ODY3MzgxNX0.zFbYbO2LbjK1DZSK4JRkieWiD0JHnDRCMtkPU1kWaxI';

const MSG_GENERICA = 'Não deu pra validar agora. Tenta de novo em instantes.';

function mensagemPorMotivo(motivo?: string): string {
  switch (motivo) {
    case 'nao_existe':      return 'Não encontramos esse cupom. Confere as letras e tenta de novo.';
    case 'desativado':      return 'Esse cupom não está mais ativo.';
    case 'expirado':        return 'Esse cupom expirou.';
    case 'limite_atingido': return 'Esse cupom já bateu o limite de usos.';
    default:                return MSG_GENERICA;
  }
}

export default function PromoCupom() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setAppliedCoupon = useAppStore((s) => s.setAppliedCoupon);

  const [valor, setValor] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { y } = useObFrame();

  const active = valor.trim().length > 0;

  // Voltar = descartar o cupom e reabrir o paywall NORMAL. Nenhuma rota para o app.
  // (o `ObHeader` já dá o toque háptico)
  const handleBack = () => {
    setAppliedCoupon(null);
    setNextPlacement('paywall_onboarding');
    router.back();
  };

  const handleApply = async () => {
    haptics.action();
    const codigo = valor.trim().toUpperCase();
    if (!codigo || loading) return;
    setErro(null);
    setLoading(true);
    try {
      // Identidade provisória: id do RevenueCat no momento (anônimo). Vai junto para
      // a Edge Function registrar/deduplicar a aplicação.
      const rcAppUserId = await Purchases.getAppUserID();

      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({ codigo, rc_app_user_id: rcAppUserId }),
      });
      const data = await res.json().catch(() => ({} as any));

      // Cupom válido → guarda localmente e volta para o paywall com desconto.
      if (res.ok && data?.valido === true) {
        haptics.success();
        const canonical: string = data?.cupom?.codigo ?? codigo;
        setAppliedCoupon({ codigo: canonical, rcAppUserId });
        track('coupon_applied', { codigo: canonical });
        setNextPlacement('paywall_cupom');
        router.back();
        return;
      }

      // Cupom inválido → mensagem específica por motivo, pode tentar de novo.
      if (res.ok && data?.valido === false) {
        haptics.warning();
        setErro(mensagemPorMotivo(data?.motivo));
        track('coupon_rejected', { motivo: data?.motivo ?? 'desconhecido' });
        return;
      }

      // 400/500/resposta inesperada.
      haptics.error();
      setErro(MSG_GENERICA);
      track('coupon_error', { status: res.status });
    } catch {
      haptics.error();
      setErro(MSG_GENERICA);
      track('coupon_error', { status: 0 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ObScreen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, paddingTop: y(90), justifyContent: 'center' }}
      >
        {/* Esqueleto do nome/detalhe: título → 9 → subtítulo → 24 → campo → 39 → botão. */}
        <View>
          <ObTitle>
            {'Aplica o seu '}
            <Text style={{ color: OB.pink }}>cupom</Text>
          </ObTitle>
          <ObSubtitle style={{ marginTop: 9, marginHorizontal: 30 }}>
            Digita o código da sua influenciadora pra liberar o plano anual com desconto.
          </ObSubtitle>
          <View style={{
            marginTop: 24, marginHorizontal: 17, height: 57, borderRadius: 12,
            backgroundColor: OB.option, justifyContent: 'center',
            borderWidth: erro ? 1.5 : 0, borderColor: OB.pink,
          }}>
            <TextInput
              value={valor}
              onChangeText={(t) => { setValor(t.toUpperCase()); if (erro) setErro(null); }}
              placeholder="SEU CUPOM"
              placeholderTextColor={OB.sub}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleApply}
              selectionColor={OB.pink}
              cursorColor={OB.pink}
              style={{
                textAlign: 'center', fontSize: 22, fontWeight: valor.length > 0 ? '700' : '400',
                letterSpacing: 0.5, color: OB.ink, paddingHorizontal: 16,
              }}
            />
          </View>

          {/* Mensagem de erro por motivo */}
          {erro && (
            <Text style={{ marginTop: 12, marginHorizontal: 30, textAlign: 'center', fontSize: 15, lineHeight: 20, color: OB.pink, fontWeight: '500' }}>
              {erro}
            </Text>
          )}

          {loading ? (
            <View style={{ marginTop: 39, height: 48, justifyContent: 'center' }}>
              <ActivityIndicator color={OB.pink} />
            </View>
          ) : (
            <ObPillButton label="Aplicar" onPress={handleApply} disabled={!active} style={{ marginTop: 39 }} />
          )}
        </View>
      </KeyboardAvoidingView>

      <ObHeader onBack={handleBack} />
    </ObScreen>
  );
}
