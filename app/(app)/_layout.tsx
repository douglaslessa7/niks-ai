import { Tabs, usePathname, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Scan, Droplet, User } from 'lucide-react-native';
import { usePlacement } from 'expo-superwall';
import { supabase } from '../../lib/supabase';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';
import { useAppStore } from '../../store/onboarding';

// Light mode — design: PROTO.coral / PROTO.gray6
const ACTIVE_LIGHT = '#FB7B6B';
const INACTIVE_LIGHT = '#8A8A8E';
// Dark mode — design: PROTO.coralSoft / rgba(255,255,255,0.45)
const ACTIVE_DARK = '#F9A898';
const INACTIVE_DARK = 'rgba(255,255,255,0.45)';

const tabs = [
  { name: 'home', label: 'scanear', Icon: Scan },
  { name: 'protocolo', label: 'protocolo', Icon: Droplet },
  { name: 'perfil', label: 'perfil', Icon: User },
];

function CustomTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const tabBarTheme = useAppStore((s) => s.tabBarTheme);
  const isDark = tabBarTheme === 'dark';

  const activeColor = isDark ? ACTIVE_DARK : ACTIVE_LIGHT;
  const inactiveColor = isDark ? INACTIVE_DARK : INACTIVE_LIGHT;

  return (
    <View
      style={[
        styles.barContainer,
        { position: 'absolute', bottom: 20, left: 16, right: 16 },
      ]}
    >
      {/* Shadow wrapper separado para não clipar com overflow:hidden do inner */}
      <View style={[styles.pillShadow, isDark ? styles.pillShadowDark : styles.pillShadowLight]}>
        <View style={[styles.pillInner, isDark ? styles.pillInnerDark : styles.pillInnerLight]}>
          {tabs.map((tab) => {
            const isActive = pathname === `/${tab.name}` || pathname.includes(tab.name);
            const { Icon } = tab;

            return (
              <TouchableOpacity
                key={tab.name}
                onPress={() => router.push(`/${tab.name}` as any)}
                activeOpacity={0.8}
                style={styles.tabItem}
              >
                <Icon
                  size={24}
                  color={isActive ? activeColor : inactiveColor}
                  strokeWidth={1.5}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isActive ? activeColor : inactiveColor, fontWeight: isActive ? '600' : '400' },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function AppLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const tabBarVisible = useAppStore((s) => s.tabBarVisible);
  const { registerPlacement } = usePlacement();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/');
        return;
      }

      if (__DEV__) {
        setReady(true);
        return;
      }

      const timer = setTimeout(() => {
        setReady(true);
        registerPlacement({ placement: 'paywall_onboarding' });
      }, 8000);

      try {
        const info = await getCustomerInfo();
        clearTimeout(timer);
        if (!isSubscribed(info)) {
          setReady(true);
          registerPlacement({ placement: 'paywall_onboarding' });
          return;
        }
      } catch {
        clearTimeout(timer);
        setReady(true);
        registerPlacement({ placement: 'paywall_onboarding' });
        return;
      }
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
        <Tabs.Screen name="analise" options={{ href: null }} />
        <Tabs.Screen name="evolucao" options={{ href: null }} />
        <Tabs.Screen name="perfil" />
        <Tabs.Screen name="set-name" options={{ href: null }} />
        <Tabs.Screen name="skin-result" options={{ href: null }} />
      </Tabs>
      {tabBarVisible && <CustomTabBar />}
    </View>
  );
}

const styles = StyleSheet.create({
  barContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'transparent',
  },
  // Wrapper carrega a sombra (sem overflow:hidden para não clipar)
  pillShadow: {
    flex: 1,
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
  // Inner carrega o visual (borderRadius, border, bg, conteúdo)
  pillInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  pillInnerLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#F0F0F0',
  },
  pillInnerDark: {
    backgroundColor: 'rgba(26,31,46,0.85)',
    borderColor: 'rgba(255,255,255,0.08)',
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
});
