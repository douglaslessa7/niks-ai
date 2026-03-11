import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Timer, Check, Sun, Moon } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAppStore, ProtocolResult } from '../../store/onboarding';

interface Step {
  id: number;
  name: string;
  ingredient: string;
  instruction: string;
  color: string;
  waitTime?: string | null;
  product_suggestions?: string[];
  completed: boolean;
}

interface Protocol {
  morning: Step[];
  night: Step[];
  introduction_warnings: string | null;
  expected_timeline: {
    two_weeks: string;
    one_month: string;
    three_months: string;
  };
}

export default function Protocolo() {
  const { scanResult, onboarding, protocolResult: cachedProtocol, setProtocolResult } = useAppStore();
  const [period, setPeriod] = useState<'morning' | 'night'>('morning');
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [morningSteps, setMorningSteps] = useState<Step[]>([]);
  const [nightSteps, setNightSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generateProtocol();
  }, []);

  const generateProtocol = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Tentar carregar do cache do store (gerado na protocol-loading)
      if (cachedProtocol) {
        const withCompleted: Protocol = {
          ...cachedProtocol,
          morning: cachedProtocol.morning.map((s: Step) => ({ ...s, completed: false })),
          night: cachedProtocol.night.map((s: Step) => ({ ...s, completed: false })),
        };
        setProtocol(withCompleted);
        setMorningSteps(withCompleted.morning);
        setNightSteps(withCompleted.night);
        return;
      }

      // 2. Tentar buscar do Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: saved } = await supabase
          .from('protocolos')
          .select('rotina_am, rotina_pm, dicas')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (saved?.rotina_am && saved?.rotina_pm) {
          const fromDb: Protocol = {
            morning: saved.rotina_am,
            night: saved.rotina_pm,
            introduction_warnings: saved.dicas?.[0] ?? null,
            expected_timeline: {
              two_weeks: saved.dicas?.[1] ?? '',
              one_month: saved.dicas?.[2] ?? '',
              three_months: saved.dicas?.[3] ?? '',
            },
          };
          setProtocolResult(fromDb as ProtocolResult);
          const withCompleted: Protocol = {
            ...fromDb,
            morning: fromDb.morning.map((s: Step) => ({ ...s, completed: false })),
            night: fromDb.night.map((s: Step) => ({ ...s, completed: false })),
          };
          setProtocol(withCompleted);
          setMorningSteps(withCompleted.morning);
          setNightSteps(withCompleted.night);
          return;
        }
      }

      // 3. Fallback: regenerar via Edge Function
      if (!scanResult) {
        setError('Faça um scan de pele primeiro para gerar seu protocolo personalizado.');
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(
        'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/generate-protocol',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionData.session?.access_token
              ? { Authorization: `Bearer ${sessionData.session.access_token}` }
              : {}),
          },
          body: JSON.stringify({ scanResult, onboardingData: onboarding }),
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: ProtocolResult = await response.json();
      setProtocolResult(data);

      const withCompleted: Protocol = {
        ...data,
        morning: data.morning.map((s: Step) => ({ ...s, completed: false })),
        night: data.night.map((s: Step) => ({ ...s, completed: false })),
      };

      setProtocol(withCompleted);
      setMorningSteps(withCompleted.morning);
      setNightSteps(withCompleted.night);
    } catch (err) {
      console.error('Erro ao gerar protocolo:', err);
      setError('Não foi possível gerar seu protocolo. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePeriod = (newPeriod: 'morning' | 'night') => {
    setPeriod(newPeriod);
  };

  const toggleStepCompletion = (stepId: number) => {
    if (period === 'morning') {
      setMorningSteps((prev) =>
        prev.map((step) => step.id === stepId ? { ...step, completed: !step.completed } : step)
      );
    } else {
      setNightSteps((prev) =>
        prev.map((step) => step.id === stepId ? { ...step, completed: !step.completed } : step)
      );
    }
  };

  const markAllComplete = () => {
    if (period === 'morning') {
      setMorningSteps((prev) => prev.map((step) => ({ ...step, completed: true })));
    } else {
      setNightSteps((prev) => prev.map((step) => ({ ...step, completed: true })));
    }
  };

  const steps = period === 'morning' ? morningSteps : nightSteps;
  const completedCount = steps.filter((s) => s.completed).length;
  const totalSteps = steps.length;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
  const allDone = completedCount === totalSteps && totalSteps > 0;

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE', alignItems: 'center', justifyContent: 'center' }} edges={['top']}>
        <ActivityIndicator size="large" color="#FB7B6B" />
        <Text style={{ marginTop: 16, color: '#8A8A8E', fontSize: 15 }}>Gerando seu protocolo personalizado...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }} edges={['top']}>
        <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 16 }}>{error}</Text>
        {scanResult && (
          <TouchableOpacity
            onPress={generateProtocol}
            style={{ backgroundColor: '#FB7B6B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
          >
            <Text style={{ color: 'white', fontWeight: '600' }}>Tentar novamente</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE' }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={{ maxWidth: 393, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 48 }}>

          {/* Header */}
          <Text style={{ fontSize: 32, fontWeight: '700', color: '#1D3A44', marginBottom: 24 }}>
            Seu Protocolo
          </Text>

          {/* Toggle Switcher */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => handleTogglePeriod('morning')}
              activeOpacity={0.8}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 999,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: period === 'morning' ? '#FB7B6B' : '#FFFFFF',
                borderWidth: period === 'morning' ? 0 : 1,
                borderColor: '#1D3A44',
              }}
            >
              <Sun size={15} color={period === 'morning' ? '#FFFFFF' : '#1D3A44'} strokeWidth={2} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: period === 'morning' ? '#FFFFFF' : '#1D3A44' }}>
                Manhã
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleTogglePeriod('night')}
              activeOpacity={0.8}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 999,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: period === 'night' ? '#FB7B6B' : '#FFFFFF',
                borderWidth: period === 'night' ? 0 : 1,
                borderColor: '#1D3A44',
              }}
            >
              <Moon size={15} color={period === 'night' ? '#FFFFFF' : '#1D3A44'} strokeWidth={2} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: period === 'night' ? '#FFFFFF' : '#1D3A44' }}>
                Noite
              </Text>
            </TouchableOpacity>
          </View>

          {/* Badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
            <View style={{ backgroundColor: '#7CB69D', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFFFFF' }}>
                {totalSteps} passos
              </Text>
            </View>
          </View>

          {/* Warning */}
          {protocol?.introduction_warnings && (
            <View style={{ backgroundColor: 'rgba(251,123,107,0.1)', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(251,123,107,0.3)' }}>
              <Text style={{ fontSize: 13, color: '#FB7B6B', lineHeight: 18 }}>{protocol.introduction_warnings}</Text>
            </View>
          )}

          {/* Step Cards */}
          <View style={{ gap: 12, marginBottom: 24 }}>
            {steps.map((step) => (
              <View
                key={step.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                {/* Color dot */}
                <View style={{ width: 48, height: 48, borderRadius: 999, backgroundColor: step.color, flexShrink: 0 }} />

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: '#1D3A44', marginBottom: 4 }}>
                    {step.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <View style={{ backgroundColor: 'rgba(124,182,157,0.2)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: '500', color: '#7CB69D' }}>{step.ingredient}</Text>
                    </View>
                    {step.waitTime && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Timer size={12} color="#8A8A8E" />
                        <Text style={{ fontSize: 11, color: '#8A8A8E' }}>{step.waitTime}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 13, color: '#8A8A8E' }}>{step.instruction}</Text>
                  {step.product_suggestions && step.product_suggestions.length > 0 && (
                    <Text style={{ fontSize: 11, color: '#FB7B6B', marginTop: 4 }}>
                      {step.product_suggestions[0]}
                    </Text>
                  )}
                </View>

                {/* Checkbox */}
                <TouchableOpacity
                  onPress={() => toggleStepCompletion(step.id)}
                  activeOpacity={0.8}
                  style={{ flexShrink: 0 }}
                >
                  {step.completed ? (
                    <View style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: '#7CB69D', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                    </View>
                  ) : (
                    <View style={{ width: 32, height: 32, borderRadius: 999, borderWidth: 2, borderColor: '#E5E7EB' }} />
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Progress Bar */}
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: '#8A8A8E' }}>
                {completedCount} de {totalSteps} passos
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#7CB69D' }}>{progressPercent}%</Text>
            </View>
            <View style={{ width: '100%', height: 8, backgroundColor: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
              <View
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  backgroundColor: '#7CB69D',
                  borderRadius: 999,
                }}
              />
            </View>
          </View>

          {/* CTA Button */}
          <TouchableOpacity
            onPress={markAllComplete}
            disabled={allDone}
            activeOpacity={0.85}
            style={{
              width: '100%',
              paddingVertical: 16,
              borderRadius: 999,
              alignItems: 'center',
              backgroundColor: allDone ? '#E5E7EB' : '#FB7B6B',
              marginBottom: 8,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '600', color: allDone ? '#8A8A8E' : '#FFFFFF' }}>
              Marcar Rotina Completa
            </Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 13, color: '#8A8A8E', textAlign: 'center' }}>
            Toque em cada passo ou marque tudo de uma vez
          </Text>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

