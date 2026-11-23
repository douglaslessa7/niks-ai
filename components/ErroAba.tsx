// ─────────────────────────────────────────────────────────────────────────────
// ErrorBoundary de cada ABA (1.64). Desde a 1.63 as abas são pré-carregadas por trás
// (`(abas)/_layout.tsx`); com só o boundary da raiz, um erro numa aba que ela nem abriu
// trocava o app inteiro por "Algo deu errado" (caso real: assinante presa, nov/2026).
// Agora o erro fica preso na aba: as outras seguem funcionando, a navbar continua lá e
// o erro é registrado em `erros_app` (lib/erroApp).
//
// Uso, no arquivo da aba: `export const ErrorBoundary = erroDaAba('protocolo');`
//
// Aba pré-carregada que falhou por trás: quando ela é ABERTA de verdade, tenta de novo
// sozinha uma vez (o foco traz dado fresco do servidor; o que quebrou pode ter sido o
// cache). Se falhar de novo, fica a mensagem com "Tentar de novo".
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { registrarErroApp } from '../lib/erroApp';
import { trackFora } from '../lib/mixpanel/MixpanelProvider';
import { haptics } from '../lib/haptics';
import { t } from '../lib/i18n';

type Props = { error: Error; retry: () => Promise<void> };

export function erroDaAba(tela: string) {
  function ErroDaAba({ error, retry }: Props) {
    const focada = useIsFocused();
    const tentouSozinha = useRef(false);

    useEffect(() => {
      console.error(`[ErrorBoundary:${tela}] erro de tela:`, error);
      try {
        // O mesmo evento do boundary da raiz, agora com a tela.
        trackFora('erro_tela', { tela, nome: error?.name ?? 'Error', mensagem: String(error?.message ?? '').slice(0, 200) });
      } catch {}
      registrarErroApp(tela, error);
    }, [error]);

    useEffect(() => {
      if (!focada || tentouSozinha.current) return;
      tentouSozinha.current = true;
      void retry();
    }, [focada, retry]);

    return (
      <View style={estilos.tela}>
        <Text style={estilos.titulo} accessibilityRole="header">{t('Não deu para abrir esta tela')}</Text>
        <Text style={estilos.texto}>{t('As outras partes do app continuam funcionando.')}</Text>
        <Pressable
          onPress={() => { haptics.tap(); void retry(); }}
          style={estilos.botao}
          accessibilityRole="button"
          accessibilityLabel={t('Tentar de novo')}
        >
          <Text style={estilos.botaoTexto}>{t('Tentar de novo')}</Text>
        </Pressable>
      </View>
    );
  }
  ErroDaAba.displayName = `ErroDaAba(${tela})`;
  return ErroDaAba;
}

// Mesmo visual do boundary da raiz (`app/_layout.tsx`); o respiro de baixo deixa a navbar livre.
const estilos = StyleSheet.create({
  tela: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, paddingBottom: 120, backgroundColor: '#F9F2F5' },
  titulo: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: '#121212', textAlign: 'center' },
  texto: { fontSize: 15, color: '#818181', textAlign: 'center' },
  botao: { height: 52, paddingHorizontal: 32, borderRadius: 100, backgroundColor: '#FF5EA8', justifyContent: 'center', marginTop: 8 },
  botaoTexto: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: '#FFFFFF' },
});
