import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';

// `chave`: o SOS espinha guarda a foto, por isso tem um aceite próprio.
export function useAIConsent(chave = 'ai_consent_accepted') {
  const [consentModalVisible, setConsentModalVisible] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(chave).then((value) => {
      setConsentChecked(true);
      if (value === 'true') setConsentModalVisible(false);
    });
  }, []);

  // Chame esta função no lugar de navegar direto para o scan
  const requestConsent = (onGranted: () => void) => {
    AsyncStorage.getItem(chave).then((value) => {
      if (value === 'true') {
        onGranted();
      } else {
        setPendingAction(() => onGranted);
        setConsentModalVisible(true);
      }
    });
  };

  const handleAccept = async () => {
    await AsyncStorage.setItem(chave, 'true');
    setConsentModalVisible(false);
    pendingAction?.();
    setPendingAction(null);
  };

  const handleDecline = () => {
    setConsentModalVisible(false);
    setPendingAction(null);
  };

  return { consentModalVisible, consentChecked, requestConsent, handleAccept, handleDecline };
}
