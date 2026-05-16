/* global React */
const { useState, useEffect, useRef } = React;

// ─────────────────────────────────────────────────────────────
// MiniOrb — used for the welcome moment + small accents
// ─────────────────────────────────────────────────────────────
function MiniOrb({ size = 72 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', position: 'relative',
      background: 'radial-gradient(circle at 35% 30%, #FFEFE4 0%, #F9C9B6 30%, #E89178 70%, #C86651 100%)',
      boxShadow: '0 12px 28px rgba(232,145,120,0.30), 0 2px 6px rgba(232,145,120,0.18)',
    }}>
      <div style={{
        position: 'absolute', top: '12%', left: '22%', width: '34%', height: '22%',
        borderRadius: '50%', filter: 'blur(1.5px)',
        background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.65) 0%, transparent 70%)',
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Avatar — circular monogram "N" in italic serif
// ─────────────────────────────────────────────────────────────
function NiksAvatar({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: '#FFFFFF',
      border: '0.5px solid var(--niks-surface-hair)',
      boxShadow: '0 1px 3px rgba(43,39,36,0.06), inset 0 0 0 0.5px rgba(251,123,107,0.10)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* faint dawn wash, behind the N */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, rgba(255,239,228,0.7) 0%, rgba(249,201,182,0.35) 55%, transparent 100%)',
      }} />
      <span style={{
        position: 'relative',
        font: 'italic 500 ' + Math.round(size * 0.56) + 'px/1 var(--niks-display)',
        color: 'var(--niks-coral)',
        letterSpacing: '-0.5px',
        marginTop: -1,
      }}>N</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Chat header — NIKS smallcaps + history
// ─────────────────────────────────────────────────────────────
function ChatHeader({ onBack, onHistory }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 22px 14px', flexShrink: 0,
      borderBottom: '0.5px solid rgba(43,39,36,0.05)',
    }}>
      <button onClick={onBack} aria-label="voltar" style={{
        width: 30, height: 30, padding: 0, border: 0, background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        color: 'var(--niks-ink-soft)',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* tiny accent dot */}
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #FFEFE4 0%, #E89178 70%, #C86651 100%)',
        }} />
        <span style={{
          font: '600 11px/1 var(--niks-ui)',
          letterSpacing: '3.2px',
          textTransform: 'uppercase',
          color: 'var(--niks-ink)',
        }}>NIKS</span>
      </div>
      <button onClick={onHistory} aria-label="histórico" style={{
        width: 30, height: 30, padding: 0, border: 0, background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        color: 'var(--niks-ink-soft)',
      }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7"/>
          <path d="M3 4v5h5"/>
          <path d="M12 8v4l2.5 1.5"/>
        </svg>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Suggestion card — full-width, hair-bordered, with a thin
// line icon on the left and a coral chevron on the right.
// ─────────────────────────────────────────────────────────────
const SUGGESTION_ICONS = {
  spot: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/>
    </svg>
  ),
  product: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>
      <path d="M9 14.5c.6 1 1.6 1.5 2.7 1.5"/>
    </svg>
  ),
  mood: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M8.5 14c.8.9 2 1.5 3.5 1.5s2.7-.6 3.5-1.5"/>
      <circle cx="9" cy="10" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="15" cy="10" r="0.8" fill="currentColor" stroke="none"/>
    </svg>
  ),
  chart: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17l5-5 3.5 3.5L20 8"/>
      <path d="M15 8h5v5"/>
    </svg>
  ),
  alert: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l9.5 16.5a1 1 0 0 1-.87 1.5H3.37a1 1 0 0 1-.87-1.5L12 3z"/>
      <path d="M12 10v4.5"/>
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/>
    </svg>
  ),
};

function SuggestionRow({ icon, children, onClick, delay = 0 }) {
  return (
    <button onClick={onClick} className="niks-suggest" style={{ animationDelay: delay + 'ms' }}>
      <span className="niks-suggest-icon">{SUGGESTION_ICONS[icon]}</span>
      <span className="niks-suggest-text">{children}</span>
      <span className="niks-suggest-chev">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Message bubble + image bubble + streaming indicator
// ─────────────────────────────────────────────────────────────
function NiksBubble({ children, first = true, streaming = false }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', maxWidth: '82%' }}>
      <div style={{ width: 32, visibility: first ? 'visible' : 'hidden', flexShrink: 0 }}>
        {first && <MiniOrb size={32} />}
      </div>
      <div style={{
        background: '#FFFFFF',
        border: '0.5px solid var(--niks-coral)',
        borderRadius: '4px 18px 18px 18px',
        padding: '12px 16px 13px',
        boxShadow: '0 1px 2px rgba(251,123,107,0.06), 0 4px 14px rgba(251,123,107,0.08)',
        font: '400 15px/1.55 var(--niks-ui)',
        color: 'var(--niks-ink)',
        letterSpacing: '-0.1px',
      }}>
        {children}
        {streaming && <span className="niks-caret" aria-hidden="true" />}
      </div>
    </div>
  );
}

function UserBubble({ children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        maxWidth: '78%',
        background: 'var(--niks-coral)',
        color: '#FFFFFF',
        borderRadius: '18px 4px 18px 18px',
        padding: '11px 16px 12px',
        font: '400 15px/1.5 var(--niks-ui)',
        letterSpacing: '-0.1px',
        boxShadow: '0 6px 18px rgba(251,123,107,0.20), 0 1px 2px rgba(251,123,107,0.10)',
      }}>{children}</div>
    </div>
  );
}

function UserPhotoBubble() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        width: 168, height: 210, borderRadius: '20px 4px 20px 20px', overflow: 'hidden',
        position: 'relative',
        background: 'linear-gradient(155deg, #F4D8C2 0%, #E8B59A 45%, #C58A6F 100%)',
        boxShadow: '0 10px 26px rgba(168,90,107,0.25), 0 2px 6px rgba(43,39,36,0.06)',
        border: '0.5px solid rgba(251,123,107,0.20)',
      }}>
        {/* subtle face placeholder — abstract */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.5,
          background: 'radial-gradient(ellipse 60% 45% at 50% 38%, rgba(255,235,220,0.65), transparent 70%), radial-gradient(ellipse 22% 14% at 42% 55%, rgba(190,120,90,0.35), transparent 70%), radial-gradient(ellipse 22% 14% at 58% 55%, rgba(190,120,90,0.35), transparent 70%)' }} />
        <div style={{
          position: 'absolute', left: 12, top: 12,
          padding: '4px 9px', borderRadius: 100,
          background: 'rgba(255,255,255,0.92)',
          font: 'italic 500 10px/1 var(--niks-display)',
          color: 'var(--niks-coral)',
          letterSpacing: '0.2px',
        }}>foto · agora</div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', maxWidth: '82%' }}>
      <MiniOrb size={32} />
      <div style={{
        background: '#FFFFFF',
        border: '0.5px solid var(--niks-coral)',
        borderRadius: '4px 18px 18px 18px',
        padding: '14px 18px',
        boxShadow: '0 1px 2px rgba(251,123,107,0.06), 0 4px 14px rgba(251,123,107,0.08)',
        display: 'flex', gap: 5, alignItems: 'center',
      }}>
        <span className="niks-dot" style={{ animationDelay: '0ms' }} />
        <span className="niks-dot" style={{ animationDelay: '180ms' }} />
        <span className="niks-dot" style={{ animationDelay: '360ms' }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Chat input — camera + gallery icons, pill input, send button
// ─────────────────────────────────────────────────────────────
function ChatInput({ value = '', placeholder = 'pergunte algo…', filled = false }) {
  return (
    <div style={{
      padding: '12px 16px 22px',
      background: '#FFFFFF',
      borderTop: '0.5px solid rgba(43,39,36,0.05)',
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          flex: 1,
          display: 'flex', alignItems: 'center', gap: 4,
          background: '#FAFAF8',
          border: '0.5px solid var(--niks-surface-hair)',
          borderRadius: 100,
          padding: '8px 8px 8px 14px',
          minHeight: 44, boxSizing: 'border-box',
        }}>
          <button className="niks-icon-btn" aria-label="câmera">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8a2 2 0 0 1 2-2h2.5l1.5-2h4l1.5 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z"/>
              <circle cx="12" cy="13" r="3.5"/>
            </svg>
          </button>
          <button className="niks-icon-btn" aria-label="galeria">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/>
              <circle cx="9" cy="10" r="1.4"/>
              <path d="M4 17l5-5 4 4 3-3 4 4"/>
            </svg>
          </button>
          <div style={{
            flex: 1,
            font: filled ? '400 15px/1.3 var(--niks-ui)' : 'italic 400 15px/1.3 var(--niks-display)',
            color: filled ? 'var(--niks-ink)' : 'var(--niks-ink-whisper)',
            letterSpacing: filled ? '-0.1px' : '0',
            padding: '0 6px 0 8px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{filled ? value : placeholder}</div>
        </div>
        <button aria-label="enviar" style={{
          width: 44, height: 44, borderRadius: '50%',
          background: filled ? 'var(--niks-coral)' : 'rgba(251,123,107,0.92)',
          border: 0, cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 22px rgba(251,123,107,0.30), 0 1px 2px rgba(251,123,107,0.20)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h13M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

Object.assign(window, {
  MiniOrb, NiksAvatar, ChatHeader, SuggestionRow, SUGGESTION_ICONS,
  NiksBubble, UserBubble, UserPhotoBubble, TypingDots,
  ChatInput,
});
