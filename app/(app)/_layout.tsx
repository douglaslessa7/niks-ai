import { Tabs, usePathname, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { supabase } from '../../lib/supabase';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';
import { useAppStore } from '../../store/onboarding';
import { ScanModal } from '../../components/scan/ScanModal';

// ── Tab icons (filled/outline dual-mode) ─────────────────────────────────────
function TabIconHome({ color, size = 24, filled }: { color: string; size?: number; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H15V14H9v7.5H4.5A1.5 1.5 0 0 1 3 20z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap={filled ? undefined : 'round'}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function TabIconProtocol({ color, size = 24, filled }: { color: string; size?: number; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap={filled ? undefined : 'round'}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function TabIconUser({ color, size = 24, filled }: { color: string; size?: number; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap={filled ? undefined : 'round'}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={7} r={4} fill={filled ? color : 'none'} stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}
function TabIconSparkles({ color, size = 24, filled }: { color: string; size?: number; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M5 3v4"   stroke={color} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M19 17v4" stroke={color} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M3 5h4"   stroke={color} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M17 19h4" stroke={color} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

const TABS = [
  { key: 'home',      label: 'início', Icon: TabIconHome     },
  { key: 'protocolo', label: 'rotina', Icon: TabIconProtocol },
  { key: 'niks-chat', label: 'niks',   Icon: TabIconSparkles },
  { key: 'perfil',    label: 'perfil', Icon: TabIconUser     },
];

// ── Global bottom bar — tab pill (left) + FAB scan (right) ───────────────────
function GlobalBottomBar() {
  const router = useRouter();
  const pathname = usePathname();
  const tabBarTheme = useAppStore((s) => s.tabBarTheme);
  const setScanModalOpen = useAppStore((s) => s.setScanModalOpen);

  const isDark = tabBarTheme === 'dark';
  const tabAccent    = isDark ? '#FB8877' : '#FB7B6B';
  const fabColor     = '#FB7B6B';
  const inactiveColor = isDark ? 'rgba(255,255,255,0.45)' : '#8A8A8E';
  const bg     = isDark ? 'rgba(26,31,46,0.85)' : '#FFFFFF';
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#F0F0F0';

  const tabItems = TABS.map((tab) => {
    const isActive = pathname === `/${tab.key}` || pathname.startsWith(`/${tab.key}/`);
    const color = isActive ? tabAccent : inactiveColor;
    return (
      <TouchableOpacity
        key={tab.key}
        onPress={() => router.push(`/${tab.key}` as any)}
        activeOpacity={0.8}
        style={styles.tabItem}
      >
        <tab.Icon color={color} size={24} filled={isActive} />
        <Text style={[styles.tabLabel, { color, fontWeight: isActive ? '600' : '400' }]}>
          {tab.label}
        </Text>
      </TouchableOpacity>
    );
  });

  const tabContent = (
    <View style={[styles.pillInner, { backgroundColor: bg, borderColor: border }]}>
      {tabItems}
    </View>
  );

  return (
    <>
      {/* Tab pill — leaves right: 92 gap for the FAB */}
      <View style={[
        styles.pill,
        isDark ? styles.pillShadowDark : styles.pillShadowLight,
      ]}>
        {isDark ? (
          <BlurView intensity={50} tint="dark" style={{ borderRadius: 20, overflow: 'hidden' }}>
            {tabContent}
          </BlurView>
        ) : (
          tabContent
        )}
      </View>

      {/* FAB — scan button */}
      <TouchableOpacity
        onPress={() => setScanModalOpen(true)}
        activeOpacity={0.88}
        style={[styles.fab, { backgroundColor: fabColor, shadowColor: fabColor }]}
      >
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        </Svg>
      </TouchableOpacity>
    </>
  );
}

export default function AppLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const tabBarVisible = useAppStore((s) => s.tabBarVisible);
  const subscriptionVerified = useAppStore((s) => s.subscriptionVerified);
  const setSubscriptionVerified = useAppStore((s) => s.setSubscriptionVerified);
  const scanModalOpen = useAppStore((s) => s.scanModalOpen);
  const setScanModalOpen = useAppStore((s) => s.setScanModalOpen);
  const tabBarTheme = useAppStore((s) => s.tabBarTheme);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/');
        return;
      }

      // Verifica se o usuário já tem nome definido
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('nome')
          .eq('id', session.user.id)
          .single();
        const nome = (userData?.nome ?? '').trim();
        if (!nome) {
          router.replace('/(onboarding)/nome');
          return;
        }
      } catch {
        // Em caso de erro não bloqueamos o nome check
      }

      // Pula o check de assinatura se já foi verificado nesta sessão (evita tela branca no remount)
      if (__DEV__ || subscriptionVerified) {
        setReady(true);
        return;
      }

      // Guard de assinatura — fail closed: qualquer dúvida vai para o paywall
      try {
        const infoPromise = getCustomerInfo();
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 8000)
        );
        const info = await Promise.race([infoPromise, timeoutPromise]);

        if (!info || !isSubscribed(info)) {
          router.replace('/(onboarding)/paywall-soft');
          return;
        }
      } catch {
        router.replace('/(onboarding)/paywall-soft');
        return;
      }

      setSubscriptionVerified(true);
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="home" />
        <Tabs.Screen name="protocolo" />
        <Tabs.Screen name="niks-chat" />
        <Tabs.Screen name="analise" options={{ href: null }} />
        <Tabs.Screen name="evolucao" options={{ href: null }} />
        <Tabs.Screen name="perfil" />
        <Tabs.Screen name="set-name" options={{ href: null }} />
        <Tabs.Screen name="skin-result" options={{ href: null }} />
      </Tabs>
      {tabBarVisible && <GlobalBottomBar />}
      <ScanModal
        isOpen={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        isDark={tabBarTheme === 'dark'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: 16,
    right: 92,
    bottom: 20,
    borderRadius: 20,
  },
  pillShadowLight: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  pillShadowDark: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tabItem: {
    alignItems: 'center',
    paddingVertical: 4,
    gap: 4,
    minWidth: 52,
  },
  tabLabel: {
    fontSize: 12,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    zIndex: 30,
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.33,
    shadowRadius: 28,
    elevation: 12,
  },
});
