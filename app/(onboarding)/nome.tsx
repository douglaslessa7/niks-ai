import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';

export default function Nome() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Pre-fill: tenta user_metadata (Apple Sign-In), mas NÃO pre-preenche users.nome
      // pois se chegou aqui é porque users.nome está vazio
      const existing =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        '';
      if (existing) setNome(existing.split(' ')[0]);
    })();
  }, []);

  const handleContinue = async () => {
    const trimmed = nome.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('users').update({ nome: trimmed }).eq('id', user.id);
      }
    } catch (e) {
      console.warn('[Nome] Erro ao salvar nome:', e);
    } finally {
      setLoading(false);
      router.replace('/(app)/home');
    }
  };

  const canContinue = nome.trim().length > 0;

  return (
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.4, 0.7, 1]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

            {/* Conteúdo */}
            <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 64 }}>
              {/* Label */}
              <Text style={{
                fontSize: 11, fontWeight: '700',
                color: Colors.scanBtn, letterSpacing: 1.2,
                textTransform: 'uppercase', marginBottom: 8,
              }}>
                Sobre você
              </Text>

              {/* Título */}
              <Text style={{
                fontSize: 26, fontWeight: '800',
                color: Colors.tabActive, lineHeight: 31, marginBottom: 8,
              }}>
                Como você quer ser chamado?
              </Text>

              {/* Subtítulo */}
              <Text style={{
                fontSize: 13, color: Colors.gray,
                lineHeight: 20, marginBottom: 32,
              }}>
                Esse é o nome que aparecerá na tela inicial do app.
              </Text>

              {/* Input */}
              <View style={{
                backgroundColor: Colors.white,
                borderRadius: 16,
                borderWidth: 1.5,
                borderColor: nome.length > 0 ? Colors.scanBtn : 'rgba(0,0,0,0.08)',
                paddingHorizontal: 18, paddingVertical: 16,
                shadowColor: nome.length > 0 ? Colors.scanBtn : '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: nome.length > 0 ? 0.15 : 0.06,
                shadowRadius: nome.length > 0 ? 12 : 8,
                elevation: 2,
              }}>
                <TextInput
                  value={nome}
                  onChangeText={setNome}
                  placeholder="Seu nome"
                  placeholderTextColor={Colors.gray}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleContinue}
                  style={{
                    fontSize: 18, fontWeight: '500',
                    color: Colors.tabActive,
                  }}
                />
              </View>
            </View>

            {/* Botão fixo no fundo — sem "Pular" */}
            <View style={{ paddingHorizontal: 18, paddingBottom: 24 }}>
              <TouchableOpacity
                onPress={handleContinue}
                disabled={!canContinue || loading}
                activeOpacity={0.8}
                style={{
                  backgroundColor: canContinue ? Colors.scanBtn : Colors.disabled,
                  borderRadius: 100,
                  paddingVertical: 16,
                  alignItems: 'center',
                  opacity: !canContinue ? 0.6 : 1,
                }}
              >
                {loading
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>Continuar</Text>
                }
              </TouchableOpacity>
            </View>

          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
