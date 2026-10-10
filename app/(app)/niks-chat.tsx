import {
  View, Text, TouchableOpacity, ScrollView, TextInput, Animated, Easing,
  KeyboardAvoidingView, Platform, Keyboard, Image, ActionSheetIOS, Alert, StyleSheet, AccessibilityInfo,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker'
import { trackNativePresentation } from '../../lib/nativePresentation'
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Path } from 'react-native-svg';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/onboarding';
import { useCachedQuery, invalidateCache } from '../../lib/cache';
import { getUserId, useUserId } from '../../lib/currentUser';
import { haptics } from '../../lib/haptics';

// ─────────────────────────────────────────────────────────────────────────────
// NIKS Chat — réplica dos designs 39a (início) e 39b (conversa em andamento) do
// Claude Design (projeto "NIKS home redesign — rotina skincare", NiksChatFlo.dc.html).
// Tela cheia, sem a navbar (como no design). Fonte = SF Pro (sistema), rosa #FF5EA8.
// Medidas do frame 393×852: o cabeçalho do design (110) = barra de status (54) +
// barra (54) + progresso (2) → aqui `insets.top + 56`.
// A LÓGICA (streaming XHR, histórico no banco, fotos, card de aprovação do protocolo,
// niksChatMode) é a mesma de antes — só a camada visual mudou.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const BUBBLE = '#F3EFF1';
const MUTED = '#8A8387';
const HAIR = '#EFE8EB';
const FIELD_BD = '#E3DCDF';
// `text-wrap: pretty` do design (sem palavra sozinha na última linha) = `lineBreakStrategyIOS="push-out"`.

// ── Ícones (paths copiados do design) ───────────────────────────────────────
function CameraIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" fill="none" stroke={MUTED} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={3.5} fill="none" stroke={MUTED} strokeWidth={1.7} />
    </Svg>
  );
}

// Rabicho do balão (14×14, fora do balão, embaixo).
function BotTail() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" style={{ position: 'absolute', left: -6, bottom: 0 }}>
      <Path d="M14 0v14H0c4.5-1 8-4.5 8-14z" fill={BUBBLE} />
    </Svg>
  );
}
function MeTail() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" style={{ position: 'absolute', right: -6, bottom: 0 }}>
      <Path d="M0 0v14h14C9.5 13 6 9.5 6 0z" fill={PINK} />
    </Svg>
  );
}

// Três pontinhos de "digitando" — as cores do design, piscando em onda.
function TypingBubble({ marginTop }: { marginTop: number }) {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current
  useEffect(() => {
    const anim = Animated.loop(Animated.stagger(160, dots.map(v => Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]))))
    anim.start()
    return () => anim.stop()
  }, [dots])
  return (
    <View style={[styles.typing, { marginTop }]}>
      {['#C9BFC4', '#B0A5AB', '#958A90'].map((c, i) => (
        <Animated.View
          key={c}
          style={[styles.typingDot, {
            backgroundColor: c,
            opacity: dots[i].interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
            transform: [{ translateY: dots[i].interpolate({ inputRange: [0, 1], outputRange: [0, -2.5] }) }],
          }]}
        />
      ))}
      <BotTail />
    </View>
  )
}

// Entrada de cada mensagem da abertura: aparece subindo de leve, como num chat real.
function FadeIn({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const v = useRef(new Animated.Value(enabled ? 0 : 1)).current
  useEffect(() => {
    if (!enabled) return
    Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [enabled, v])
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
      {children}
    </Animated.View>
  )
}

// ── Conteúdo do design ──────────────────────────────────────────────────────
const SUGS = [
  'Apareceu uma espinha no meu rosto. Preciso de ajuda.',
  'Estou vendo o resultado com o meu protocolo?',
  'Minha pele reagiu a algo que eu usei.',
];
// Respostas prontas das 3 opções (texto do design). Gravadas no banco como uma
// conversa normal, igual às respostas pré-definidas de antes.
const PREDEFINED_RESPONSES: Record<string, string> = {
  [SUGS[0]]: 'ah, que chato! me manda uma foto de perto dela? assim eu vejo se tá inflamada e te digo o que passar hoje.',
  [SUGS[1]]: 'bora ver juntas! me manda uma selfie agora que eu comparo com o seu último scan.',
  [SUGS[2]]: 'entendi. qual produto você usou por último? e o que apareceu: vermelhidão, coceira ou bolinhas?',
};
const ABOUT = ['Analisa fotos da sua pele e dos seus produtos', 'Tira dúvidas sobre o seu protocolo', 'Ajusta a rotina quando a pele reage'];

// ── Datas ───────────────────────────────────────────────────────────────────
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function daysAgo(iso: string): number {
  const d = new Date(iso);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

// "Hoje" · "Ontem" · "Seg" (esta semana) · "19 set"
function shortDay(iso: string): string {
  const n = daysAgo(iso);
  if (n <= 0) return 'Hoje';
  if (n === 1) return 'Ontem';
  const d = new Date(iso);
  if (n < 7) return WEEKDAYS[d.getDay()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// ── Types ──────────────────────────────────────────────────────────────────────
type HistoryConversation = {
  id: string
  title: string
  when: string
  prev: string
  recent: boolean
}

// ── Coach protocol suggestion (card de aprovação — Bloco 3) ───────────────────
type PassoProposto = { step_name?: string; ingredient?: string; instruction?: string | null; schedule_days?: string[] | null }
type ProposedChanges = {
  action?: string
  period?: string
  step_name?: string
  ingredient?: string
  instruction?: string | null
  schedule_days?: string[] | null
  replaces?: string | null
  steps?: PassoProposto[] | null   // replace_period: a rotina nova do período, na ordem
}
type CoachSuggestion = {
  id: string
  reason: string
  proposed_changes: ProposedChanges
  status: 'pending' | 'applied' | 'rejected' | 'expired' | 'approved' | 'superseded'
}

// O servidor (app novo, `rotinaV2`) manda `[[SUGESTAO:<id>]]` no fim da resposta: o card
// aparece na hora, sem a corrida de antes. O marcador nunca aparece na tela.
const MARCADOR_SUGESTAO = /\n?\[\[SUGESTAO:([0-9a-f-]+)\]\]\s*$/
function semMarcador(t: string): string {
  return t.replace(MARCADOR_SUGESTAO, '').replace(/\n?\[\[[^\]]*$/, '')
}

// ── Message type ──────────────────────────────────────────────────────────────
type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  // Mensagem nascida nesta sessão: a resposta da NIKS é "digitada" bolha a bolha.
  live?: boolean
  createdAt?: number
  imageUris?: string[]
  suggestion?: CoachSuggestion
}

// Frase-gatilho (visível — o bloco [[PROTOCOL_PATCH]] já foi cortado no servidor).
// Só quando ela aparece o app procura a sugestão pendente que o servidor acabou de criar.
// Duas frases-gatilho (inclusão/substituição e remoção). O poll do card procura
// qualquer uma no texto visível — o bloco já foi cortado no servidor.
const TRIGGER_PHRASES = [
  'posso incluir isso no seu protocolo?',
  'posso remover isso do seu protocolo?',
]
const APPROVE_URL = 'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/approve-coach-protocol-change'

// A sugestão pendente DELA (qualquer conversa; o servidor garante no máximo 1 — uma
// nova substitui a anterior — e expira as de +24h). Aparece num card fixo no fim da conversa.
async function fetchPendingSuggestion(_conversationId?: string): Promise<CoachSuggestion | null> {
  const uid = await getUserId()
  if (!uid) return null
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('coach_protocol_suggestions')
    .select('id, reason, proposed_changes, status')
    .eq('user_id', uid)
    .eq('status', 'pending')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as CoachSuggestion | null) ?? null
}

async function fetchSuggestionById(id: string): Promise<CoachSuggestion | null> {
  const { data } = await supabase
    .from('coach_protocol_suggestions')
    .select('id, reason, proposed_changes, status')
    .eq('id', id)
    .maybeSingle()
  return (data as CoachSuggestion | null) ?? null
}

// Mesmo padrão de aquisição de token do sendMessage: só renova perto de expirar.
async function getAccessToken(): Promise<string | null> {
  try {
    const { data: { session: current } } = await supabase.auth.getSession()
    const expiresAt = current?.expires_at ?? 0
    const nowSecs = Math.floor(Date.now() / 1000)
    if (current?.access_token && expiresAt - nowSecs > 300) return current.access_token
    const { data: refreshed, error } = await supabase.auth.refreshSession()
    return (!error && refreshed.session?.access_token) ? refreshed.session.access_token : (current?.access_token ?? null)
  } catch {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }
}

// Chama a Edge Function approve-coach-protocol-change. Contrato REAL do endpoint:
// { suggestion_id, approved } + Bearer JWT (o user_id sai do token, não do corpo).
async function approveProtocolChange(
  suggestionId: string,
  approved: boolean,
): Promise<{ ok: boolean; action?: string; protocol?: any; mensagem?: string }> {
  const token = await getAccessToken()
  if (!token) return { ok: false }
  try {
    const resp = await fetch(APPROVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ suggestion_id: suggestionId, approved }),
    })
    const data = await resp.json().catch(() => ({} as any))
    if (!resp.ok) {
      console.warn('approveProtocolChange: falhou', resp.status, JSON.stringify(data))
      return { ok: false, action: data?.action }
    }
    return { ok: true, action: data?.action, protocol: data?.protocol, mensagem: data?.mensagem }
  } catch {
    return { ok: false }
  }
}

// Resumo legível do proposed_changes para o card.
function formatChangeSummary(pc: ProposedChanges): string {
  const verbo = pc.action === 'add' ? 'Incluir' : pc.action === 'remove' ? 'Remover' : pc.action === 'replace' ? 'Trocar por' : 'Ajustar'
  const item = (pc.step_name || pc.ingredient || 'passo').trim()
  const extra = pc.ingredient && pc.step_name && pc.ingredient.trim().toLowerCase() !== pc.step_name.trim().toLowerCase() ? ` (${pc.ingredient.trim()})` : ''
  const dias = Array.isArray(pc.schedule_days) && pc.schedule_days.length ? ` · ${pc.schedule_days.join(', ')}` : ''
  const sai = pc.action === 'replace' && pc.replaces ? `\nSai: ${pc.replaces}` : ''
  return `${verbo} ${item}${extra}${dias}${sai}`
}

// ── ProtocolApprovalCard ──────────────────────────────────────────────────────
// Não existe no design; segue a linguagem do card "O que a NIKS faz" (branco,
// borda #E6E0E3, raio 20) com o botão rosa do design.
function ProtocolApprovalCard({
  suggestion, onDecide,
}: {
  suggestion: CoachSuggestion
  onDecide: (approved: boolean) => Promise<{ ok: boolean; action?: string }>
}) {
  const [submitting, setSubmitting] = useState<null | 'approve' | 'reject'>(null)
  const [failed, setFailed] = useState(false)

  const decide = async (approved: boolean) => {
    haptics.action()
    setSubmitting(approved ? 'approve' : 'reject')
    setFailed(false)
    const res = await onDecide(approved)
    setSubmitting(null)
    if (!res.ok && res.action !== 'expired') setFailed(true)
  }

  if (suggestion.status !== 'pending') {
    const label = suggestion.status === 'applied' ? 'Aprovado ✓'
      : suggestion.status === 'rejected' ? 'Recusado'
      : suggestion.status === 'expired' ? 'Essa sugestão expirou'
      : suggestion.status === 'superseded' ? 'Substituída por uma sugestão mais nova'
      : 'Resolvido'
    return (
      <View style={[styles.card, { marginTop: 8 }]}>
        <Text style={{ fontSize: 15, letterSpacing: -0.25, color: MUTED }}>{label}</Text>
      </View>
    )
  }

  return (
    <View style={[styles.card, { marginTop: 8 }]}>
      {/* O PERÍODO em destaque: a mudança é na manhã OU na noite. */}
      <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 0.3, color: '#E8468F', textTransform: 'uppercase' }}>
        {suggestion.proposed_changes.period === 'am' ? 'Rotina da manhã' : 'Rotina da noite'}
      </Text>
      <Text style={[styles.cardTitle, { marginTop: 4 }]}>
        {suggestion.proposed_changes.action === 'replace_period' ? 'Sua rotina passa a ser' : 'Sugestão de mudança'}
      </Text>
      {suggestion.proposed_changes.action === 'replace_period' && Array.isArray(suggestion.proposed_changes.steps) ? (
        <View style={{ marginTop: 8, gap: 4 }}>
          {suggestion.proposed_changes.steps.map((st, i) => (
            <Text key={i} style={styles.aboutText}>
              {`${i + 1}. ${st.step_name ?? ''}`}
              {Array.isArray(st.schedule_days) && st.schedule_days.length ? <Text style={{ color: MUTED }}>{` · ${st.schedule_days.join(', ')}`}</Text> : null}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={[styles.aboutText, { marginTop: 8 }]}>{formatChangeSummary(suggestion.proposed_changes)}</Text>
      )}
      {!!suggestion.reason && (
        <Text style={{ marginTop: 6, fontSize: 15, lineHeight: 20, letterSpacing: -0.25, color: MUTED }}>{suggestion.reason}</Text>
      )}
      {failed && (
        <Text style={{ fontSize: 13, color: '#C0392B', marginTop: 8 }}>Não consegui registrar agora. Tenta de novo.</Text>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <TouchableOpacity
          onPress={() => decide(true)}
          disabled={submitting !== null}
          activeOpacity={0.85}
          style={[styles.sendBtn, { flex: 1, height: 44, opacity: submitting !== null ? 0.6 : 1 }]}
        >
          <Text style={styles.sendText}>{submitting === 'approve' ? 'Aprovando…' : 'Aprovar'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => decide(false)}
          disabled={submitting !== null}
          activeOpacity={0.85}
          style={{ flex: 1, height: 44, borderRadius: 100, borderWidth: 1, borderColor: FIELD_BD, alignItems: 'center', justifyContent: 'center', opacity: submitting !== null ? 0.6 : 1 }}
        >
          <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK }}>
            {submitting === 'reject' ? 'Recusando…' : 'Recusar'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ── Resposta "ao vivo" ──────────────────────────────────────────────────────
// Cada parágrafo da resposta vira uma bolha, e antes de cada bolha a NIKS
// "digita" (três pontinhos) por um tempo proporcional ao tamanho do texto.
function splitBubbles(text: string): string[] {
  return text.split(/\n\s*\n/).map(t => t.trim()).filter(Boolean)
}
const FIRST_BUBBLE_MS = 900 // mínimo de "digitando" antes da 1ª bolha (conta a espera da rede)
function typingMs(text: string): number {
  return Math.min(1600, Math.max(700, 350 + text.length * 12))
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function NiksChat() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { setTabBarTheme, setNiksChatMode, setTabBarVisible } = useAppStore();

  // O design é tela cheia, sem a navbar: some ao entrar e volta ao sair.
  useFocusEffect(
    useCallback(() => {
      setTabBarTheme('light');
      setTabBarVisible(false);
      return () => { setTabBarTheme('light'); setTabBarVisible(true); };
    }, [])
  );

  const [mode,           setMode]           = useState<'empty' | 'active'>('empty');
  const [firstName,      setFirstName]      = useState('');
  const [inputText,      setInputText]      = useState('');
  const [freeText,       setFreeText]       = useState('');
  const [pick,           setPick]           = useState<number | null>(null);
  const [aboutOpen,      setAboutOpen]      = useState(false);
  // Abertura "ao vivo": quantas das 3 peças fixas (oi · me conta · card) já apareceram,
  // se a NIKS está "digitando" a próxima, e se as opções já subiram.
  const [introShown,     setIntroShown]     = useState(3);
  const [introTyping,    setIntroTyping]    = useState(false);
  const [introAnimated,  setIntroAnimated]  = useState(false);
  // Quantas bolhas de cada resposta ao vivo já apareceram (id da mensagem → n).
  const [revealed,       setRevealed]       = useState<Record<string, number>>({});
  const revealTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const reduceMotion = useRef(false);
  const introTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const sheetAnim = useRef(new Animated.Value(1)).current;
  const modeRef = useRef<'empty' | 'active'>('empty');
  const [keyboardOpen,   setKeyboardOpen]   = useState(false);
  const [userId,         setUserId]         = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [pendingImages,        setPendingImages]        = useState<Array<{ base64: string; mimeType: string; uri: string }>>([]);
  const [historyVisible,       setHistoryVisible]       = useState(false);
  const [historyConversations, setHistoryConversations] = useState<HistoryConversation[]>([]);
  const [historyLoading,       setHistoryLoading]       = useState(false);
  const [conversationTime,     setConversationTime]     = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  // SÓ ANDROID: altura do teclado ACIMA da barra de navegação (vem no `keyboardDidShow`).
  // Ref, não estado: quem redesenha é o `setKeyboardOpen(true)` logo em seguida.
  const androidKbHeight = useRef(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true));
    const hide  = Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false));
    // ANDROID não emite os eventos `Will*` — só os `Did*`. Sem isto o chat achava
    // que o teclado estava sempre fechado.
    if (Platform.OS === 'android') {
      const didShow = Keyboard.addListener('keyboardDidShow', (e) => {
        androidKbHeight.current = e.endCoordinates.height;
        setKeyboardOpen(true);
      });
      const didHide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
      return () => { show.remove(); hide.remove(); didShow.remove(); didHide.remove(); };
    }
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── Carga inicial do chat, cacheada ──────────────────────────────────────
  // Nome + conversa + mensagens são uma entrada de cache só → a tela volta instantânea.
  const cachedUserId = useUserId()

  const fetchChat = useCallback(async () => {
    const uid = await getUserId()
    if (!uid) throw new Error('sem sessão')

    const [userRes, convRes] = await Promise.all([
      supabase.from('users').select('nome').eq('id', uid).single(),
      supabase
        .from('coach_conversations')
        .select('id')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const nome = userRes.data?.nome ?? null
    const convId: string | null = convRes.data?.id ?? null
    if (!convId) return { userId: uid, nome, conversationId: null, msgs: [] as any[] }

    const { data: msgs } = await supabase
      .from('coach_messages')
      .select('id, role, content, image_url, created_at')
      .eq('conversation_id', convId)
      .eq('user_id', uid)
      .order('created_at', { ascending: true })

    return { userId: uid, nome, conversationId: convId, msgs: msgs ?? [] }
  }, [])

  const { data: chatData } = useCachedQuery(
    cachedUserId ? `chat:${cachedUserId}` : null,
    fetchChat,
    { enabled: Boolean(cachedUserId) },
  )

  useEffect(() => {
    if (!chatData) return

    setUserId(chatData.userId)
    if (chatData.nome) setFirstName(chatData.nome.trim().split(' ')[0] || '')
    if (!chatData.conversationId) return
    setConversationId(chatData.conversationId)

    // ⚠️ `niksChatMode` (store) decide se a conversa é RESTAURADA na tela. Cold
    // start cai em 'empty' de propósito (README) — o cache não muda isso.
    const chatMode = useAppStore.getState().niksChatMode
    if (chatMode === 'empty') return

    const msgs = chatData.msgs
    if (msgs.length > 0) {
      setMessages(msgs.map(toMessage))
      setConversationTime(msgs[0].created_at)
      setMode('active')
      void attachPendingToLast(chatData.conversationId)
    } else {
      setMessages([])
      setMode('empty')
    }
  }, [chatData])

  // "Nova conversa" (painel de conversas): volta ao início (39a).
  // Abertura ao vivo: digitando → "oi, Nome! 👋" → digitando → "me conta…" → card →
  // as opções sobem. Com "Reduzir movimento" ligado, aparece tudo de uma vez.
  const clearIntro = () => { introTimers.current.forEach(clearTimeout); introTimers.current = [] }
  const runIntro = async () => {
    clearIntro()
    const reduce = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false)
    if (reduce) {
      setIntroShown(3); setIntroTyping(false); setIntroAnimated(false); sheetAnim.setValue(1)
      return
    }
    setIntroAnimated(true)
    setIntroShown(0)
    setIntroTyping(true)
    sheetAnim.setValue(0)
    const at = (ms: number, fn: () => void) => { introTimers.current.push(setTimeout(fn, ms)) }
    at(900,  () => { setIntroTyping(false); setIntroShown(1) })
    at(1150, () => setIntroTyping(true))
    at(2250, () => { setIntroTyping(false); setIntroShown(2) })
    at(2700, () => setIntroShown(3))
    at(3000, () => {
      Animated.timing(sheetAnim, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    })
  }

  useEffect(() => { modeRef.current = mode }, [mode])

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(v => { reduceMotion.current = v }).catch(() => {})
    return () => { Object.values(revealTimers.current).forEach(clearTimeout) }
  }, [])

  // Agenda a próxima bolha de cada resposta ao vivo. Enquanto o texto ainda chega
  // (streaming), só parágrafos COMPLETOS podem aparecer — o último pode estar pela metade.
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== 'assistant' || !m.live || revealTimers.current[m.id]) continue
      const parts = splitBubbles(m.content)
      const ready = m.isStreaming ? Math.max(0, parts.length - 1) : parts.length
      const n = revealed[m.id] ?? 0
      if (n >= ready) continue
      const delay = reduceMotion.current ? 0
        : n === 0 ? Math.max(0, FIRST_BUBBLE_MS - (Date.now() - (m.createdAt ?? 0)))
        : typingMs(parts[n])
      revealTimers.current[m.id] = setTimeout(() => {
        delete revealTimers.current[m.id]
        setRevealed(r => ({ ...r, [m.id]: (r[m.id] ?? 0) + 1 }))
      }, delay)
    }
  }, [messages, revealed])

  // Cada vez que a usuária abre o chat numa conversa nova, a abertura roda de novo.
  useFocusEffect(
    useCallback(() => {
      if (modeRef.current === 'empty') void runIntro()
      return () => clearIntro()
    }, [])
  );

  const startNewChat = () => {
    setNiksChatMode('empty')
    setMode('empty')
    setMessages([])
    setConversationTime(null)
    setPick(null)
    setFreeText('')
    setInputText('')
    setPendingImages([])
    setAboutOpen(false)
    setHistoryVisible(false)
    void runIntro()
  }

  // A sugestão pendente dela aparece num CARD FIXO no fim da conversa (não preso a uma
  // bolha — antes, presa à última resposta, sumia quando essa resposta vinha vazia).
  const [pendente, setPendente] = useState<CoachSuggestion | null>(null)
  // Conversa vazia (sem bolhas na tela): a confirmação fica no lugar do card.
  const [confirmacao, setConfirmacao] = useState<string | null>(null)
  const attachPendingToLast = async (_convId?: string) => {
    setPendente(await fetchPendingSuggestion())
  }

  // Toda vez que o chat ganha foco: a pendente dela aparece, inclusive com a conversa vazia.
  useFocusEffect(useCallback(() => { void attachPendingToLast() }, []))

  // Sem o marcador (servidor antigo): procura a pendente por até ~10 s.
  const hydrateSuggestion = async (_convId?: string, _messageId?: string) => {
    for (let i = 0; i < 10; i++) {
      const sug = await fetchPendingSuggestion()
      if (sug) { setPendente(sug); return }
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  // Decisão no card fixo: o card some e entra a confirmação VERDADEIRA do servidor
  // ("Pronto, sua rotina da manhã foi atualizada ✓" ou o motivo de não ter aplicado).
  const decidirPendente = async (approved: boolean): Promise<{ ok: boolean; action?: string }> => {
    if (!pendente) return { ok: false }
    const res = await approveProtocolChange(pendente.id, approved)
    if (res.ok && approved && cachedUserId) {
      invalidateCache(`minharotina:${cachedUserId}`)
      invalidateCache(`protocolo:${cachedUserId}`)
      invalidateCache(`rotinaideal:${cachedUserId}`)
    }
    if (res.ok || res.action === 'expired') {
      setPendente(null)
      const texto = res.mensagem ?? (approved ? null : 'Combinado, deixei sua rotina como estava.')
      if (texto) {
        if (mode === 'active') setMessages(prev => [...prev, { id: `conf-${Date.now()}`, role: 'assistant', content: texto, live: true }])
        else setConfirmacao(texto)
      }
      if (cachedUserId) invalidateCache(`chat:${cachedUserId}`)
    } else {
      // Ela já foi substituída/expirada no servidor: mostra a pendente de verdade (ou nenhuma).
      const atual = await fetchPendingSuggestion()
      if (atual?.id !== pendente.id) setPendente(atual)
    }
    return { ok: res.ok, action: res.action }
  }

  const handleSuggestionDecision = async (
    messageId: string, suggestionId: string, approved: boolean,
  ): Promise<{ ok: boolean; action?: string }> => {
    const res = await approveProtocolChange(suggestionId, approved)
    // Aplicada: a rotina mudou no servidor (Minha rotina, ou a ideal p/ quem não tem) —
    // a aba Rotina e os cards que dependem dela precisam reler.
    if (res.ok && approved && cachedUserId) {
      invalidateCache(`minharotina:${cachedUserId}`)
      invalidateCache(`protocolo:${cachedUserId}`)
      invalidateCache(`rotinaideal:${cachedUserId}`)
    }
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId || !m.suggestion) return m
      let status = m.suggestion.status
      if (res.ok) status = approved ? 'applied' : 'rejected'
      else if (res.action === 'expired') status = 'expired'
      return { ...m, suggestion: { ...m.suggestion, status } }
    }))
    return { ok: res.ok, action: res.action }
  }

  const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
  const FUNCTION_URL = 'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/niks-chat'

  const sendMessage = async (text: string, images?: Array<{ base64: string; mimeType: string; uri: string }>) => {
    setNiksChatMode('active')
    setConfirmacao(null)
    if (!userId) return

    let activeConvId = conversationId

    if (mode === 'empty' || !activeConvId) {
      const title = text.trim() ? text.substring(0, 80) : 'Foto'
      const { data: newConv, error: convError } = await supabase
        .from('coach_conversations')
        .insert({ user_id: userId, title })
        .select('id')
        .single()
      if (convError || !newConv?.id) return
      activeConvId = newConv.id
      setConversationId(activeConvId)
      setConversationTime(new Date().toISOString())
    }

    const userMsgId       = `user_${Date.now()}`
    const assistantMsgId  = `assistant_${Date.now()}`
    const clientMessageId = `${userId}_${Date.now()}`

    setMessages(prev => [
      ...prev,
      { id: userMsgId,      role: 'user',      content: text, imageUris: images?.map(i => i.uri), live: true },
      { id: assistantMsgId, role: 'assistant',  content: '', isStreaming: true, live: true, createdAt: Date.now() },
    ])
    setMode('active')

    const showSendError = (msg: string) => {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: msg, isStreaming: false }
          : m
      ))
    }

    // Token válido antes de enviar: só renova perto de expirar (<5 min).
    let accessToken: string | null = null

    try {
      const { data: { session: current } } = await supabase.auth.getSession()
      const expiresAt = current?.expires_at ?? 0
      const nowSecs   = Math.floor(Date.now() / 1000)

      if (current?.access_token && expiresAt - nowSecs > 300) {
        accessToken = current.access_token
      } else {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
        accessToken = (!refreshError && refreshed.session?.access_token)
          ? refreshed.session.access_token
          : (current?.access_token ?? null)
      }
    } catch {
      const { data: { session } } = await supabase.auth.getSession()
      accessToken = session?.access_token ?? null
    }

    if (!accessToken) {
      showSendError('Ocorreu um erro. Tente novamente.')
      return
    }

    let lastLength = 0
    const xhr = new XMLHttpRequest()
    xhr.open('POST', FUNCTION_URL)
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    xhr.setRequestHeader('apikey', ANON_KEY)
    xhr.setRequestHeader('Content-Type', 'application/json')

    xhr.onprogress = () => {
      if (xhr.status !== 200) return
      const chunk = xhr.responseText.slice(lastLength)
      lastLength = xhr.responseText.length
      if (!chunk) return
      // Texto inteiro sem o marcador da sugestão (nem um pedaço dele no fim).
      const visivel = semMarcador(xhr.responseText)
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, content: visivel } : m
      ))
    }

    xhr.onload = () => {
      if (xhr.status !== 200) {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: 'Ocorreu um erro. Tente novamente.', isStreaming: false }
            : m
        ))
        return
      }
      // Sempre o responseText inteiro — garante que nada fica truncado.
      const idSugestao = xhr.responseText.match(MARCADOR_SUGESTAO)?.[1] ?? null
      const visivel = semMarcador(xhr.responseText)
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: visivel, isStreaming: false }
          : m
      ))
      // A conversa cresceu no banco — marca o cache como velho.
      if (cachedUserId) invalidateCache(`chat:${cachedUserId}`)
      // A NIKS propôs: o servidor já gravou a sugestão e mandou o id → card na hora.
      // Sem id (servidor antigo) mas com a frase-gatilho → procura a pendente.
      if (idSugestao) {
        void fetchSuggestionById(idSugestao).then((sug) => { if (sug?.status === 'pending') setPendente(sug) })
      } else if (activeConvId && TRIGGER_PHRASES.some(p => visivel.toLowerCase().includes(p))) {
        void hydrateSuggestion(activeConvId, assistantMsgId)
      }
    }

    xhr.onerror = () => {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: 'Ocorreu um erro. Tente novamente.', isStreaming: false }
          : m
      ))
    }

    // Análise de imagem demora mais (upload + inferência multimodal):
    // 120s com imagens, 90s só texto.
    xhr.timeout = images && images.length > 0 ? 120000 : 90000
    xhr.ontimeout = () => {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: 'A resposta demorou muito. Tente novamente.', isStreaming: false }
          : m
      ))
    }

    xhr.send(JSON.stringify({
      userId,
      conversationId: activeConvId,
      message: text,
      clientMessageId,
      images: images?.map(i => ({ base64: i.base64, mimeType: i.mimeType })),
      supportsProtocolCard: true,
      // App novo: recebe o id da sugestão no fim da resposta e entende "trocar a rotina
      // inteira de um período" (replace_period).
      rotinaV2: true,
    }))
  }

  const handleSuggestionPress = async (text: string) => {
    setNiksChatMode('active')
    const predefined = PREDEFINED_RESPONSES[text]
    if (predefined) {
      if (!userId) return

      const { data: newConv } = await supabase
        .from('coach_conversations')
        .insert({ user_id: userId, title: text.substring(0, 80) })
        .select('id')
        .single()
      if (!newConv?.id) return

      const activeConvId = newConv.id
      setConversationId(activeConvId)
      setConversationTime(new Date().toISOString())

      await supabase.from('coach_messages').insert([
        { conversation_id: activeConvId, user_id: userId, role: 'user',      content: text },
        { conversation_id: activeConvId, user_id: userId, role: 'assistant', content: predefined },
      ])
      if (cachedUserId) invalidateCache(`chat:${cachedUserId}`)

      setMessages([
        { id: `user_${Date.now()}`,      role: 'user',      content: text, live: true },
        { id: `assistant_${Date.now()}`, role: 'assistant',  content: predefined, live: true, createdAt: Date.now() },
      ])
      setMode('active')
    } else {
      sendMessage(text)
    }
  }

  const pickImage = async (source: 'camera' | 'gallery') => {
    if (pendingImages.length >= 5) return

    const result = await trackNativePresentation(() => source === 'camera'
      ? ImagePicker.launchCameraAsync({
          mediaTypes: ['images'] as any,
          quality: 0.8,
          allowsEditing: false,
        })
      : ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'] as any,
          quality: 0.8,
          allowsEditing: false,
        }))

    if (result.canceled || !result.assets?.[0]) return

    const asset = result.assets[0]

    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 512 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    )

    if (!manipulated.base64) return

    setPendingImages(prev => [...prev, {
      base64: manipulated.base64!,
      mimeType: 'image/jpeg',
      uri: manipulated.uri,
    }])
  }

  // O design tem UM ícone de câmera no campo: ele oferece câmera ou galeria.
  const choosePhotoSource = () => {
    haptics.tap()
    if (pendingImages.length >= 5) return
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Tirar foto', 'Escolher da galeria', 'Cancelar'], cancelButtonIndex: 2 },
        (i) => { if (i === 0) pickImage('camera'); if (i === 1) pickImage('gallery') },
      )
    } else {
      Alert.alert('Enviar foto', undefined, [
        { text: 'Tirar foto', onPress: () => pickImage('camera') },
        { text: 'Escolher da galeria', onPress: () => pickImage('gallery') },
        { text: 'Cancelar', style: 'cancel' },
      ])
    }
  }

  const loadHistory = async () => {
    if (!userId) return
    setHistoryLoading(true)
    setHistoryVisible(true)

    const { data: convs } = await supabase
      .from('coach_conversations')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!convs || convs.length === 0) {
      setHistoryConversations([])
      setHistoryLoading(false)
      return
    }

    const convIds = convs.map(c => c.id)

    const [{ data: userMsgs }, { data: lastMsgs }] = await Promise.all([
      supabase
        .from('coach_messages')
        .select('conversation_id, content, created_at')
        .in('conversation_id', convIds)
        .eq('role', 'user')
        .order('created_at', { ascending: true }),
      supabase
        .from('coach_messages')
        .select('conversation_id, content, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false }),
    ])

    const titleMap: Record<string, string> = {}
    userMsgs?.forEach(msg => {
      if (!titleMap[msg.conversation_id]) titleMap[msg.conversation_id] = msg.content || 'Foto'
    })

    const lastMap: Record<string, { content: string; created_at: string }> = {}
    lastMsgs?.forEach(msg => {
      if (!lastMap[msg.conversation_id]) lastMap[msg.conversation_id] = msg
    })

    setHistoryConversations(convIds
      .filter(id => lastMap[id])
      .map(id => ({
        id,
        title: (titleMap[id] ?? 'Conversa').slice(0, 80),
        when: shortDay(lastMap[id].created_at),
        prev: (lastMap[id].content || 'Foto').replace(/\s+/g, ' '),
        recent: daysAgo(lastMap[id].created_at) < 7,
      })))
    setHistoryLoading(false)
  }

  const loadConversation = async (convId: string) => {
    setHistoryVisible(false)
    setNiksChatMode('active')

    const { data: msgs } = await supabase
      .from('coach_messages')
      .select('id, role, content, image_url, created_at')
      .eq('conversation_id', convId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (!msgs || msgs.length === 0) return

    setConversationId(convId)
    setConversationTime(msgs[0].created_at)
    setMessages(msgs.map(toMessage))
    setMode('active')
    void attachPendingToLast(convId)
  }

  // Composer (39b): campo "Pergunte à NIKS" + botão rosa.
  const handleSend = () => {
    const text = inputText.trim()
    if (!text && pendingImages.length === 0) return
    haptics.action()
    setInputText('')
    const images = pendingImages.length > 0 ? [...pendingImages] : undefined
    setPendingImages([])
    sendMessage(text || '', images)
  }

  // Folha do início (39a): opção marcada OU texto livre (OU foto) + "Enviar".
  const canSubmit = pick !== null || !!freeText.trim() || pendingImages.length > 0
  const handleSubmit = () => {
    if (!canSubmit) return
    haptics.action()
    Keyboard.dismiss()
    if (freeText.trim() || pendingImages.length > 0) {
      const images = pendingImages.length > 0 ? [...pendingImages] : undefined
      const text = freeText.trim()
      setFreeText('')
      setPendingImages([])
      sendMessage(text, images)
    } else if (pick !== null) {
      handleSuggestionPress(SUGS[pick])
    }
    setPick(null)
  }

  // ── Barra de progresso do topo (24% → 62% com "Ler mais" aberto → 100% na conversa)
  const done = mode === 'active'
  const progressTarget = done ? 1 : aboutOpen ? 0.62 : 0.24
  const progress = useRef(new Animated.Value(progressTarget)).current
  useEffect(() => {
    Animated.timing(progress, { toValue: progressTarget, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }).start()
  }, [progressTarget, progress])

  // ── Painel "Conversas" (desliza da direita) ──────────────────────────────
  const drawer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(drawer, {
      toValue: historyVisible ? 1 : 0,
      duration: 320,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    }).start()
  }, [historyVisible, drawer])

  // ── Linhas da conversa: 2 balões de boas-vindas + card + mensagens ────────
  type Row =
    | { kind: 'bot'; key: string; text: string; streaming?: boolean; suggestion?: CoachSuggestion; msgId?: string; anim?: boolean }
    | { kind: 'me'; key: string; text: string; images?: string[]; anim?: boolean }
    | { kind: 'card'; key: string }
    | { kind: 'typing'; key: string }
    | { kind: 'sugestao'; key: string }
  const intro: Row[] = [
    { kind: 'bot', key: 'hi', text: firstName ? `oi, ${firstName}! 👋` : 'oi! 👋' },
    { kind: 'bot', key: 'help', text: 'me conta, como posso te ajudar hoje?' },
    { kind: 'card', key: 'about' },
  ]
  const rows: Row[] = done ? intro : intro.slice(0, introShown)
  if (!done && introTyping) rows.push({ kind: 'typing', key: 'intro-typing' })
  if (done) {
    for (const m of messages) {
      if (m.role === 'user') {
        rows.push({ kind: 'me', key: m.id, text: m.content, images: m.imageUris, anim: m.live })
        continue
      }
      // Resposta da NIKS: um parágrafo por bolha. Ao vivo, só as já "digitadas"
      // aparecem e os pontinhos ficam embaixo até a última; o card de aprovação
      // (se houver) só entra depois da última bolha.
      const parts = splitBubbles(m.content)
      const n = m.live ? Math.min(revealed[m.id] ?? 0, parts.length) : parts.length
      const finished = !m.isStreaming && n >= parts.length
      parts.slice(0, n).forEach((t, k) => {
        const last = k === parts.length - 1 && finished
        rows.push({
          kind: 'bot', key: `${m.id}-${k}`, text: t, anim: m.live,
          suggestion: last ? m.suggestion : undefined, msgId: m.id,
        })
      })
      if (!finished) rows.push({ kind: 'typing', key: `${m.id}-typing` })
    }
  }
  // Card FIXO da sugestão pendente, no fim da conversa (também com a conversa vazia, depois
  // das boas-vindas) — e só depois que a resposta terminou de aparecer (a NIKS explica
  // primeiro, o card vem em seguida).
  const respondendo = messages.some(m =>
    m.role === 'assistant' && (m.isStreaming || (m.live && (revealed[m.id] ?? 0) < splitBubbles(m.content).length)))
  if ((pendente || confirmacao) && !respondendo && (done || introShown >= intro.length)) rows.push({ kind: 'sugestao', key: pendente ? `sug-${pendente.id}` : 'sug-conf' })
  const isBot = (r?: Row) => r?.kind === 'bot' || r?.kind === 'typing'

  const renderRow = (r: Row, i: number) => {
    const prev = rows[i - 1]
    const next = rows[i + 1]
    const sameAsPrev = !!prev && prev.kind !== 'card' && r.kind !== 'card' && isBot(prev) === isBot(r)
    const mt = i === 0 ? 14 : sameAsPrev ? 5 : r.kind === 'card' ? 8 : 21

    if (r.kind === 'sugestao') {
      if (pendente) {
        return (
          <View key={r.key} style={{ marginTop: 8 }}>
            <ProtocolApprovalCard key={pendente.id} suggestion={pendente} onDecide={decidirPendente} />
          </View>
        )
      }
      return confirmacao ? (
        <View key={r.key} style={[styles.card, { marginTop: 8 }]}>
          <Text style={styles.aboutText}>{confirmacao}</Text>
        </View>
      ) : null
    }

    if (r.kind === 'card') {
      return (
        <View key={r.key} style={[styles.card, { marginTop: mt }]}>
          <Text style={styles.cardTitle} lineBreakStrategyIOS="push-out">O que a NIKS faz neste chat? Veja aqui os detalhes</Text>
          {aboutOpen && (
            <View style={{ marginTop: 12, gap: 8 }}>
              {ABOUT.map(ab => (
                <View key={ab} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={styles.aboutDot} />
                  <Text style={[styles.aboutText, { flex: 1 }]}>{ab}</Text>
                </View>
              ))}
            </View>
          )}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => { haptics.tap(); setAboutOpen(o => !o) }}
            style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
          >
            <Text style={styles.moreText}>{aboutOpen ? 'Ler menos' : 'Ler mais'}</Text>
            <Svg width={16} height={16} viewBox="0 0 24 24" style={{ transform: [{ rotate: aboutOpen ? '180deg' : '0deg' }] }}>
              <Path d="M6 9l6 6 6-6" fill="none" stroke={PINK_TEXT} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </View>
      )
    }

    if (r.kind === 'typing') {
      return <TypingBubble key={r.key} marginTop={mt} />
    }

    if (r.kind === 'me') {
      return (
        <View key={r.key} style={{ marginTop: mt, alignItems: 'flex-end', gap: 5 }}>
          {r.images?.map((uri, k) => (
            <Image key={k} source={{ uri }} style={styles.photo} />
          ))}
          {!!r.text && (
            <View style={styles.meBubble}>
              <Text style={styles.meText} lineBreakStrategyIOS="push-out">{r.text}</Text>
              <MeTail />
            </View>
          )}
        </View>
      )
    }

    const lastOfGroup = !isBot(next) && !r.suggestion
    const tail = lastOfGroup && next?.kind !== 'card'
    return (
      <View key={r.key} style={{ marginTop: mt }}>
        <View style={[styles.botBubble, { borderBottomLeftRadius: tail ? 4 : 20 }]}>
          <Text style={styles.botText} lineBreakStrategyIOS="push-out">{r.text}</Text>
          {tail && <BotTail />}
        </View>
        {r.suggestion && r.msgId && (
          <ProtocolApprovalCard
            suggestion={r.suggestion}
            onDecide={(approved) => handleSuggestionDecision(r.msgId!, r.suggestion!.id, approved)}
          />
        )}
      </View>
    )
  }

  const dayLabel = done && conversationTime ? shortDay(conversationTime) : 'Hoje'
  const recentConvs = historyConversations.filter(c => c.recent)
  const olderConvs = historyConversations.filter(c => !c.recent)

  const renderHistItem = (c: HistoryConversation) => (
    <TouchableOpacity
      key={c.id}
      activeOpacity={0.85}
      onPress={() => { haptics.tap(); loadConversation(c.id) }}
      style={[styles.histItem, c.id === conversationId && done && { backgroundColor: '#FDEEF4' }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={styles.histTitle} numberOfLines={1}>{c.title}</Text>
        <Text style={styles.histWhen}>{c.when}</Text>
      </View>
      <Text style={styles.histPrev} numberOfLines={1}>{c.prev}</Text>
    </TouchableOpacity>
  )

  const pendingStrip = pendingImages.length > 0 && (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginBottom: 8 }}
      contentContainerStyle={{ gap: 8, paddingTop: 6 }}
      keyboardShouldPersistTaps="handled"
    >
      {pendingImages.map((img, index) => (
        <View key={index} style={{ width: 56, height: 56 }}>
          <Image source={{ uri: img.uri }} style={{ width: 56, height: 56, borderRadius: 12 }} />
          <TouchableOpacity
            onPress={() => { haptics.tap(); setPendingImages(prev => prev.filter((_, i) => i !== index)) }}
            style={{ position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' }}
          >
            <Svg width={10} height={10} viewBox="0 0 24 24">
              <Path d="M18 6L6 18M6 6l12 12" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" fill="none" />
            </Svg>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  )

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar style="dark" />

      {/* ── Cabeçalho: degradê rosado + voltar · logo NIKS · conversas + progresso ── */}
      <LinearGradient
        colors={['#FCEAF1', '#FDF3F7', '#FFFFFF']}
        locations={[0, 0.55, 1]}
        style={{ height: insets.top + 56, paddingTop: insets.top, zIndex: 4 }}
      >
        <View style={styles.bar}>
          <TouchableOpacity
            onPress={() => { haptics.tap(); router.navigate('/home' as any) }}
            activeOpacity={0.85}
            style={[styles.barBtn, { left: 14 }]}
            accessibilityLabel="Voltar"
          >
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <Path d="M15.5 4.5 8 12l7.5 7.5" fill="none" stroke={INK} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { haptics.tap(); loadHistory() }}
            activeOpacity={0.85}
            style={[styles.barBtn, { right: 14 }]}
            accessibilityLabel="Conversas anteriores"
          >
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <Path d="M3 12a9 9 0 1 0 2.64-6.36L3 8.3" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M3 3.5v4.8h4.8" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M12 7.5V12l3.2 1.9" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={styles.logoCircle}>
              <Image source={require('../../assets/home/score-logo-pink.png')} style={{ width: 27, height: 27 }} resizeMode="contain" />
            </View>
            <Text style={styles.barTitle}>NIKS</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <Animated.View
            style={{
              height: 2, backgroundColor: PINK,
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }}
          />
        </View>
      </LinearGradient>

      {/* ANDROID: sem `behavior` — o KAV do RN trata o `keyboardDidHide` como mais
          uma mudança e, com edge-to-edge, calcula uma sobreposição falsa (status bar +
          navbar) ao fechar: a caixa ficava presa no meio. Aqui o recuo é nosso: altura
          do teclado + inset da navbar enquanto aberto, ZERO ao fechar (toque ou voltar).
          iOS: exatamente como antes. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={
          Platform.OS === 'android'
            ? { flex: 1, paddingBottom: keyboardOpen ? androidKbHeight.current + insets.bottom : 0 }
            : { flex: 1 }
        }
      >
        {/* ── Conversa ───────────────────────────────────────────────────── */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 21, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <Text style={styles.dayLabel}>{dayLabel}</Text>
          {rows.map((r, i) => (
            <FadeIn key={r.key} enabled={(introAnimated && !done && (r.key === 'hi' || r.key === 'help' || r.key === 'about')) || ('anim' in r && !!r.anim)}>
            {renderRow(r, i)}
            </FadeIn>
          ))}
        </ScrollView>

        {/* ── 39a: folha com as opções + "Ou escreva sua pergunta" + Enviar ── */}
        {!done && (
          <Animated.View
            pointerEvents={introShown < 3 ? 'none' : 'auto'}
            style={[styles.sheet, {
              paddingBottom: keyboardOpen ? 14 : insets.bottom,
              opacity: sheetAnim,
              transform: [{ translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
            }]}
          >
            {SUGS.map((q, i) => {
              const on = pick === i
              return (
                <TouchableOpacity
                  key={q}
                  activeOpacity={0.85}
                  onPress={() => { haptics.select(); setPick(i); setFreeText('') }}
                  style={[styles.opt, i > 0 && { borderTopWidth: 1, borderTopColor: HAIR }]}
                >
                  <View style={[styles.radio, on ? { borderWidth: 2, borderColor: PINK } : { borderWidth: 1.5, borderColor: '#A39A9F' }]}>
                    <View style={[styles.radioDot, { backgroundColor: on ? PINK : 'transparent' }]} />
                  </View>
                  <Text style={styles.optText} lineBreakStrategyIOS="push-out">{q}</Text>
                </TouchableOpacity>
              )
            })}
            <View style={{ paddingTop: 8, paddingHorizontal: 21, borderTopWidth: 1, borderTopColor: HAIR }}>
              {pendingStrip}
              <View style={[styles.freeField, freeText.trim() ? { borderWidth: 1.5, borderColor: PINK } : { borderWidth: 1, borderColor: FIELD_BD }]}>
                <TextInput
                  value={freeText}
                  onChangeText={(t) => { setFreeText(t); if (t) setPick(null) }}
                  placeholder="Ou escreva sua pergunta"
                  placeholderTextColor="#9A9497"
                  style={styles.input}
                />
                <TouchableOpacity onPress={choosePhotoSource} hitSlop={8} activeOpacity={0.85}>
                  <CameraIcon />
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ paddingTop: 14, paddingHorizontal: 21 }}>
              <TouchableOpacity
                activeOpacity={canSubmit ? 0.85 : 1}
                disabled={!canSubmit}
                onPress={handleSubmit}
                style={[styles.sendBtn, !canSubmit && { backgroundColor: '#FFD3E5', shadowOpacity: 0 }]}
              >
                <Text style={styles.sendText}>Enviar</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* ── 39b: campo "Pergunte à NIKS" + enviar ─────────────────────── */}
        {done && (
          <View style={[styles.composer, { paddingBottom: keyboardOpen ? 12 : 20 + insets.bottom }]}>
            {pendingStrip}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
              <View style={styles.composerField}>
                <TextInput
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Pergunte à NIKS"
                  placeholderTextColor="#9A9497"
                  multiline
                  style={[styles.input, { maxHeight: 96, paddingTop: 9, paddingBottom: 9 }]}
                />
                <TouchableOpacity onPress={choosePhotoSource} hitSlop={8} activeOpacity={0.85} style={{ marginBottom: 9 }}>
                  <CameraIcon />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={handleSend} activeOpacity={0.85} style={styles.composerSend}>
                <Svg width={18} height={18} viewBox="0 0 24 24">
                  <Path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ── Painel "Conversas" ─────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents={historyVisible ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, { zIndex: 7, backgroundColor: 'rgba(18,18,18,0.35)', opacity: drawer }]}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setHistoryVisible(false)} />
      </Animated.View>
      <Animated.View
        pointerEvents={historyVisible ? 'auto' : 'none'}
        style={[
          styles.drawer,
          { transform: [{ translateX: drawer.interpolate({ inputRange: [0, 1], outputRange: [340, 0] }) }] },
        ]}
      >
        <LinearGradient
          colors={['#FCEAF1', '#FFFFFF']}
          style={{ height: insets.top + 56, paddingTop: insets.top + 6, paddingLeft: 20, paddingRight: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={styles.drawerTitle}>Conversas</Text>
          <TouchableOpacity onPress={() => { haptics.tap(); setHistoryVisible(false) }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path d="M6 6l12 12M18 6 6 18" fill="none" stroke={INK} strokeWidth={1.9} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
        </LinearGradient>
        <View style={{ paddingTop: 8, paddingHorizontal: 18, paddingBottom: 12 }}>
          <TouchableOpacity onPress={() => { haptics.action(); startNewChat() }} activeOpacity={0.85} style={[styles.sendBtn, { height: 44, flexDirection: 'row', gap: 8 }]}>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M12 5v14M5 12h14" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
            </Svg>
            <Text style={styles.sendText}>Nova conversa</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
          {historyLoading ? (
            <Text style={[styles.histGroup, { textAlign: 'center' }]}>Carregando…</Text>
          ) : historyConversations.length === 0 ? (
            <Text style={[styles.histGroup, { textAlign: 'center' }]}>Nenhuma conversa ainda.</Text>
          ) : (
            <>
              {recentConvs.length > 0 && <Text style={styles.histGroup}>Esta semana</Text>}
              {recentConvs.map(renderHistItem)}
              {olderConvs.length > 0 && <Text style={styles.histGroup}>Anteriores</Text>}
              {olderConvs.map(renderHistItem)}
            </>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// Linha do banco → mensagem da tela (image_url pode ser URL única ou JSON de URLs).
function toMessage(msg: any): Message {
  let imageUris: string[] | undefined
  if (msg.image_url) {
    try {
      const parsed = JSON.parse(msg.image_url)
      imageUris = Array.isArray(parsed) ? parsed : [msg.image_url]
    } catch {
      imageUris = [msg.image_url]
    }
  }
  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    imageUris,
  }
}

const styles = StyleSheet.create({
  bar: { height: 54, alignItems: 'center', justifyContent: 'center' },
  barBtn: { position: 'absolute', top: 5, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  logoCircle: {
    width: 33, height: 33, borderRadius: 16.5, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: PINK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4,
  },
  barTitle: { fontSize: 18, fontWeight: '600', letterSpacing: -0.4, color: INK },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: HAIR },

  dayLabel: { marginTop: 22, textAlign: 'center', fontSize: 13, fontWeight: '600', letterSpacing: -0.1, color: MUTED },

  botBubble: {
    alignSelf: 'flex-start', maxWidth: 300,
    paddingVertical: 9, paddingHorizontal: 13,
    borderRadius: 20, backgroundColor: BUBBLE,
  },
  botText: { fontSize: 17, lineHeight: 24, letterSpacing: -0.35, color: INK },
  meBubble: {
    alignSelf: 'flex-end', maxWidth: 290,
    paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: 20, borderBottomRightRadius: 4, backgroundColor: PINK,
  },
  meText: { fontSize: 17, lineHeight: 24, letterSpacing: -0.35, color: '#FFFFFF' },
  photo: { width: 222, height: 207, borderRadius: 20 },

  card: {
    paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14,
    borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E0E3',
  },
  cardTitle: { fontSize: 17, fontWeight: '600', lineHeight: 23, letterSpacing: -0.4, color: INK },
  aboutDot: { width: 6, height: 6, marginTop: 8, borderRadius: 3, backgroundColor: PINK },
  aboutText: { fontSize: 16, lineHeight: 22, letterSpacing: -0.3, color: '#3D3A3C' },
  moreText: { color: PINK_TEXT, fontSize: 17, fontWeight: '500', letterSpacing: -0.3 },

  typing: {
    alignSelf: 'flex-start', height: 42, paddingHorizontal: 15,
    borderRadius: 20, borderBottomLeftRadius: 4, backgroundColor: BUBBLE,
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },

  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 4,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.1, shadowRadius: 14,
    elevation: 10,
  },
  opt: {
    minHeight: 58, paddingVertical: 12, paddingLeft: 24, paddingRight: 21,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  radio: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  optText: { flex: 1, fontSize: 17, lineHeight: 22, letterSpacing: -0.35, color: INK },
  freeField: {
    height: 44, borderRadius: 100, backgroundColor: '#FFFFFF',
    flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 14, gap: 8,
  },
  input: { flex: 1, minWidth: 0, fontSize: 17, letterSpacing: -0.35, color: INK, paddingVertical: 0 },
  sendBtn: {
    height: 50, borderRadius: 100, backgroundColor: PINK,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  sendText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },

  composer: { backgroundColor: '#F6F2F4', paddingTop: 24, paddingLeft: 17, paddingRight: 14 },
  composerField: {
    flex: 1, minWidth: 0, minHeight: 40, borderRadius: 20, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: FIELD_BD,
    flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 16, paddingRight: 8, gap: 8,
  },
  composerSend: {
    width: 36, height: 36, marginBottom: 2, borderRadius: 18, backgroundColor: PINK,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: PINK, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6,
  },

  drawer: {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: 322, zIndex: 8,
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderBottomLeftRadius: 24,
    shadowColor: '#783C48', shadowOffset: { width: -10, height: 0 }, shadowOpacity: 0.14, shadowRadius: 15,
  },
  drawerTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.6, color: INK },
  histGroup: { paddingTop: 16, paddingHorizontal: 10, paddingBottom: 6, fontSize: 13, fontWeight: '600', letterSpacing: -0.1, color: MUTED },
  histItem: { paddingVertical: 11, paddingHorizontal: 10, borderRadius: 14, gap: 2 },
  histTitle: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: '500', letterSpacing: -0.35, color: INK },
  histWhen: { fontSize: 13, color: MUTED },
  histPrev: { fontSize: 15, lineHeight: 20, letterSpacing: -0.25, color: MUTED },
});
