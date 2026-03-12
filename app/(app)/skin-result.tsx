import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ChevronLeft, Sparkles, AlertTriangle, CheckCircle, Info } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useAppStore, SkinMetric } from '../../store/onboarding';

const r = 32;
const circ = 2 * Math.PI * r;

const metricColors: Record<string, string> = {
  hydration: '#3B82F6',
  oiliness: '#F59E0B',
  texture: '#10B981',
  acne: '#8B5CF6',
  dark_spots: '#EF4444',
  sensitivity: '#06B6D4',
};

const metricLabels: Record<string, string> = {
  hydration: 'Hidratação',
  oiliness: 'Oleosidade',
  texture: 'Textura',
  acne: 'Poros',
  dark_spots: 'Manchas',
  sensitivity: 'Elasticidade',
};

function MetricCard({ name, metric }: { name: string; metric: SkinMetric }) {
  const color = metricColors[name] ?? '#FB7B6B';
  const pct = Math.min(100, Math.max(0, metric.score));
  return (
    <View
      style={{
        backgroundColor: 'white',
        borderRadius: 14,
        padding: 14,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
        gap: 8,
      }}
    >
      {/* Topo: nome + score */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#1D3A44' }}>
            {metricLabels[name] ?? name}
          </Text>
        </View>
        <Text style={{ fontSize: 15, fontWeight: '800', color }}>
          {pct}<Text style={{ fontSize: 11, fontWeight: '600', color: '#9CA3AF' }}>/100</Text>
        </Text>
      </View>

      {/* Barra de progresso */}
      <View style={{ height: 4, borderRadius: 2, backgroundColor: '#F0F0F2' }}>
        <View
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 2,
            backgroundColor: color,
          }}
        />
      </View>

      {/* Insight */}
      <Text style={{ fontSize: 12, color: '#5A5A5C', lineHeight: 17 }}>{metric.insight}</Text>
    </View>
  );
}

export default function SkinResult() {
  const router = useRouter();
  const { scanResult, scanImageUri, selectedScan } = useAppStore();

  const result = selectedScan?.result ?? scanResult;
  const imageUri = selectedScan?.imageUri ?? scanImageUri;

  useEffect(() => {
    return () => { useAppStore.getState().setSelectedScan(null); };
  }, []);

  const score = result?.skin_score ?? 0;
  const offset = circ * (1 - score / 100);
  const metrics = result?.metrics ? Object.entries(result.metrics) : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.8}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.06,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <ChevronLeft size={20} color="#1D3A44" strokeWidth={2} />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1D3A44' }}>Análise Facial</Text>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 40 }}>

          {/* Hero: foto + score */}
          <View style={{ borderRadius: 20, overflow: 'hidden', height: 280 }}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            ) : (
              <View style={{ flex: 1, backgroundColor: '#C8C0B8' }} />
            )}

            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.7)']}
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 200 }}
            />

            {/* Score badge */}
            <View
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                backgroundColor: '#FB7B6B',
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 6,
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: 2,
              }}
            >
              <Text style={{ fontSize: 24, fontWeight: '800', color: 'white' }}>{result?.skin_score ?? 0}</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)' }}>/100</Text>
            </View>

            {/* Skin type + score ring no rodapé */}
            <View
              style={{
                position: 'absolute',
                bottom: 16,
                left: 16,
                right: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>
                  Tipo de pele detectado
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: 'white' }}>
                  {result?.skin_type_detected ?? '—'}
                </Text>
              </View>

              {/* Mini score ring */}
              <View style={{ width: 52, height: 52 }}>
                <Svg width={52} height={52} style={{ transform: [{ rotate: '-90deg' }] }}>
                  <Circle cx={26} cy={26} r={r} stroke="rgba(255,255,255,0.25)" strokeWidth={4} fill="none" />
                  <Circle
                    cx={26} cy={26} r={r}
                    stroke="#FB7B6B" strokeWidth={4} fill="none"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    strokeLinecap="round"
                  />
                </Svg>
                <View style={{ position: 'absolute', top: 0, left: 0, width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: 'white' }}>{result?.skin_score ?? 0}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Headline da IA */}
          {result?.headline && (
            <View
              style={{
                backgroundColor: 'white',
                borderRadius: 14,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10,
                shadowColor: '#000',
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <Sparkles size={18} color="#FB7B6B" strokeWidth={2} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 14, color: '#1D3A44', lineHeight: 21, fontWeight: '500' }}>
                {result?.headline}
              </Text>
            </View>
          )}

          {/* Métricas */}
          {metrics.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#1D3A44', marginBottom: 2 }}>
                Suas métricas detalhadas
              </Text>
              {metrics.map(([name, metric]) => (
                <MetricCard key={name} name={name} metric={metric} />
              ))}
            </View>
          )}

          {/* Principais preocupações */}
          {(result?.top_concerns?.length ?? 0) > 0 && (
            <View
              style={{
                backgroundColor: 'white',
                borderRadius: 14,
                padding: 16,
                shadowColor: '#000',
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <AlertTriangle size={16} color="#D4A017" strokeWidth={2} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D3A44' }}>Principais preocupações</Text>
              </View>
              <View style={{ gap: 8 }}>
                {result!.top_concerns.map((concern, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <AlertTriangle size={14} color="#D4A017" strokeWidth={2} style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, fontSize: 13, color: '#5A5A5C', lineHeight: 18 }}>{concern}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Pontos positivos */}
          {(result?.positive_highlights?.length ?? 0) > 0 && (
            <View
              style={{
                backgroundColor: 'white',
                borderRadius: 14,
                padding: 16,
                shadowColor: '#000',
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <CheckCircle size={16} color="#7CB69D" strokeWidth={2} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D3A44' }}>Pontos positivos</Text>
              </View>
              <View style={{ gap: 8 }}>
                {result!.positive_highlights.map((h, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <CheckCircle size={14} color="#7CB69D" strokeWidth={2} style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, fontSize: 13, color: '#5A5A5C', lineHeight: 18 }}>{h}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Disclaimer */}
          {result?.disclaimer && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 4 }}>
              <Info size={13} color="#9CA3AF" strokeWidth={2} style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, fontSize: 11, color: '#9CA3AF', lineHeight: 16 }}>
                {result?.disclaimer}
              </Text>
            </View>
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
