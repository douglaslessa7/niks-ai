import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { restorePurchases, isPremium } from '../../lib/revenuecat';

function PhoneMockup() {
  const ringSize = 36;
  const r = 14;
  const circ = 2 * Math.PI * r;

  return (
    <View style={styles.phoneMockupWrapper} pointerEvents="none">
      {/* Phone frame */}
      <View style={styles.phoneFrame}>
        <View style={styles.phoneScreen}>
          {/* Notch */}
          <View className="flex items-center justify-center pt-3 pb-1">
            <View style={{ width: 64, height: 5, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 99 }} />
          </View>

          {/* Mini top bar */}
          <View className="px-3 pb-1 flex-row items-center justify-between">
            <Text style={{ fontSize: 7, fontWeight: '800', color: '#1D3A44' }}>NIKS AI</Text>
            <View style={{ backgroundColor: 'white', borderRadius: 99, paddingHorizontal: 5, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={{ fontSize: 5 }}>🔥</Text>
              <Text style={{ fontSize: 6, fontWeight: '700', color: '#FB7B6B' }}>14</Text>
            </View>
          </View>

          {/* Mini calendar strip */}
          <View className="px-3 pb-1 flex-row justify-between">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
              <View key={i} className="items-center">
                <Text style={{ fontSize: 5, color: '#8A8A8E' }}>{d}</Text>
                <View style={{
                  width: 14, height: 14, borderRadius: 7, marginTop: 2,
                  backgroundColor: i < 4 ? '#7CB69D' : 'transparent',
                  borderWidth: i === 4 ? 1 : 0,
                  borderColor: i === 4 ? '#FB7B6B' : undefined,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 5, color: i < 4 ? 'white' : i === 4 ? '#1D3A44' : '#C4C4C6', fontWeight: i === 4 ? '700' : '500' }}>
                    {i + 3}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Mini score card */}
          <View style={{ marginHorizontal: 12, marginBottom: 4, backgroundColor: 'white', borderRadius: 8, padding: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 }}>
            <View className="flex-row items-center gap-2">
              <View style={{ width: ringSize, height: ringSize }}>
                <Svg width={ringSize} height={ringSize} style={{ transform: [{ rotate: '-90deg' }] }}>
                  <Circle cx={ringSize / 2} cy={ringSize / 2} r={r} stroke="#E5E7EB" strokeWidth={3} fill="none" />
                  <Circle cx={ringSize / 2} cy={ringSize / 2} r={r} stroke="#7CB69D" strokeWidth={3} fill="none"
                    strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * 0.18} />
                </Svg>
                <View style={{ position: 'absolute', top: 0, left: 0, width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#1D3A44' }}>82</Text>
                </View>
              </View>
              <View className="flex-1 gap-1">
                {[{ w: '70%', c: '#7CB69D' }, { w: '45%', c: '#FB7B6B' }, { w: '88%', c: '#7CB69D' }].map((bar, i) => (
                  <View key={i} style={{ flex: 1, height: 2, backgroundColor: '#E5E7EB', borderRadius: 99, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: bar.w as any, backgroundColor: bar.c, borderRadius: 99 }} />
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Mini routine card */}
          <View style={{ marginHorizontal: 12, marginBottom: 4, backgroundColor: 'white', borderRadius: 8, overflow: 'hidden', flexDirection: 'row', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 }}>
            <View style={{ width: 2, backgroundColor: '#FB7B6B' }} />
            <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6 }}>
              <View className="flex-row items-center gap-1 mb-1">
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#FB7B6B' }} />
                <Text style={{ fontSize: 6, fontWeight: '700', color: '#1D3A44' }}>Rotina da Manhã</Text>
                <Text style={{ fontSize: 6, fontWeight: '700', color: '#1D3A44', marginLeft: 'auto' }}>2/5</Text>
              </View>
              <View className="flex-row gap-[2px]">
                {[0, 1, 2, 3, 4].map((j) => (
                  <View key={j} style={{ flex: 1, height: 2, borderRadius: 99, backgroundColor: j < 2 ? '#7CB69D' : '#E5E7EB' }} />
                ))}
              </View>
            </View>
          </View>

          {/* Mini food card — Análise Alimentar */}
          <View style={{ marginHorizontal: 12, backgroundColor: 'white', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#7CB69D' }} />
              <Text style={{ fontSize: 6, fontWeight: '700', color: '#1D3A44' }}>Análise Alimentar</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function PaywallSoft() {
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async () => {
    try {
      setRestoring(true);
      const customerInfo = await restorePurchases();
      if (isPremium(customerInfo)) {
        router.push('/(onboarding)/notifications');
      } else {
        Alert.alert('Sem assinatura ativa', 'Não encontramos nenhuma compra anterior associada a esta conta.');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível restaurar as compras. Tente novamente.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 relative overflow-hidden">

        {/* Phone Mockup renderizado PRIMEIRO — fica atrás do conteúdo (z-index natural do RN) */}
        <PhoneMockup />

        {/* Restaurar link — z-index acima do mockup */}
        <View className="px-6 pt-4 pb-2 items-end" style={{ zIndex: 10 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={handleRestore} disabled={restoring}>
            {restoring ? (
              <ActivityIndicator size="small" color="#9CA3AF" />
            ) : (
              <Text className="text-[14px] text-[#9CA3AF] underline">Restaurar</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Conteúdo principal — z-index acima do mockup */}
        <View className="flex-1 px-6" style={{ zIndex: 10 }}>
          {/* Headline */}
          <View className="mt-4 mb-8">
            <Text
              style={{ fontSize: 30, fontWeight: '800', lineHeight: 36, color: '#1A1A1A', textAlign: 'center' }}
            >
              {'Queremos que você\nexperimente o NIKS AI\n'}
              <Text style={{ color: '#FB7B6B' }}>de graça.</Text>
            </Text>
          </View>

          {/* Spacer */}
          <View className="flex-1" />

          {/* Badge "Nenhum pagamento" */}
          <View className="flex-row items-center justify-center gap-2 mb-4">
            <View className="w-[22px] h-[22px] rounded-full bg-[#1A1A1A] items-center justify-center">
              <Check size={13} color="#FFFFFF" strokeWidth={3} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>
              Nenhum pagamento agora
            </Text>
          </View>

          {/* CTA */}
          <View className="pb-8">
            <TouchableOpacity
              onPress={() => router.push('/(onboarding)/paywall-detailed')}
              activeOpacity={0.85}
              className="w-full py-4 rounded-[14px] items-center justify-center bg-[#1A1A1A]"
            >
              <Text className="text-white text-[17px] font-semibold">Testar por R$0,00</Text>
            </TouchableOpacity>
            <Text className="text-center text-[13px] text-[#9CA3AF] mt-3">
              R$35,90/mês ou R$238,80/ano (R$19,90/mês)
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  phoneMockupWrapper: {
    position: 'absolute',
    bottom: -24,
    right: -32,
    width: 200,
    height: 410,
    transform: [{ rotate: '12deg' }],
    pointerEvents: 'none',
  },
  phoneFrame: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1A1A1A',
    borderRadius: 28,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 60,
    elevation: 16,
  },
  phoneScreen: {
    flex: 1,
    backgroundColor: '#F6F4EE',
    borderRadius: 22,
    overflow: 'hidden',
  },
});
