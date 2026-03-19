import { Modal, View, Text, TouchableOpacity, Animated, Pressable } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Camera, Utensils, ChevronRight, Star, Clock, Lock } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { AIConsentModal } from '../ui/AIConsentModal';
import { useAIConsent } from '../../hooks/useAIConsent';

interface ScanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 10,
  elevation: 3,
};

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias em ms

/**
 * Dado o timestamp do último scan, retorna a mensagem de cooldown
 * ou null se o scan já estiver disponível.
 */
function calcularCooldown(lastScanAt: string | null): string | null {
  if (!lastScanAt) return null;

  const agora = Date.now();
  const ultimoScan = new Date(lastScanAt).getTime();
  const restanteMs = ultimoScan + COOLDOWN_MS - agora;

  if (restanteMs <= 0) return null; // Disponível

  const totalHoras = Math.ceil(restanteMs / (1000 * 60 * 60));
  const totalDias = Math.ceil(restanteMs / (1000 * 60 * 60 * 24));

  if (totalHoras <= 48) {
    return `próxima análise em ${totalHoras}h`;
  }

  return `próxima análise em ${totalDias} dias`;
}

export function ScanModal({ isOpen, onClose }: ScanModalProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(400)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const [cooldownMsg, setCooldownMsg] = useState<string | null>(null);
  const { consentModalVisible, requestConsent, handleAccept, handleDecline } = useAIConsent();

  // ── Busca o último scan quando o modal abre ──────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    let ativo = true;

    async function verificarCooldown() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !ativo) return;

        const { data, error } = await supabase
          .from('skin_scans')
          .select('created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!ativo) return;

        if (error || !data) {
          setCooldownMsg(null); // Nunca fez scan → disponível
        } else {
          setCooldownMsg(calcularCooldown(data.created_at));
        }
      } catch {
        if (ativo) setCooldownMsg(null);
      }
    }

    verificarCooldown();

    // Atualiza a cada minuto enquanto o modal estiver aberto
    const intervalo = setInterval(verificarCooldown, 60 * 1000);

    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, [isOpen]);

  // ── Animação ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, friction: 10, tension: 80, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 400, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [isOpen]);

  const handleScanFood = () => {
    requestConsent(() => {
      onClose();
      router.push('/(scan)/food-scan-intro' as any);
    });
  };

  const handleScanFace = () => {
    if (cooldownMsg) return; // Bloqueado — não navega
    requestConsent(() => {
      onClose();
      router.push('/(scan)/scan-prep' as any);
    });
  };

  const faceDisponivel = !cooldownMsg;

  return (
    <>
    <Modal transparent visible={isOpen} animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View style={{ flex: 1, opacity }}>
        <Pressable
          onPress={onClose}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
        />
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#F6F4EE',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom > 0 ? insets.bottom + 12 : 24,
          transform: [{ translateY }],
        }}
      >
        {/* Handle */}
        <View
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: '#D1D5DB',
            alignSelf: 'center',
            marginBottom: 24,
          }}
        />

        {/* Título */}
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: '#1D3A44',
            textAlign: 'center',
            marginBottom: 6,
          }}
        >
          Escolha o tipo de scan
        </Text>

        {/* Subtítulo */}
        <Text
          style={{
            fontSize: 14,
            color: '#9CA3AF',
            textAlign: 'center',
            marginBottom: 20,
          }}
        >
          Selecione o que você deseja analisar
        </Text>

        {/* Opção 1: Scanear Alimento */}
        <TouchableOpacity
          onPress={handleScanFood}
          activeOpacity={0.85}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            marginBottom: 10,
            ...SHADOW,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: '#FFF0EE',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Utensils size={22} color="#FB7B6B" strokeWidth={2} />
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#1D3A44' }}>Scanear Alimento</Text>
              {/* Badge MAIS USADO */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  backgroundColor: '#7CB69D',
                  borderRadius: 100,
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                }}
              >
                <Star size={9} color="#FFFFFF" fill="#FFFFFF" />
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 }}>
                  MAIS USADO
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 18 }}>
              Analise o impacto da comida na sua pele
            </Text>
          </View>

          <ChevronRight size={20} color="#D1D5DB" strokeWidth={2} />
        </TouchableOpacity>

        {/* Opção 2: Scanear Rosto */}
        <TouchableOpacity
          onPress={handleScanFace}
          activeOpacity={faceDisponivel ? 0.85 : 1}
          style={{
            backgroundColor: faceDisponivel ? '#FFFFFF' : '#F5F5F7',
            borderRadius: 16,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            marginBottom: 10,
            opacity: faceDisponivel ? 1 : 0.7,
            ...SHADOW,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: faceDisponivel ? '#FFF0EE' : '#EDEDEE',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Camera size={22} color={faceDisponivel ? '#FB7B6B' : '#9CA3AF'} strokeWidth={2} />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: faceDisponivel ? '#1D3A44' : '#9CA3AF',
                marginBottom: 3,
              }}
            >
              Scanear Rosto
            </Text>

            {faceDisponivel ? (
              <Text style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 18 }}>
                Faça uma análise facial completa
              </Text>
            ) : (
              // Mensagem de cooldown com ícone de relógio
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Clock size={12} color="#FB7B6B" strokeWidth={2} />
                <Text style={{ fontSize: 13, color: '#FB7B6B', fontWeight: '500', lineHeight: 18 }}>
                  {cooldownMsg}
                </Text>
              </View>
            )}
          </View>

          {faceDisponivel ? (
            <ChevronRight size={20} color="#D1D5DB" strokeWidth={2} />
          ) : (
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: '#EDEDEE',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Lock size={14} color="#9CA3AF" strokeWidth={2} />
            </View>
          )}
        </TouchableOpacity>

        {/* Botão Cancelar */}
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.8}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            height: 56,
            alignItems: 'center',
            justifyContent: 'center',
            ...SHADOW,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '500', color: '#8A8A8E' }}>Cancelar</Text>
        </TouchableOpacity>
      </Animated.View>

    </Modal>

    <AIConsentModal
      visible={consentModalVisible}
      onAccept={handleAccept}
      onDecline={handleDecline}
    />
  </>
  );
}
