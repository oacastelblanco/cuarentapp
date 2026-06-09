import { useEffect, useMemo, useRef, useState } from 'react';

const PROFILE_KEY = 'cuarenta-profile';
const HISTORY_KEY = 'cuarenta-history';
const SAVED_GAME_KEY = 'cuarenta-saved-game';
const CARD_PLAY_SOUND = '/sounds/card-play.mp3';
const SPECIAL_PLAY_SOUND = '/sounds/te-caen.mp3';
const COMBO_PLAY_SOUND = '/sounds/caida-limpia.wav';
const DEAL_SOUND = '/sounds/deal.ogg';
const COUNT_TICK_SOUND = '/sounds/countdown-tick.wav';
const CARD_BACK_LOGO = '/images/card-back-logo-2.png';
const MAIN_MENU_LOGO = '/images/cuarenta-menu-logo.png';
const DEAL_SOUND_SPACING_MS = 290;
const STARTING_RATING = 1200;
const EMPTY_PROFILE = { name: '', city: '', email: '', photo: '', rating: STARTING_RATING, games: 0, wins: 0, losses: 0 };
const DIFFICULTIES = {
  beginner: { label: 'Principiante', description: 'El rival juega rapido y no siempre aprovecha capturas.', rating: 900 },
  intermediate: { label: 'Intermedio', description: 'El rival busca capturas y bonificaciones razonables.', rating: 1200 },
  expert: { label: 'Experto', description: 'El rival prioriza caida, limpia y manos con mas cartas.', rating: 1500 },
};

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

function normalizeProfile(profile) {
  return {
    ...EMPTY_PROFILE,
    ...profile,
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
  const selectedTableCards = useMemo(() => game.table.filter((c) => game.selectedTableIds.includes(c.id)), [game]);
  const isAnimating = Boolean(game.animation);
  const hasProfile = Boolean(profile.name.trim());

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

  function saveProfile(event) {
    event.preventDefault();
    const nextProfile = {
      ...profile,
      name: profileDraft.name.trim(),
      city: profileDraft.city.trim(),
      email: profileDraft.email.trim(),
      photo: profileDraft.photo,
    };
    setProfile(nextProfile);
    setProfileDraft(nextProfile);
    writeStored(PROFILE_KEY, nextProfile);
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

  if (screen === 'menu') {
    return (
      <main className="app menu-screen main-menu-screen">
        <section className="menu-panel">
          <p className="eyebrow">Juego ecuatoriano de cartas</p>
          <button className="menu-profile-summary" type="button" onClick={() => setScreen('profile')} aria-label="Abrir perfil">
            <div className="profile-photo menu-profile-photo">
              {profile.photo ? <img src={profile.photo} alt="Foto de perfil" /> : <span>{profile.name.trim().charAt(0) || '?'}</span>}
            </div>
            <div>
              <strong>{hasProfile ? profile.name.trim() : 'Iniciar sesión'}</strong>
              <small>Rating: {hasProfile ? playerRating : '?'}</small>
            </div>
          </button>
          <img className="main-menu-logo" src={MAIN_MENU_LOGO} alt="Cuarenta" />
          <div className="menu-actions">
            <button className="new" onClick={openDifficulty}>Nueva partida</button>
            {savedGame && <button className="menu-button resume-button" onClick={resumeSavedGame}>Continuar partida</button>}
            <button className="menu-button" onClick={() => setScreen('ranking')}>Ranking</button>
            <button className="menu-button" onClick={() => setScreen('rules')}>Reglas</button>
            <button className="menu-button" onClick={() => setScreen('credits')}>Creditos</button>
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
