import { Tabs, usePathname, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { Droplet, Scan, ScanLine, TrendingUp, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlacement } from 'expo-superwall';
import { supabase } from '../../lib/supabase';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';
import { ScanModal } from '../../components/scan/ScanModal';
import { Colors } from '../../constants/colors';

const LEFT_TABS = [
  { name: 'home',      label: 'scanear',   Icon: Scan },
  { name: 'protocolo', label: 'protocolo', Icon: Droplet  },
];

const RIGHT_TABS = [
  { name: 'evolucao', label: 'evolução', Icon: TrendingUp },
  { name: 'perfil',   label: 'perfil',   Icon: User       },
];

function CustomTabBar({ onCameraPress }: { onCameraPress: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  const renderTab = (tab: { name: string; label: string; Icon: typeof ScanFace }) => {
    const isActive = pathname === `/${tab.name}` || pathname.includes(tab.name);
    const { Icon } = tab;
    return (
      <TouchableOpacity
        key={tab.name}
        onPress={() => router.push(`/${tab.name}` as any)}
        activeOpacity={0.7}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 10, gap: 3 }}
      >
        <Icon size={24} color={isActive ? Colors.scanBtn : Colors.tabInactive} strokeWidth={1.5} />
        <Text style={{ fontSize: 10, color: isActive ? Colors.scanBtn : Colors.tabInactive, fontWeight: isActive ? '600' : '400' }}>
          {tab.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: Colors.white,
        borderTopWidth: 0.5,
        borderTopColor: 'rgba(0,0,0,0.08)',
        paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        flexDirection: 'row',
        alignItems: 'flex-start',
      }}
    >
      {/* Left tabs */}
      {LEFT_TABS.map(renderTab)}

      {/* Central camera button */}
      <View style={{ width: 64, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4 }}>
        <TouchableOpacity
          onPress={onCameraPress}
          activeOpacity={0.85}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: Colors.scanBtn,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: -20,
            shadowColor: Colors.scanBtnShadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 1,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <ScanLine size={24} color={Colors.white} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Right tabs */}
      {RIGHT_TABS.map(renderTab)}
    </View>
  );
}

export default function AppLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
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
        <Tabs.Screen name="evolucao" />
        <Tabs.Screen name="perfil" />
        <Tabs.Screen name="set-name" options={{ href: null }} />
        <Tabs.Screen name="skin-result" options={{ href: null }} />
      </Tabs>
      <CustomTabBar onCameraPress={() => setScanOpen(true)} />
      <ScanModal isOpen={scanOpen} onClose={() => setScanOpen(false)} />
    </View>
  );
}
