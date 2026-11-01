// ─────────────────────────────────────────────────────────────────────────────
// Cartas de raspar — conteúdo das 4 cartas do protótipo 67a do Claude Design
// (projeto "NIKS home redesign", NiksCartas.dc.html: CFG e TYPES). Por enquanto são
// os textos do design, fixos; depois viram um banco de cartas (vários tipos, surpresas
// e informações) e cada carta passa a vir do servidor.
// ─────────────────────────────────────────────────────────────────────────────

export type CartaTipo = 'sos' | 'dia' | 'surpresa' | 'idade';

export type RecIcon = 'sparkles' | 'ban' | 'clock' | 'sun' | 'moon' | 'droplet' | 'shield' | 'umbrella' | 'calendar' | 'trend';

export type Carta = {
  label: string;          // etiqueta rosa (topo da tela e da carta)
  when: string;           // canto direito da carta
  headline: string;       // frase da curiosidade, acima da carta
  timer?: boolean;        // pílula "some em …" (carta surpresa)
  kind: 'meter' | 'count' | 'roll';
  title?: string; level?: string;               // meter
  prefix?: string; suffix?: string; to?: number; // count (e o número novo do roll)
  from?: number;                                 // roll
  text?: string;
  chip: string;           // pílula rosa embaixo do número
  foot: string;           // rodapé da carta
  holo: number;           // intensidade do reflexo perolado
  recTitle: string;
  recs: { i: RecIcon; t: string; d: string }[];
};

export const CARTAS: Record<CartaTipo, Carta> = {
  sos: {
    label: 'SOS espinha', when: 'Agora', headline: 'Raspe para ver o que sua foto revelou', kind: 'meter',
    title: 'Espinha inflamada', level: 'Nível moderado', chip: 'Aja hoje', foot: 'Análise da sua foto de agora', holo: 1,
    recTitle: 'Pra cuidar dela hoje', recs: [
      { i: 'sparkles', t: 'O que fazer agora', d: 'Compressa fria por 5 minutos e ácido salicílico só no ponto.' },
      { i: 'ban', t: 'O que evitar', d: 'Não esprema. Isso espalha a inflamação e pode deixar marca.' },
      { i: 'clock', t: 'Quando melhora', d: 'Em 3 a 5 dias, se você mantiver a rotina.' },
    ],
  },
  dia: {
    label: 'Foto do dia', when: 'Hoje', headline: 'Sua pele contou um segredo hoje', kind: 'count', to: 12, suffix: '%',
    text: 'mais uniforme que na semana passada', chip: 'Sua pele está ótima hoje', foot: 'Análise da foto de hoje', holo: 1,
    recTitle: 'Pra manter assim', recs: [
      { i: 'sun', t: 'Vitamina C de manhã', d: 'É ela que ajuda a uniformizar o tom ao longo das semanas.' },
      { i: 'moon', t: 'Durma pelo menos 7 horas', d: 'A pele se renova enquanto você dorme.' },
      { i: 'droplet', t: 'Hidrate à noite', d: 'Um hidratante leve segura a água na pele até de manhã.' },
    ],
  },
  surpresa: {
    label: 'Carta surpresa', when: 'Agora', headline: 'Uma carta surpresa apareceu', timer: true, kind: 'count', prefix: 'UV', to: 11,
    text: 'em Salvador agora', chip: 'Reaplique o protetor', foot: 'Índice UV na sua cidade', holo: 1.15,
    recTitle: 'Pra sua pele no sol', recs: [
      { i: 'shield', t: 'Reaplique o protetor', d: 'FPS 30 ou mais, a cada 2 horas no sol.' },
      { i: 'umbrella', t: 'Prefira a sombra', d: 'O UV fica mais forte entre 10h e 15h.' },
    ],
  },
  idade: {
    label: 'Idade da pele', when: 'Semana 12', headline: 'Sua nova idade de pele chegou', kind: 'roll', from: 27, to: 26,
    text: 'anos', chip: '1 ano mais jovem', foot: 'Scan semanal', holo: 1.7,
    recTitle: 'O que te trouxe até aqui', recs: [
      { i: 'trend', t: 'Sua rotina noturna', d: 'Você fez 6 de 7 noites esta semana.' },
      { i: 'sparkles', t: 'Próximo passo', d: 'Adicione retinol 2 vezes na semana.' },
      { i: 'calendar', t: 'Próximo scan', d: 'Em 7 dias, no domingo.' },
    ],
  },
};

/** Ordem do "Continuar" do protótipo (A → B → C → D → A). */
export const ORDEM_CARTAS: CartaTipo[] = ['sos', 'dia', 'surpresa', 'idade'];

// Ícones das recomendações (lucide, traço branco 1,8 sobre o círculo rosa).
export const REC_ICONS: Record<RecIcon, string[]> = {
  sparkles: ['M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z', 'M20 3v4', 'M22 5h-4'],
  ban: ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z', 'm4.9 4.9 14.2 14.2'],
  clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z', 'M12 6v6l4 2'],
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8z', 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  droplet: ['M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z'],
  shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
  umbrella: ['M22 12a10.06 10.06 1 0 0-20 0Z', 'M12 12v8a2 2 0 0 0 4 0', 'M12 2v1'],
  calendar: ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M16 2v4M8 2v4M3 10h18'],
  trend: ['M16 17h6v-6', 'm22 17-8.5-8.5-5 5L2 7'],
};
