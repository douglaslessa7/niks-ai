import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ArrowLeft, Sparkles, Info, AlertTriangle, CheckCircle, Zap } from 'lucide-react-native';
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
  meal_name: string;
  meal_score: number;
  meal_label: 'Ótimo' | 'Bom' | 'Moderado' | 'Atenção';
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
  const { foodImageBase64, foodImageMimeType, onboarding, selectedFoodResult, setSelectedFoodResult } = useAppStore();
  const [result, setResult] = useState<FoodAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const apiDoneRef = useRef(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const TOTAL_DURATION = 10000;
    const increment = 90 / (TOTAL_DURATION / 50);

    progressIntervalRef.current = setInterval(() => {
      if (apiDoneRef.current) {
        clearInterval(progressIntervalRef.current!);
        return;
      }
      setProgress((prev) => {
        if (prev >= 98) return 98;
        if (prev >= 90) return prev + 0.03;
        return Math.min(prev + increment, 90);
      });
    }, 50);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (selectedFoodResult) {
      setResult(selectedFoodResult as FoodAnalysisResult);
      setLoading(false);
    } else {
      analyzeFood();
    }
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

      // Salvar na tabela food_scans para aparecer na home
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Upload da foto para o Storage
          let imageUrl: string | null = null;
          if (foodImageBase64) {
            try {
              const ext = (foodImageMimeType ?? 'image/jpeg').includes('png') ? 'png' : 'jpg';
              const path = `${user.id}/food_${Date.now()}.${ext}`;
              const binaryStr = atob(foodImageBase64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              const { error: upErr } = await supabase.storage
                .from('scans').upload(path, bytes.buffer, { contentType: foodImageMimeType ?? 'image/jpeg', upsert: false });
              if (!upErr) {
                const { data: signed } = await supabase.storage.from('scans').createSignedUrl(path, 31536000);
                imageUrl = signed?.signedUrl ?? null;
              }
            } catch (upEx) {
              console.warn('Falha ao fazer upload da foto de comida:', upEx);
            }
          }

          const { error: insertErr } = await supabase.from('food_scans').insert({
            user_id: user.id,
            meal_name: data.meal_name,
            meal_score: data.meal_score,
            meal_label: data.meal_label,
            meal_summary: data.meal_summary,
            image_url: imageUrl,
            full_result: data,
          });
          if (insertErr) console.warn('Falha ao salvar food_scan:', JSON.stringify(insertErr));
        } else {
          console.warn('food_scan não salvo: usuário não autenticado');
        }
      } catch (saveErr) {
        console.warn('Falha ao salvar food_scan (exception):', saveErr);
      }
    } catch (err: any) {
      console.error('Erro ao analisar refeição:', String(err));
      setError('Não foi possível analisar a refeição. Tente novamente.');
    } finally {
      apiDoneRef.current = true;
      setProgress(100);
      await new Promise((r) => setTimeout(r, 400));
      setLoading(false);
    }
  };

  if (loading) {
    const displayProgress = Math.floor(progress);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
        <Text style={{ fontSize: 64, fontWeight: '800', color: '#FB7B6B', lineHeight: 72 }}>
          {displayProgress}%
        </Text>
        <View style={{ width: '100%', height: 6, backgroundColor: '#E8E0D8', borderRadius: 99, marginTop: 16, overflow: 'hidden' }}>
          <View style={{ height: 6, width: `${displayProgress}%`, backgroundColor: '#FB7B6B', borderRadius: 99 }} />
        </View>
        <Text style={{ marginTop: 20, color: '#1D3A44', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>
          Analisando sua refeição...
        </Text>
        <Text style={{ marginTop: 6, color: '#8A8A8E', fontSize: 13, textAlign: 'center', lineHeight: 18 }}>
          Identificando o impacto de cada alimento na sua pele
        </Text>
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

  const score = scoreConfig[result.meal_label] ?? scoreConfig['Bom'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            onPress={() => { setSelectedFoodResult(null); router.back(); }}
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
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
              <Text style={{ fontSize: 56, fontWeight: '800', color: score.color, lineHeight: 60 }}>{result.meal_score}</Text>
              <Text style={{ fontSize: 16, color: '#8A8A8E', marginBottom: 8 }}>/100</Text>
            </View>
            <View style={{ paddingHorizontal: 14, paddingVertical: 5, borderRadius: 99, backgroundColor: score.color + '20', marginTop: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: score.color }}>{result.meal_label}</Text>
            </View>
            <Text style={{ fontSize: 14, color: '#5A5A5C', textAlign: 'center', marginTop: 12, lineHeight: 20 }}>{result.meal_summary}</Text>
          </View>

          {/* Alimentos identificados */}
          <View style={{ backgroundColor: 'white', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D3A44', marginBottom: 12 }}>Alimentos identificados</Text>
            <View style={{ gap: 12 }}>
              {result.foods.map((food, index) => {
                const cfg = impactConfig[food.impact] ?? impactConfig.neutro;
                return (
                  <View key={index} style={{ borderRadius: 12, backgroundColor: cfg.bgColor, padding: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#1D3A44', flexWrap: 'wrap' }}>{food.name}</Text>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: cfg.color + '20', flexShrink: 0 }}>
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

          {/* Botão Voltar para tela inicial */}
          <TouchableOpacity
            onPress={() => { setSelectedFoodResult(null); router.replace('/(app)/home' as any); }}
            activeOpacity={0.85}
            style={{
              height: 56,
              borderRadius: 999,
              backgroundColor: '#FB7B6B',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              marginTop: 8,
              shadowColor: '#FB7B6B',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.35,
              shadowRadius: 20,
              elevation: 6,
            }}
          >
            <ArrowLeft size={20} color="white" strokeWidth={2.5} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>Voltar para tela inicial</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

