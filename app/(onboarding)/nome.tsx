import { useRouter } from 'expo-router';
import NameCapture from '../../components/onboarding/NameCapture';

// Wrapper fino da etapa de nome no onboarding. Todo o visual e a lógica de save
// vivem em `components/onboarding/NameCapture.tsx` (fonte única, compartilhada com
// o guard de nome do `app/(app)/_layout.tsx`). Aqui só definimos o que acontece
// após o save: seguir o fluxo do onboarding.
export default function Nome() {
  const router = useRouter();
  return <NameCapture onSaved={() => router.replace('/(onboarding)/notifications')} />;
}
