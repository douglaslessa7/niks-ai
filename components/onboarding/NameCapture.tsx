import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { supabase } from '../../lib/supabase';
import { attributeCouponIfAny } from '../../lib/couponAttribution';
import { invalidateCache } from '../../lib/cache';
import { haptics } from '../../lib/haptics';

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';

// FONTE ÚNICA da captura de nome ("Como você quer ser chamada?"). Usada por:
//   1. `app/(onboarding)/nome.tsx` — etapa do onboarding (após salvar, navega).
//   2. `app/(app)/_layout.tsx` — quando a usuária entra com sessão + assinatura
//      mas `users.nome` vazio; renderiza no lugar do app (após salvar, só libera
//      a renderização, sem navegar). Antes disso era um router.replace que criava
//      um loop de navegação com o guard do (onboarding)/_layout.
//
// O que fazer após o save é responsabilidade de quem monta (prop `onSaved`) —
// o componente nunca navega sozinho. Visual e lógica de save vivem só aqui:
// duplicar já se queimou antes (ver `components/product/ProductAnalysis.tsx`).
export default function NameCapture({ onSaved }: { onSaved: () => void }) {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Chokepoint por onde TODA usuária com sessão ativa passa antes de entrar —
      // tanto no onboarding quanto na captura dentro do app (caminho de confirmação
      // de e-mail). Liga o cupom (se houver) ao user_id real. Idempotente e
      // fire-and-forget: nunca trava a tela nem a entrada.
      attributeCouponIfAny(user.id);
      const existing =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ?? '';
      if (existing) setNome(existing.split(' ')[0]);
    })();
  }, []);

  const handleContinue = async () => {
    haptics.action();
    const trimmed = nome.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão expirada');
      // Prova que a linha foi realmente gravada. Um upsert bloqueado por RLS
      // retorna sucesso com ZERO linhas e sem erro — se confiássemos só na
      // ausência de erro, a usuária "salvaria" um nome que nunca foi persistido
      // e cairia de novo no guard de nome. `.select().single()` traz a linha de
      // volta: sem linha (ou nome divergente) = escrita não confirmada = erro.
      const { data, error } = await supabase
        .from('users')
        .upsert({ id: user.id, nome: trimmed, email: user.email ?? '' }, { onConflict: 'id' })
        .select('id, nome')
        .single();
      if (error) throw error;
      if (!data || (data.nome ?? '').trim() !== trimmed) {
        throw new Error('A gravação do nome não foi confirmada');
      }
      // O nome é lido de cache no Perfil e na saudação da NIKS. Sem invalidar, os
      // dois continuariam mostrando o nome antigo/vazio (mesmo motivo da set-name.tsx).
      invalidateCache(`perfil:${user.id}`);
      invalidateCache(`chat:${user.id}`);
      onSaved();
    } catch (e) {
      console.warn('[NameCapture] Erro ao salvar nome:', e);
      Alert.alert('Erro ao salvar', 'Não conseguimos salvar seu nome. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const active = nome.trim().length > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Title block */}
            <View style={{ paddingTop: 34, paddingHorizontal: 28 }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: CORAL_DEEP, letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 14 }}>
                sobre você
              </Text>
              <Text style={{ fontSize: 30, fontWeight: '700', color: DEEP, letterSpacing: -0.85, lineHeight: 33.6 }}>
                {'Como você quer ser '}
                <Text style={{ fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined, fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -1 }}>
                  chamada
                </Text>
                {'?'}
              </Text>
              <Text style={{ marginTop: 14, fontSize: 14.5, lineHeight: 21.75, color: DEEP_SOFT, letterSpacing: -0.1 }}>
                Esse é o nome que aparecerá na tela inicial do app.
              </Text>
            </View>

            {/* Input */}
            <View style={{ paddingTop: 28, paddingHorizontal: 24 }}>
              <View style={{
                height: 62, borderRadius: 18,
                backgroundColor: '#FFFFFF',
                borderWidth: isFocused ? 1.5 : 1,
                borderColor: isFocused ? CORAL : 'rgba(29,58,68,0.10)',
                shadowColor: CORAL,
                shadowOffset: { width: 0, height: isFocused ? 6 : 2 },
                shadowOpacity: isFocused ? 0.22 : 0.04,
                shadowRadius: isFocused ? 22 : 14,
                paddingHorizontal: 20,
                justifyContent: 'center',
              }}>
                <TextInput
                  value={nome}
                  onChangeText={setNome}
                  placeholder="Escreva seu nome"
                  placeholderTextColor="rgba(29,58,68,0.30)"
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleContinue}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  style={{
                    fontSize: 17,
                    color: DEEP,
                    letterSpacing: -0.2,
                    fontWeight: nome.length > 0 ? '500' : '400',
                  }}
                />
              </View>
            </View>

            <View style={{ flex: 1, minHeight: 40 }} />

            {/* CTA */}
            <View style={{ paddingHorizontal: 24, paddingBottom: 22 }}>
              <TouchableOpacity
                onPress={handleContinue}
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
                  : <Text style={{ fontSize: 17, fontWeight: '600', color: active ? '#FFFFFF' : 'rgba(255,255,255,0.92)', letterSpacing: -0.2 }}>Continuar</Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
