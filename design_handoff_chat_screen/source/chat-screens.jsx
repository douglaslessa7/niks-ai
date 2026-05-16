/* global React, Phone, StatusBarMini, MiniOrb, ChatHeader, SuggestionRow,
   NiksBubble, UserBubble, UserPhotoBubble, TypingDots, ChatInput */
const { useState, useEffect, useRef } = React;

// ─────────────────────────────────────────────────────────────
// EMPTY STATE — welcome moment + 5 suggestion cards
// ─────────────────────────────────────────────────────────────
function ChatEmptyScreen() {
  const suggestions = [
    { icon: 'spot',    text: 'Apareceu uma espinha no meu rosto, preciso de ajuda' },
    { icon: 'product', text: 'Esse produto vai funcionar pra mim?' },
    { icon: 'mood',    text: 'Não tô gostando da minha pele hoje, me ajuda a melhorar?' },
    { icon: 'chart',   text: 'Tô vendo resultado com meu protocolo?' },
    { icon: 'alert',   text: 'Minha pele reagiu a algo que usei' },
  ];

  return (
    <Phone>
      <StatusBarMini />
      <ChatHeader />
      <div style={{
        flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        background: '#FFFFFF',
      }}>
        {/* Welcome moment */}
        <div style={{
          padding: '36px 28px 22px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          textAlign: 'center',
        }}>
          <div className="niks-orb-breath" style={{ marginBottom: 22 }}>
            <MiniOrb size={68} />
          </div>
          <div className="niks-eyebrow-sm" style={{
            color: 'var(--niks-ink-soft)', marginBottom: 14, letterSpacing: '2.2px',
          }}>NIKS · SUA COACH DE PELE</div>
          <h1 style={{
            margin: 0,
            font: '400 38px/1.05 var(--niks-display)',
            color: 'var(--niks-coral)',
            letterSpacing: '-1.2px',
            textTransform: 'lowercase',
          }}>
            olá, <i style={{ fontWeight: 500 }}>juliana</i>.
          </h1>
          <p style={{
            margin: '10px 0 0',
            font: 'italic 400 17px/1.4 var(--niks-display)',
            color: 'var(--niks-ink-soft)',
            letterSpacing: '-0.15px',
            maxWidth: 260,
          }}>
            como posso te ajudar hoje?
          </p>
        </div>

        {/* Section eyebrow with ornamental rules */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 28px 16px',
        }}>
          <span style={{ flex: 1, height: 0.5, background: 'var(--niks-ink-hair)' }} />
          <span className="niks-eyebrow-sm" style={{ letterSpacing: '2.4px' }}>SUGESTÕES</span>
          <span style={{ flex: 1, height: 0.5, background: 'var(--niks-ink-hair)' }} />
        </div>

        {/* Suggestions list */}
        <div style={{
          flex: 1, overflow: 'auto',
          padding: '0 20px 12px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {suggestions.map((s, i) => (
            <SuggestionRow key={i} icon={s.icon} delay={i * 60}>{s.text}</SuggestionRow>
          ))}
        </div>

        <ChatInput />
      </div>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────
// ACTIVE STATE — message bubbles, streaming response
// ─────────────────────────────────────────────────────────────
function ChatActiveScreen() {
  // Streamed text — appears one chunk at a time, with a blinking caret.
  const FULL_TEXT =
    'Pelo que vejo, é uma lesão inflamatória leve — bem comum na linha do queixo no período pré-menstrual. Hoje à noite eu trocaria seu ácido pelo niacinamida e adicionaria uma compressa morna por 2 minutos antes do hidratante.';
  const [shown, setShown] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      if (i >= FULL_TEXT.length) {
        setShown(FULL_TEXT);
        clearInterval(id);
      } else {
        setShown(FULL_TEXT.slice(0, i));
      }
      // autoscroll
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 28);
    return () => clearInterval(id);
  }, []);

  // Loop the streaming — restart after a pause for the canvas
  useEffect(() => {
    if (shown === FULL_TEXT) {
      const t = setTimeout(() => setShown(''), 3200);
      return () => clearTimeout(t);
    }
  }, [shown]);

  const isStreaming = shown !== FULL_TEXT;

  return (
    <Phone>
      <StatusBarMini />
      <ChatHeader />
      <div ref={containerRef} style={{
        flex: 1, overflow: 'auto', background: '#FFFFFF',
        padding: '22px 18px 18px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Conversation timestamp */}
        <div style={{
          alignSelf: 'center',
          font: 'italic 400 12px/1 var(--niks-display)',
          color: 'var(--niks-ink-whisper)',
          letterSpacing: '0.2px',
          padding: '2px 0 6px',
        }}>hoje · 21:48</div>

        {/* Opening — NIKS */}
        <NiksBubble first={true}>
          olá, <span style={{ fontStyle: 'italic', fontFamily: 'var(--niks-display)' }}>juliana</span>. me conta o que está acontecendo com sua pele hoje.
        </NiksBubble>

        {/* User text */}
        <UserBubble>Apareceu uma espinha no meu rosto, preciso de ajuda</UserBubble>

        {/* NIKS asks for a photo */}
        <NiksBubble first={true}>
          sinto muito — isso incomoda mesmo. consegue me mandar uma foto da área? assim vejo se é inflamatória ou comedônica.
        </NiksBubble>

        {/* User sends a photo */}
        <UserPhotoBubble />

        {/* NIKS — streaming response (or typing dots while empty) */}
        {shown === '' ? (
          <TypingDots />
        ) : (
          <NiksBubble first={true} streaming={isStreaming}>
            {shown}
          </NiksBubble>
        )}
      </div>

      <ChatInput value="me explica o passo da compressa" filled={!isStreaming && shown === FULL_TEXT} />
    </Phone>
  );
}

Object.assign(window, { ChatEmptyScreen, ChatActiveScreen });
