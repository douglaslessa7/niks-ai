import { Tabs, useRouter } from 'expo-router';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { useState } from 'react';
import { Home, Droplet, TrendingUp, User, Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScanModal } from '../../components/scan/ScanModal';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const TAB_ACTIVE = '#1D3A44';
const TAB_INACTIVE = '#8A8A8E';
const TAB_BAR_BG = '#EDEDEE';
const FAB_COLOR = '#FB7B6B';

const tabs = [
  { name: 'home', label: 'Home', Icon: Home },
  { name: 'protocolo', label: 'Protocolo', Icon: Droplet },
  { name: 'evolucao', label: 'Evolução', Icon: TrendingUp },
  { name: 'perfil', label: 'Perfil', Icon: User },
];

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [scanOpen, setScanOpen] = useState(false);

  // Only show tabs that match our 4 visible tabs
  const visibleTabs = tabs;

  return (
    <>
      <View style={[styles.barContainer, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
        {/* Pill com 4 tabs */}
        <View style={styles.pill}>
          {visibleTabs.map((tab) => {
            const routeIndex = state.routes.findIndex((r) => r.name === tab.name);
            const isActive = state.index === routeIndex;
            const { Icon } = tab;

            return (
              <TouchableOpacity
                key={tab.name}
                onPress={() => navigation.navigate(tab.name)}
                activeOpacity={0.8}
                style={styles.tabItem}
              >
                <Icon
                  size={22}
                  color={isActive ? TAB_ACTIVE : TAB_INACTIVE}
                  strokeWidth={isActive ? 2.2 : 1.8}
                  fill={isActive ? TAB_ACTIVE : 'none'}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isActive ? TAB_ACTIVE : TAB_INACTIVE, fontWeight: isActive ? '600' : '500' },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* FAB */}
        <TouchableOpacity
          onPress={() => setScanOpen(true)}
          activeOpacity={0.85}
          style={styles.fab}
        >
          <Plus size={32} color="white" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <ScanModal isOpen={scanOpen} onClose={() => setScanOpen(false)} />
    </>
  );
}

export default function AppLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="protocolo" />
      <Tabs.Screen name="analise" options={{ href: null }} />
      <Tabs.Screen name="evolucao" />
      <Tabs.Screen name="perfil" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    backgroundColor: 'transparent',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: TAB_BAR_BG,
    borderRadius: 999,
    paddingVertical: 6,
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
    minWidth: 52,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 3,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: FAB_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: FAB_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
});
