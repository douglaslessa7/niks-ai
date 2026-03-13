import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Animated } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

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

  const labelTop = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 8] });
  const labelSize = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 12] });

  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: focused ? '#FB7B6B' : '#E5E5E5',
        height: 60,
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
        paddingBottom: 10,
      }}
    >
      <Animated.Text
        style={{
          position: 'absolute',
          left: 16,
          top: labelTop,
          fontSize: labelSize,
          color: '#8A8A8E',
        }}
      >
        {label}
      </Animated.Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          fontSize: 16,
          color: '#1D3A44',
          padding: 0,
          marginTop: 8,
        }}
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
  const tabBarHeight = insets.bottom + 80;
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
    setSaving(true);
    try {
      const nome = `${firstName.trim()} ${lastName.trim()}`.trim();
      await supabase.from('users').update({ nome }).eq('id', user.id);
      router.back();
    } catch (e) {
      console.error('Erro ao salvar nome:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Bar */}
          <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#F0F0F0',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 1,
              }}
              activeOpacity={0.8}
            >
              <ArrowLeft size={20} color="#1D3A44" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={{ paddingHorizontal: 24, paddingTop: 24, flex: 1 }}>
            <Text style={{ fontSize: 32, fontWeight: '800', color: '#1D3A44', lineHeight: 38, marginBottom: 8 }}>
              Qual é o seu nome?
            </Text>
            <Text style={{ fontSize: 15, color: '#8A8A8E', marginBottom: 32 }}>
              Como gostaria de ser chamado no NIKS AI.
            </Text>

            <View style={{ gap: 16 }}>
              <FloatingLabelInput
                label="Nome"
                value={firstName}
                onChangeText={setFirstName}
              />
              <FloatingLabelInput
                label="Sobrenome"
                value={lastName}
                onChangeText={setLastName}
              />
            </View>
          </View>

          {/* Button */}
          <View style={{ paddingHorizontal: 24, paddingBottom: tabBarHeight, paddingTop: 24 }}>
            <TouchableOpacity
              onPress={handleSave}
              disabled={!canSave || saving}
              activeOpacity={0.85}
              style={{
                backgroundColor: canSave ? '#FB7B6B' : '#A0A0B8',
                borderRadius: 100,
                paddingVertical: 16,
                alignItems: 'center',
                opacity: canSave ? 1 : 0.6,
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>
                {saving ? 'Salvando...' : 'Continuar'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
