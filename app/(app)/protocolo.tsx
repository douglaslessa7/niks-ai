import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Check, Sun, Moon, Info } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAppStore, ProtocolResult } from '../../store/onboarding';
import { BASE_PROTOCOLS } from '../../constants/protocols';

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
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);
  const [showStepDetail, setShowStepDetail] = useState(false);

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
          morning: (cachedProtocol.morning as any[]).map((s) => ({ ...s, completed: false })),
          night: (cachedProtocol.night as any[]).map((s) => ({ ...s, completed: false })),
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
            morning: (fromDb.morning as any[]).map((s) => ({ ...s, completed: false })),
            night: (fromDb.night as any[]).map((s) => ({ ...s, completed: false })),
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

      const skinType = scanResult.skin_type_detected ?? 'normal';
      const baseProtocol = BASE_PROTOCOLS[skinType] ?? BASE_PROTOCOLS['normal'];

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
          body: JSON.stringify({ baseProtocol, scanResult, onboardingData: onboarding }),
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: ProtocolResult = await response.json();
      setProtocolResult(data);

      const withCompleted: Protocol = {
        ...data,
        morning: (data.morning as any[]).map((s) => ({ ...s, completed: false })),
        night: (data.night as any[]).map((s) => ({ ...s, completed: false })),
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

  const steps = period === 'morning' ? morningSteps : nightSteps;
  const isMorning = period === 'morning';
  const accentColor = isMorning ? '#FB7B6B' : '#1D3A44';

  // Detecta se o texto contém info de dias da semana
  const DAY_REGEX = /(?:Seg|Ter|Qua|Qui|Sex|S[aá]b|Dom|segunda|terça|quarta|quinta|sexta|s[aá]bado|domingo)/i;

  const getDayTag = (step: Step): string | null => {
    // 1. waitTime com dias (ex: "Seg/Qua/Sex")
    if (step.waitTime && DAY_REGEX.test(step.waitTime)) {
      return step.waitTime;
    }
    // 2. ingredient com padrão entre parênteses: "(Seg/Qua/Sex)"
    if (step.ingredient) {
      const match = step.ingredient.match(/\(([^)]*(?:Seg|Ter|Qua|Qui|Sex|S[aá]b|Dom)[^)]*)\)/i);
      if (match) return match[1];
    }
    // 3. instruction com dias
    if (step.instruction && DAY_REGEX.test(step.instruction)) {
      const match = step.instruction.match(/\(([^)]*(?:Seg|Ter|Qua|Qui|Sex|S[aá]b|Dom)[^)]*)\)/i);
      if (match) return match[1];
    }
    return null;
  };

  // waitTime é tempo real (ex: "5 min") — não é dia da semana
  const isTimeWait = (wt: string | null | undefined): boolean => {
    if (!wt) return false;
    if (DAY_REGEX.test(wt)) return false;
    return /\d/.test(wt);
  };

  // Split instruction into numbered sub-steps for modal
  const getSubSteps = (step: Step): string[] => {
    if (step.instruction) {
      const parts = step.instruction
        .split(/\.\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => (s.endsWith('.') ? s : `${s}.`));
      if (parts.length > 1) return parts;
    }
    return step.instruction ? [step.instruction] : ['Siga as instruções do fabricante.'];
  };

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
        <View style={{ maxWidth: 393, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24 }}>

          {/* Header */}
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#1D3A44', marginBottom: 24 }}>
            Seu Protocolo
          </Text>

          {/* Tab Toggle */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
            <TouchableOpacity
              onPress={() => setPeriod('morning')}
              activeOpacity={0.8}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 999,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: isMorning ? '#FB7B6B' : 'transparent',
                borderWidth: 1,
                borderColor: isMorning ? '#FB7B6B' : '#1D3A44',
              }}
            >
              <Sun size={20} color={isMorning ? '#FFFFFF' : '#1D3A44'} strokeWidth={2} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: isMorning ? '#FFFFFF' : '#1D3A44' }}>
                Manhã
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPeriod('night')}
              activeOpacity={0.8}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 999,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: !isMorning ? '#FB7B6B' : 'transparent',
                borderWidth: 1,
                borderColor: !isMorning ? '#FB7B6B' : '#1D3A44',
              }}
            >
              <Moon size={20} color={!isMorning ? '#FFFFFF' : '#1D3A44'} strokeWidth={2} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: !isMorning ? '#FFFFFF' : '#1D3A44' }}>
                Noite
              </Text>
            </TouchableOpacity>
          </View>

          {/* Step Cards */}
          <View style={{ gap: 12 }}>
            {steps.map((step, index) => (
              <View
                key={step.id}
                style={{
                  borderRadius: 16,
                  padding: 16,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: '#F0F0F0',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                {/* Top row */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  {/* Number circle */}
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      backgroundColor: accentColor,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      shadowColor: accentColor,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.25,
                      shadowRadius: 8,
                      elevation: 3,
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
                      {index + 1}
                    </Text>
                  </View>

                  {/* Text info */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {/* Name + day tag row — wraps se necessário */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#1D3A44', flexShrink: 1 }}>
                        {step.name}
                      </Text>
                      {(() => {
                        const dayTag = getDayTag(step);
                        if (dayTag) {
                          return (
                            <View
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                borderRadius: 999,
                                backgroundColor: '#FFF5F4',
                                borderWidth: 1,
                                borderColor: '#FDE8E6',
                                flexShrink: 0,
                                alignSelf: 'flex-start',
                              }}
                            >
                              <Text style={{ fontSize: 10, fontWeight: '600', color: '#FB7B6B' }}>
                                {dayTag}
                              </Text>
                            </View>
                          );
                        }
                        // waitTime normal (ex: "5 min") — não é dia
                        if (isTimeWait(step.waitTime)) {
                          return (
                            <View
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                borderRadius: 999,
                                backgroundColor: '#F3F3F5',
                                flexShrink: 0,
                                alignSelf: 'flex-start',
                              }}
                            >
                              <Text style={{ fontSize: 10, fontWeight: '600', color: '#8A8A8E' }}>
                                {step.waitTime}
                              </Text>
                            </View>
                          );
                        }
                        return null;
                      })()}
                    </View>
                    {/* Ingredient — wrap automático */}
                    <Text style={{ fontSize: 13, color: '#8A8A8E', marginBottom: 4, flexShrink: 1 }}>
                      {step.ingredient}
                    </Text>
                    {/* Instruction — wrap automático */}
                    <Text style={{ fontSize: 12, color: '#A0A0A8', lineHeight: 18, flexShrink: 1 }}>
                      {step.instruction}
                    </Text>
                  </View>

                  {/* Checkbox */}
                  <TouchableOpacity
                    onPress={() => toggleStepCompletion(step.id)}
                    activeOpacity={0.8}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: step.completed ? accentColor : 'transparent',
                      borderWidth: 1,
                      borderColor: step.completed ? accentColor : '#D1D5DB',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      shadowColor: step.completed ? accentColor : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: step.completed ? 0.25 : 0,
                      shadowRadius: 8,
                    }}
                  >
                    {step.completed && (
                      <Check size={14} color="#FFFFFF" strokeWidth={3} />
                    )}
                  </TouchableOpacity>
                </View>

                {/* "Ver passo a passo" button */}
                <TouchableOpacity
                  onPress={() => {
                    setSelectedStep(step);
                    setShowStepDetail(true);
                  }}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: '#F0F9F5',
                  }}
                >
                  <Info size={14} color="#7CB69D" strokeWidth={2} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#7CB69D' }}>
                    Ver passo a passo
                  </Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* Observação noturna */}
            {!isMorning && protocol?.introduction_warnings && (
              <View
                style={{
                  borderRadius: 12,
                  padding: 16,
                  backgroundColor: '#FDFDFD',
                  borderWidth: 1,
                  borderColor: '#F0F0F0',
                  marginTop: 4,
                }}
              >
                <Text style={{ fontSize: 13, color: '#8A8A8E', lineHeight: 20 }}>
                  <Text style={{ fontWeight: '700', color: '#1D3A44' }}>Observação: </Text>
                  {protocol.introduction_warnings}
                </Text>
              </View>
            )}
          </View>

        </View>
      </ScrollView>

      {/* Step Detail Modal */}
      <Modal
        visible={showStepDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStepDetail(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => setShowStepDetail(false)}
          />
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              maxHeight: '80%',
            }}
          >
            {/* Handle */}
            <View
              style={{
                width: 40,
                height: 4,
                backgroundColor: '#D1D5DB',
                borderRadius: 999,
                alignSelf: 'center',
                marginBottom: 24,
              }}
            />

            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedStep && (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#1D3A44', marginBottom: 8 }}>
                    {selectedStep.name}
                  </Text>
                  <Text style={{ fontSize: 14, color: '#8A8A8E', marginBottom: 24, lineHeight: 20 }}>
                    {selectedStep.instruction}
                  </Text>

                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#1D3A44', marginBottom: 16 }}>
                    Passo a passo:
                  </Text>

                  <View style={{ gap: 16, marginBottom: 24 }}>
                    {getSubSteps(selectedStep).map((subStep, index) => (
                      <View key={index} style={{ flexDirection: 'row', gap: 12 }}>
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            backgroundColor: '#FB7B6B',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            shadowColor: '#FB7B6B',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.25,
                            shadowRadius: 8,
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                            {index + 1}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 14, color: '#1D3A44', lineHeight: 22, flex: 1, paddingTop: 3 }}>
                          {subStep}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    onPress={() => setShowStepDetail(false)}
                    activeOpacity={0.85}
                    style={{
                      height: 52,
                      borderRadius: 999,
                      backgroundColor: '#FB7B6B',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: '#FB7B6B',
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.4,
                      shadowRadius: 24,
                      elevation: 6,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
                      Entendi
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
