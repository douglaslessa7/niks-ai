import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Sparkles, Info, AlertTriangle, CheckCircle, Zap } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/onboarding';

type FoodItem = {
  name: string;
  impact: 'positivo' | 'neutro' | 'negativo';
  evidence: string;
  mechanism: string;
  relevance_to_skin: string;
  substitution: string | null;
};

type FoodAnalysisResult = {
  meal_score: 'Ótimo' | 'Bom' | 'Moderado' | 'Atenção';
  meal_summary: string;
  foods: FoodItem[];
  highlights: string[];
  watch_out: string[];
  science_note: string;
  disclaimer: string;
};

const scoreConfig = {
  'Ótimo':    { color: '#7CB69D', bgColor: 'rgba(124,182,157,0.1)' },
  'Bom':      { color: '#7CB69D', bgColor: 'rgba(124,182,157,0.1)' },
  'Moderado': { color: '#D4A017', bgColor: 'rgba(212,160,23,0.1)' },
  'Atenção':  { color: '#FB7B6B', bgColor: 'rgba(251,123,107,0.1)' },
};

const impactConfig = {
  positivo: { label: 'Positivo', color: '#7CB69D', bgColor: 'rgba(124,182,157,0.1)' },
  neutro:   { label: 'Neutro',   color: '#D4A017', bgColor: 'rgba(212,160,23,0.1)'   },
  negativo: { label: 'Negativo', color: '#FB7B6B', bgColor: 'rgba(251,123,107,0.1)'  },
};

export default function FoodReport() {
  const router = useRouter();
  const { foodImageBase64, foodImageMimeType, onboarding } = useAppStore();
  const [result, setResult] = useState<FoodAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyzeFood();
  }, []);

  const analyzeFood = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('foodImageBase64 size KB:', Math.round(((foodImageBase64?.length ?? 0) * 0.75) / 1024));
      console.log('foodImageMimeType:', foodImageMimeType);

      const response = await fetch(
        'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/analyze-food',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            imageBase64: foodImageBase64,
            mimeType: foodImageMimeType ?? 'image/jpeg',
            skinProfile: {
              skin_type: onboarding.skin_type,
              concerns: onboarding.concerns,
            },
          }),
        }
      );

      if (!response.ok) {
        const errBody = await response.json();
        throw new Error(JSON.stringify(errBody));
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      console.error('Erro ao analisar refeição:', String(err));
      setError('Não foi possível analisar a refeição. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#FB7B6B" />
        <Text style={{ marginTop: 16, color: '#5A5A5C', fontSize: 15 }}>Analisando sua refeição...</Text>
      </SafeAreaView>
    );
  }

  if (error || !result) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 16 }}>
          {error ?? 'Erro inesperado'}
        </Text>
        <TouchableOpacity
          onPress={analyzeFood}
          style={{ backgroundColor: '#FB7B6B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>Tentar novamente</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const score = scoreConfig[result.meal_score] ?? scoreConfig['Bom'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.8}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
          >
            <ChevronLeft size={20} color="#1D3A44" strokeWidth={2} />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1D3A44' }}>Relatório de Impacto</Text>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 32 }}>

          {/* Score geral */}
          <View style={{ backgroundColor: score.bgColor, borderRadius: 16, padding: 20, borderWidth: 1.5, borderColor: score.color + '30', alignItems: 'center' }}>
            <Text style={{ fontSize: 42, fontWeight: '800', color: score.color }}>{result.meal_score}</Text>
            <Text style={{ fontSize: 14, color: '#5A5A5C', textAlign: 'center', marginTop: 8, lineHeight: 20 }}>{result.meal_summary}</Text>
          </View>

          {/* Alimentos identificados */}
          <View style={{ backgroundColor: 'white', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D3A44', marginBottom: 12 }}>Alimentos identificados</Text>
            <View style={{ gap: 12 }}>
              {result.foods.map((food, index) => {
                const cfg = impactConfig[food.impact] ?? impactConfig.neutro;
                return (
                  <View key={index} style={{ borderRadius: 12, backgroundColor: cfg.bgColor, padding: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D3A44' }}>{food.name}</Text>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: cfg.color + '20' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, color: '#5A5A5C', lineHeight: 18, marginBottom: 4 }}>{food.mechanism}</Text>
                    {food.substitution && (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 4 }}>
                        <Sparkles size={12} color={cfg.color} strokeWidth={2} style={{ marginTop: 1 }} />
                        <Text style={{ flex: 1, fontSize: 12, color: cfg.color, fontWeight: '600' }}>
                          Substitua por: {food.substitution}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {/* Destaques */}
          {result.highlights.length > 0 && (
            <View style={{ backgroundColor: 'white', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <CheckCircle size={16} color="#7CB69D" strokeWidth={2} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D3A44' }}>Pontos positivos</Text>
              </View>
              <View style={{ gap: 8 }}>
                {result.highlights.map((h, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <CheckCircle size={16} color="#7CB69D" strokeWidth={2} style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, fontSize: 13, color: '#5A5A5C', lineHeight: 18 }}>{h}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Atenção */}
          {result.watch_out.length > 0 && (
            <View style={{ backgroundColor: 'white', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <AlertTriangle size={16} color="#D4A017" strokeWidth={2} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D3A44' }}>Fique atento</Text>
              </View>
              <View style={{ gap: 8 }}>
                {result.watch_out.map((w, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <AlertTriangle size={16} color="#D4A017" strokeWidth={2} style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, fontSize: 13, color: '#5A5A5C', lineHeight: 18 }}>{w}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Science note */}
          <View style={{ borderRadius: 14, padding: 16, backgroundColor: 'rgba(251,123,107,0.08)', borderWidth: 1.5, borderColor: '#FB7B6B30' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Zap size={18} color="#FB7B6B" strokeWidth={2} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FB7B6B', marginBottom: 4 }}>Você sabia?</Text>
                <Text style={{ fontSize: 13, color: '#1D3A44', lineHeight: 20 }}>{result.science_note}</Text>
              </View>
            </View>
          </View>

          {/* Disclaimer */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 4 }}>
            <Info size={13} color="#9CA3AF" strokeWidth={2} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: 11, color: '#9CA3AF', lineHeight: 16 }}>{result.disclaimer}</Text>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

