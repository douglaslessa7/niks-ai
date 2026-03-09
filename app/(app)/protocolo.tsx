import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Timer, Check, Sun, Moon } from 'lucide-react-native';

interface Step {
  id: number;
  name: string;
  ingredient: string;
  instruction: string;
  color: string;
  waitTime?: string;
  completed: boolean;
}

const morningSteps: Step[] = [
  {
    id: 1,
    name: 'Gel de Limpeza',
    ingredient: 'Ácido Salicílico 2%',
    instruction: 'Aplique no rosto úmido, massageie 60s',
    color: '#3B82F6',
    completed: true,
  },
  {
    id: 2,
    name: 'Sérum Vitamina C',
    ingredient: 'Ácido Ascórbico 15%',
    instruction: '3-4 gotas, espalhe com palmas',
    color: '#7CB69D',
    waitTime: '2 min',
    completed: true,
  },
  {
    id: 3,
    name: 'Hidratante',
    ingredient: 'Niacinamida 5%',
    instruction: 'Aplique em todo o rosto e pescoço',
    color: '#FBBF24',
    completed: false,
  },
  {
    id: 4,
    name: 'Protetor Solar',
    ingredient: 'FPS 50+',
    instruction: 'Quantidade de 2 dedos, reaplique a cada 2h',
    color: '#FB7B6B',
    completed: false,
  },
];

const nightSteps: Step[] = [
  {
    id: 1,
    name: 'Gel de Limpeza',
    ingredient: 'Ácido Salicílico 2%',
    instruction: 'Aplique no rosto úmido, massageie 60s',
    color: '#3B82F6',
    completed: false,
  },
  {
    id: 2,
    name: 'Sérum Retinol',
    ingredient: 'Retinol 0.5%',
    instruction: 'Comece com tamanho de ervilha',
    color: '#9333EA',
    waitTime: '3 min',
    completed: false,
  },
  {
    id: 3,
    name: 'Hidratante',
    ingredient: 'Ceramidas',
    instruction: 'Aplique camada generosa',
    color: '#FBBF24',
    completed: false,
  },
];

export default function Protocolo() {
  const [period, setPeriod] = useState<'morning' | 'night'>('morning');
  const [steps, setSteps] = useState<Step[]>(morningSteps);

  const handleTogglePeriod = (newPeriod: 'morning' | 'night') => {
    setPeriod(newPeriod);
    setSteps(newPeriod === 'morning' ? morningSteps : nightSteps);
  };

  const toggleStepCompletion = (stepId: number) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId ? { ...step, completed: !step.completed } : step
      )
    );
  };

  const markAllComplete = () => {
    setSteps((prev) => prev.map((step) => ({ ...step, completed: true })));
  };

  const completedCount = steps.filter((s) => s.completed).length;
  const totalSteps = steps.length;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);
  const allDone = completedCount === totalSteps;

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

          {/* Date and Badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
            <Text style={{ fontSize: 13, color: '#8A8A8E' }}>Domingo, 8 de março</Text>
            <View style={{ backgroundColor: '#7CB69D', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFFFFF' }}>
                {totalSteps} passos hoje
              </Text>
            </View>
          </View>

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
              Marcar Rotina Completa ✓
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
