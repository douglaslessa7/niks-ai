import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { aoGuardarConvite, pegarConvite } from '../../lib/convitePendente';
import { entrarNoGrupo, invalidarGrupos, validarConvite } from '../../lib/gruposServidor';
import { trackFora } from '../../lib/mixpanel/MixpanelProvider';
import { t } from '../../lib/i18n';

// Convite pelo link (Parte A: quem já tem o app e já assina). Confere o token no
// servidor, pergunta se ela quer entrar e abre o grupo. Sem tela no design para este
// passo (o 80l é o da convidada, Parte B): é um alerta do sistema.
export default function ConvitePendente() {
  const router = useRouter();
  const ocupado = useRef(false);

  useEffect(() => {
    const tratar = async () => {
      if (ocupado.current) return;
      ocupado.current = true;
      try {
        const token = await pegarConvite();
        if (!token) return;
        const info = await validarConvite(token).catch(() => null);
        if (!info?.valido) {
          Alert.alert(t('Convite inválido'), t('Esse link não vale mais. Peça um convite novo para quem te chamou.'));
          return;
        }
        const nome = info.nome ?? t('o grupo');
        Alert.alert(t('Entrar em “{{nome}}”?', { nome }), info.convidou ? t('Convite de {{nome}}.', { nome: info.convidou }) : undefined, [
          { text: t('Agora não'), style: 'cancel' },
          {
            text: t('Entrar', { context: 'grupo' }),
            onPress: async () => {
              const r = await entrarNoGrupo(token).catch(() => null);
              if (!r) { Alert.alert(t('Não deu para entrar agora'), t('Confira a internet e abra o link de novo.')); return; }
              if (!r.ok) {
                Alert.alert(
                  r.motivo === 'removida' ? t('Você foi removida desse grupo') : t('Não deu para entrar nesse grupo'),
                  r.motivo === 'removida' ? undefined : t('Peça um convite novo para quem te chamou.'),
                );
                return;
              }
              if (!r.ja_era) trackFora('convite_aceito', { tipo: 'assinante' });
              await invalidarGrupos(r.grupo_id);
              router.push(`/grupo?id=${r.grupo_id}` as any);
            },
          },
        ]);
      } finally {
        ocupado.current = false;
      }
    };
    void tratar();
    return aoGuardarConvite(() => { void tratar(); });
  }, [router]);

  return null;
}
