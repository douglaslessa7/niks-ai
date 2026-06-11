import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Canvas, Circle as SkiaCircle, RadialGradient, vec } from '@shopify/react-native-skia';
import { useFonts } from 'expo-font';
import { supabase } from '../../lib/supabase';
import { requestPushPermission, savePushToken } from '../../lib/notifications';

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';

export default function Notifications() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from('users').select('nome').eq('id', user.id).single();
        if (data?.nome) setUserName(data.nome.split(' ')[0]);
      } catch {}
    })();
  }, []);

  const navigateToApp = () => {
    router.replace('/(app)/home');
  };

  const handleActivate = async () => {
    setLoading(true);
    setHasRequested(true);
    try {
      const token = await Promise.race([
        requestPushPermission(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
      ]);
      if (token) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await savePushToken(user.id, token);
      }
    } catch (error) {
      console.error('[Notifications] Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  const subtitle = userName
    ? `Vamos lembrar você, ${userName}, nos melhores momentos do dia pra cuidar da sua pele.`
    : 'Vamos te lembrar nos melhores momentos do dia pra cuidar da sua pele.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

        {/* Title block */}
        <View style={{ paddingTop: 34, paddingHorizontal: 28 }}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: CORAL_DEEP, letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 14 }}>
            quase lá
          </Text>
          <Text style={{ fontSize: 30, fontWeight: '700', color: DEEP, letterSpacing: -0.85, lineHeight: 33.6 }}>
            {'Ative as '}
            <Text style={{ fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined, fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -1 }}>
              notificações
            </Text>
          </Text>
          <Text style={{ marginTop: 14, fontSize: 14.5, lineHeight: 21.75, color: DEEP_SOFT, letterSpacing: -0.1 }}>
            {subtitle}
          </Text>
        </View>

        {/* Bell illustration */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 260, height: 260, alignItems: 'center', justifyContent: 'center' }}>

            {/* Outer coral halo — exact match of:
                radial-gradient(circle at 50% 50%,
                  rgba(251,123,107,0.16) 0%,
                  rgba(251,123,107,0.08) 45%,
                  rgba(251,123,107,0)    70%)
                Skia is required because react-native-svg RadialGradient is broken in this project */}
            <Canvas style={{ position: 'absolute', width: 260, height: 260 }}>
              <SkiaCircle cx={130} cy={130} r={130}>
                <RadialGradient
                  c={vec(130, 130)}
                  r={130}
                  colors={[
                    'rgba(251,123,107,0.16)',
                    'rgba(251,123,107,0.08)',
                    'rgba(251,123,107,0.00)',
                    'rgba(251,123,107,0.00)',
                  ]}
                  positions={[0, 0.45, 0.70, 1]}
                />
              </SkiaCircle>
            </Canvas>

            {/* Inner disc — shadow matches CSS: 0 18px 40px -18px (negative spread → tight focus below) */}
            <View style={{
              width: 168, height: 168, borderRadius: 84,
              backgroundColor: '#FFFFFF',
              borderWidth: 1, borderColor: 'rgba(29,58,68,0.06)',
              shadowColor: CORAL,
              shadowOffset: { width: 0, height: 18 },
              shadowOpacity: 0.30,
              shadowRadius: 8,
              elevation: 4,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Svg width={74} height={74} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M6 8a6 6 0 1 1 12 0c0 4.5 1.5 6 2 7H4c.5-1 2-2.5 2-7z"
                  stroke={CORAL} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                />
                <Path
                  d="M10 18a2 2 0 0 0 4 0"
                  stroke={CORAL} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                />
              </Svg>

              {/* Pulse dot — CSS: boxShadow 0 0 0 4px rgba(251,123,107,0.18)
                  That's a solid ring (no blur, 4px spread). Implemented as a wrapper
                  View (the ring) containing the dot View.
                  top: 38, right: 56 is the dot position; ring extends 4px outward so top: 34, right: 52 */}
              <View style={{
                position: 'absolute', top: 34, right: 52,
                width: 20, height: 20, borderRadius: 10,
                backgroundColor: 'rgba(251,123,107,0.18)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: CORAL }} />
              </View>
            </View>

          </View>
        </View>

        {/* CTAs */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 22, gap: 12 }}>
          <TouchableOpacity
            onPress={handleActivate}
            disabled={loading}
            activeOpacity={0.85}
            style={{
              height: 60, borderRadius: 100,
              backgroundColor: CORAL,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: CORAL,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.30, shadowRadius: 12,
              elevation: 8,
            }}
          >
            {loading
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.2 }}>Ativar notificações</Text>
            }
          </TouchableOpacity>

          {hasRequested && (
            <TouchableOpacity
              onPress={navigateToApp}
              activeOpacity={0.85}
              style={{
                height: 60, borderRadius: 100,
                borderWidth: 1, borderColor: 'rgba(29,58,68,0.14)',
                backgroundColor: 'transparent',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: DEEP, letterSpacing: -0.15 }}>Já ativei!</Text>
            </TouchableOpacity>
          )}
        </View>

      </View>
    </SafeAreaView>
  );
}
