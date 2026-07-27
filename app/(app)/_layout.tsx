import { Tabs, usePathname, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { View, TouchableOpacity, Image, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { haptics } from '../../lib/haptics';
import { getCustomerInfo, isSubscribed, loginRevenueCat } from '../../lib/revenuecat';
import { useAppStore } from '../../store/onboarding';
import NameCapture from '../../components/onboarding/NameCapture';

// ── Bottom navbar — réplica do design "Fixed bottom bar" (navbar-design/Navbar.dc.html) ──
// Ícones line/stroke SVG idênticos ao design. Cores/estados do design:
//   inativo #8a8a93 · ativo #e0736f (traço 2) + ponto #ff9d9d sob a aba ativa ·
//   badge de notificação vermelho #e8452f no ícone de mensagens · barra branca,
//   borda superior hairline #f2e6e6, sombra suave para cima, flush full-width.
const NAV_ACTIVE = '#ff9d9d';
const NAV_INACTIVE = '#8a8a93';
const NAV_DOT = '#ff9d9d';        // ponto sob a aba ativa
const NAV_BORDER = '#f2e6e6';     // borda superior hairline
const NAV_BADGE = '#ff9d9d';      // badge de notificação (mensagens) — rosa da Rotina
// Modo noturno da tab bar (sincronizado com o tema da tela — ex.: protocolo à noite)
const NAV_ACTIVE_DARK = '#FF9D9D';
const NAV_INACTIVE_DARK = '#8B93A8';
const NAV_BG_DARK = '#1A1F2E';
// A logo central da navbar é SEMPRE a logo rosa padrão da marca (#FF9D9D) — fixa,
// independente do Niks score e igual em ambos os modos (claro e noturno).

// Ícones SVG line, copiados 1:1 do design (viewBox 24, cantos/juntas arredondados).
// Tamanho aumentado p/ 29 (design usava 23) — ficava pequeno demais na barra real.
const GLYPH_SIZE = 29;
function NavGlyph({ name, color, active }: { name: string; color: string; active: boolean }) {
  // Ícone "beauty" (tela protocolo) — preenchido (fill), viewBox 34. Segue a cor da
  // navbar: rosa padrão (#ff9d9d) quando ativo, cinza quando inativo.
  if (name === 'beauty') {
    return (
      <Svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 34 34">
        <Path d="M17.5152 4.15432C18.3865 4.15432 19.093 4.37213 19.6668 4.7015C20.7718 5.00432 22.0787 5.47713 23.3537 6.19432C22.3974 3.809 20.0759 2.11963 17.3505 2.11963H16.6599C13.9399 2.11963 11.6184 3.80369 10.6621 6.17838C13.7062 4.46244 16.9574 4.17557 17.1434 4.15963C17.2815 4.149 17.4037 4.149 17.5205 4.149L17.5152 4.15432Z" fill={color} />
        <Path d="M6.05673 19.0082C6.31704 18.7107 6.69423 18.5354 7.10329 18.5354C7.62923 18.5354 8.11267 18.8275 8.36236 19.295C8.58548 19.7041 8.86173 20.06 9.15392 20.3629L9.26548 18.7319C9.26548 18.7319 8.89892 13.276 18.557 11.2413C18.7961 11.1882 19.0245 11.1032 19.2317 10.9704C19.848 10.5825 20.8892 9.61036 20.5917 7.57036C20.5917 7.57036 20.0286 5.04161 17.2183 5.22755C17.2183 5.22755 11.3745 5.69505 8.28267 9.48817C8.28267 9.48817 4.91454 13.0422 5.84954 17.9988C5.84954 17.9988 5.90798 18.4025 6.05673 19.0082Z" fill={color} />
        <Path d="M28.1506 17.9986C29.0856 13.0421 25.7175 9.48801 25.7175 9.48801C24.485 7.97395 22.8169 7.00176 21.2497 6.36426C21.4409 6.7202 21.5631 7.0602 21.6269 7.33645L21.6375 7.41082C22.0413 10.1361 20.4847 11.4377 19.7994 11.868C19.5178 12.0433 19.2044 12.1708 18.8697 12.2505C25.0003 14.673 24.7347 18.7318 24.7347 18.7318L24.9525 21.9352L24.5541 23.3324C23.5394 26.7058 20.3625 29.0221 16.8509 28.953C13.9025 28.8999 11.2781 27.1468 9.97656 24.4852C9.67375 24.7189 9.40813 24.9793 9.17969 25.2396C9.92875 26.6474 11.0072 27.8108 12.2928 28.6343V31.1046C12.2928 31.5296 12.6381 31.8749 13.0631 31.8749H20.6919C21.1116 31.8749 21.4569 31.5296 21.4569 31.1046V28.8096C23.3481 27.7152 24.825 25.9514 25.5209 23.7786C25.5422 23.768 25.5688 23.7627 25.59 23.7414C27.5822 21.7705 28.1506 17.9986 28.1506 17.9986Z" fill={color} />
        <Path d="M16.1656 19.2472C16.341 19.0135 16.2985 18.6788 16.0647 18.5035C15.831 18.3281 15.4963 18.3706 15.321 18.6044C15.0235 18.9975 14.5772 19.2206 14.0885 19.2206C13.5997 19.2206 13.1535 18.9975 12.856 18.6044C12.6806 18.3706 12.346 18.3228 12.1122 18.5035C11.8785 18.6788 11.8306 19.0135 12.0113 19.2472C12.5106 19.906 13.2703 20.2831 14.0885 20.2831C14.9066 20.2831 15.6716 19.906 16.1656 19.2472Z" fill={color} />
        <Path d="M22.5406 19.2472C22.716 19.0135 22.6735 18.6788 22.4397 18.5035C22.206 18.3281 21.8713 18.3706 21.696 18.6044C21.3985 18.9975 20.9522 19.2206 20.4635 19.2206C19.9747 19.2206 19.5285 18.9975 19.231 18.6044C19.0556 18.3706 18.721 18.3228 18.4872 18.5035C18.2535 18.6788 18.2056 19.0135 18.3863 19.2472C18.8856 19.906 19.6453 20.2831 20.4635 20.2831C21.2816 20.2831 22.0466 19.906 22.5406 19.2472Z" fill={color} />
        <Path d="M17.2705 25.5424C18.009 25.5424 18.6943 25.3033 19.1565 24.8836C19.3743 24.6871 19.3902 24.3524 19.1936 24.1346C18.9971 23.9168 18.6624 23.9008 18.4446 24.0974C18.179 24.3418 17.738 24.4852 17.2705 24.4852C16.803 24.4852 16.3621 24.3418 16.0965 24.0974C15.8786 23.9008 15.544 23.9168 15.3474 24.1346C15.1508 24.3524 15.1668 24.6871 15.3846 24.8836C15.8468 25.3033 16.5374 25.5424 17.2705 25.5424Z" fill={color} />
        <Path d="M10.1683 22.4772C9.41395 22.0469 8.17083 21.1809 7.42708 19.7944C7.28895 19.5394 6.93302 19.5234 6.79489 19.7784C6.39645 20.4956 5.57302 21.6325 4.04833 22.4825C3.80395 22.6206 3.79333 22.9713 4.04302 23.1041C4.78145 23.5078 6.00333 24.3578 6.81083 25.8613C6.94364 26.1109 7.29958 26.1269 7.4377 25.8772C7.86802 25.1175 8.74458 23.8584 10.1577 23.0988C10.4074 22.9659 10.4233 22.61 10.179 22.4719L10.1683 22.4772Z" fill={color} />
        <Path d="M29.9842 27.8269C29.4476 27.5029 28.6826 26.9344 28.1726 26.0632C28.0292 25.8188 27.6839 25.8082 27.5404 26.0526C27.2376 26.5573 26.6798 27.2638 25.7289 27.8323C25.4898 27.9757 25.4845 28.3104 25.7235 28.4538C26.2495 28.7619 27.0092 29.3357 27.5563 30.276C27.6945 30.5151 28.0345 30.531 28.1779 30.2919C28.502 29.7554 29.0864 28.9744 29.9682 28.4485C30.2073 28.3051 30.2232 27.9704 29.9842 27.8269Z" fill={color} />
      </Svg>
    );
  }
  // traço proporcional ao tamanho maior (design: 1.8 / 2 em 23px → ~1.55 / 1.7 em 24 viewBox)
  const sw = active ? 1.7 : 1.55;
  const common = {
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox="0 0 24 24">
      {name === 'rotina' && (
        <>
          <Path d="M10 2h4M11 2v2.5M13 2v2.5M9.5 8.5h5" {...common} />
          <Rect x={7.5} y={8.5} width={9} height={13.5} rx={2.5} {...common} />
          <Path d="M12 5.5V8.5M8 15.5h4" {...common} />
        </>
      )}
      {name === 'busca' && (
        <>
          <Circle cx={11} cy={11} r={7} {...common} />
          <Path d="M20 20l-3.2-3.2" {...common} />
        </>
      )}
      {name === 'niks' && (
        <Path d="M21 12a8 8 0 0 1-11.4 7.2L4 20l1-4.6A8 8 0 1 1 21 12z" {...common} />
      )}
      {name === 'perfil' && (
        <>
          <Circle cx={12} cy={8} r={4} {...common} />
          <Path d="M4.5 20a7.5 7.5 0 0 1 15 0" {...common} />
        </>
      )}
    </Svg>
  );
}

// Ordem esquerda→direita do design. Center = logo NIKS (mantida como no app atual).
// Mapeamento de rotas preservado do app.
const NAV_ITEMS = [
  { key: 'beauty', route: '/protocolo' },          // ícone "beauty" (rosto/skincare)
  { key: 'rotina', route: '/recomendacao-produtos' }, // ícone de produto (frasco)
  { key: 'home',   route: '/home' },              // center — logo (intocada)
  { key: 'niks',   route: '/niks-chat', badge: true },
  { key: 'perfil', route: '/perfil' },
] as const;

function GlobalBottomBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  // Tema da tab bar — escurece junto com telas em modo noturno (protocolo)
  const isDark = useAppStore((s) => s.tabBarTheme) === 'dark';

  const isActive = (route: string) => pathname === route || pathname.startsWith(`${route}/`);

  const activeColor = isDark ? NAV_ACTIVE_DARK : NAV_ACTIVE;
  const inactiveColor = isDark ? NAV_INACTIVE_DARK : NAV_INACTIVE;

  return (
    // Barra flush na borda inferior, full-width. padding do design: 14 topo / 20 lados.
    // padding inferior = safe area (home indicator) com mínimo de 26 do design.
    <View style={[
      styles.navbar,
      {
        paddingTop: 14,
        paddingBottom: Math.max(insets.bottom, 26),
        backgroundColor: isDark ? NAV_BG_DARK : '#FFFFFF',
        borderTopColor: isDark ? 'rgba(255,255,255,0.07)' : NAV_BORDER,
      },
    ]}>
      {NAV_ITEMS.map((it) => {
        const active = isActive(it.route);

        // Item central — a logo NIKS pura (fundo transparente, sem moldura). SEMPRE na
        // cor rosa padrão da marca (#FF9D9D — a mesma logo tintada de protocolo/chat),
        // independente do Niks score e em ambos os modos (claro e noturno).
        if (it.key === 'home') {
          return (
            <TouchableOpacity
              key={it.key}
              activeOpacity={0.7}
              onPress={() => { haptics.tap(); router.push(it.route as any); }}
              style={styles.item}
            >
              <Image
                source={require('../../assets/home/niks-logo.png')}
                style={[styles.centerLogo, { tintColor: '#FF9D9D' }]}
              />
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity
            key={it.key}
            activeOpacity={0.7}
            onPress={() => { haptics.tap(); router.push(it.route as any); }}
            style={styles.item}
          >
            <View>
              <NavGlyph
                name={it.key}
                color={active ? activeColor : inactiveColor}
                active={active}
              />
              {('badge' in it && it.badge) && (
                <View style={[styles.badge, isDark && { borderColor: NAV_BG_DARK }]} />
              )}
            </View>
            {/* slot de altura fixa: ponto sob a aba ativa (mantém ícones alinhados) */}
            <View style={styles.dotSlot}>
              {active && <View style={[styles.dot, isDark && { backgroundColor: NAV_ACTIVE_DARK }]} />}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AppLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [needsName, setNeedsName] = useState(false);
  const tabBarVisible = useAppStore((s) => s.tabBarVisible);
  const subscriptionVerified = useAppStore((s) => s.subscriptionVerified);
  const setSubscriptionVerified = useAppStore((s) => s.setSubscriptionVerified);
  const tabBarTheme = useAppStore((s) => s.tabBarTheme);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/');
        return;
      }

      // Guard de nome — APENAS marca o estado; NUNCA navega. Um router.replace
      // para o grupo (onboarding) aqui criava um loop: o (onboarding)/_layout via
      // sessão + assinante e mandava de volta para /home, e assim sem parar (a
      // tela "entrava e saía" e a usuária não conseguia digitar). Agora o guard só
      // decide se a captura de nome deve ser RENDERIZADA no lugar do app (ver render
      // abaixo). O efeito NÃO pode parar aqui: precisa seguir até verificar a
      // assinatura e setar `ready`, senão `if (!ready) return null` deixaria a tela
      // branca para sempre. `needsName` é um estado paralelo ao `ready`.
      // Espaço em branco conta como vazio (mesma regra da validação do input).
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('nome')
          .eq('id', session.user.id)
          .single();
        setNeedsName(!(userData?.nome ?? '').trim());
      } catch {
        // Em caso de erro não bloqueamos o nome check
      }

      // Pula o check de assinatura se já foi verificado nesta sessão (evita tela branca no remount)
      if (__DEV__ || subscriptionVerified) {
        setReady(true);
        return;
      }

      // Garante que o RC está logado com o usuário correto antes de verificar a assinatura
      // (corrige race condition: _layout.tsx faz loginRevenueCat de forma assíncrona)
      try {
        await loginRevenueCat(session.user.id);
      } catch {
        // ignora — prossegue para o check de assinatura
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

  // Nome vazio → renderiza a captura no lugar do app (mesma fonte da etapa do
  // onboarding). Só chega aqui com `ready` true, ou seja, assinatura já verificada
  // (o guard de assinatura continua fail closed e intocado). Ao salvar, `onSaved`
  // apenas libera a renderização — sem navegação, sem remontar layout, sem loop.
  if (needsName) return <NameCapture onSaved={() => setNeedsName(false)} />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="home" />
        <Tabs.Screen name="recomendacao-produtos" />
        <Tabs.Screen name="protocolo" />
        <Tabs.Screen name="niks-chat" />
        <Tabs.Screen name="perfil" />
        <Tabs.Screen name="set-name" options={{ href: null }} />
        <Tabs.Screen name="skin-result" options={{ href: null }} />
      </Tabs>
      {tabBarVisible && <GlobalBottomBar />}
    </View>
  );
}

const styles = StyleSheet.create({
  // Flush na borda inferior, full-width. Borda superior hairline + sombra suave p/ cima.
  navbar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 12,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  centerLogo: {
    width: 49,
    height: 49,
    resizeMode: 'contain',
    marginTop: -6,
  },
  // Slot de altura fixa p/ o ponto da aba ativa — mantém todos os ícones na mesma linha.
  dotSlot: {
    height: 9,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: NAV_DOT,
  },
  // Badge de notificação no ícone de mensagens (canto superior direito).
  badge: {
    position: 'absolute',
    top: -1,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: NAV_BADGE,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
