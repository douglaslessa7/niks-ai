import { Tabs, usePathname, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Scan, Droplet, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlacement } from 'expo-superwall';
import { supabase } from '../../lib/supabase';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';

const TAB_ACTIVE = '#FB7B6B';
const TAB_INACTIVE = '#8A8A8E';

const tabs = [
  { name: 'home', label: 'scanear', Icon: Scan },
  { name: 'protocolo', label: 'protocolo', Icon: Droplet },
  { name: 'perfil', label: 'perfil', Icon: User },
];

function CustomTabBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View
      style={[
        styles.barContainer,
        {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        },
      ]}
    >
      <View style={styles.pill}>
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
                size={28}
                color={isActive ? TAB_ACTIVE : TAB_INACTIVE}
                strokeWidth={1.5}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? TAB_ACTIVE : TAB_INACTIVE, fontWeight: isActive ? '600' : '400' },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function AppLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
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
      <CustomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  barContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    paddingVertical: 10,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tabItem: {
    alignItems: 'center',
    paddingVertical: 4,
    gap: 4,
    minWidth: 52,
  },
  tabLabel: {
    fontSize: 13,
    marginTop: 2,
  },
});
