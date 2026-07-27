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

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import { ChevronLeft } from 'lucide-react-native';
import Purchases from 'react-native-purchases';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { setNextPlacement } from '../../lib/paywallFlow';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const DEEP_HAIR = 'rgba(29,58,68,0.10)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';

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
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const router = useRouter();
  const { track } = useMixpanel();
  const setAppliedCoupon = useAppStore((s) => s.setAppliedCoupon);

  const [valor, setValor] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const active = valor.trim().length > 0;

  // Voltar = descartar o cupom e reabrir o paywall NORMAL. Nenhuma rota para o app.
  const handleBack = () => {
    haptics.tap();
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header: só o botão voltar (canto superior esquerdo). */}
            <View style={{ paddingTop: 12, paddingHorizontal: 24, flexDirection: 'row' }}>
              <TouchableOpacity
                onPress={handleBack}
                activeOpacity={0.7}
                style={{
                  width: 40, height: 40, borderRadius: 100,
                  backgroundColor: 'rgba(255,255,255,0.6)',
                  borderWidth: 0.5, borderColor: DEEP_HAIR,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ChevronLeft size={18} color={DEEP} />
              </TouchableOpacity>
            </View>

            {/* Title block */}
            <View style={{ paddingTop: 22, paddingHorizontal: 28 }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: CORAL_DEEP, letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 14 }}>
                cupom de desconto
              </Text>
              <Text style={{ fontSize: 30, fontWeight: '700', color: DEEP, letterSpacing: -0.85, lineHeight: 33.6 }}>
                {'Aplica o seu '}
                <Text style={{ fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined, fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -1 }}>
                  cupom
                </Text>
              </Text>
              <Text style={{ marginTop: 14, fontSize: 14.5, lineHeight: 21.75, color: DEEP_SOFT, letterSpacing: -0.1 }}>
                Digita o código da sua influenciadora pra liberar o plano anual com desconto.
              </Text>
            </View>

            {/* Input */}
            <View style={{ paddingTop: 28, paddingHorizontal: 24 }}>
              <View style={{
                height: 62, borderRadius: 18,
                backgroundColor: '#FFFFFF',
                borderWidth: isFocused ? 1.5 : 1,
                borderColor: erro ? CORAL_DEEP : (isFocused ? CORAL : DEEP_HAIR),
                shadowColor: CORAL,
                shadowOffset: { width: 0, height: isFocused ? 6 : 2 },
                shadowOpacity: isFocused ? 0.22 : 0.04,
                shadowRadius: isFocused ? 22 : 14,
                paddingHorizontal: 20,
                justifyContent: 'center',
              }}>
                <TextInput
                  value={valor}
                  onChangeText={(t) => { setValor(t.toUpperCase()); if (erro) setErro(null); }}
                  placeholder="SEU CUPOM"
                  placeholderTextColor="rgba(29,58,68,0.30)"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  returnKeyType="done"
                  onSubmitEditing={handleApply}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  style={{
                    fontSize: 17,
                    color: DEEP,
                    letterSpacing: 0.5,
                    fontWeight: valor.length > 0 ? '600' : '400',
                  }}
                />
              </View>

              {/* Mensagem de erro por motivo */}
              {erro && (
                <Text style={{ marginTop: 12, paddingHorizontal: 4, fontSize: 13.5, lineHeight: 19, color: CORAL_DEEP, fontWeight: '500', letterSpacing: -0.1 }}>
                  {erro}
                </Text>
              )}
            </View>

            <View style={{ flex: 1, minHeight: 40 }} />

            {/* CTA */}
            <View style={{ paddingHorizontal: 24, paddingBottom: 22 }}>
              <TouchableOpacity
                onPress={handleApply}
                disabled={!active || loading}
                activeOpacity={0.85}
                style={{
                  height: 60, borderRadius: 100,
                  backgroundColor: active ? CORAL : 'rgba(29,58,68,0.18)',
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: CORAL,
                  shadowOffset: { width: 0, height: active ? 8 : 0 },
                  shadowOpacity: active ? 0.30 : 0,
                  shadowRadius: 12,
                  elevation: active ? 4 : 0,
                }}
              >
                {loading
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={{ fontSize: 17, fontWeight: '600', color: active ? '#FFFFFF' : 'rgba(255,255,255,0.92)', letterSpacing: -0.2 }}>Aplicar</Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
