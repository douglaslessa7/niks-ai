import { useRouter } from 'expo-router';
import NameCapture from '../../components/onboarding/NameCapture';
import { useAppStore } from '../../store/onboarding';

// Etapa INICIAL do onboarding ("Como você quer ser chamada?"), logo após a tela de
// boas-vindas (`app/index.tsx`) e ANTES do signup/paywall — ainda não há sessão.
// Por isso roda em mode="store": o nome é só guardado no store (`pendingName`); a
// gravação em `users.nome` acontece no cadastro (`saveToSupabase`). O visual e a
// lógica vivem em `components/onboarding/NameCapture.tsx` (fonte única, compartilhada
// com o guard de nome do `app/(app)/_layout.tsx`).
export default function Nome() {
  const router = useRouter();
  const setPendingName = useAppStore((s) => s.setPendingName);
  return (
    <NameCapture
      mode="store"
      onSaved={(name) => {
        setPendingName(name ?? '');
        router.replace('/(onboarding)/birthday');
      }}
    />
  );
}
