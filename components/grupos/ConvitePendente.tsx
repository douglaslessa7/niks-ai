import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { aoGuardarConvite, pegarConvite } from '../../lib/convitePendente';
import { entrarNoGrupo, invalidarGrupos, validarConvite } from '../../lib/gruposServidor';
import { trackFora } from '../../lib/mixpanel/MixpanelProvider';

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
          Alert.alert('Convite inválido', 'Esse link não vale mais. Peça um convite novo para quem te chamou.');
          return;
        }
        const nome = info.nome ?? 'o grupo';
        Alert.alert(`Entrar em “${nome}”?`, info.convidou ? `Convite de ${info.convidou}.` : undefined, [
          { text: 'Agora não', style: 'cancel' },
          {
            text: 'Entrar',
            onPress: async () => {
              const r = await entrarNoGrupo(token).catch(() => null);
              if (!r) { Alert.alert('Não deu para entrar agora', 'Confira a internet e abra o link de novo.'); return; }
              if (!r.ok) {
                Alert.alert(
                  r.motivo === 'removida' ? 'Você foi removida desse grupo' : 'Não deu para entrar nesse grupo',
                  r.motivo === 'removida' ? undefined : 'Peça um convite novo para quem te chamou.',
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
