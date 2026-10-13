// ─────────────────────────────────────────────────────────────────────────────
// Definir nome — aberta pelo topo do Perfil. Mesma identidade do Perfil/alarme:
// fundo degradê de lib/homeTheme (dia/noite), botão voltar branco 36pt, campos
// brancos com contorno rosa no foco, botão pílula rosa #FF5EA8, fonte do sistema.
// ─────────────────────────────────────────────────────────────────────────────
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { invalidateCache } from '../../lib/cache';
import { haptics } from '../../lib/haptics';
import { BG_STOPS, homeTheme, isNightTheme } from '../../lib/homeTheme';

const INK = '#121212';
const INK_MUTE = '#8A8A93';
const PINK = '#FF5EA8';

function FloatingLabelInput({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
}) {
  const floatAnim = useRef(new Animated.Value(value ? 1 : 0)).current;
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    Animated.timing(floatAnim, {
      toValue: value || focused ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [value, focused]);

  const labelTop = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [19, 9] });
  const labelSize = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 12] });

  return (
    <View style={[styles.field, { borderColor: focused ? PINK : 'rgba(255,94,168,0.25)' }]}>
      <Animated.Text style={{ position: 'absolute', left: 16, top: labelTop, fontSize: labelSize, color: INK_MUTE }}>
        {label}
      </Animated.Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ fontSize: 17, letterSpacing: -0.3, color: INK, padding: 0, marginTop: 8 }}
        selectionColor={PINK}
        autoCapitalize="words"
        autoCorrect={false}
      />
    </View>
  );
}

export default function SetName() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const navbarHeight = 53 + insets.bottom;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('users')
      .select('nome')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.nome) {
          const parts = data.nome.split(' ');
          setFirstName(parts[0] ?? '');
          setLastName(parts.slice(1).join(' '));
        }
      });
  }, [user?.id]);

  const canSave = firstName.trim().length > 0 || lastName.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || !user?.id) return;
    haptics.action();
    setSaving(true);
    try {
      const nome = `${firstName.trim()} ${lastName.trim()}`.trim();
      // O supabase-js não lança em erro de banco — devolve `error`. Sem checar, a
      // tela voltava como se tivesse salvado.
      const { error } = await supabase.from('users').update({ nome }).eq('id', user.id);
      if (error) throw error;
      // O nome é lido de cache em três lugares — o Perfil, a saudação da home e a
      // da NIKS. Sem invalidar, eles continuariam mostrando o nome antigo.
      invalidateCache(`perfil:${user.id}`);
      invalidateCache(`home:${user.id}`);
      invalidateCache(`chat:${user.id}`);
      haptics.success();
      router.back();
    } catch (e) {
      console.error('Erro ao salvar nome:', e);
      haptics.error();
    } finally {
      setSaving(false);
    }
  };

  const theme = homeTheme(isNightTheme(), 'rgba(255,226,236,0.40)');

  return (
    <View style={{ flex: 1, backgroundColor: theme.base }}>
      <StatusBar style="dark" />
      <LinearGradient colors={theme.bg} locations={BG_STOPS} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[styles.circleBlob, { backgroundColor: theme.blob }]} pointerEvents="none" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {/* Cabeçalho: voltar · "Seu nome" */}
          <View style={[styles.header, { paddingTop: insets.top + 15 }]}>
            <TouchableOpacity onPress={() => { haptics.tap(); router.back(); }} activeOpacity={0.85} style={styles.backBtn} accessibilityLabel="Voltar">
              <Svg width={18} height={18} viewBox="0 0 24 24">
                <Path d="M15 5l-7 7 7 7" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '400', letterSpacing: -0.3, color: INK }}>Seu nome</Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={{ paddingHorizontal: 18, paddingTop: 28, flex: 1 }}>
            <Text style={styles.title}>Qual é o seu nome?</Text>
            <Text style={styles.subtitle}>É assim que a NIKS vai chamar você.</Text>

            <View style={{ gap: 12 }}>
              <FloatingLabelInput label="Nome" value={firstName} onChangeText={setFirstName} />
              <FloatingLabelInput label="Sobrenome" value={lastName} onChangeText={setLastName} />
            </View>
          </View>

          <View style={{ paddingHorizontal: 18, paddingTop: 24, paddingBottom: navbarHeight + 20 }}>
            <TouchableOpacity
              onPress={handleSave}
              disabled={!canSave || saving}
              activeOpacity={0.85}
              style={[styles.bigBtn, { opacity: !canSave ? 0.45 : saving ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: '#FFFFFF' }}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  circleBlob: {
    position: 'absolute', width: 560, height: 560, borderRadius: 280,
    left: 190, top: -90, // cor: `theme.blob` (dia/noite)
  },
  header: {
    paddingHorizontal: 20, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 7,
  },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 34, letterSpacing: -0.7, color: INK },
  subtitle: { marginTop: 6, marginBottom: 26, fontSize: 16, lineHeight: 21, letterSpacing: -0.3, color: INK_MUTE },
  field: {
    height: 62, borderRadius: 16, borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 11,
  },
  bigBtn: {
    height: 50, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
});
