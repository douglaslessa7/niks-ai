import { Tabs, usePathname, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Home, Droplet, User } from 'lucide-react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { usePlacement } from 'expo-superwall';
import { supabase } from '../../lib/supabase';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';
import { useAppStore } from '../../store/onboarding';

function HomeFilled({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill={color} />
    </Svg>
  );
}
function DropletFilled({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" fill={color} />
    </Svg>
  );
}
function UserFilled({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={7} r={4} fill={color} />
      <Path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2H4z" fill={color} />
    </Svg>
  );
}

// Light mode — design: PROTO.coral / PROTO.gray6
const ACTIVE_LIGHT = '#FB7B6B';
const INACTIVE_LIGHT = '#8A8A8E';
// Dark mode — design: PROTO.coralSoft / rgba(255,255,255,0.45)
const ACTIVE_DARK = '#F9A898';
const INACTIVE_DARK = 'rgba(255,255,255,0.45)';

const tabs = [
  { name: 'home',      label: 'início', Icon: Home,    IconFilled: HomeFilled    },
  { name: 'protocolo', label: 'rotina',  Icon: Droplet, IconFilled: DropletFilled },
  { name: 'perfil',    label: 'perfil',  Icon: User,    IconFilled: UserFilled    },
];

function CustomTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const tabBarTheme = useAppStore((s) => s.tabBarTheme);
  const isDark = tabBarTheme === 'dark';
  const activeColor = isDark ? ACTIVE_DARK : ACTIVE_LIGHT;
  const inactiveColor = isDark ? INACTIVE_DARK : INACTIVE_LIGHT;

  const tabItems = tabs.map((tab) => {
    const isActive = pathname === `/${tab.name}` || pathname.includes(tab.name);
    const { Icon, IconFilled } = tab;
    return (
      <TouchableOpacity
        key={tab.name}
        onPress={() => router.push(`/${tab.name}` as any)}
        activeOpacity={0.8}
        style={styles.tabItem}
      >
        {isActive
          ? <IconFilled size={24} color={activeColor} />
          : <Icon size={24} color={inactiveColor} strokeWidth={1.5} />
        }
        <Text style={[styles.tabLabel, { color: isActive ? activeColor : inactiveColor, fontWeight: isActive ? '600' : '400' }]}>
          {tab.label}
        </Text>
      </TouchableOpacity>
    );
  });

  return (
    <View style={[styles.barContainer, isDark ? styles.pillShadowDark : styles.pillShadowLight, { position: 'absolute', bottom: 20, left: 16, right: 16, borderRadius: 20 }]}>
      {isDark ? (
        <BlurView intensity={50} tint="dark" style={{ borderRadius: 20, overflow: 'hidden', flex: 1 }}>
          <View style={[styles.pillInner, styles.pillInnerDark]}>
            {tabItems}
          </View>
        </BlurView>
      ) : (
        <View style={[styles.pillInner, styles.pillInnerLight]}>
          {tabItems}
        </View>
      )}
    </View>
  );
}

export default function AppLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const tabBarVisible = useAppStore((s) => s.tabBarVisible);
  const { registerPlacement } = usePlacement();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/');
        return;
      }

      // Verifica se o usuário já tem nome definido — válido para todos (novos e existentes)
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
        // Em caso de erro não bloqueamos o usuário
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
      {/* Home screen tem seu próprio menu inferior (HomeBottomBar em home.tsx), igual ao design de referência */}
      {tabBarVisible && pathname !== '/home' && <CustomTabBar />}
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
