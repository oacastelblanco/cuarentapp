import { useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient';

const PROFILE_KEY = 'cuarenta-profile';
const HISTORY_KEY = 'cuarenta-history';
const SAVED_GAME_KEY = 'cuarenta-saved-game';
const FRIENDS_KEY = 'cuarenta-friends';
const SENT_INVITES_KEY = 'cuarenta-sent-invites';
const RECEIVED_INVITES_KEY = 'cuarenta-received-invites';
const CARD_PLAY_SOUND = '/sounds/card-play.mp3';
const SPECIAL_PLAY_SOUND = '/sounds/te-caen.mp3';
const COMBO_PLAY_SOUND = '/sounds/caida-limpia.wav';
const DEAL_SOUND = '/sounds/deal.ogg';
const COUNT_TICK_SOUND = '/sounds/countdown-tick.wav';
const CARD_BACK_LOGO = '/images/card-back-logo-2.png';
const MAIN_MENU_LOGO = '/images/cuarenta-menu-logo.png';
const DEAL_SOUND_SPACING_MS = 290;
const STARTING_RATING = 1200;
const EMPTY_PROFILE = { username: '', name: '', city: '', email: '', photo: '', rating: STARTING_RATING, games: 0, wins: 0, losses: 0 };
const DIFFICULTIES = {
  beginner: { label: 'Principiante', description: 'El rival juega rapido y no siempre aprovecha capturas.', rating: 900 },
  intermediate: { label: 'Intermedio', description: 'El rival busca capturas y bonificaciones razonables.', rating: 1200 },
  expert: { label: 'Experto', description: 'El rival prioriza caida, limpia y manos con mas cartas.', rating: 1500 },
};
const ACCEPTED_FRIENDS = [
  { id: 'ana-quito', name: 'Ana Paredes', city: 'Quito', rating: 1320, acceptedAt: '2026-06-03T18:30:00.000Z', gamesTogether: 4, initials: 'AP' },
  { id: 'diego-cuenca', name: 'Diego Mora', city: 'Cuenca', rating: 1268, acceptedAt: '2026-06-05T21:10:00.000Z', gamesTogether: 2, initials: 'DM' },
  { id: 'maria-guayaquil', name: 'Maria Solis', city: 'Guayaquil', rating: 1185, acceptedAt: '2026-06-08T00:45:00.000Z', gamesTogether: 0, initials: 'MS' },
];
const RECEIVED_FRIEND_INVITES = [
  { id: 'invite-carlos-loja', name: 'Carlos Vega', city: 'Loja', rating: 1212, sentAt: '2026-06-08T16:20:00.000Z', initials: 'CV' },
  { id: 'invite-lucia-manta', name: 'Lucia Rivas', city: 'Manta', rating: 1164, sentAt: '2026-06-09T01:05:00.000Z', initials: 'LR' },
];

const SUITS = [
  { id: 'oros', icon: 'D', image: '/images/diamante.png', name: 'diamante' },
  { id: 'copas', icon: 'R', image: '/images/corazon.png', name: 'corazon rojo' },
  { id: 'espadas', icon: 'N', image: '/images/coraz%C3%B3n%20negro.png', name: 'corazon negro' },
  { id: 'bastos', icon: 'T', image: '/images/trebol.png', name: 'trebol' },
];
const RANKS = [
  { r: 'A', v: 1, label: 'A' },
  { r: '2', v: 2, label: '2' },
  { r: '3', v: 3, label: '3' },
  { r: '4', v: 4, label: '4' },
  { r: '5', v: 5, label: '5' },
  { r: '6', v: 6, label: '6' },
  { r: '7', v: 7, label: '7' },
  { r: 'J', v: 8, label: 'J' },
  { r: 'Q', v: 9, label: 'Q' },
  { r: 'K', v: 10, label: 'K' },
];
const rankOrder = RANKS.map((x) => x.r);
const uid = () => Math.random().toString(36).slice(2, 9);

function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function makeInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || '?') + (parts[1]?.[0] || '');
}

function profileDisplayName(profile) {
  return profile?.display_name || profile?.username || 'Jugador';
}

function mapFriendshipRow(row, currentUserId) {
  const profile = row.user_id === currentUserId ? row.friend : row.user;
  const name = profileDisplayName(profile);
  return {
    id: row.id,
    userId: profile?.id,
    name,
    city: profile?.city || '',
    rating: profile?.rating || STARTING_RATING,
    acceptedAt: row.accepted_at,
    gamesTogether: row.games_together || 0,
    initials: makeInitials(name).toUpperCase(),
  };
}

function mapInviteRow(row, direction = 'received') {
  const profile = direction === 'received' ? row.sender : row.receiver;
  const name = profileDisplayName(profile);
  return {
    id: row.id,
    userId: profile?.id,
    name,
    city: profile?.city || '',
    rating: profile?.rating || STARTING_RATING,
    sentAt: row.created_at,
    initials: makeInitials(name).toUpperCase(),
    status: row.status || 'pendiente',
  };
}

function roomStatusLabel(status) {
  if (status === 'waiting') return 'Esperando rival';
  if (status === 'playing') return 'Lista para jugar';
  if (status === 'finished') return 'Finalizada';
  return 'Cancelada';
}

function mapRoomPlayer(row) {
  const name = profileDisplayName(row.profile);
  return {
    id: row.id,
    userId: row.user_id,
    seat: row.seat,
    isReady: row.is_ready,
    joinedAt: row.joined_at,
    name,
    city: row.profile?.city || '',
    rating: row.profile?.rating || STARTING_RATING,
    initials: makeInitials(name).toUpperCase(),
  };
}

function buildOnlineActionAnimation(action) {
  const payload = action?.payload || {};
  const seat = Number(payload.seat);
  const card = payload.card;
  const capturedCards = payload.capturedCards || [];
  if (!seat || !card) return null;
  return {
    actor: seat,
    card,
    cardId: card.id,
    capturedCards,
    capturedIds: capturedCards.map((c) => c.id),
    summedIds: payload.summedIds || [],
    forfeitedIds: payload.forfeitedIds || [],
    kind: capturedCards.length ? 'capture' : 'place',
    stage: 'move',
    moveSoundType: payload.moveSoundType || 'normal',
  };
}

function normalizeProfile(profile) {
  return {
    ...EMPTY_PROFILE,
    ...profile,
    username: profile?.username || '',
    rating: Number.isFinite(profile?.rating) ? profile.rating : STARTING_RATING,
    games: Number.isFinite(profile?.games) ? profile.games : 0,
    wins: Number.isFinite(profile?.wins) ? profile.wins : 0,
    losses: Number.isFinite(profile?.losses) ? profile.losses : 0,
  };
}

function ratingTier(rating) {
  if (rating >= 1700) return 'Maestro';
  if (rating >= 1450) return 'Experto';
  if (rating >= 1250) return 'Avanzado';
  if (rating >= 1050) return 'Competidor';
  return 'Aprendiz';
}

function calculateRatingChange(playerRating, difficulty, didWin, gamesPlayed) {
  const opponentRating = DIFFICULTIES[difficulty]?.rating || DIFFICULTIES.intermediate.rating;
  const expected = 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
  const result = didWin ? 1 : 0;
  const kFactor = gamesPlayed < 10 ? 40 : 28;
  const rawDelta = Math.round(kFactor * (result - expected));
  const delta = didWin ? Math.max(1, rawDelta) : Math.min(-1, rawDelta);
  return {
    opponentRating,
    delta,
    nextRating: Math.max(100, playerRating + delta),
  };
}

function makeDeck() {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({
      id: `${rank.r}-${suit.id}-${uid()}`,
      rank: rank.r,
      value: rank.v,
      suit: suit.id,
      icon: suit.icon,
      image: suit.image,
      suitName: suit.name,
      label: rank.label,
    }))
  );
}

function shuffle(deck) {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function dealFive(state) {
  const deck = [...state.deck];
  const dealFrom = deck.length;
  const playerHand = deck.splice(0, 5);
  const cpuHand = deck.splice(0, 5);
  const dealTo = deck.length;
  const dealPulse = (state.dealPulse || 0) + 1;
  const logs = [...state.logs];
  const playerBonus = rondaBonus(playerHand, state.score.player);
  const cpuBonus = rondaBonus(cpuHand, state.score.cpu);
  let score = { ...state.score };
  if (playerBonus.instantWin) score.player = 40;
  if (cpuBonus.instantWin) score.cpu = 40;
  if (playerBonus.points) score.player = capScore(score.player + playerBonus.points);
  if (cpuBonus.points) score.cpu = capScore(score.cpu + cpuBonus.points);
  if (playerBonus.message) logs.unshift(playerBonus.message);
  if (cpuBonus.message) logs.unshift(`Rival: ${cpuBonus.message}`);
  return { ...state, deck, playerHand, cpuHand, score, logs, dealPulse, dealFrom, dealTo };
}

function rondaBonus(hand, currentScore) {
  const counts = hand.reduce((acc, c) => ({ ...acc, [c.rank]: (acc[c.rank] || 0) + 1 }), {});
  if (Object.values(counts).some((n) => n >= 4)) return { instantWin: true, message: 'Cuatro iguales. Chica ganada automaticamente.' };
  if (currentScore >= 30) return { points: 0, message: '' };
  if (Object.values(counts).some((n) => n === 3)) return { points: 4, message: 'Ronda: +4 puntos.' };
  return { points: 0, message: '' };
}

function capScore(n) {
  return Math.min(40, n);
}

function subsetCombos(cards, target) {
  const numeric = cards.filter((c) => c.value <= 7);
  const out = [];
  const walk = (start, picked, sum) => {
    if (sum === target && picked.length >= 2) out.push(picked);
    if (sum >= target) return;
    for (let i = start; i < numeric.length; i++) walk(i + 1, [...picked, numeric[i]], sum + numeric[i].value);
  };
  walk(0, [], 0);
  return out;
}

function appendSequence(base, table, played, preferredIds = new Set()) {
  const used = new Set(base.map((c) => c.id));
  const result = [...base];
  let idx = rankOrder.indexOf(played.rank) + 1;
  while (idx < rankOrder.length) {
    const candidates = table.filter((c) => !used.has(c.id) && c.rank === rankOrder[idx]);
    const next = candidates.find((c) => preferredIds.has(c.id)) || candidates[0];
    if (!next) break;
    result.push(next);
    used.add(next.id);
    idx += 1;
  }
  return result;
}

function uniqueOptions(options) {
  const seen = new Set();
  return options.filter((opt) => {
    const key = opt.map((c) => c.id).sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getBaseCaptureOptions(card, table) {
  const options = [];
  table.filter((t) => t.rank === card.rank).forEach((match) => {
    options.push([match]);
  });
  if (card.value <= 7) {
    subsetCombos(table, card.value).forEach((combo) => {
      options.push(combo);
    });
  }
  return uniqueOptions(options);
}

function getCaptureOptions(card, table) {
  const options = getBaseCaptureOptions(card, table).map((base) => appendSequence(base, table, card));
  return uniqueOptions(options).sort((a, b) => b.length - a.length);
}

function resolveManualCapture(card, table, selectedCards) {
  if (!selectedCards.length) return { ok: true, captured: [], forfeited: [], base: [] };
  const selectedIds = new Set(selectedCards.map((c) => c.id));

  for (const base of getBaseCaptureOptions(card, table)) {
    const baseIds = new Set(base.map((c) => c.id));
    if (!base.every((c) => selectedIds.has(c.id))) continue;

    const full = appendSequence(base, table, card, selectedIds);
    const fullIds = new Set(full.map((c) => c.id));
    if (selectedCards.some((c) => !fullIds.has(c.id))) continue;

    const extras = full.filter((c) => !baseIds.has(c.id));
    let prefixLength = 0;
    while (prefixLength < extras.length && selectedIds.has(extras[prefixLength].id)) {
      prefixLength += 1;
    }
    if (extras.slice(prefixLength).some((c) => selectedIds.has(c.id))) continue;

    return {
      ok: true,
      captured: [...base, ...extras.slice(0, prefixLength)],
      forfeited: extras.slice(prefixLength),
      base,
    };
  }

  return { ok: false, captured: [], forfeited: [], base: [] };
}

function getCaptureBase(card, table, capturedCards) {
  if (!capturedCards.length) return [];
  const capturedIds = new Set(capturedCards.map((c) => c.id));
  return getBaseCaptureOptions(card, table).find((base) => {
    if (!base.every((c) => capturedIds.has(c.id))) return false;
    const fullIds = new Set(appendSequence(base, table, card).map((c) => c.id));
    return capturedCards.every((c) => fullIds.has(c.id));
  }) || [];
}

function cartonBonus(count) {
  return count >= 20 ? count - 14 : 0;
}

function isCaidaCapture(last, actor, card, capturedCards) {
  return Boolean(
    last &&
    last.actor !== actor &&
    last.card.rank === card.rank &&
    capturedCards.some((c) => c.id === last.card.id)
  );
}

function applyMove(state, actor, card, capturedCards) {
  const isPlayer = actor === 'player';
  const handKey = isPlayer ? 'playerHand' : 'cpuHand';
  const capturedKey = isPlayer ? 'playerCaptured' : 'cpuCaptured';
  const newHand = state[handKey].filter((c) => c.id !== card.id);
  const removedIds = new Set(capturedCards.map((c) => c.id));
  const hadCapture = capturedCards.length > 0;
  const newTable = hadCapture
    ? state.table.filter((c) => !removedIds.has(c.id))
    : [...state.table, card];
  const last = state.lastPlayed;
  const caida = hadCapture && isCaidaCapture(last, actor, card, capturedCards);
  const limpia = hadCapture && newTable.length === 0;
  let bonus = 0;
  const current = state.score[actor];
  if (caida) bonus += 2;
  if (limpia && current !== 38) bonus += 2;
  let score = { ...state.score, [actor]: capScore(current + bonus) };
  let logs = [...state.logs];
  const captureText = hadCapture ? `capturo ${capturedCards.map(cardName).join(', ')}` : 'puso carta en mesa';
  const bonusText = [caida ? 'Caida +2' : '', limpia && current !== 38 ? 'Limpia +2' : ''].filter(Boolean).join(' / ');
  logs.unshift(`${isPlayer ? 'Tu' : 'Rival'} jugo ${cardName(card)} y ${captureText}${bonusText ? ` (${bonusText})` : ''}.`);
  return {
    ...state,
    [handKey]: newHand,
    [capturedKey]: hadCapture ? [...state[capturedKey], card, ...capturedCards] : state[capturedKey],
    table: newTable,
    score,
    logs,
    lastPlayed: hadCapture ? null : { actor, card },
    turn: isPlayer ? 'cpu' : 'player',
    pending: null,
    selectedCardId: null,
    selectedTableIds: [],
    message: '',
  };
}

function getMoveSoundType(state, actor, card, capturedCards) {
  if (!capturedCards.length) return 'normal';
  const last = state.lastPlayed;
  const caida = isCaidaCapture(last, actor, card, capturedCards);
  const removedIds = new Set(capturedCards.map((c) => c.id));
  const limpia = state.table.filter((c) => !removedIds.has(c.id)).length === 0;
  if (caida && limpia) return 'combo';
  if (caida) return 'caida';
  if (limpia) return 'limpia';
  return 'normal';
}

function getMoveToast(type) {
  if (type === 'combo') return 'Caida y limpia!';
  if (type === 'caida') return 'Caida!';
  if (type === 'limpia') return 'Limpia!';
  return '';
}

function maybeEndDeal(state) {
  if (state.playerHand.length || state.cpuHand.length) return state;
  if (state.deck.length >= 10) {
    return dealFive(state);
  }
  return {
    ...state,
    phase: 'countReady',
    turn: null,
    message: 'Se acabo la chica. Cuenta las cartas capturadas.',
  };
}

function seatKey(seat) {
  return seat === 1 ? 'p1' : 'p2';
}

function nextSeat(seat) {
  return seat === 1 ? 2 : 1;
}

function onlinePlayerLabel(state, seat) {
  if (!seat) return 'Rival';
  return state.playerNames?.[seat] || `Jugador ${seat}`;
}

function dealOnlineFive(state) {
  const deck = [...state.deck];
  const p1Hand = deck.splice(0, 5);
  const p2Hand = deck.splice(0, 5);
  const p1Bonus = rondaBonus(p1Hand, state.score.p1);
  const p2Bonus = rondaBonus(p2Hand, state.score.p2);
  let score = { ...state.score };
  const logs = [...state.logs];

  if (p1Bonus.instantWin) score.p1 = 40;
  if (p2Bonus.instantWin) score.p2 = 40;
  if (p1Bonus.points) score.p1 = capScore(score.p1 + p1Bonus.points);
  if (p2Bonus.points) score.p2 = capScore(score.p2 + p2Bonus.points);
  if (p1Bonus.message) logs.unshift(`${onlinePlayerLabel(state, 1)}: ${p1Bonus.message}`);
  if (p2Bonus.message) logs.unshift(`${onlinePlayerLabel(state, 2)}: ${p2Bonus.message}`);

  return { ...state, deck, p1Hand, p2Hand, score, logs };
}

function newOnlineGame(players) {
  const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat);
  const playerIds = {};
  const playerNames = {};
  sortedPlayers.forEach((player) => {
    playerIds[player.seat] = player.userId;
    playerNames[player.seat] = player.name;
  });

  const deck = shuffle(makeDeck());
  const base = {
    deck,
    p1Hand: [],
    p2Hand: [],
    table: [],
    p1Captured: [],
    p2Captured: [],
    score: { p1: 0, p2: 0 },
    turnSeat: 1,
    phase: 'playing',
    selectedTableIds: [],
    message: '',
    pending: null,
    lastPlayed: null,
    logs: ['Partida online iniciada.'],
    playerIds,
    playerNames,
    matchId: uid(),
  };
  return dealOnlineFive(base);
}

function onlineEndChica(state) {
  const p1Carton = cartonBonus(state.p1Captured.length);
  const p2Carton = cartonBonus(state.p2Captured.length);
  const score = {
    p1: capScore(state.score.p1 + p1Carton),
    p2: capScore(state.score.p2 + p2Carton),
  };
  const logs = [
    `Conteo: ${onlinePlayerLabel(state, 1)} +${p1Carton}, ${onlinePlayerLabel(state, 2)} +${p2Carton}.`,
    ...state.logs,
  ];

  if (score.p1 >= 40 || score.p2 >= 40) {
    const winnerSeat = score.p1 >= 40 ? 1 : 2;
    return {
      ...state,
      score,
      logs: [`${onlinePlayerLabel(state, winnerSeat)} gano la partida online.`, ...logs],
      phase: 'ended',
      turnSeat: null,
      message: 'Partida finalizada.',
    };
  }

  const deck = shuffle(makeDeck());
  return dealOnlineFive({
    ...state,
    deck,
    p1Hand: [],
    p2Hand: [],
    table: [],
    p1Captured: [],
    p2Captured: [],
    score,
    logs: ['Nueva chica online. Se conservan los puntos.', ...logs],
    turnSeat: nextSeat(state.turnSeat || 1),
    phase: 'playing',
    selectedTableIds: [],
    message: '',
    pending: null,
    lastPlayed: null,
  });
}

function maybeAdvanceOnlineDeal(state) {
  if (state.p1Hand.length || state.p2Hand.length) return state;
  if (state.deck.length >= 10) return dealOnlineFive(state);
  return onlineEndChica(state);
}

function applyOnlineMove(state, seat, card, capturedCards) {
  const key = seatKey(seat);
  const handKey = `${key}Hand`;
  const capturedKey = `${key}Captured`;
  const newHand = state[handKey].filter((c) => c.id !== card.id);
  const removedIds = new Set(capturedCards.map((c) => c.id));
  const hadCapture = capturedCards.length > 0;
  const newTable = hadCapture
    ? state.table.filter((c) => !removedIds.has(c.id))
    : [...state.table, card];
  const last = state.lastPlayed;
  const caida = hadCapture && isCaidaCapture(last, seat, card, capturedCards);
  const limpia = hadCapture && newTable.length === 0;
  let bonus = 0;
  const current = state.score[key];
  if (caida) bonus += 2;
  if (limpia && current !== 38) bonus += 2;
  const score = { ...state.score, [key]: capScore(current + bonus) };
  const captureText = hadCapture ? `capturo ${capturedCards.map(cardName).join(', ')}` : 'puso carta en mesa';
  const bonusText = [caida ? 'Caida +2' : '', limpia && current !== 38 ? 'Limpia +2' : ''].filter(Boolean).join(' / ');
  const logs = [
    `${onlinePlayerLabel(state, seat)} jugo ${cardName(card)} y ${captureText}${bonusText ? ` (${bonusText})` : ''}.`,
    ...state.logs,
  ];

  return maybeAdvanceOnlineDeal({
    ...state,
    [handKey]: newHand,
    [capturedKey]: hadCapture ? [...state[capturedKey], card, ...capturedCards] : state[capturedKey],
    table: newTable,
    score,
    logs,
    lastPlayed: hadCapture ? null : { actor: seat, card },
    turnSeat: nextSeat(seat),
    pending: null,
    selectedTableIds: [],
    message: '',
  });
}

function scoreCpuMove(state, card, opt, difficulty) {
  const last = state.lastPlayed;
  const caida = isCaidaCapture(last, 'cpu', card, opt);
  const limpia = opt.length === state.table.length;
  const baseScore = opt.length + (caida ? 4 : 0) + (limpia ? 3 : 0);
  if (difficulty === 'expert') {
    const sequenceScore = opt.filter((c) => rankOrder.indexOf(c.rank) > rankOrder.indexOf(card.rank)).length;
    return baseScore + (caida ? 4 : 0) + (limpia ? 4 : 0) + sequenceScore;
  }
  return baseScore;
}

function chooseCpuMove(state) {
  if (state.difficulty === 'beginner') {
    const shuffledHand = shuffle(state.cpuHand);
    for (const card of shuffledHand) {
      const options = getCaptureOptions(card, state.table);
      if (options.length && Math.random() > 0.45) return { card, captured: options[options.length - 1] };
    }
    return { card: shuffledHand[0], captured: [] };
  }

  let best = null;
  for (const card of state.cpuHand) {
    const options = getCaptureOptions(card, state.table);
    if (!options.length) continue;
    for (const opt of options) {
      const score = scoreCpuMove(state, card, opt, state.difficulty);
      if (!best || score > best.score) best = { card, opt, score };
    }
  }
  if (best) return { card: best.card, captured: best.opt };
  const safe = [...state.cpuHand].sort((a, b) => b.value - a.value)[0];
  return { card: safe, captured: [] };
}

function newGame(difficulty = 'intermediate') {
  const deck = shuffle(makeDeck());
  const base = {
    deck,
    playerHand: [],
    cpuHand: [],
    table: [],
    playerCaptured: [],
    cpuCaptured: [],
    score: { player: 0, cpu: 0 },
    turn: 'player',
    phase: 'playing',
    selectedCardId: null,
    selectedTableIds: [],
    message: '',
    animation: null,
    countAnimation: null,
    pending: null,
    logs: ['Nueva chica iniciada. Se reparten 5 cartas por jugador.'],
    lastPlayed: null,
    dealer: Math.random() > 0.5 ? 'player' : 'cpu',
    historySaved: false,
    matchId: uid(),
    difficulty,
    dealPulse: 0,
    dealFrom: deck.length,
    dealTo: deck.length,
  };
  return dealFive(base);
}

function nextChica(previous) {
  const deck = shuffle(makeDeck());
  const nextDealer = previous.dealer === 'player' ? 'cpu' : 'player';
  const base = {
    ...previous,
    deck,
    playerHand: [],
    cpuHand: [],
    table: [],
    playerCaptured: [],
    cpuCaptured: [],
    turn: 'player',
    phase: 'playing',
    selectedCardId: null,
    selectedTableIds: [],
    message: '',
    animation: null,
    countAnimation: null,
    pending: null,
    lastPlayed: null,
    dealer: nextDealer,
    logs: ['Nueva chica. Se conservan los puntos y se reparten 5 cartas.', ...previous.logs],
  };
  return dealFive(base);
}

function cardName(c) {
  return `${c.label}${c.icon}`;
}

function Card({ card, onClick, selected, disabled, back, motion, style }) {
  return (
    <button className={`card ${selected ? 'selected' : ''} ${back ? 'back' : ''} ${motion || ''}`} style={style} onClick={onClick} disabled={disabled}>
      {back ? <img className="card-back-logo" src={CARD_BACK_LOGO} alt="Cuarenta" /> : <><strong>{card.label}</strong><img className={`suit-logo ${card.suit === 'espadas' ? 'suit-logo-large' : ''}`} src={card.image} alt={card.suitName} /></>}
    </button>
  );
}

function fanStyle(index, count) {
  const offset = index - (count - 1) / 2;
  return {
    '--fan-offset': offset,
    '--fan-lift': Math.abs(offset),
  };
}

export default function App() {
  const [screen, setScreen] = useState('menu');
  const [selectedDifficulty, setSelectedDifficulty] = useState('intermediate');
  const [game, setGame] = useState(() => newGame('intermediate'));
  const [profile, setProfile] = useState(() => normalizeProfile(readStored(PROFILE_KEY, EMPTY_PROFILE)));
  const [profileDraft, setProfileDraft] = useState(() => normalizeProfile(readStored(PROFILE_KEY, EMPTY_PROFILE)));
  const [history, setHistory] = useState(() => readStored(HISTORY_KEY, []));
  const [savedGame, setSavedGame] = useState(() => readStored(SAVED_GAME_KEY, null));
  const [friends, setFriends] = useState(() => readStored(FRIENDS_KEY, ACCEPTED_FRIENDS));
  const [sentInvites, setSentInvites] = useState(() => readStored(SENT_INVITES_KEY, []));
  const [receivedInvites, setReceivedInvites] = useState(() => readStored(RECEIVED_INVITES_KEY, RECEIVED_FRIEND_INVITES));
  const [friendsView, setFriendsView] = useState('list');
  const [inviteName, setInviteName] = useState('');
  const [friendsMessage, setFriendsMessage] = useState('');
  const [supabaseUser, setSupabaseUser] = useState(null);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authDraft, setAuthDraft] = useState({ email: '', password: '', username: '', name: '', city: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [onlineRoom, setOnlineRoom] = useState(null);
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [onlineGameState, setOnlineGameState] = useState(null);
  const [onlineGameVersion, setOnlineGameVersion] = useState(0);
  const [onlineAnimation, setOnlineAnimation] = useState(null);
  const [onlineLastAction, setOnlineLastAction] = useState(null);
  const [onlineSelectedTableIds, setOnlineSelectedTableIds] = useState([]);
  const [onlineJoinCode, setOnlineJoinCode] = useState('');
  const [onlineMessage, setOnlineMessage] = useState('');
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({ sound: true, animations: true, hints: true });
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [bottomView, setBottomView] = useState('history');
  const [chatMessage, setChatMessage] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { id: 'welcome', author: 'Sistema', text: 'Chat listo para la partida.' },
  ]);
  const [deckCountDisplay, setDeckCountDisplay] = useState(game.dealFrom ?? game.deck.length);
  const [toast, setToast] = useState('');
  const cardSoundRef = useRef(null);
  const specialSoundRef = useRef(null);
  const comboSoundRef = useRef(null);
  const dealSoundRef = useRef(null);
  const countTickSoundRef = useRef(null);
  const dealSoundTimersRef = useRef([]);
  const toastTimerRef = useRef(null);
  const onlineMatchSoundRef = useRef(null);
  const onlineAnimatedActionRef = useRef(null);
  const onlineLocalAnimationUntilRef = useRef(null);
  const onlineGameVersionRef = useRef(onlineGameVersion);
  const supabaseUserRef = useRef(supabaseUser);
  const settingsRef = useRef(settings);
  onlineGameVersionRef.current = onlineGameVersion;
  supabaseUserRef.current = supabaseUser;
  settingsRef.current = settings;
  const selectedTableCards = useMemo(() => game.table.filter((c) => game.selectedTableIds.includes(c.id)), [game]);
  const isAnimating = Boolean(game.animation);
  const hasProfile = Boolean(profile.name.trim());
  const shouldShowProfileSummary = hasProfile && (!isSupabaseConfigured || Boolean(supabaseUser));
  const useSupabaseFriends = Boolean(isSupabaseConfigured && supabaseUser);

  useEffect(() => {
    cardSoundRef.current = new Audio(CARD_PLAY_SOUND);
    cardSoundRef.current.preload = 'auto';
    specialSoundRef.current = new Audio(SPECIAL_PLAY_SOUND);
    specialSoundRef.current.preload = 'auto';
    comboSoundRef.current = new Audio(COMBO_PLAY_SOUND);
    comboSoundRef.current.preload = 'auto';
    dealSoundRef.current = new Audio(DEAL_SOUND);
    dealSoundRef.current.preload = 'auto';
    countTickSoundRef.current = new Audio(COUNT_TICK_SOUND);
    countTickSoundRef.current.preload = 'auto';

    return () => {
      dealSoundTimersRef.current.forEach((timer) => clearTimeout(timer));
      dealSoundTimersRef.current = [];
      clearTimeout(toastTimerRef.current);
      cardSoundRef.current?.pause();
      cardSoundRef.current = null;
      specialSoundRef.current?.pause();
      specialSoundRef.current = null;
      comboSoundRef.current?.pause();
      comboSoundRef.current = null;
      dealSoundRef.current?.pause();
      dealSoundRef.current = null;
      countTickSoundRef.current?.pause();
      countTickSoundRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) setSupabaseUser(data.user || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseUser(session?.user || null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!useSupabaseFriends) return;
    loadSupabaseFriends();
  }, [useSupabaseFriends, supabaseUser?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabaseUser) return;
    loadSupabaseProfile();
  }, [supabaseUser?.id]);

  useEffect(() => {
    if (!supabase || !onlineRoom?.id) return undefined;
    const channel = supabase
      .channel(`live-room-${onlineRoom.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_rooms', filter: `id=eq.${onlineRoom.id}` }, () => {
        loadOnlineRoom(onlineRoom.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_room_players', filter: `room_id=eq.${onlineRoom.id}` }, () => {
        loadOnlineRoom(onlineRoom.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_game_state', filter: `room_id=eq.${onlineRoom.id}` }, () => {
        loadOnlineRoom(onlineRoom.id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_game_actions', filter: `room_id=eq.${onlineRoom.id}` }, () => {
        loadOnlineRoom(onlineRoom.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onlineRoom?.id]);

  useEffect(() => {
    if (!onlineRoom?.id || !supabaseUser) return undefined;
    if (screen !== 'online' && screen !== 'onlineGame') return undefined;

    loadOnlineRoom(onlineRoom.id);
    const timer = setInterval(() => {
      loadOnlineRoom(onlineRoom.id);
    }, onlineRoom.status === 'waiting' ? 1800 : 3500);

    return () => clearInterval(timer);
  }, [onlineRoom?.id, onlineRoom?.status, screen, supabaseUser?.id]);

  useEffect(() => {
    if (screen !== 'onlineGame' || !onlineGameState?.matchId) return;
    if (onlineMatchSoundRef.current === onlineGameState.matchId) return;
    onlineMatchSoundRef.current = onlineGameState.matchId;
    playDealSounds();
  }, [screen, onlineGameState?.matchId]);

  useEffect(() => {
    if (screen !== 'onlineGame' || !onlineLastAction || !onlineGameState || !supabaseUser) return;
    if (onlineLastAction.action_type === 'start') return;
    if (onlineLastAction.user_id === supabaseUser.id) return;
    if (onlineAnimatedActionRef.current === onlineLastAction.id) return;

    const animation = buildOnlineActionAnimation(onlineLastAction);
    if (!animation) return;

    onlineAnimatedActionRef.current = onlineLastAction.id;

    playMoveSound(animation.moveSoundType);
    showMoveToast(animation.moveSoundType);
    if (!settings.animations) return;
    setOnlineAnimation(animation);
    const timer = setTimeout(() => setOnlineAnimation(null), 760);
    return () => clearTimeout(timer);
  }, [screen, onlineLastAction?.id, onlineGameState?.matchId, supabaseUser?.id, settings.animations, settings.sound]);

  useEffect(() => {
    if (game.phase !== 'ended' || game.historySaved) return;
    const didWin = game.score.player >= game.score.cpu;
    const result = didWin ? 'Victoria' : 'Derrota';
    const rating = calculateRatingChange(profile.rating, game.difficulty, didWin, profile.games);
    const entry = {
      id: `${game.matchId}-${Date.now()}`,
      matchId: game.matchId,
      playerName: profile.name.trim() || 'Invitado',
      playedAt: new Date().toISOString(),
      result,
      difficulty: game.difficulty,
      playerScore: game.score.player,
      cpuScore: game.score.cpu,
      captured: game.playerCaptured.length,
      rivalCaptured: game.cpuCaptured.length,
      ratingBefore: profile.rating,
      ratingAfter: rating.nextRating,
      ratingDelta: rating.delta,
      opponentRating: rating.opponentRating,
    };
    const nextProfile = {
      ...profile,
      rating: rating.nextRating,
      games: profile.games + 1,
      wins: profile.wins + (didWin ? 1 : 0),
      losses: profile.losses + (didWin ? 0 : 1),
    };
    const nextHistory = [entry, ...history].slice(0, 12);
    setProfile(nextProfile);
    setProfileDraft(nextProfile);
    writeStored(PROFILE_KEY, nextProfile);
    syncSupabaseProfile(nextProfile);
    setHistory(nextHistory);
    writeStored(HISTORY_KEY, nextHistory);
    setGame((current) => current.matchId === game.matchId ? { ...current, historySaved: true } : current);
  }, [game, history, profile]);

  useEffect(() => {
    if (screen !== 'game') return undefined;
    const from = game.dealFrom ?? game.deck.length;
    const to = game.dealTo ?? game.deck.length;
    setDeckCountDisplay(from);
    if (from <= to) {
      setDeckCountDisplay(to);
      return undefined;
    }

    let timer;
    let next = from;
    timer = setInterval(() => {
      next -= 1;
      setDeckCountDisplay(next);
      if (next <= to) clearInterval(timer);
    }, 130);

    return () => {
      clearInterval(timer);
    };
  }, [screen, game.dealPulse, game.dealFrom, game.dealTo, game.deck.length]);

  useEffect(() => {
    if (screen !== 'game') return;
    const from = game.dealFrom ?? game.deck.length;
    const to = game.dealTo ?? game.deck.length;
    if (from <= to) return;

    playDealSounds();
  }, [screen, game.dealPulse]);

  function openDifficulty() {
    setScreen('difficulty');
  }

  function startGame(difficulty = selectedDifficulty) {
    setSelectedDifficulty(difficulty);
    const nextGame = newGame(difficulty);
    setGame(nextGame);
    setDeckCountDisplay(nextGame.dealFrom ?? nextGame.deck.length);
    setSettingsOpen(false);
    setScreen('game');
  }

  function saveCurrentGame() {
    const snapshot = {
      savedAt: new Date().toISOString(),
      game: {
        ...game,
        animation: null,
        countAnimation: null,
        dealFrom: game.deck.length,
        dealTo: game.deck.length,
      },
      chatMessages,
    };
    setSavedGame(snapshot);
    writeStored(SAVED_GAME_KEY, snapshot);
    setSettingsOpen(false);
    setBottomPanelOpen(false);
    setScreen('menu');
  }

  function resumeSavedGame() {
    if (!savedGame?.game) return;
    const resumed = {
      ...savedGame.game,
      animation: null,
      countAnimation: null,
      dealFrom: savedGame.game.deck.length,
      dealTo: savedGame.game.deck.length,
    };
    setSelectedDifficulty(resumed.difficulty || 'intermediate');
    setGame(resumed);
    setChatMessages(savedGame.chatMessages?.length ? savedGame.chatMessages : chatMessages);
    setDeckCountDisplay(resumed.deck.length);
    setSettingsOpen(false);
    setBottomPanelOpen(false);
    setScreen('game');
  }

  function openProfile() {
    if (!supabaseUser) {
      setAuthMode('login');
      setAuthMessage('');
      setScreen('auth');
      return;
    }
    setScreen('profile');
  }

  function openOnlineLobby() {
    if (!supabaseUser) {
      setAuthMode('login');
      setAuthMessage('Inicia sesion para jugar partidas online.');
      setScreen('auth');
      return;
    }
    setOnlineMessage('');
    setScreen('online');
  }

  function normalizeUsername(value) {
    const username = value.trim().toLocaleLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
    return username.length >= 3 ? username : 'jugador';
  }

  async function loadSupabaseProfile(user = supabaseUser) {
    if (!user || !supabase) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id,username,display_name,city,avatar_url,rating,games,wins,losses')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    const nextProfile = normalizeProfile({
      username: data?.username || '',
      name: data?.display_name || user.email?.split('@')[0] || '',
      city: data?.city || '',
      email: user.email || '',
      photo: data?.avatar_url || '',
      rating: data?.rating,
      games: data?.games,
      wins: data?.wins,
      losses: data?.losses,
    });
    setProfile(nextProfile);
    setProfileDraft(nextProfile);
    writeStored(PROFILE_KEY, nextProfile);
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (!supabase) {
      setAuthMessage('Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para iniciar sesion.');
      return;
    }

    setAuthLoading(true);
    setAuthMessage('');
    const email = authDraft.email.trim();
    const password = authDraft.password;

    if (authMode === 'register') {
      const username = normalizeUsername(authDraft.username || email.split('@')[0]);
      if (username.length < 3) {
        setAuthMessage('El nombre de usuario debe tener al menos 3 caracteres.');
        setAuthLoading(false);
        return;
      }

      const displayName = authDraft.name.trim() || username;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: displayName,
            name: displayName,
          },
        },
      });

      if (error) {
        setAuthMessage(error.message);
        setAuthLoading(false);
        return;
      }

      if (data.user) {
        setSupabaseUser(data.user);
        const nextProfile = normalizeProfile({
          username,
          name: displayName,
          city: authDraft.city.trim(),
          email,
          rating: STARTING_RATING,
        });
        setProfile(nextProfile);
        setProfileDraft(nextProfile);
        writeStored(PROFILE_KEY, nextProfile);
        if (data.session) await syncSupabaseProfile(nextProfile, data.user);
      }

      setAuthDraft({ email: '', password: '', username: '', name: '', city: '' });
      setAuthLoading(false);
      if (data.session) {
        setScreen('profile');
      } else {
        setAuthMessage('Revisa tu correo para confirmar la cuenta y luego inicia sesion.');
        setAuthMode('login');
      }
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthMessage(error.message);
      setAuthLoading(false);
      return;
    }

    setSupabaseUser(data.user || null);
    await loadSupabaseProfile(data.user);
    setAuthDraft({ email: '', password: '', username: '', name: '', city: '' });
    setAuthLoading(false);
    setScreen('profile');
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSupabaseUser(null);
    setOnlineRoom(null);
    setOnlinePlayers([]);
    setScreen('menu');
  }

  async function loadOnlineRoom(roomId) {
    if (!supabase || !roomId) return;
    const [roomResult, playersResult, stateResult, actionResult] = await Promise.all([
      supabase
        .from('live_rooms')
        .select('id,code,host_id,status,max_players,created_at,started_at,finished_at')
        .eq('id', roomId)
        .maybeSingle(),
      supabase
        .from('live_room_players')
        .select('id,room_id,user_id,seat,is_ready,joined_at,profile:profiles(id,username,display_name,city,rating)')
        .eq('room_id', roomId)
        .order('seat', { ascending: true }),
      supabase
        .from('live_game_state')
        .select('room_id,state,turn_user_id,version,updated_at')
        .eq('room_id', roomId)
        .maybeSingle(),
      supabase
        .from('live_game_actions')
        .select('id,room_id,user_id,action_type,payload,version,created_at')
        .eq('room_id', roomId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (roomResult.error || playersResult.error || stateResult.error || actionResult.error) {
      setOnlineMessage(roomResult.error?.message || playersResult.error?.message || stateResult.error?.message || actionResult.error?.message);
      return;
    }

    const nextState = stateResult.data?.state && Object.keys(stateResult.data.state).length ? stateResult.data.state : null;
    const nextAction = actionResult.data || null;
    const nextVersion = stateResult.data?.version || 0;
    const currentUserId = supabaseUserRef.current?.id;
    const currentVersion = onlineGameVersionRef.current;
    const animationsEnabled = settingsRef.current.animations;
    const localAnimationHold = onlineLocalAnimationUntilRef.current;
    const shouldHoldLocalState = Boolean(
      localAnimationHold &&
      localAnimationHold.roomId === roomId &&
      localAnimationHold.until > Date.now() &&
      nextAction?.user_id === currentUserId &&
      nextVersion > currentVersion
    );
    if (shouldHoldLocalState) {
      setOnlineRoom(roomResult.data || null);
      setOnlinePlayers((playersResult.data || []).map(mapRoomPlayer));
      setTimeout(() => loadOnlineRoom(roomId), localAnimationHold.until - Date.now() + 20);
      return;
    }

    const isNewRemoteVersion = Boolean(
      nextState &&
      nextVersion > currentVersion &&
      stateResult.data?.turn_user_id !== currentUserId
    );
    if (isNewRemoteVersion && nextVersion > 1 && nextAction?.version !== nextVersion) {
      setTimeout(() => loadOnlineRoom(roomId), 50);
      return;
    }

    if (
      nextAction &&
      nextAction.action_type !== 'start' &&
      nextAction.user_id !== currentUserId &&
      onlineAnimatedActionRef.current !== nextAction.id &&
      animationsEnabled
    ) {
      setOnlineAnimation(buildOnlineActionAnimation(nextAction));
    }

    setOnlineRoom(roomResult.data || null);
    setOnlinePlayers((playersResult.data || []).map(mapRoomPlayer));
    setOnlineGameState(nextState);
    setOnlineGameVersion(nextVersion);
    setOnlineLastAction(nextAction);
  }

  async function createOnlineRoom() {
    if (!supabase || !supabaseUser) {
      setOnlineMessage('Inicia sesion para crear una sala online.');
      return;
    }
    setOnlineLoading(true);
    setOnlineMessage('');
    await syncSupabaseProfile();
    const { data, error } = await supabase.rpc('create_live_room');
    if (error) {
      setOnlineMessage(error.message);
      setOnlineLoading(false);
      return;
    }

    const room = Array.isArray(data) ? data[0] : data;
    setOnlineRoom(room);
    await loadOnlineRoom(room.id);
    setOnlineLoading(false);
  }

  async function joinOnlineRoom(event) {
    event.preventDefault();
    if (!supabase || !supabaseUser) {
      setOnlineMessage('Inicia sesion para unirte a una sala online.');
      return;
    }
    const code = onlineJoinCode.trim().toLocaleUpperCase();
    if (!code) return;

    setOnlineLoading(true);
    setOnlineMessage('');
    await syncSupabaseProfile();
    const { data, error } = await supabase.rpc('join_live_room', { room_code: code });
    if (error) {
      setOnlineMessage(error.message);
      setOnlineLoading(false);
      return;
    }

    const room = Array.isArray(data) ? data[0] : data;
    setOnlineJoinCode('');
    setOnlineRoom(room);
    await loadOnlineRoom(room.id);
    setOnlineLoading(false);
  }

  function closeOnlineRoom() {
    setOnlineRoom(null);
    setOnlinePlayers([]);
    setOnlineGameState(null);
    setOnlineGameVersion(0);
    setOnlineSelectedTableIds([]);
    setOnlineMessage('');
  }

  async function startOnlineGame() {
    if (!supabase || !onlineRoom || onlinePlayers.length < 2) return;
    setOnlineLoading(true);
    setOnlineMessage('');
    const nextState = newOnlineGame(onlinePlayers);
    const firstTurnUserId = nextState.playerIds?.[nextState.turnSeat];
    const { error } = await supabase.rpc('start_live_game', {
      target_room_id: onlineRoom.id,
      initial_state: nextState,
      first_turn_user_id: firstTurnUserId,
    });

    if (error) {
      setOnlineMessage(error.message);
      setOnlineLoading(false);
      return;
    }

    setOnlineGameState(nextState);
    setOnlineSelectedTableIds([]);
    await loadOnlineRoom(onlineRoom.id);
    setScreen('onlineGame');
    setOnlineLoading(false);
  }

  async function submitOnlineMove(card) {
    if (!supabase || !onlineRoom || !onlineGameState || !supabaseUser) return;
    const mySeat = Number(Object.entries(onlineGameState.playerIds || {}).find(([, id]) => id === supabaseUser.id)?.[0]);
    if (!mySeat || onlineGameState.turnSeat !== mySeat || onlineGameState.phase !== 'playing') return;

    const selectedCards = onlineGameState.table.filter((c) => onlineSelectedTableIds.includes(c.id));
    const result = resolveManualCapture(card, onlineGameState.table, selectedCards);
    if (!result.ok) {
      setOnlineMessage(`Esa captura no es valida con ${cardName(card)}.`);
      return;
    }

    const nextState = applyOnlineMove(onlineGameState, mySeat, card, result.captured);
    const nextTurnUserId = nextState.turnSeat ? nextState.playerIds?.[nextState.turnSeat] : null;
    const moveSoundType = getMoveSoundType(onlineGameState, mySeat, card, result.captured);
    const animation = {
      actor: mySeat,
      cardId: card.id,
      capturedIds: result.captured.map((c) => c.id),
      summedIds: result.base.length >= 2 ? result.base.map((c) => c.id) : [],
      forfeitedIds: result.forfeited.map((c) => c.id),
      kind: result.captured.length ? 'capture' : 'place',
      stage: 'move',
    };

    if (result.forfeited.length) {
      showToastMessage('Atencion: perdiste la oportunidad de tomar mas cartas de la escalera.', 2400);
    } else {
      showMoveToast(moveSoundType);
    }
    playMoveSound(moveSoundType);
    setOnlineAnimation(settings.animations ? animation : null);
    setOnlineLoading(true);
    setOnlineMessage('');
    const animationUntil = settings.animations ? Date.now() + 720 : 0;
    onlineLocalAnimationUntilRef.current = animationUntil ? { roomId: onlineRoom.id, until: animationUntil } : null;

    const { data: committedVersion, error } = await supabase.rpc('submit_live_game_state', {
      target_room_id: onlineRoom.id,
      expected_version: onlineGameVersion,
      next_state: nextState,
      next_turn_user_id: nextTurnUserId,
      action_type: result.captured.length ? 'capture' : 'place',
      action_payload: {
        card,
        capturedCards: result.captured,
        seat: mySeat,
        moveSoundType,
        summedIds: animation.summedIds,
        forfeitedIds: animation.forfeitedIds,
      },
    });

    if (error) {
      setOnlineMessage(error.message);
      setOnlineLoading(false);
      setOnlineAnimation(null);
      onlineLocalAnimationUntilRef.current = null;
      await loadOnlineRoom(onlineRoom.id);
      return;
    }

    const remainingAnimationMs = Math.max(0, animationUntil - Date.now());
    if (remainingAnimationMs) {
      await new Promise((resolve) => setTimeout(resolve, remainingAnimationMs));
    }

    onlineLocalAnimationUntilRef.current = null;
    setOnlineGameState(nextState);
    setOnlineSelectedTableIds([]);
    setOnlineAnimation(null);
    setOnlineGameVersion(Number(committedVersion) || onlineGameVersion + 1);
    await loadOnlineRoom(onlineRoom.id);
    setOnlineLoading(false);
  }

  function toggleOnlineTableCard(card) {
    if (!onlineGameState || onlineGameState.phase !== 'playing') return;
    const mySeat = Number(Object.entries(onlineGameState.playerIds || {}).find(([, id]) => id === supabaseUser?.id)?.[0]);
    if (!mySeat || onlineGameState.turnSeat !== mySeat) return;
    setOnlineSelectedTableIds((current) => (
      current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id]
    ));
  }

  async function syncSupabaseProfile(nextProfile = profile, user = supabaseUser) {
    if (!isSupabaseConfigured || !supabase || !user) return;
    const username = normalizeUsername(nextProfile.username || nextProfile.name || user.email?.split('@')[0] || 'jugador');
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        username,
        display_name: nextProfile.name.trim() || user.email?.split('@')[0] || 'Jugador',
        city: nextProfile.city.trim(),
        avatar_url: nextProfile.photo || null,
        rating: Math.round(nextProfile.rating || STARTING_RATING),
        games: nextProfile.games || 0,
        wins: nextProfile.wins || 0,
        losses: nextProfile.losses || 0,
      }, { onConflict: 'id' });
    if (error) setFriendsMessage(error.message);
  }

  async function loadSupabaseFriends() {
    if (!supabaseUser || !supabase) return;
    setFriendsLoading(true);
    setFriendsMessage('');
    await syncSupabaseProfile();

    const [friendshipsResult, receivedResult, sentResult] = await Promise.all([
      supabase
        .from('friendships')
        .select('id,user_id,friend_id,accepted_at,games_together,user:profiles!friendships_user_id_fkey(id,username,display_name,city,rating),friend:profiles!friendships_friend_id_fkey(id,username,display_name,city,rating)')
        .or(`user_id.eq.${supabaseUser.id},friend_id.eq.${supabaseUser.id}`)
        .order('accepted_at', { ascending: false }),
      supabase
        .from('friend_invites')
        .select('id,status,created_at,sender:profiles!friend_invites_sender_id_fkey(id,username,display_name,city,rating)')
        .eq('receiver_id', supabaseUser.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('friend_invites')
        .select('id,status,created_at,receiver:profiles!friend_invites_receiver_id_fkey(id,username,display_name,city,rating)')
        .eq('sender_id', supabaseUser.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    if (friendshipsResult.error || receivedResult.error || sentResult.error) {
      setFriendsMessage(friendshipsResult.error?.message || receivedResult.error?.message || sentResult.error?.message);
      setFriendsLoading(false);
      return;
    }

    setFriends((friendshipsResult.data || []).map((row) => mapFriendshipRow(row, supabaseUser.id)));
    setReceivedInvites((receivedResult.data || []).map((row) => mapInviteRow(row, 'received')));
    setSentInvites((sentResult.data || []).map((row) => mapInviteRow(row, 'sent')));
    setFriendsLoading(false);
  }

  function saveProfile(event) {
    event.preventDefault();
    const nextProfile = {
      ...profile,
      username: normalizeUsername(profileDraft.username || profileDraft.name),
      name: profileDraft.name.trim(),
      city: profileDraft.city.trim(),
      email: profileDraft.email.trim(),
      photo: profileDraft.photo,
    };
    setProfile(nextProfile);
    setProfileDraft(nextProfile);
    writeStored(PROFILE_KEY, nextProfile);
    syncSupabaseProfile(nextProfile);
  }

  function clearHistory() {
    setHistory([]);
    writeStored(HISTORY_KEY, []);
  }

  function updateProfilePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setProfileDraft({ ...profileDraft, photo: reader.result });
    };
    reader.readAsDataURL(file);
  }

  function removeProfilePhoto() {
    setProfileDraft({ ...profileDraft, photo: '' });
  }

  async function sendFriendInvite(event) {
    event.preventDefault();
    const name = inviteName.trim();
    if (!name) return;

    if (isSupabaseConfigured && !supabaseUser) {
      setFriendsMessage('Inicia sesion para enviar invitaciones reales.');
      return;
    }

    if (useSupabaseFriends) {
      setFriendsLoading(true);
      setFriendsMessage('');
      const username = name.toLocaleLowerCase();
      let { data: target, error } = await supabase
        .from('profiles')
        .select('id,username,display_name,city,rating')
        .eq('username', username)
        .maybeSingle();

      if (!target && !error) {
        const result = await supabase
          .from('profiles')
          .select('id,username,display_name,city,rating')
          .ilike('display_name', name)
          .limit(1)
          .maybeSingle();
        target = result.data;
        error = result.error;
      }

      if (error) {
        setFriendsMessage(error.message);
        setFriendsLoading(false);
        return;
      }
      if (!target) {
        setFriendsMessage(`No encontre el usuario ${name}.`);
        setFriendsLoading(false);
        return;
      }
      if (target.id === supabaseUser.id) {
        setFriendsMessage('No puedes enviarte una invitacion a ti mismo.');
        setFriendsLoading(false);
        return;
      }

      const { error: inviteError } = await supabase
        .from('friend_invites')
        .insert({ sender_id: supabaseUser.id, receiver_id: target.id });

      if (inviteError) {
        setFriendsMessage(inviteError.message);
        setFriendsLoading(false);
        return;
      }

      setInviteName('');
      setFriendsMessage(`Invitacion enviada a ${profileDisplayName(target)}.`);
      await loadSupabaseFriends();
      return;
    }

    const normalized = name.toLocaleLowerCase();
    const isFriend = friends.some((friend) => friend.name.toLocaleLowerCase() === normalized);
    const alreadySent = sentInvites.some((invite) => invite.name.toLocaleLowerCase() === normalized);
    if (isFriend || alreadySent) {
      setFriendsMessage(isFriend ? `${name} ya esta en tu lista de amigos.` : `Ya enviaste una invitacion a ${name}.`);
      return;
    }

    const nextInvite = {
      id: `sent-${Date.now()}-${uid()}`,
      name,
      sentAt: new Date().toISOString(),
      initials: makeInitials(name).toUpperCase(),
      status: 'pendiente',
    };
    const nextSentInvites = [nextInvite, ...sentInvites];
    setSentInvites(nextSentInvites);
    writeStored(SENT_INVITES_KEY, nextSentInvites);
    setInviteName('');
    setFriendsMessage(`Invitacion enviada a ${name}.`);
  }

  async function acceptFriendInvite(invite) {
    if (useSupabaseFriends) {
      setFriendsLoading(true);
      setFriendsMessage('');
      const { error } = await supabase.rpc('accept_friend_invite', { invite_id: invite.id });
      if (error) {
        setFriendsMessage(error.message);
        setFriendsLoading(false);
        return;
      }
      setFriendsMessage(`Ahora ${invite.name} esta en tu lista de amigos.`);
      await loadSupabaseFriends();
      return;
    }

    const nextFriend = {
      id: `friend-${Date.now()}-${uid()}`,
      name: invite.name,
      city: invite.city || '',
      rating: invite.rating || STARTING_RATING,
      acceptedAt: new Date().toISOString(),
      gamesTogether: 0,
      initials: invite.initials || makeInitials(invite.name).toUpperCase(),
    };
    const nextFriends = [nextFriend, ...friends];
    const nextReceivedInvites = receivedInvites.filter((item) => item.id !== invite.id);
    setFriends(nextFriends);
    setReceivedInvites(nextReceivedInvites);
    writeStored(FRIENDS_KEY, nextFriends);
    writeStored(RECEIVED_INVITES_KEY, nextReceivedInvites);
    setFriendsMessage(`Ahora ${invite.name} esta en tu lista de amigos.`);
  }

  async function rejectFriendInvite(invite) {
    if (useSupabaseFriends) {
      setFriendsLoading(true);
      setFriendsMessage('');
      const { error } = await supabase.rpc('reject_friend_invite', { invite_id: invite.id });
      if (error) {
        setFriendsMessage(error.message);
        setFriendsLoading(false);
        return;
      }
      setFriendsMessage(`Rechazaste la invitacion de ${invite.name}.`);
      await loadSupabaseFriends();
      return;
    }

    const nextReceivedInvites = receivedInvites.filter((item) => item.id !== invite.id);
    setReceivedInvites(nextReceivedInvites);
    writeStored(RECEIVED_INVITES_KEY, nextReceivedInvites);
    setFriendsMessage(`Rechazaste la invitacion de ${invite.name}.`);
  }

  function toggleSetting(key) {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  }

  function playMoveSound(type = 'normal') {
    if (!settings.sound) return;
    const sound = type === 'combo'
      ? comboSoundRef.current
      : type === 'caida' || type === 'limpia'
        ? specialSoundRef.current
        : cardSoundRef.current;
    if (!sound) return;
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }

  function showToastMessage(text, duration = 1800) {
    if (!text) return;
    clearTimeout(toastTimerRef.current);
    setToast(text);
    toastTimerRef.current = setTimeout(() => setToast(''), duration);
  }

  function showMoveToast(type) {
    showToastMessage(getMoveToast(type));
  }

  function playDealSounds() {
    dealSoundTimersRef.current.forEach((timer) => clearTimeout(timer));
    dealSoundTimersRef.current = [];
    if (!settings.sound || !dealSoundRef.current) return;

    dealSoundTimersRef.current = Array.from({ length: 5 }, (_, index) => (
      setTimeout(() => {
        const sound = dealSoundRef.current;
        if (!sound) return;
        sound.currentTime = 0;
        sound.play().catch(() => {});
      }, index * DEAL_SOUND_SPACING_MS)
    ));
  }

  function playCountTickSound() {
    if (!settings.sound || !countTickSoundRef.current) return;
    const sound = countTickSoundRef.current;
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }

  function sendChatMessage(event) {
    event.preventDefault();
    const text = chatMessage.trim();
    if (!text) return;
    setChatMessages((current) => [
      ...current,
      { id: `${Date.now()}-${uid()}`, author: profile.name.trim() || 'Invitado', text },
    ]);
    setChatMessage('');
  }

  function toggleTableCard(card) {
    if (isAnimating || game.turn !== 'player' || game.phase !== 'playing') return;
    const selectedTableIds = game.selectedTableIds.includes(card.id)
      ? game.selectedTableIds.filter((id) => id !== card.id)
      : [...game.selectedTableIds, card.id];
    setGame({ ...game, selectedTableIds, message: '', selectedCardId: null });
  }

  function selectCard(card) {
    if (isAnimating || game.turn !== 'player' || game.phase !== 'playing') return;
    const result = resolveManualCapture(card, game.table, selectedTableCards);
    if (!result.ok) {
      setGame({
        ...game,
        selectedCardId: card.id,
        message: `Esa captura no es valida con ${cardName(card)}. Marca iguales, una suma exacta o una escalera sin saltos.`,
      });
      return;
    }
    const animation = {
      cardId: card.id,
      capturedIds: result.captured.map((c) => c.id),
      summedIds: result.base.length >= 2 ? result.base.map((c) => c.id) : [],
      forfeitedIds: [],
      kind: result.captured.length ? 'capture' : 'place',
    };
    if (result.forfeited.length) {
      showToastMessage('Atencion: perdiste la oportunidad de tomar mas cartas de la escalera.', 2400);
    }
    const moveSoundType = getMoveSoundType(game, 'player', card, result.captured);
    playMoveSound(moveSoundType);
    showMoveToast(moveSoundType);
    setGame({ ...game, selectedCardId: card.id, animation: { ...animation, actor: 'player', stage: 'move' }, message: '' });
    setTimeout(() => {
      const next = maybeEndDeal(applyMove({ ...game, animation: null }, 'player', card, result.captured));
      setGame(next);
      setTimeout(cpuTurn, 500);
    }, 720);
  }

  function cpuTurn() {
    setGame((current) => {
      if (current.phase !== 'playing' || current.turn !== 'cpu') return current;
      const move = chooseCpuMove(current);
      const base = getCaptureBase(move.card, current.table, move.captured);
      const animation = {
        actor: 'cpu',
        stage: 'reveal',
        cardId: move.card.id,
        capturedIds: move.captured.map((c) => c.id),
        summedIds: base.length >= 2 ? base.map((c) => c.id) : [],
        forfeitedIds: [],
        kind: move.captured.length ? 'capture' : 'place',
      };

      setTimeout(() => {
        const moveSoundType = getMoveSoundType(current, 'cpu', move.card, move.captured);
        playMoveSound(moveSoundType);
        showMoveToast(moveSoundType);
        setGame((revealing) => {
          if (revealing.animation?.actor !== 'cpu' || revealing.animation?.cardId !== move.card.id || revealing.turn !== 'cpu') return revealing;
          return { ...revealing, animation: { ...animation, stage: 'move' } };
        });
      }, 420);

      setTimeout(() => {
        setGame((moving) => {
          if (moving.animation?.actor !== 'cpu' || moving.animation?.cardId !== move.card.id || moving.turn !== 'cpu') return moving;
          return maybeEndDeal(applyMove({ ...current, animation: null }, 'cpu', move.card, move.captured));
        });
      }, 1140);

      return { ...current, animation };
    });
  }

  function startCounting() {
    if (game.phase !== 'countReady' || game.countAnimation?.active) return;
    const playerTotal = game.playerCaptured.length;
    const cpuTotal = game.cpuCaptured.length;
    const totalTicks = Math.max(playerTotal, cpuTotal);

    if (!totalTicks) {
      finishCounting();
      return;
    }

    let tick = 0;
    setGame({
      ...game,
      countAnimation: {
        active: true,
        playerTotal,
        cpuTotal,
        playerCounted: 0,
        cpuCounted: 0,
        playerRemaining: playerTotal,
        cpuRemaining: cpuTotal,
        playerBonus: 0,
        cpuBonus: 0,
      },
      message: 'Contando cartas capturadas...',
    });

    const timer = setInterval(() => {
      tick += 1;
      playCountTickSound();
      setGame((current) => {
        if (!current.countAnimation?.active || current.phase !== 'countReady') {
          clearInterval(timer);
          return current;
        }
        const playerCounted = Math.min(playerTotal, tick);
        const cpuCounted = Math.min(cpuTotal, tick);
        return {
          ...current,
          countAnimation: {
            ...current.countAnimation,
            playerCounted,
            cpuCounted,
            playerRemaining: playerTotal - playerCounted,
            cpuRemaining: cpuTotal - cpuCounted,
            playerBonus: cartonBonus(playerCounted),
            cpuBonus: cartonBonus(cpuCounted),
          },
        };
      });

      if (tick >= totalTicks) {
        clearInterval(timer);
        setTimeout(finishCounting, 450);
      }
    }, 130);
  }

  function finishCounting() {
    setGame((current) => {
      if (current.phase !== 'countReady') return current;
      const playerCarton = cartonBonus(current.playerCaptured.length);
      const cpuCarton = cartonBonus(current.cpuCaptured.length);
      const score = {
        player: capScore(current.score.player + playerCarton),
        cpu: capScore(current.score.cpu + cpuCarton),
      };
      const logs = [
        `Conteo: tu ${current.playerCaptured.length} cartas (+${playerCarton}), rival ${current.cpuCaptured.length} cartas (+${cpuCarton}).`,
        ...current.logs,
      ];

      if (score.player >= 40 || score.cpu >= 40) {
        const winner = score.player >= 40 ? 'Ganaste la partida.' : 'El rival gano la partida.';
        return {
          ...current,
          score,
          logs: [winner, ...logs],
          countAnimation: null,
          message: '',
          phase: 'ended',
        };
      }

      return nextChica({ ...current, score, logs, countAnimation: null });
    });
  }

  const playerRating = Math.round(profile.rating || STARTING_RATING);
  const playerTier = ratingTier(playerRating);
  const winRate = profile.games ? Math.round((profile.wins / profile.games) * 100) : 0;
  const winner = game.phase === 'ended' ? (game.score.player >= game.score.cpu ? 'Ganaste' : 'Gano el rival') : null;
  const playerCapturedDisplay = game.countAnimation?.active ? game.countAnimation.playerRemaining : game.playerCaptured.length;
  const cpuCapturedDisplay = game.countAnimation?.active ? game.countAnimation.cpuRemaining : game.cpuCaptured.length;
  const rankingEntries = useMemo(() => {
    const players = new Map();
    const upsertPlayer = (name, data) => {
      const key = (name || 'Invitado').trim().toLocaleLowerCase();
      const current = players.get(key);
      const rating = Math.round(data.rating || STARTING_RATING);
      if (!current || rating > current.rating) {
        players.set(key, {
          name: (name || 'Invitado').trim() || 'Invitado',
          rating,
          games: data.games || current?.games || 0,
          wins: data.wins || current?.wins || 0,
          losses: data.losses || current?.losses || 0,
          city: data.city || current?.city || '',
        });
        return;
      }
      players.set(key, {
        ...current,
        games: Math.max(current.games || 0, data.games || 0),
        wins: Math.max(current.wins || 0, data.wins || 0),
        losses: Math.max(current.losses || 0, data.losses || 0),
      });
    };

    history.forEach((item) => {
      const rating = Number.isFinite(item.ratingAfter)
        ? item.ratingAfter
        : Number.isFinite(item.ratingBefore)
          ? item.ratingBefore
          : STARTING_RATING;
      upsertPlayer(item.playerName, { rating, games: 1 });
    });

    if (hasProfile) {
      upsertPlayer(profile.name, {
        rating: profile.rating,
        games: profile.games,
        wins: profile.wins,
        losses: profile.losses,
        city: profile.city,
      });
    }

    return [...players.values()].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  }, [hasProfile, history, profile]);
  const myOnlineSeat = onlineGameState && supabaseUser
    ? Number(Object.entries(onlineGameState.playerIds || {}).find(([, id]) => id === supabaseUser.id)?.[0])
    : null;
  const rivalOnlineSeat = myOnlineSeat ? nextSeat(myOnlineSeat) : null;
  const myOnlineKey = myOnlineSeat ? seatKey(myOnlineSeat) : null;
  const rivalOnlineKey = rivalOnlineSeat ? seatKey(rivalOnlineSeat) : null;
  const myOnlineHand = myOnlineKey ? onlineGameState?.[`${myOnlineKey}Hand`] || [] : [];
  const rivalOnlineHand = rivalOnlineKey ? onlineGameState?.[`${rivalOnlineKey}Hand`] || [] : [];
  const myOnlineCaptured = myOnlineKey ? onlineGameState?.[`${myOnlineKey}Captured`] || [] : [];
  const rivalOnlineCaptured = rivalOnlineKey ? onlineGameState?.[`${rivalOnlineKey}Captured`] || [] : [];
  const isMyOnlineTurn = Boolean(myOnlineSeat && onlineGameState?.turnSeat === myOnlineSeat && onlineGameState?.phase === 'playing');
  const onlineTableCardsForRender = onlineGameState
    ? [
        ...onlineGameState.table.filter((card) => !(
          onlineAnimation?.actor === rivalOnlineSeat &&
          onlineAnimation?.kind === 'place' &&
          onlineAnimation?.cardId === card.id
        )),
        ...((onlineAnimation?.capturedCards || []).filter((card) => !onlineGameState.table.some((tableCard) => tableCard.id === card.id))),
      ]
    : [];
  const onlineWinnerSeat = onlineGameState?.phase === 'ended'
    ? (onlineGameState.score?.p1 >= onlineGameState.score?.p2 ? 1 : 2)
    : null;

  if (screen === 'menu') {
    return (
      <main className="app menu-screen main-menu-screen">
        <section className="menu-panel">
          <p className="eyebrow">Juego ecuatoriano de cartas</p>
          <button className="menu-profile-summary" type="button" onClick={openProfile} aria-label="Abrir perfil">
            <div className="profile-photo menu-profile-photo">
              {shouldShowProfileSummary && profile.photo ? <img src={profile.photo} alt="Foto de perfil" /> : <span>{shouldShowProfileSummary ? profile.name.trim().charAt(0) : '?'}</span>}
            </div>
            <div>
              <strong>{shouldShowProfileSummary ? profile.name.trim() : 'Iniciar sesion'}</strong>
              <small>Rating: {shouldShowProfileSummary ? playerRating : '?'}</small>
            </div>
          </button>
          <img className="main-menu-logo" src={MAIN_MENU_LOGO} alt="Cuarenta" />
          <div className="menu-actions">
            <button className="new" onClick={openDifficulty}>Nueva partida</button>
            {savedGame && <button className="menu-button resume-button" onClick={resumeSavedGame}>Continuar partida</button>}
            <button className="menu-button" onClick={openOnlineLobby}>Partida online</button>
            <button className="menu-button" onClick={() => setScreen('ranking')}>Ranking</button>
            <button className="menu-button" onClick={() => setScreen('friends')}>Amigos</button>
            <button className="menu-button" onClick={() => setScreen('rules')}>Reglas</button>
            <button className="menu-button" onClick={() => setScreen('credits')}>Creditos</button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'online') {
    return (
      <main className="app menu-screen">
        <section className="menu-panel online-panel">
          <p className="eyebrow">Multijugador</p>
          <h1>Online</h1>
          {!supabaseUser ? (
            <div className="auth-local-card">
              <p>Inicia sesion para crear o unirte a partidas online.</p>
            </div>
          ) : onlineRoom ? (
            <div className="online-room">
              <div className="online-room-code">
                <span>Codigo de sala</span>
                <strong>{onlineRoom.code}</strong>
                <small>{roomStatusLabel(onlineRoom.status)}</small>
              </div>
              <div className="online-player-list">
                {onlinePlayers.map((player) => (
                  <article className="online-player-item" key={player.id}>
                    <div className="friend-avatar">{player.initials}</div>
                    <div>
                      <strong>{player.name}</strong>
                      <small>Asiento {player.seat} - {ratingTier(player.rating)}</small>
                    </div>
                    <em>{player.isReady ? 'Listo' : 'En lobby'}</em>
                  </article>
                ))}
                {Array.from({ length: Math.max(0, (onlineRoom.max_players || 2) - onlinePlayers.length) }).map((_, index) => (
                  <article className="online-player-item online-player-empty" key={`empty-${index}`}>
                    <div className="friend-avatar">?</div>
                    <div>
                      <strong>Esperando jugador</strong>
                      <small>Comparte el codigo {onlineRoom.code}</small>
                    </div>
                  </article>
                ))}
              </div>
              <div className="online-room-note">
                {onlineRoom.status === 'playing'
                  ? 'La sala ya tiene dos jugadores. El siguiente paso sera abrir la mesa online sincronizada.'
                  : 'Cuando entre otro jugador, este lobby se actualizara automaticamente.'}
              </div>
              <div className="online-actions">
                {onlinePlayers.length >= 2 && !onlineGameState && onlineRoom.host_id === supabaseUser?.id && (
                  <button className="new" type="button" onClick={startOnlineGame} disabled={onlineLoading}>Iniciar partida online</button>
                )}
                {onlineGameState && (
                  <button className="new" type="button" onClick={() => setScreen('onlineGame')}>Abrir mesa online</button>
                )}
                <button className="menu-button" type="button" onClick={closeOnlineRoom}>Salir del lobby</button>
              </div>
            </div>
          ) : (
            <>
              <div className="online-actions">
                <button className="new" type="button" onClick={createOnlineRoom} disabled={onlineLoading}>Crear sala</button>
              </div>
              <form className="online-join-form" onSubmit={joinOnlineRoom}>
                <label>
                  Codigo de sala
                  <input
                    value={onlineJoinCode}
                    onChange={(event) => setOnlineJoinCode(event.target.value.toLocaleUpperCase())}
                    placeholder="ABC123"
                    maxLength={8}
                    disabled={onlineLoading}
                  />
                </label>
                <button className="menu-button" type="submit" disabled={onlineLoading}>Unirme</button>
              </form>
            </>
          )}
          {onlineLoading && <p className="friends-message">Sincronizando sala...</p>}
          {onlineMessage && <p className="friends-message">{onlineMessage}</p>}
          <div className="menu-actions">
            <button className="menu-button" onClick={() => setScreen('menu')}>Volver</button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'onlineGame' && onlineGameState) {
    return (
      <main className="app game-screen">
        {onlineWinnerSeat && (
          <div className="banner">
            {onlineWinnerSeat === myOnlineSeat ? 'Ganaste' : 'Gano el rival'} la partida online.
          </div>
        )}
        <section className="board online-game-board">
          <div className="row-header player-hand-header human-hand-header">
            <div className="game-profile">
              <div className="game-profile-photo rival-photo">
                <span>{rivalOnlineSeat || '?'}</span>
              </div>
              <div>
                <h2>{onlinePlayerLabel(onlineGameState, rivalOnlineSeat)}</h2>
                <small>{onlineGameState.turnSeat === rivalOnlineSeat ? 'Turno del rival' : 'Esperando'}</small>
              </div>
            </div>
          </div>

          <div className="play-row cpu-play-row">
            <div className="player-stats compact-stats cpu-card-stats">
              <div className="inline-score"><span>Puntos</span><strong>{rivalOnlineKey ? onlineGameState.score?.[rivalOnlineKey] : 0}</strong></div>
              <div className="inline-score captured-box"><span>Capturadas</span><strong>{rivalOnlineCaptured.length}</strong></div>
            </div>
            <div className="hand compact">
              {rivalOnlineHand.map((c, index) => (
                <Card key={c.id} card={c} back style={fanStyle(index, rivalOnlineHand.length)} disabled />
              ))}
              {onlineAnimation?.actor === rivalOnlineSeat && onlineAnimation.card && (
                <Card
                  key={`remote-${onlineAnimation.cardId}`}
                  card={onlineAnimation.card}
                  motion={onlineAnimation.kind === 'place' ? 'cpu-placing-card' : 'cpu-playing-card'}
                  style={fanStyle(rivalOnlineHand.length, rivalOnlineHand.length + 1)}
                  disabled
                />
              )}
            </div>
          </div>

          <div className="table-row">
            <div className="deck-visual" aria-label="Mazo">
              <div className="deck-stack">
                <span className="deck-count">{onlineGameState.deck?.length || 0}</span>
              </div>
            </div>
            <div className="table-zone">
              <div className="toast-alert">{toast || onlineMessage}</div>
              <div className="table-cards">
                {onlineTableCardsForRender.length ? onlineTableCardsForRender.map((c) => {
                  const motion = onlineAnimation?.stage === 'move' && onlineAnimation?.summedIds?.includes(c.id)
                    ? 'summed-absorbed'
                    : onlineAnimation?.stage === 'move' && onlineAnimation?.capturedIds?.includes(c.id)
                      ? 'absorbed'
                      : onlineAnimation?.stage === 'move' && onlineAnimation?.forfeitedIds?.includes(c.id)
                        ? 'forfeited'
                        : '';
                  return (
                    <Card
                      key={c.id}
                      card={c}
                      motion={motion}
                      selected={onlineSelectedTableIds.includes(c.id)}
                      onClick={() => toggleOnlineTableCard(c)}
                      disabled={!isMyOnlineTurn || onlineLoading}
                    />
                  );
                }) : <p className="empty">Mesa vacia</p>}
              </div>
            </div>
          </div>

          <div className="play-row player-play-row">
            <div className="player-stats compact-stats mobile-player-stats">
              <div className="inline-score"><span>Puntos</span><strong>{myOnlineKey ? onlineGameState.score?.[myOnlineKey] : 0}</strong></div>
              <div className="inline-score captured-box"><span>Capturadas</span><strong>{myOnlineCaptured.length}</strong></div>
            </div>
            <div className="row-header player-hand-header">
              <div className="game-profile">
                <div className="game-profile-photo">
                  <span>{myOnlineSeat || '?'}</span>
                </div>
                <div>
                  <h2>{onlinePlayerLabel(onlineGameState, myOnlineSeat)}</h2>
                  <small>{isMyOnlineTurn ? 'Tu turno' : 'Espera tu turno'}</small>
                </div>
              </div>
            </div>
            <div className="hand">{myOnlineHand.map((c, index) => {
              const isOnlineCardAnimating = onlineAnimation?.actor === myOnlineSeat && onlineAnimation?.cardId === c.id;
              const motion = isOnlineCardAnimating
                ? onlineAnimation.kind === 'place'
                  ? 'placing-card'
                  : 'playing-card'
                : '';
              return (
                <Card
                  key={c.id}
                  card={c}
                  motion={motion}
                  style={fanStyle(index, myOnlineHand.length)}
                  onClick={() => submitOnlineMove(c)}
                  disabled={!isMyOnlineTurn || onlineLoading}
                />
              );
            })}</div>
          </div>
        </section>

        <section className="panel online-log-panel">
          <h3>Historial online</h3>
          {(onlineGameState.logs || []).slice(0, 8).map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
          <div className="menu-actions">
            <button className="menu-button" onClick={() => setScreen('online')}>Volver al lobby</button>
            <button className="menu-button" onClick={() => setScreen('menu')}>Menu</button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'auth') {
    return (
      <main className="app menu-screen">
        <section className="menu-panel auth-panel">
          <p className="eyebrow">Cuenta de jugador</p>
          <h1>{authMode === 'login' ? 'Iniciar sesion' : 'Registrarte'}</h1>
          {!isSupabaseConfigured && (
            <div className="auth-local-card">
              <p>Supabase aun no esta configurado en esta vista previa. El inicio de sesion real requiere las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.</p>
            </div>
          )}
          <div className="auth-tabs">
            <button className={authMode === 'login' ? 'active' : ''} type="button" onClick={() => { setAuthMode('login'); setAuthMessage(''); }}>Ingresar</button>
            <button className={authMode === 'register' ? 'active' : ''} type="button" onClick={() => { setAuthMode('register'); setAuthMessage(''); }}>Crear cuenta</button>
          </div>
          <form className="profile-form auth-form" onSubmit={submitAuth}>
            {authMode === 'register' && (
              <>
                <label>
                  Usuario
                  <input
                    value={authDraft.username}
                    onChange={(event) => setAuthDraft({ ...authDraft, username: event.target.value })}
                    placeholder="usuario"
                    minLength={3}
                    required
                  />
                </label>
                <label>
                  Nombre
                  <input
                    value={authDraft.name}
                    onChange={(event) => setAuthDraft({ ...authDraft, name: event.target.value })}
                    placeholder="Tu nombre"
                    required
                  />
                </label>
                <label>
                  Ciudad
                  <input
                    value={authDraft.city}
                    onChange={(event) => setAuthDraft({ ...authDraft, city: event.target.value })}
                    placeholder="Ej. Quito"
                  />
                </label>
              </>
            )}
            <label>
              Correo
              <input
                type="email"
                value={authDraft.email}
                onChange={(event) => setAuthDraft({ ...authDraft, email: event.target.value })}
                placeholder="correo@ejemplo.com"
                required
              />
            </label>
            <label>
              Contrasena
              <input
                type="password"
                value={authDraft.password}
                onChange={(event) => setAuthDraft({ ...authDraft, password: event.target.value })}
                placeholder="Minimo 6 caracteres"
                minLength={6}
                required
              />
            </label>
            {authMessage && <p className="auth-message">{authMessage}</p>}
            <button className="new" type="submit" disabled={authLoading}>
              {authLoading ? 'Procesando...' : authMode === 'login' ? 'Iniciar sesion' : 'Crear cuenta'}
            </button>
          </form>
          <div className="menu-actions">
            <button className="menu-button" onClick={() => setScreen('menu')}>Volver</button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'difficulty') {
    return (
      <main className="app menu-screen">
        <section className="menu-panel difficulty-panel">
          <p className="eyebrow">Elige tu reto</p>
          <h1>Dificultad</h1>
          <div className="difficulty-list">
            {Object.entries(DIFFICULTIES).map(([id, item]) => (
              <button className="difficulty-option" key={id} onClick={() => startGame(id)}>
                <strong>{item.label}</strong>
                <span>{item.description}</span>
                <small>IA {item.rating}</small>
              </button>
            ))}
          </div>
          <div className="menu-actions">
            <button className="menu-button" onClick={() => setScreen('menu')}>Volver</button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'profile') {
    return (
      <main className="app menu-screen">
        <section className="menu-panel profile-panel">
          <p className="eyebrow">Jugador</p>
          <h1>Perfil</h1>
          <form className="profile-form" onSubmit={saveProfile}>
            <div className="photo-field">
              <div className="profile-photo">
                {profileDraft.photo ? <img src={profileDraft.photo} alt="Foto de perfil" /> : <span>{profileDraft.name.trim().charAt(0) || '?'}</span>}
              </div>
              <div className="photo-actions">
                <label className="photo-button">
                  Agregar foto
                  <input type="file" accept="image/*" onChange={updateProfilePhoto} />
                </label>
                {profileDraft.photo && <button className="text-button" type="button" onClick={removeProfilePhoto}>Quitar foto</button>}
              </div>
            </div>
            <div className="rating-summary">
              <div>
                <span>Rating</span>
                <strong>{playerRating}</strong>
                <small>{playerTier}</small>
              </div>
              <div>
                <span>Partidas</span>
                <strong>{profile.games}</strong>
                <small>{profile.wins}V / {profile.losses}D</small>
              </div>
              <div>
                <span>Efectividad</span>
                <strong>{winRate}%</strong>
                <small>vs IA</small>
              </div>
            </div>
            <label>
              Usuario
              <input
                value={profileDraft.username}
                onChange={(event) => setProfileDraft({ ...profileDraft, username: event.target.value })}
                placeholder="usuario"
                minLength={3}
                required={isSupabaseConfigured}
              />
            </label>
            <label>
              Nombre
              <input
                value={profileDraft.name}
                onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })}
                placeholder="Tu nombre"
                required
              />
            </label>
            <label>
              Ciudad
              <input
                value={profileDraft.city}
                onChange={(event) => setProfileDraft({ ...profileDraft, city: event.target.value })}
                placeholder="Ej. Quito"
              />
            </label>
            <label>
              Correo
              <input
                type="email"
                value={profileDraft.email}
                onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })}
                placeholder="correo@ejemplo.com"
              />
            </label>
            <button className="new" type="submit">{hasProfile ? 'Actualizar perfil' : 'Registrarme'}</button>
            {isSupabaseConfigured && supabaseUser && (
              <button className="menu-button profile-sign-out-button" type="button" onClick={signOut}>Cerrar sesion</button>
            )}
          </form>

          <div className="profile-history">
            <div className="profile-history-head">
              <h3>Ultimas partidas</h3>
              {history.length > 0 && <button className="text-button" onClick={clearHistory}>Limpiar</button>}
            </div>
            {history.length ? history.map((item) => (
              <article className="history-item" key={item.id}>
                <strong>{item.result}</strong>
                <span>{item.playerScore} - {item.cpuScore}</span>
                <small>{new Date(item.playedAt).toLocaleDateString()} - {DIFFICULTIES[item.difficulty]?.label || 'Intermedio'}{Number.isFinite(item.ratingDelta) ? ` - Rating ${item.ratingDelta > 0 ? '+' : ''}${item.ratingDelta}` : ''}</small>
              </article>
            )) : <p className="empty">Aun no hay partidas registradas.</p>}
          </div>

          <div className="menu-actions">
            <button className="new" onClick={openDifficulty}>Jugar</button>
            <button className="menu-button" onClick={() => setScreen('menu')}>Volver</button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'ranking') {
    return (
      <main className="app menu-screen">
        <section className="menu-panel ranking-panel">
          <p className="eyebrow">Mejores jugadores</p>
          <h1>Ranking</h1>
          <div className="ranking-list">
            {rankingEntries.length ? rankingEntries.map((item, index) => (
              <article className="ranking-item" key={`${item.name}-${item.rating}`}>
                <span className="ranking-position">{index + 1}</span>
                <div>
                  <strong>{item.name}</strong>
                  <small>{ratingTier(item.rating)}{item.city ? ` - ${item.city}` : ''}</small>
                </div>
                <div className="ranking-score">
                  <strong>{item.rating}</strong>
                  <small>{item.games || 0} partidas</small>
                </div>
              </article>
            )) : <p className="empty">Aun no hay jugadores con rating registrado.</p>}
          </div>
          <div className="menu-actions">
            <button className="new" onClick={openDifficulty}>Jugar</button>
            <button className="menu-button" onClick={() => setScreen('menu')}>Volver</button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'friends') {
    return (
      <main className="app menu-screen">
        <section className="menu-panel friends-panel">
          <p className="eyebrow">Amistades aceptadas</p>
          <h1>Amigos</h1>
          <p className="friends-mode">
            {useSupabaseFriends ? 'Conectado a Supabase' : 'Modo local hasta iniciar sesion con Supabase'}
          </p>
          <div className="friends-actions">
            <button className={friendsView === 'invite' ? 'active' : ''} type="button" onClick={() => setFriendsView(friendsView === 'invite' ? 'list' : 'invite')}>
              Invitar
            </button>
            <button className={friendsView === 'received' ? 'active' : ''} type="button" onClick={() => setFriendsView(friendsView === 'received' ? 'list' : 'received')}>
              Invitaciones recibidas
              {receivedInvites.length > 0 && <span>{receivedInvites.length}</span>}
            </button>
          </div>
          {friendsView === 'invite' && (
            <form className="friend-invite-form" onSubmit={sendFriendInvite}>
              <label>
                Nombre de usuario
                <input
                  value={inviteName}
                  onChange={(event) => setInviteName(event.target.value)}
                  placeholder="Ej. Juan Perez"
                  disabled={friendsLoading}
                />
              </label>
              <button className="new" type="submit" disabled={friendsLoading}>Enviar invitacion</button>
            </form>
          )}
          {friendsView === 'received' && (
            <div className="received-invites">
              {receivedInvites.length ? receivedInvites.map((invite) => (
                <article className="friend-item invite-item" key={invite.id}>
                  <div className="friend-avatar">{invite.initials}</div>
                  <div>
                    <strong>{invite.name}</strong>
                    <small>{invite.city} - {ratingTier(invite.rating)}</small>
                    <em>Te envio una invitacion el {new Date(invite.sentAt).toLocaleDateString()}</em>
                  </div>
                  <div className="invite-actions">
                    <button type="button" onClick={() => acceptFriendInvite(invite)} disabled={friendsLoading}>Aceptar</button>
                    <button type="button" onClick={() => rejectFriendInvite(invite)} disabled={friendsLoading}>Rechazar</button>
                  </div>
                </article>
              )) : <p className="empty">No tienes invitaciones recibidas.</p>}
            </div>
          )}
          {friendsLoading && <p className="friends-message">Sincronizando...</p>}
          {friendsMessage && <p className="friends-message">{friendsMessage}</p>}
          <div className="friends-summary">
            <strong>{friends.length}</strong>
            <span>usuarios aceptaron tu invitacion</span>
          </div>
          <div className="friends-list">
            {friends.length ? friends.map((friend) => (
              <article className="friend-item" key={friend.id}>
                <div className="friend-avatar">{friend.initials}</div>
                <div>
                  <strong>{friend.name}</strong>
                  <small>{friend.city ? `${friend.city} - ` : ''}{ratingTier(friend.rating)}</small>
                  <em>Amistad aceptada el {new Date(friend.acceptedAt).toLocaleDateString()}</em>
                </div>
                <div className="friend-meta">
                  <strong>{friend.rating}</strong>
                  <small>{friend.gamesTogether} partidas</small>
                </div>
              </article>
            )) : <p className="empty">Aun no tienes amistades aceptadas.</p>}
          </div>
          {sentInvites.length > 0 && (
            <div className="sent-invites">
              <h3>Invitaciones enviadas</h3>
              {sentInvites.map((invite) => (
                <article className="sent-invite-item" key={invite.id}>
                  <span>{invite.initials}</span>
                  <div>
                    <strong>{invite.name}</strong>
                    <small>Enviada el {new Date(invite.sentAt).toLocaleDateString()}</small>
                  </div>
                  <em>{invite.status}</em>
                </article>
              ))}
            </div>
          )}
          <div className="menu-actions">
            <button className="new" onClick={openDifficulty}>Jugar</button>
            <button className="menu-button" onClick={() => setScreen('menu')}>Volver</button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'rules') {
    return (
      <main className="app menu-screen">
        <section className="menu-panel rules-panel">
          <h1>Reglas</h1>
          <ul>
            <li>Selecciona primero las cartas de la mesa y luego la carta de tu mano.</li>
            <li>Capturas por igual, por suma exacta y por escalera.</li>
            <li>Caida y limpia suman puntos adicionales.</li>
            <li>Al terminar la chica, cuenta cartas capturadas: desde 20 cartas se suman puntos.</li>
            <li>La partida continua por chicas hasta que alguien llegue a 40 puntos.</li>
          </ul>
          <div className="menu-actions">
            <button className="new" onClick={openDifficulty}>Jugar</button>
            <button className="menu-button" onClick={() => setScreen('menu')}>Volver</button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'credits') {
    return (
      <main className="app menu-screen">
        <section className="menu-panel">
          <h1>Creditos</h1>
          <p className="subtitle">Cuarenta React Vite. Version web 1 vs IA.</p>
          <p className="subtitle">Cartas, reglas y animaciones ajustadas para jugar una partida completa a 40 puntos.</p>
          <div className="menu-actions">
            <button className="new" onClick={openDifficulty}>Jugar</button>
            <button className="menu-button" onClick={() => setScreen('menu')}>Volver</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app game-screen">
      {winner && <div className="banner">{winner} la partida. Presiona "Nueva chica" para reiniciar.</div>}

      <section className="board">
        <div className="row-header player-hand-header human-hand-header">
          <div className="game-profile">
            <div className="game-profile-photo rival-photo">
              <span>IA</span>
            </div>
            <div>
              <h2>IA</h2>
              <small>{DIFFICULTIES[game.difficulty]?.label || 'Intermedio'} - Rating {DIFFICULTIES[game.difficulty]?.rating || DIFFICULTIES.intermediate.rating}</small>
            </div>
          </div>
        </div>
        <div className="play-row cpu-play-row">
          <div className="player-stats compact-stats cpu-card-stats">
            <div className="inline-score"><span>Puntos</span><strong>{game.score.cpu}</strong></div>
            <div className={`inline-score captured-box ${game.countAnimation?.active ? 'counting' : ''}`}>
              <span>Capturadas</span>
              <strong>{cpuCapturedDisplay}</strong>
              {game.countAnimation?.cpuBonus > 0 && <em>+{game.countAnimation.cpuBonus}</em>}
            </div>
          </div>
          <div className="hand compact">{game.cpuHand.map((c, index) => {
            const isCpuCardAnimating = game.animation?.actor === 'cpu' && game.animation.cardId === c.id;
            const motion = isCpuCardAnimating
              ? game.animation.stage === 'reveal'
                ? 'cpu-reveal'
                : game.animation.kind === 'place'
                  ? 'cpu-placing-card'
                  : 'cpu-playing-card'
              : '';
            return <Card key={c.id} card={c} back={!isCpuCardAnimating} motion={`${motion} hand-deal-in`} style={{ ...fanStyle(index, game.cpuHand.length), '--deal-order': index * 2 }} disabled />;
          })}</div>
        </div>

        <div className="table-row">
          <div className="deck-visual" aria-label="Mazo">
            <div className="deck-stack">
              <span className="deck-count" key={`${game.dealPulse}-${deckCountDisplay}`}>{deckCountDisplay}</span>
            </div>
            {Array.from({ length: 5 }).map((_, index) => (
              <i className="deal-card deal-card-cpu" key={`cpu-${game.dealPulse}-${index}`} style={{ '--deal-order': index * 2 }} />
            ))}
            {Array.from({ length: 5 }).map((_, index) => (
              <i className="deal-card deal-card-player" key={`player-${game.dealPulse}-${index}`} style={{ '--deal-order': index * 2 + 1 }} />
            ))}
          </div>
          <div className="table-zone">
            {game.phase === 'countReady' && (
              <div className="count-ready">
                <strong>Se acabo la chica</strong>
                <button className="new" onClick={startCounting} disabled={game.countAnimation?.active}>
                  {game.countAnimation?.active ? 'Contando...' : 'Contar cartas'}
                </button>
              </div>
            )}
            <div className="table-cards">
              {game.table.length ? game.table.map((c) => (
                <Card
                  key={c.id}
                  card={c}
                  selected={game.selectedTableIds.includes(c.id)}
                  motion={
                    game.animation?.stage === 'move' && game.animation?.summedIds?.includes(c.id)
                      ? 'summed-absorbed'
                      : game.animation?.stage === 'move' && game.animation?.capturedIds.includes(c.id)
                        ? 'absorbed'
                        : game.animation?.stage === 'move' && game.animation?.forfeitedIds.includes(c.id)
                          ? 'forfeited'
                          : ''
                  }
                  onClick={() => toggleTableCard(c)}
                  disabled={isAnimating || game.turn !== 'player' || game.phase !== 'playing'}
                />
              )) : <p className="empty">Mesa limpia. Cuidado con la caida y limpia.</p>}
            </div>
          </div>
        </div>

        <div className="row-header player-hand-header">
          <div className="game-profile">
            <div className="game-profile-photo">
              {profile.photo ? <img src={profile.photo} alt="Foto de perfil" /> : <span>{profile.name.trim().charAt(0) || '?'}</span>}
            </div>
            <div>
              <h2>{profile.name.trim() || 'Invitado'}</h2>
              <small>{playerTier} - Rating {playerRating}</small>
            </div>
          </div>
        </div>
        <div className="play-row player-play-row">
          {toast && <div className="toast-alert">{toast}</div>}
          <div className="hand">{game.playerHand.map((c, index) => {
            const isPlayerCardAnimating = game.animation?.actor === 'player' && game.animation?.cardId === c.id;
            const motion = isPlayerCardAnimating
              ? game.animation.kind === 'place'
                ? 'placing-card'
                : 'playing-card'
              : '';
            return <Card key={c.id} card={c} selected={c.id === game.selectedCardId} motion={`${motion} hand-deal-in`} style={{ ...fanStyle(index, game.playerHand.length), '--deal-order': index * 2 + 1 }} onClick={() => selectCard(c)} disabled={isAnimating || game.turn !== 'player' || game.phase !== 'playing'} />;
          })}</div>
          <div className="player-stats compact-stats mobile-player-stats">
            <div className="inline-score"><span>Puntos</span><strong>{game.score.player}</strong></div>
            <div className={`inline-score captured-box ${game.countAnimation?.active ? 'counting' : ''}`}>
              <span>Capturadas</span>
              <strong>{playerCapturedDisplay}</strong>
              {game.countAnimation?.playerBonus > 0 && <em>+{game.countAnimation.playerBonus}</em>}
            </div>
          </div>
        </div>

        {bottomPanelOpen && (
          <section className="bottom-panel floating-bottom-panel">
            <div className="bottom-tabs">
              <button className={bottomView === 'history' ? 'active' : ''} onClick={() => setBottomView('history')}>Historial</button>
              <button className={bottomView === 'chat' ? 'active' : ''} onClick={() => setBottomView('chat')}>Chat</button>
            </div>

            {bottomView === 'history' ? (
              <div className="log-view">
                {game.logs.slice(0, 9).map((l, i) => <p key={i}>{l}</p>)}
              </div>
            ) : (
              <div className="chat-view">
                <div className="chat-messages">
                  {chatMessages.map((message) => (
                    <p key={message.id}><strong>{message.author}:</strong> {message.text}</p>
                  ))}
                </div>
                <form className="chat-form" onSubmit={sendChatMessage}>
                  <input value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} placeholder="Escribe un mensaje" />
                  <button type="submit">Enviar</button>
                </form>
              </div>
            )}
          </section>
        )}

        <div className="bottom-dock">
          <button className="bottom-button" type="button" aria-label="Abrir historial o chat" onClick={() => setBottomPanelOpen(!bottomPanelOpen)}>
            {bottomPanelOpen ? 'Cerrar' : 'Chat'}
          </button>
        </div>

        <div className="settings-dock">
          {settingsOpen && (
            <div className="settings-panel">
              <button type="button" onClick={() => toggleSetting('sound')}>
                <span>Sonido</span>
                <strong>{settings.sound ? 'Si' : 'No'}</strong>
              </button>
              <button type="button" onClick={() => toggleSetting('animations')}>
                <span>Animaciones</span>
                <strong>{settings.animations ? 'Si' : 'No'}</strong>
              </button>
              <button type="button" onClick={() => toggleSetting('hints')}>
                <span>Ayuda</span>
                <strong>{settings.hints ? 'Si' : 'No'}</strong>
              </button>
              <button type="button" onClick={saveCurrentGame}>
                <span>Guardar juego</span>
                <strong>OK</strong>
              </button>
              <button type="button" onClick={() => startGame(game.difficulty)}>
                <span>Nueva partida</span>
                <strong>OK</strong>
              </button>
              <button type="button" onClick={() => { setSettingsOpen(false); setScreen('menu'); }}>
                <span>Menu</span>
                <strong>Ir</strong>
              </button>
            </div>
          )}
          <button className="settings-button" type="button" aria-label="Configuracion" onClick={() => setSettingsOpen(!settingsOpen)}>
            &#9881;
          </button>
        </div>
      </section>

      {(selectedTableCards.length > 0 || game.message) && (
        <section className="panel">
          <h3>Captura manual</h3>
          {selectedTableCards.length > 0 && <p>Seleccionadas: {selectedTableCards.map(cardName).join(' + ')}</p>}
          <p className="hint">Si hay escalera disponible, puedes marcar las cartas en orden. Las no marcadas quedan en la mesa.</p>
          {game.message && <p className="warning">{game.message}</p>}
        </section>
      )}

    </main>
  );
}
