/* global React, Phone, StatusBarMini, MiniOrb,
   ChatHeader, ChatInput, UserBubble, UserPhotoBubble, SUGGESTION_ICONS */
const { useState: useStateV2, useEffect: useEffectV2, useRef: useRefV2 } = React;

// ─────────────────────────────────────────────────────────────
// V2 Suggestion card — same V1 typography & icons, supports
// `wide` for the full-width last card. Uses V1's `.niks-suggest`
// class plus the `.niks-suggest--wide` modifier so it inherits
// V1's hover/animation/visuals automatically.
// ─────────────────────────────────────────────────────────────
function SuggestionV2({ icon, children, delay = 0, wide = false }) {
  return (
    <button
      className={'niks-suggest' + (wide ? ' niks-suggest--wide' : '')}
      style={{ animationDelay: delay + 'ms' }}
    >
      <span className="niks-suggest-icon">{SUGGESTION_ICONS[icon]}</span>
      <span className="niks-suggest-text">{children}</span>
      <span className="niks-suggest-chev">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// V2 AI message — inline serif, no bubble, with MiniOrb avatar
// on the left aligned to the top of the text block, and small
// action chips below the message.
// ─────────────────────────────────────────────────────────────
function AIMessageV2({ children, streaming = false, showActions = true, showOrb = true, variant = 'plain' }) {
  // Variants:
  //   'plain'  — V2 default; just text on the canvas
  //   'bubble' — V2.3: featherlight coral hairline bubble
  //   'rule'   — V2.3b: editorial left rule, no enclosure
  const wrapClass =
    variant === 'bubble' ? 'niks-ai-msg-v2 niks-ai-bubble-v23' :
    variant === 'rule'   ? 'niks-ai-msg-v2 niks-ai-rule-v23' :
                           'niks-ai-msg-v2';
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '100%', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      {showOrb && (
        <div style={{ flexShrink: 0, paddingTop: 1 }}>
          <MiniOrb size={28} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={wrapClass}>
          {children}
          {streaming && <span className="niks-caret" aria-hidden="true" />}
        </div>
        {showActions && !streaming && (
          <div className="niks-ai-actions-v2">
            <button className="niks-action-v2" aria-label="copiar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="8" y="8" width="13" height="13" rx="2.5"/>
                <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
            <button className="niks-action-v2" aria-label="salvar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// V2 ESTADO INICIAL — white bg, orb + serif greeting, 2×2 + 1 grid
// ─────────────────────────────────────────────────────────────
function ChatEmptyScreenV2() {
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
        flex: 1, display: 'flex', flexDirection: 'column',
        background: '#FFFFFF', overflow: 'hidden',
      }}>
        {/* Hero greeting — orb beside serif text */}
        <div style={{
          padding: '46px 28px 30px',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
        }}>
          <div className="niks-orb-breath" style={{ flexShrink: 0 }}>
            <MiniOrb size={52} />
          </div>
          <div style={{
            flex: 1, minWidth: 0,
            font: '400 24px/1.2 var(--niks-display)',
            color: 'var(--niks-ink)',
            letterSpacing: '-0.5px',
          }}>
            Como vai sua pele, <i style={{ color: 'var(--niks-coral)' }}>juliana</i>?
          </div>
        </div>

        {/* Suggestions — 2-col grid; last card spans full width */}
        <div className="niks-suggest-grid" style={{
          flex: 1, overflow: 'auto',
          padding: '0 20px 14px',
        }}>
          {suggestions.map((s, i) => (
            <SuggestionV2
              key={i}
              icon={s.icon}
              delay={i * 70}
              wide={i === 4}
            >
              {s.text}
            </SuggestionV2>
          ))}
        </div>

        <ChatInput />
      </div>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────
// V2 CONVERSA EM ANDAMENTO — white bg, inline serif AI text,
// coral user bubbles, V1 input/header
// ─────────────────────────────────────────────────────────────
function ChatActiveScreenV2() {
  const FULL = 'Pelo que vejo, é uma lesão inflamatória leve — bem comum na linha do queixo no período pré-menstrual. Hoje à noite trocaria seu ácido pelo niacinamida e adicionaria uma compressa morna por 2 minutos antes do hidratante.';
  const [shown, setShown] = useStateV2('');
  const scrollRef = useRefV2(null);

  useEffectV2(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      if (i >= FULL.length) { setShown(FULL); clearInterval(id); }
      else setShown(FULL.slice(0, i));
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 28);
    return () => clearInterval(id);
  }, []);

  useEffectV2(() => {
    if (shown === FULL) {
      const t = setTimeout(() => setShown(''), 3400);
      return () => clearTimeout(t);
    }
  }, [shown]);

  const streaming = shown !== FULL;

  return (
    <Phone>
      <StatusBarMini />
      <ChatHeader />

      <div ref={scrollRef} style={{
        flex: 1, overflow: 'auto', background: '#FFFFFF',
        padding: '16px 22px 18px',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div className="niks-divider-v2">hoje · 21:48</div>

        <AIMessageV2>
          Olá, <i>juliana</i>. Me conta o que está acontecendo com sua pele hoje.
        </AIMessageV2>

        <UserBubble>Apareceu uma espinha no meu rosto, preciso de ajuda</UserBubble>

        <AIMessageV2>
          Sinto muito — isso incomoda mesmo. Consegue me mandar uma foto da área? Assim vejo se é <i>inflamatória</i> ou <i>comedônica</i>.
        </AIMessageV2>

        <UserPhotoBubble />

        {shown === '' ? (
          <AIMessageV2 showActions={false}>
            <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', verticalAlign: 'middle' }}>
              <span className="niks-dot" style={{ animationDelay: '0ms' }} />
              <span className="niks-dot" style={{ animationDelay: '180ms' }} />
              <span className="niks-dot" style={{ animationDelay: '360ms' }} />
            </span>
          </AIMessageV2>
        ) : (
          <AIMessageV2 streaming={streaming} showActions={!streaming}>
            {shown}
          </AIMessageV2>
        )}
      </div>

      <ChatInput />
    </Phone>
  );
}



// ─────────────────────────────────────────────────────────────
// V2.2 CONVERSA EM ANDAMENTO — same as V2, but the Orbe only
// appears beside the typing-dots indicator. Finished/streaming
// NIKS messages have no orb on the side.
// ─────────────────────────────────────────────────────────────
function ChatActiveScreenV22() {
  const FULL = 'Pelo que vejo, é uma lesão inflamatória leve — bem comum na linha do queixo no período pré-menstrual. Hoje à noite trocaria seu ácido pelo niacinamida e adicionaria uma compressa morna por 2 minutos antes do hidratante.';
  const [shown, setShown] = useStateV2('');
  const scrollRef = useRefV2(null);

  useEffectV2(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      if (i >= FULL.length) { setShown(FULL); clearInterval(id); }
      else setShown(FULL.slice(0, i));
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 28);
    return () => clearInterval(id);
  }, []);

  useEffectV2(() => {
    if (shown === FULL) {
      const t = setTimeout(() => setShown(''), 3400);
      return () => clearTimeout(t);
    }
  }, [shown]);

  const streaming = shown !== FULL;

  return (
    <Phone>
      <StatusBarMini />
      <ChatHeader />

      <div ref={scrollRef} style={{
        flex: 1, overflow: 'auto', background: '#FFFFFF',
        padding: '16px 22px 18px',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div className="niks-divider-v2">hoje · 21:48</div>

        <AIMessageV2 showOrb={false}>
          Olá, <i>juliana</i>. Me conta o que está acontecendo com sua pele hoje.
        </AIMessageV2>

        <UserBubble>Apareceu uma espinha no meu rosto, preciso de ajuda</UserBubble>

        <AIMessageV2 showOrb={false}>
          Sinto muito — isso incomoda mesmo. Consegue me mandar uma foto da área? Assim vejo se é <i>inflamatória</i> ou <i>comedônica</i>.
        </AIMessageV2>

        <UserPhotoBubble />

        {shown === '' ? (
          <AIMessageV2 showOrb={true} showActions={false}>
            <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', verticalAlign: 'middle' }}>
              <span className="niks-dot" style={{ animationDelay: '0ms' }} />
              <span className="niks-dot" style={{ animationDelay: '180ms' }} />
              <span className="niks-dot" style={{ animationDelay: '360ms' }} />
            </span>
          </AIMessageV2>
        ) : (
          <AIMessageV2 showOrb={false} streaming={streaming} showActions={!streaming}>
            {shown}
          </AIMessageV2>
        )}
      </div>

      <ChatInput />
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared streaming bed for V2.x screens.
// ─────────────────────────────────────────────────────────────
function useStreamingBedV2() {
  const FULL = 'Pelo que vejo, é uma lesão inflamatória leve — bem comum na linha do queixo no período pré-menstrual. Hoje à noite trocaria seu ácido pelo niacinamida e adicionaria uma compressa morna por 2 minutos antes do hidratante.';
  const [shown, setShown] = useStateV2('');
  const scrollRef = useRefV2(null);
  useEffectV2(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      if (i >= FULL.length) { setShown(FULL); clearInterval(id); }
      else setShown(FULL.slice(0, i));
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 28);
    return () => clearInterval(id);
  }, []);
  useEffectV2(() => {
    if (shown === FULL) {
      const t = setTimeout(() => setShown(''), 3400);
      return () => clearTimeout(t);
    }
  }, [shown]);
  return [shown, scrollRef, shown !== FULL, FULL];
}

// V2.3 — featherlight coral hairline bubble around NIKS text
function ChatActiveScreenV23() {
  const [shown, scrollRef, streaming] = useStreamingBedV2();
  return (
    <Phone>
      <StatusBarMini />
      <ChatHeader />
      <div ref={scrollRef} style={{
        flex: 1, overflow: 'auto', background: '#FFFFFF',
        padding: '16px 22px 18px',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div className="niks-divider-v2">hoje · 21:48</div>

        <AIMessageV2 variant="bubble" showActions={false}>
          Olá, <i>juliana</i>. Me conta o que está acontecendo com sua pele hoje.
        </AIMessageV2>

        <UserBubble>Apareceu uma espinha no meu rosto, preciso de ajuda</UserBubble>

        <AIMessageV2 variant="bubble" showActions={false}>
          Sinto muito — isso incomoda mesmo. Consegue me mandar uma foto da área? Assim vejo se é <i>inflamatória</i> ou <i>comedônica</i>.
        </AIMessageV2>

        <UserPhotoBubble />

        {shown === '' ? (
          <AIMessageV2 showActions={false}>
            <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', verticalAlign: 'middle' }}>
              <span className="niks-dot" style={{ animationDelay: '0ms' }} />
              <span className="niks-dot" style={{ animationDelay: '180ms' }} />
              <span className="niks-dot" style={{ animationDelay: '360ms' }} />
            </span>
          </AIMessageV2>
        ) : (
          <AIMessageV2 variant="bubble" streaming={streaming} showActions={false}>
            {shown}
          </AIMessageV2>
        )}
      </div>
      <ChatInput />
    </Phone>
  );
}

// V2.3b — editorial coral left rule (no enclosure)
function ChatActiveScreenV23b() {
  const [shown, scrollRef, streaming] = useStreamingBedV2();
  return (
    <Phone>
      <StatusBarMini />
      <ChatHeader />
      <div ref={scrollRef} style={{
        flex: 1, overflow: 'auto', background: '#FFFFFF',
        padding: '16px 22px 18px',
        display: 'flex', flexDirection: 'column', gap: 22,
      }}>
        <div className="niks-divider-v2">hoje · 21:48</div>

        <AIMessageV2 variant="rule">
          Olá, <i>juliana</i>. Me conta o que está acontecendo com sua pele hoje.
        </AIMessageV2>

        <UserBubble>Apareceu uma espinha no meu rosto, preciso de ajuda</UserBubble>

        <AIMessageV2 variant="rule">
          Sinto muito — isso incomoda mesmo. Consegue me mandar uma foto da área? Assim vejo se é <i>inflamatória</i> ou <i>comedônica</i>.
        </AIMessageV2>

        <UserPhotoBubble />

        {shown === '' ? (
          <AIMessageV2 showActions={false}>
            <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', verticalAlign: 'middle' }}>
              <span className="niks-dot" style={{ animationDelay: '0ms' }} />
              <span className="niks-dot" style={{ animationDelay: '180ms' }} />
              <span className="niks-dot" style={{ animationDelay: '360ms' }} />
            </span>
          </AIMessageV2>
        ) : (
          <AIMessageV2 variant="rule" streaming={streaming} showActions={!streaming}>
            {shown}
          </AIMessageV2>
        )}
      </div>
      <ChatInput />
    </Phone>
  );
}

Object.assign(window, {
  SuggestionV2, AIMessageV2,
  ChatEmptyScreenV2, ChatActiveScreenV2, ChatActiveScreenV22,
  ChatActiveScreenV23,
});
