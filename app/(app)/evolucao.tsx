import { View, Text, TouchableOpacity, ScrollView, FlatList, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { UtensilsCrossed, TrendingUp, Camera } from 'lucide-react-native';
import Svg, { Path, Circle, Line, Text as SvgText, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';

type TimeFilter = '7D' | '1M' | '3M' | 'Tudo';

const FILTERS: TimeFilter[] = ['7D', '1M', '3M', 'Tudo'];

type ScanPoint = {
  id: string;
  skin_score: number;
  created_at: string;
  foto_url: string;
  signed_url?: string;
};

const GRAPH_W = 320;
const GRAPH_H = 140;
const PAD_L = 28;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 28;
const PLOT_W = GRAPH_W - PAD_L - PAD_R;
const PLOT_H = GRAPH_H - PAD_T - PAD_B;

function filterByPeriod(scans: ScanPoint[], filter: TimeFilter): ScanPoint[] {
  if (filter === 'Tudo') return scans;
  const now = Date.now();
  const days = filter === '7D' ? 7 : filter === '1M' ? 30 : 90;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return scans.filter((s) => new Date(s.created_at).getTime() >= cutoff);
}

function buildPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

function buildAreaPath(points: { x: number; y: number }[], bottomY: number): string {
  if (points.length === 0) return '';
  const line = buildPath(points);
  return `${line} L ${points[points.length - 1].x} ${bottomY} L ${points[0].x} ${bottomY} Z`;
}

function ScoreChart({ scans, filter }: { scans: ScanPoint[]; filter: TimeFilter }) {
  const filtered = filterByPeriod(scans, filter);

  if (filtered.length === 0) {
    return (
      <View style={{ height: GRAPH_H + 20, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <TrendingUp size={28} color={Colors.disabled} strokeWidth={1.5} />
        <Text style={{ fontSize: 13, color: Colors.gray, textAlign: 'center' }}>
          Faça seu primeiro scan para ver a evolução
        </Text>
      </View>
    );
  }

  const scores = filtered.map((s) => s.skin_score);
  const minScore = Math.max(0, Math.min(...scores) - 5);
  const maxScore = Math.min(100, Math.max(...scores) + 5);
  const range = maxScore - minScore || 1;

  const toX = (i: number) => PAD_L + (i / (filtered.length - 1 || 1)) * PLOT_W;
  const toY = (score: number) => PAD_T + PLOT_H - ((score - minScore) / range) * PLOT_H;

  const pts = filtered.map((s, i) => ({ x: toX(i), y: toY(s.skin_score) }));
  const linePath = buildPath(pts);
  const areaPath = buildAreaPath(pts, PAD_T + PLOT_H);

  // X axis labels — show max 4
  const labelIndices: number[] = [];
  if (filtered.length <= 4) {
    for (let i = 0; i < filtered.length; i++) labelIndices.push(i);
  } else {
    labelIndices.push(0);
    labelIndices.push(Math.floor(filtered.length / 3));
    labelIndices.push(Math.floor((2 * filtered.length) / 3));
    labelIndices.push(filtered.length - 1);
  }

  // Y guide lines at 25, 50, 75, 100
  const guideValues = [25, 50, 75, 100].filter((v) => v >= minScore && v <= maxScore);

  return (
    <Svg width={GRAPH_W} height={GRAPH_H + 20} viewBox={`0 0 ${GRAPH_W} ${GRAPH_H + 20}`}>
      <Defs>
        <SvgGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={Colors.scanBtn} stopOpacity="0.15" />
          <Stop offset="1" stopColor={Colors.scanBtn} stopOpacity="0" />
        </SvgGradient>
      </Defs>

      {/* Guide lines */}
      {guideValues.map((v) => (
        <Line
          key={v}
          x1={PAD_L} y1={toY(v)}
          x2={PAD_L + PLOT_W} y2={toY(v)}
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      ))}

      {/* Area fill */}
      {filtered.length > 1 && (
        <Path d={areaPath} fill="url(#areaGrad)" />
      )}

      {/* Line */}
      {filtered.length > 1 && (
        <Path
          d={linePath}
          fill="none"
          stroke={Colors.scanBtn}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Data points */}
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={5} fill={Colors.white} stroke={Colors.scanBtn} strokeWidth={2} />
      ))}

      {/* X axis labels */}
      {labelIndices.map((i) => {
        const date = new Date(filtered[i].created_at);
        const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
        return (
          <SvgText
            key={i}
            x={toX(i)}
            y={GRAPH_H + 14}
            fontSize={9}
            fill={Colors.gray}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        );
      })}
    </Svg>
  );
}

export default function Evolucao() {
  const [filter, setFilter] = useState<TimeFilter>('1M');
  const [streak, setStreak] = useState<number>(0);
  const [foodCount, setFoodCount] = useState<number>(0);
  const [chartScans, setChartScans] = useState<ScanPoint[]>([]);
  const [photoScans, setPhotoScans] = useState<ScanPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        setLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user || !active) return;

          type RawScan = { id: string; foto_url: string; full_result: { skin_score: number }; created_at: string };

          const [{ data: userData }, { count: fc }, { data: chartData }, { data: photoData }] = await Promise.all([
            supabase.from('users').select('streak_days').eq('id', user.id).single(),
            supabase.from('food_scans').select('id', { count: 'exact' }).eq('user_id', user.id),
            // For chart — chronological (oldest → newest)
            supabase
              .from('skin_scans')
              .select('id, foto_url, full_result, created_at')
              .eq('user_id', user.id)
              .not('full_result', 'is', null)
              .order('created_at', { ascending: true }),
            // For photos — newest first
            supabase
              .from('skin_scans')
              .select('id, foto_url, full_result, created_at')
              .eq('user_id', user.id)
              .not('full_result', 'is', null)
              .order('created_at', { ascending: false }),
          ]);

          if (!active) return;
          if (userData?.streak_days != null) setStreak(userData.streak_days);
          setFoodCount(fc ?? 0);

          // Chart scans — no photo signing needed
          if (chartData) {
            const points: ScanPoint[] = (chartData as RawScan[]).map((s) => ({
              id: s.id,
              skin_score: s.full_result?.skin_score ?? 0,
              created_at: s.created_at,
              foto_url: s.foto_url,
            }));
            if (active) setChartScans(points);
          }

          // Photo scans — sign URLs
          if (photoData) {
            const points: ScanPoint[] = await Promise.all(
              (photoData as RawScan[]).map(async (s) => {
                let signed_url: string | undefined;
                if (s.foto_url && s.foto_url.startsWith('http')) {
                  signed_url = s.foto_url;
                } else if (s.foto_url) {
                  const { data: signedData } = await supabase.storage
                    .from('scans')
                    .createSignedUrl(s.foto_url, 3600);
                  signed_url = signedData?.signedUrl;
                }
                return {
                  id: s.id,
                  skin_score: s.full_result?.skin_score ?? 0,
                  created_at: s.created_at,
                  foto_url: s.foto_url,
                  signed_url,
                };
              })
            );
            if (active) setPhotoScans(points);
          }
        } catch (e) {
          console.warn('Evolucao load error:', e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [])
  );

  // Score variation badge — uses chronological chart data
  const scoreDelta =
    chartScans.length >= 2 ? chartScans[chartScans.length - 1].skin_score - chartScans[0].skin_score : null;

  const CARD = {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={{ maxWidth: 393, width: '100%', alignSelf: 'center', paddingHorizontal: 24 }}>

          {/* Header */}
          <View style={{ paddingTop: 24, marginBottom: 24 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: Colors.tabActive }}>
              Sua Evolução
            </Text>
          </View>

          {loading ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <ActivityIndicator color={Colors.scanBtn} size="large" />
            </View>
          ) : (
            <>
              {/* Bloco 1 — Grid 2 widgets */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                {/* Streak */}
                <View style={[CARD, { flex: 1, alignItems: 'center' }]}>
                  <View style={{ position: 'relative', width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 64 }}>🔥</Text>
                    <Text style={{ position: 'absolute', bottom: 10, fontSize: 18, fontWeight: '800', color: Colors.white }}>
                      {streak}
                    </Text>
                    <Text style={{ position: 'absolute', top: 4, left: 6, fontSize: 11, color: Colors.gold }}>✦</Text>
                    <Text style={{ position: 'absolute', top: 0, right: 8, fontSize: 9, color: Colors.gold }}>✦</Text>
                    <Text style={{ position: 'absolute', top: 14, left: 0, fontSize: 8, color: Colors.gold }}>✦</Text>
                    <Text style={{ position: 'absolute', top: 10, right: 2, fontSize: 10, color: Colors.gold }}>✦</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: Colors.gray, textAlign: 'center', marginTop: 8 }}>
                    Sequência de dias
                  </Text>
                </View>

                {/* Refeições escaneadas */}
                <View style={[CARD, { flex: 1, alignItems: 'center', gap: 6 }]}>
                  <UtensilsCrossed size={32} color={Colors.scanBtn} strokeWidth={1.5} />
                  <Text style={{ fontSize: 32, fontWeight: '800', color: Colors.tabActive, lineHeight: 36 }}>
                    {foodCount}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray, textAlign: 'center' }}>
                    Refeições escaneadas
                  </Text>
                </View>
              </View>

              {/* Bloco 2 — Gráfico Skin Score */}
              <View style={[CARD, { marginBottom: 24 }]}>
                {/* Card header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.tabActive }}>Skin Score</Text>
                  {scoreDelta !== null && (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 20,
                        backgroundColor: scoreDelta >= 0 ? '#E8F5E9' : '#FFEBEE',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: scoreDelta >= 0 ? '#2E7D32' : '#C62828' }}>
                        {scoreDelta >= 0 ? '+' : ''}{scoreDelta} desde o início
                      </Text>
                    </View>
                  )}
                </View>

                {/* Period filter pills */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {FILTERS.map((f) => (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setFilter(f)}
                      activeOpacity={0.8}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: 20,
                        backgroundColor: filter === f ? Colors.scanBtn : 'transparent',
                        borderWidth: 0.5,
                        borderColor: filter === f ? Colors.scanBtn : Colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '500', color: filter === f ? Colors.white : Colors.gray }}>
                        {f}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Chart */}
                <View style={{ alignItems: 'center' }}>
                  <ScoreChart scans={chartScans} filter={filter} />
                </View>
              </View>

              {/* Bloco 3 — Fotos de progresso */}
              <Text style={{ fontSize: 11, fontWeight: '600', color: Colors.gray, letterSpacing: 0.8, marginBottom: 10 }}>
                FOTOS DE PROGRESSO
              </Text>

              {photoScans.length === 0 ? (
                <View
                  style={{
                    width: 140,
                    height: 210,
                    borderRadius: 12,
                    backgroundColor: Colors.lightGray,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Camera size={24} color={Colors.gray} strokeWidth={1.5} />
                  <Text style={{ fontSize: 11, color: Colors.gray, textAlign: 'center', paddingHorizontal: 12 }}>
                    Nenhum scan ainda
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={photoScans}
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
                  renderItem={({ item }) => (
                    <View
                      style={{
                        width: 140,
                        borderRadius: 12,
                        overflow: 'hidden',
                        backgroundColor: Colors.white,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.06,
                        shadowRadius: 4,
                        elevation: 1,
                      }}
                    >
                      {item.signed_url ? (
                        <Image
                          source={{ uri: item.signed_url }}
                          style={{ width: 140, height: 160 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ width: 140, height: 160, backgroundColor: Colors.lightGray, alignItems: 'center', justifyContent: 'center' }}>
                          <Camera size={24} color={Colors.gray} strokeWidth={1.5} />
                        </View>
                      )}
                      <View style={{ padding: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 11, color: Colors.gray }}>
                          {new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}
                        </Text>
                        <View style={{ backgroundColor: Colors.scanBtn, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.white }}>
                            {item.skin_score}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}
                />
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
