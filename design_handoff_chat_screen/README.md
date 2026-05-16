# Handoff: NIKS AI — Chat Screen (Definitive Screens)

## Overview
This bundle hands off the two final, approved screens for the **NIKS AI Chat** — the conversational surface where a user talks to NIKS, a personalized AI skincare coach. The two screens are:

1. **Estado Inicial — Definitivo** (Empty / Welcome state): shown when the user opens a new conversation. Greeting + 5 tappable suggestion cards + composer.
2. **Conversa em Andamento — Definitiva** (Active state, with streaming): shown once messages are flowing. NIKS messages appear inside a coral-hairline "speech" container; the user replies in solid coral bubbles. NIKS streams responses one token at a time.

## About the Design Files
The files in this bundle are **design references created in HTML/React** — high-fidelity prototypes showing intended look and behavior, **not production code to copy directly**. The task is to **recreate these designs in the target codebase's existing environment** (e.g., React Native, SwiftUI, Flutter, etc.) using its established patterns and component libraries. If no environment exists yet, choose the framework most appropriate to the platform you're building for and implement the screens there using the design tokens documented below.

## Fidelity
**High-fidelity (hifi).** Pixel-perfect mockups with final colors, typography, spacing, animations, and interactions. Recreate the UI pixel-perfectly. Every measurement, hex, weight, and easing in this README has been finalized.

---

## Design System Foundations

### Type families
| Token | Value | Use |
|---|---|---|
| `--niks-display` | `"Playfair Display", "Times New Roman", Georgia, serif` | All display + headline + body-as-quote (NIKS speaks in serif) |
| `--niks-ui` | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif` | UI labels, eyebrows, suggestion-card text, status bar |

### Color tokens (only these are used in the two screens)
| Token | Hex / value | Use |
|---|---|---|
| `--niks-coral` | `#FB7B6B` | Primary accent — send button, suggestion icon, user bubble bg, NIKS bubble border, caret, italicized emphasis |
| `--niks-coral-tint` | `rgba(251, 123, 107, 0.06)` | Suggestion icon disc background |
| `--niks-ink` | `#2B2724` | Warm near-black — all primary text |
| `--niks-ink-soft` | `rgba(43, 39, 36, 0.55)` | Eyebrow, secondary text, header icons |
| `--niks-ink-whisper` | `rgba(43, 39, 36, 0.35)` | Tertiary text, input placeholder, timestamp |
| `--niks-ink-hair` | `rgba(43, 39, 36, 0.08)` | Ornamental rule lines |
| `--niks-surface-hair` | `rgba(43, 39, 36, 0.06)` | Hairline borders on cards |
| `--niks-bg` / `--niks-surface` | `#FFFFFF` | Page bg (both screens are pure white) |

### Spacing (raw scale used in this feature)
4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 26 · 28 · 32 · 36 · 44

### Radii
| Token | Value | Use |
|---|---|---|
| Suggestion card | `18px` | All five suggestion cards |
| NIKS message bubble | `4px 18px 18px 18px` | Asymmetric — tight on the top-left "anchor" corner |
| User text bubble | `18px 4px 18px 18px` | Mirror — tight on the top-right corner |
| User photo bubble | `20px 4px 20px 20px` | Same asymmetry, larger radius |
| Input pill | `100px` (fully rounded) | Composer pill |
| Send button | `50%` (circle) | 44 × 44 |
| Suggestion icon disc | `50%` (circle) | 32 × 32 |
| Phone bezel | `52px` | iPhone frame outer corner |

### Shadows
| Use | Value |
|---|---|
| Suggestion card resting | `0 1px 2px rgba(43,39,36,0.02), 0 2px 14px rgba(43,39,36,0.04)` |
| Suggestion card hover | `0 6px 22px rgba(43,39,36,0.06)` |
| NIKS coral bubble | `0 1px 2px rgba(251,123,107,0.05), 0 6px 18px rgba(251,123,107,0.06)` |
| User coral bubble | `0 6px 18px rgba(251,123,107,0.20), 0 1px 2px rgba(251,123,107,0.10)` |
| User photo bubble | `0 10px 26px rgba(168,90,107,0.25), 0 2px 6px rgba(43,39,36,0.06)` |
| Send button | `0 8px 22px rgba(251,123,107,0.30), 0 1px 2px rgba(251,123,107,0.20)` |
| Phone outer | `0 1px 0 rgba(255,255,255,0.6) inset, 0 0 0 1px rgba(43,39,36,0.10), 0 40px 80px rgba(43,39,36,0.18), 0 12px 32px rgba(43,39,36,0.08)` |

### Typography styles used
| Role | Spec |
|---|---|
| Header wordmark "NIKS" | `niks-ui` · 600 · 11px · `letter-spacing: 3.2px` · uppercase · color `--niks-ink` |
| Welcome eyebrow "NIKS · SUA COACH DE PELE" | `niks-ui` · 600 · 9px · `letter-spacing: 2.2px` · uppercase · color `--niks-ink-soft` |
| Greeting "olá, *juliana*." | `niks-display` · 400 · 38px · `line-height: 1.05` · `letter-spacing: -1.2px` · `text-transform: lowercase` · color `--niks-coral` · `juliana` runs italic, weight 500 |
| Greeting tagline "como posso te ajudar hoje?" | `niks-display` · italic 400 · 17px · `line-height: 1.4` · `letter-spacing: -0.15px` · color `--niks-ink-soft` · `max-width: 260px` |
| Sugestões divider label | `niks-ui` · 600 · 9px · `letter-spacing: 2.4px` · uppercase · color `--niks-ink-soft` |
| Suggestion card text | `niks-ui` · 400 · 14px · `line-height: 1.4` · `letter-spacing: -0.1px` · color `--niks-ink` |
| Timestamp "hoje · 21:48" | `niks-display` · italic 400 · 12px · `letter-spacing: 0.2px` · color `--niks-ink-whisper` |
| NIKS message body | `niks-ui` · 400 · 15px · `line-height: 1.55` · `letter-spacing: -0.1px` · color `--niks-ink` |
| User text bubble | `niks-ui` · 400 · 15px · `line-height: 1.5` · `letter-spacing: -0.1px` · color `#FFFFFF` on coral |
| Input placeholder | `niks-display` · italic 400 · 15px · `line-height: 1.3` · color `--niks-ink-whisper` |

---

## Screen 1 — Estado Inicial (Definitivo)

### Purpose
First-open / new-conversation state. Welcomes the user by name and offers 5 tappable starting prompts. Composer is visible and ready.

### Layout (top → bottom, single column, full width 390px)

1. **iPhone status bar (mini)** — height 54px, top padding 18px, side padding 30px.
2. **Chat header** — 6px top padding, 22px side padding, 14px bottom padding. 0.5px bottom border `rgba(43,39,36,0.05)`. Three columns:
   - **Left:** back chevron icon (20×20, stroke 1.5, color `--niks-ink-soft`), in a 30×30 transparent button.
   - **Center:** a tiny 6×6 coral dawn-gradient dot + 8px gap + "NIKS" wordmark.
   - **Right:** history (clock-rewind) icon, 19×19, stroke 1.5, color `--niks-ink-soft`.
3. **Welcome hero** — padding `36px 28px 22px`, content centered (`text-align: center`, `align-items: center`). Children:
   - **Orb (MiniOrb)** — 68×68 circle with radial gradient (see Components → Orb). Wrapped in a 4.8s ease-in-out "breath" animation: scale 1 → 1.04 → 1. Margin-bottom 22px.
   - **Eyebrow** "NIKS · SUA COACH DE PELE". Margin-bottom 14px.
   - **Greeting heading** "olá, *juliana*." (margin 0). `juliana` is italic.
   - **Tagline** "como posso te ajudar hoje?" (margin-top 10px, max-width 260px).
4. **Ornamental "SUGESTÕES" divider** — padding `10px 28px 16px`. A flex row, gap 12px: left rule (`flex: 1; height: 0.5px; background: --niks-ink-hair`) · centered eyebrow · right rule (same).
5. **Suggestion list** — padding `0 20px 12px`, flex column, gap 10px. Five `SuggestionRow` cards, each animating in with a 60ms cascade (see Animations).
6. **Composer / Input bar** — see Composer component.

### Suggestion cards (in this exact order)
| # | Icon | Text |
|---|---|---|
| 1 | `spot` — circle outline + inner filled circle | `Apareceu uma espinha no meu rosto, preciso de ajuda` |
| 2 | `product` — droplet outline + curve | `Esse produto vai funcionar pra mim?` |
| 3 | `mood` — face outline with smile + dots | `Não tô gostando da minha pele hoje, me ajuda a melhorar?` |
| 4 | `chart` — rising bar/line arrow | `Tô vendo resultado com meu protocolo?` |
| 5 | `alert` — triangle outline with exclamation | `Minha pele reagiu a algo que usei` |

Each card is structured as a `<button>` with three slots: **icon disc** (left, 32×32 circle, bg `--niks-coral-tint`, icon stroke `--niks-coral`, stroke-width 1.4, 18×18 viewBox) · **text** (flex 1) · **chevron** (right, 14×14, color `--niks-ink-whisper`, stroke-width 1.6).

- **Card container:** white bg, 0.5px border `--niks-surface-hair`, radius 18px, padding `14px 14px 14px 16px`, gap 14px between slots.
- **Hover state:** bg `rgba(251,123,107,0.025)`, border `rgba(251,123,107,0.22)`, transform `translateY(-1px)`, hover shadow.
- **Active (press):** transform `translateY(0)`, bg `rgba(251,123,107,0.04)`.
- **Transition:** `transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease, background 200ms ease`.

---

## Screen 2 — Conversa em Andamento (Definitiva)

### Purpose
Once a conversation has started. Shows the back-and-forth between NIKS (left side, coral-hairline bubble with the orb as avatar in some moments) and the user (right side, solid coral bubble). NIKS streams responses one character at a time. The user can also send a photo of their skin.

### Layout (top → bottom)

1. **Status bar mini** — same as Screen 1.
2. **Chat header** — identical to Screen 1.
3. **Message thread** — flex column, gap 20px, padding `16px 22px 18px`, scrollable, background `#FFFFFF`. Auto-scrolls to bottom as new content streams.
4. **Composer** — same as Screen 1.

### Thread contents in the mock (top → bottom)

1. **Timestamp** "hoje · 21:48" (centered, italic serif).
2. **NIKS message** (coral hairline bubble): "Olá, *juliana*. Me conta o que está acontecendo com sua pele hoje." — `juliana` is italic and colored `--niks-coral`.
3. **User text bubble:** "Apareceu uma espinha no meu rosto, preciso de ajuda"
4. **NIKS message** (coral hairline bubble): "Sinto muito — isso incomoda mesmo. Consegue me mandar uma foto da área? Assim vejo se é *inflamatória* ou *comedônica*." — the two italicized words are coral.
5. **User photo bubble** — 168 × 210, asymmetric corner `20px 4px 20px 20px`, content is a stand-in skin photo (placeholder gradient + abstract face wash); top-left badge "foto · agora".
6. **NIKS streaming message** (coral hairline bubble + blinking caret): "Pelo que vejo, é uma lesão inflamatória leve — bem comum na linha do queixo no período pré-menstrual. Hoje à noite trocaria seu ácido pelo niacinamida e adicionaria uma compressa morna por 2 minutos antes do hidratante." — types in at ~2 chars / 28ms.

When the streaming message hasn't started yet (the typing-indicator moment, optional), show the **typing dots** variant: 3 coral-tinted dots inside a coral-hairline bubble, with the **MiniOrb (32px)** as the avatar to the left.

---

## Components

### `Phone`
iPhone-style frame, 390 × 844, radius 52, white bg. Dynamic island (122 × 35, radius 22) at top center. Home indicator (134 × 5, radius 100, `rgba(43,39,36,0.30)`) at bottom center. **Source:** `source/phone.jsx`.

### `StatusBarMini`
54px tall. Left: time "9:41" in SF Pro 16px / weight 600 / letter-spacing -0.3px. Right: signal bars (17×11) + battery (24×12). All glyphs color `--niks-ink` (black on white). **Source:** `source/phone.jsx`.

### `ChatHeader`
See Screen 1 layout. Center group: 6×6 coral dot (radial-gradient `#FFEFE4 → #E89178 70% → #C86651 100%`) + 8px gap + "NIKS" wordmark. **Source:** `source/chat-components.jsx`.

### `MiniOrb`
The dawn orb — coral radial gradient sphere with a soft highlight. Sizes used: **68px** (Empty hero), **32px** (avatar inside thread typing-dots state). 

Recipe (size `S`):
- Wrapper: `S × S`, `border-radius: 50%`, position relative.
- Background: `radial-gradient(circle at 35% 30%, #FFEFE4 0%, #F9C9B6 30%, #E89178 70%, #C86651 100%)`.
- Shadow: `0 12px 28px rgba(232,145,120,0.30), 0 2px 6px rgba(232,145,120,0.18)`.
- Highlight (absolute child): `top 12%, left 22%, width 34%, height 20%`, blur 1.5px, `border-radius: 50%`, bg `radial-gradient(ellipse at center, rgba(255,255,255,0.65) 0%, transparent 70%)`.

**Source:** `source/chat-components.jsx` (`MiniOrb` function).

### `SuggestionRow` (V1 — used in Empty state)
Full-width horizontal card. See Screen 1 → "Suggestion cards" above. **Source:** `source/chat-components.jsx`.

### NIKS message — Coral Hairline Bubble (V2.3 variant)
Container around NIKS-side text. White inside, coral hairline outline.

```css
background: #FFFFFF;
border: 0.5px solid #FB7B6B;            /* --niks-coral */
border-radius: 4px 18px 18px 18px;       /* asymmetric — tight top-left */
padding: 14px 18px 15px;
box-shadow:
  0 1px 2px rgba(251,123,107,0.05),
  0 6px 18px rgba(251,123,107,0.06);
```

**Body text inside:** `niks-ui · 400 · 15px / 1.55 · letter-spacing -0.1px · color --niks-ink`. Italicized inline runs (`<i>` or `<em>`) take color `--niks-coral` and font-style italic.

**Max width:** `94%` of the thread column.

**Source:** `niks-ai-bubble-v23` class in `source/chat-v2.css`; component rendered by `AIMessageV2` (with `variant="bubble"` and `showActions={false}`) in `source/chat-screens-v2.jsx`.

### `UserBubble` (user text reply)
```css
max-width: 78%;
background: #FB7B6B;                      /* --niks-coral */
color: #FFFFFF;
border-radius: 18px 4px 18px 18px;        /* asymmetric — tight top-right */
padding: 11px 16px 12px;
font: 400 15px/1.5 --niks-ui;
letter-spacing: -0.1px;
box-shadow: 0 6px 18px rgba(251,123,107,0.20), 0 1px 2px rgba(251,123,107,0.10);
```

Right-aligned in its row. **Source:** `source/chat-components.jsx`.

### `UserPhotoBubble`
- Size 168 × 210, radius `20px 4px 20px 20px`, overflow hidden.
- Background (placeholder, replace with actual image in production): `linear-gradient(155deg, #F4D8C2 0%, #E8B59A 45%, #C58A6F 100%)` plus three radial overlays evoking a face wash (see source).
- Shadow: `0 10px 26px rgba(168,90,107,0.25), 0 2px 6px rgba(43,39,36,0.06)`.
- Border: `0.5px solid rgba(251,123,107,0.20)`.
- Inside top-left: a small pill badge `padding: 4px 9px`, radius 100, bg `rgba(255,255,255,0.92)`, label "foto · agora" in italic serif 10px coral.

**In production:** the gradient placeholder and abstract overlays exist only because we don't have a real photo at design time. In your implementation, this is just an `<img>` source from the user's camera/gallery, with the same wrapper styling (corner radius, border, shadow, optional badge).

**Source:** `source/chat-components.jsx`.

### Typing dots (`niks-dot`)
Three 6×6 coral-tinted dots (`rgba(251,123,107,0.55)`) inside an inline-flex row with 5px gaps. Each pulses: `scale(0.7) opacity(0.4) → scale(1.0) opacity(1.0) → scale(0.7) opacity(0.4)`, 1200ms ease-in-out infinite, with stagger delays `0ms · 180ms · 360ms`.

Shown inside the coral hairline bubble, with **MiniOrb (32px)** as the avatar to its left.

**Source:** `niks-dot` class in `source/chat.css`.

### Streaming caret (`niks-caret`)
Coral vertical bar, 2px × 1em, radius 1px, `margin-left: 3px`, `vertical-align: -2px`. Blinks: opacity 1 → 0 at 50% steps, 900ms infinite. Appended at the end of the NIKS text node while `streaming === true`.

**Source:** `niks-caret` class in `source/chat.css`.

### Composer / Chat input
Fixed at bottom of screen, padding `12px 16px 22px`, white bg, 0.5px top border `rgba(43,39,36,0.05)`. Layout: flex row, gap 10px, two children:

**Pill (flex: 1):**
- Bg `#FAFAF8`, 0.5px border `--niks-surface-hair`, radius 100, padding `8px 8px 8px 14px`, min-height 44.
- Inside (flex row, gap 4, items center):
  1. **Camera icon button** (32×32, transparent, color `--niks-ink-soft`; hover: bg `rgba(251,123,107,0.08)`, color `--niks-coral`). 20×20 SVG: camera body + central circle (lens).
  2. **Gallery icon button** (same shape). 20×20 SVG: rect + tiny circle + mountain-line path (classic gallery glyph).
  3. **Text/placeholder** (flex 1, padding `0 6px 0 8px`). Placeholder copy `"pergunte algo…"` in italic serif, color `--niks-ink-whisper`.

**Send button (right of pill):**
- 44 × 44 circle, bg `--niks-coral`, white SVG arrow (18×18, stroke 2), shadow as listed above. Always coral (no disabled style needed in mock; in production, dim when input is empty if desired).

**Source:** `ChatInput` in `source/chat-components.jsx`.

---

## Interactions & Behavior

### Animations
| Element | Trigger | Definition |
|---|---|---|
| Orb breath | Always on (Empty state hero) | `transform: scale()` 1 → 1.04 → 1; 4.8s ease-in-out infinite |
| Suggestion card cascade | On mount | Each row: `opacity 0 → 1`, `translateY(6px) → 0`. 480ms `cubic-bezier(0.2, 0.7, 0.2, 1)`. Stagger 60ms per row (row N delay = N × 60ms) |
| Suggestion card hover | Hover | `translateY(-1px)`, 200ms ease |
| Typing dots | Always on (while shown) | 1200ms ease-in-out infinite, stagger 0/180/360ms |
| Caret blink | While streaming | 900ms `steps(2, end)` infinite |
| Streaming text | Active state | Append 2 chars every 28ms |
| Auto-scroll | New content | Snap thread scroll to bottom on every streaming update |

### State
- **Empty screen** has no state — pure render. Tapping a suggestion should submit that text and transition to the Active screen.
- **Active screen** needs:
  - `messages: Message[]` — ordered list. Each `Message = { id, role: 'niks' | 'user', kind: 'text' | 'photo', content: string | imageRef, status: 'streaming' | 'done' }`.
  - `streamingMessageId: string | null` — which NIKS message is currently typing.
  - On a new NIKS message: insert with `status: 'streaming'`, advance content character-by-character, flip to `'done'` when complete.
  - On user send: append `{role: 'user', kind: 'text', status: 'done'}`. On camera/gallery send: append `{role: 'user', kind: 'photo'}`.
  - Auto-scroll thread to bottom on every messages change.

### Composer behavior
- **Camera icon** → open device camera (live capture). On capture, append a `photo` user message.
- **Gallery icon** → open device photo picker. On select, append a `photo` user message.
- **Text input** → submit on Enter (or Send tap). Disabled visually fine in mock; production behavior is your call.
- **Send button** → only meaningful when text is non-empty. In mock it's always full coral.

### Header buttons
- **Back chevron** → pop navigation.
- **History clock** → open a conversation-history sheet (out of scope here).

### Streaming UX details
- The blinking caret appears **only on the currently streaming NIKS message** and **only while** that message is in `streaming` state.
- When NIKS hasn't yet produced any tokens (the brief "thinking" window), show the **typing-dots variant** inside the coral hairline bubble, with a **MiniOrb (32px) as avatar** on the left of the bubble (this is the only moment in this screen where an avatar is shown beside a message).

---

## Files in this bundle

### `preview.html`
A standalone HTML file that renders the two definitive screens side by side using the source files in `source/`. Open it in a browser to see the live design (with animations + streaming). Useful as a reference but **not** the final implementation.

### `source/tokens.css`
The full design-system token sheet (colors, type, spacing, radii, shadows, semantic type classes). Drop-in starting point for porting tokens into your codebase.

### `source/chat.css`
Local styles specific to the chat surface: suggestion-row card, orb breath animation, icon-button hover, streaming caret, typing dots.

### `source/chat-v2.css`
Holds the **`.niks-ai-bubble-v23`** rule — the coral hairline bubble used around NIKS messages in the definitive Active screen.

### `source/phone.jsx`
The 390 × 844 iPhone frame component + `StatusBarMini`. Pure visual chrome — feel free to replace with your platform's actual frame.

### `source/chat-components.jsx`
All shared chat primitives: `MiniOrb`, `ChatHeader`, `SuggestionRow` (used by Empty), `NiksBubble` (legacy from V1 — not used in the definitive Active screen), `UserBubble`, `UserPhotoBubble`, `TypingDots`, `ChatInput`, and the `SUGGESTION_ICONS` map (the 5 thematic line icons).

### `source/chat-screens.jsx`
Contains `ChatEmptyScreen` — **this is the definitive Empty state**. Composes phone frame + status bar + header + welcome hero (orb + greeting + tagline) + "SUGESTÕES" divider + 5 SuggestionRow cards + ChatInput.

### `source/chat-screens-v2.jsx`
Contains multiple V2.x explorations; **only `ChatActiveScreenV23` is the definitive Active screen.** It uses `AIMessageV2` with `variant="bubble"` and `showActions={false}` — which renders the coral hairline bubble around NIKS messages and hides the copy/save action chips.

### What to ignore in `chat-screens-v2.jsx`
The other components in that file (`ChatEmptyScreenV2`, `ChatActiveScreenV2`, `ChatActiveScreenV22`) are alternate explorations that were rejected. Do not port them. They're kept in source only because `ChatActiveScreenV23` shares the `AIMessageV2` helper with them.

---

## Implementation Notes

- **Two iPhone-shape screens at 390 × 844** is the design viewport. In production, the screens should fill the available area on any iOS/Android device — the bezel is design chrome only.
- **The serif font (`Playfair Display`) is essential** to the brand voice. NIKS speaks in serif italics; the user replies in sans-serif. Don't substitute.
- **The orb is the only brand "character".** It appears (a) large in the Empty hero, and (b) at 32px as the NIKS avatar when the thinking/typing-dots indicator is showing. It does **not** appear next to finished NIKS messages — the coral hairline bubble alone identifies them as NIKS.
- **All screens use a pure white background.** No tints, no gradients on the page surface itself.
- **Color is restrained.** Only coral (`#FB7B6B`) and ink (`#2B2724`) are visible. Hairline borders carry most of the structure.
- **Hit-area minimums:** all icon buttons are 32×32 minimum tap; the send button is 44×44; suggestion cards are 62px tall minimum. Respect platform guidance for accessibility.
- **Streaming cadence (2 chars / 28ms)** is a design preference; the underlying engine in production will likely stream per-token, which is fine — just ensure the caret is visible at the live tail until the message is finished.

---

## Assets

There are **no static assets** in this bundle (no PNGs, no SVG files on disk). Everything visual is generated in code:
- All icons are inline SVG with `currentColor` strokes.
- The orb is a CSS radial-gradient sphere.
- The user photo bubble's "skin" is a CSS gradient placeholder that should be replaced with a real `<img>` in production.

The two custom fonts are loaded from Google Fonts in `source/tokens.css`:
- Playfair Display (italics 400/500/600/700)
- DM Serif Display

---

## Quick start checklist for the implementing engineer

1. Lift the tokens from `source/tokens.css` into your codebase's theming system. Map them to whatever variable system you already use (Tailwind theme, `:root` CSS vars, SwiftUI Color, etc.).
2. Load Playfair Display in your app (or substitute a comparable serif if you have a brand-approved one). Don't fall back to Times.
3. Build the `Orb`, `Header`, `SuggestionCard`, `NiksMessage`, `UserBubble`, `UserPhotoBubble`, `TypingDots`, and `ChatInput` primitives in your framework. Match the specs above one-to-one.
4. Compose Empty and Active screens as per the Layout sections.
5. Wire up streaming + photo capture + suggestion-tap → send flows.
6. Use `preview.html` as the visual ground truth while implementing.
