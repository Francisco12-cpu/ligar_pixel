/* ==========================================================================
   UI.JS
   Tudo relacionado a TELA: trocar de tela, desenhar a grade de Pokémon,
   atualizar a barra de vida, mostrar toasts/diálogos, sons, o convite de
   sala online (link/copiar/colar) e os handlers de clique. Não decide
   regras de batalha — só mostra o que battle-engine.js calculou.
   ========================================================================== */

// ---------- utilidades ----------
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

/** Substitui alert(): mostra um toast não-bloqueante no rodapé do app.
 *  isError=true deixa a borda vermelha (falhas de rede, validação etc.).
 *  durationMs: pode ser maior que o padrão pra mensagens mais longas que
 *  precisam de mais tempo pra ler (ex: instrução de como liberar a câmera). */
function toast(message, isError = false, durationMs = 3200) {
  const container = document.getElementById('toast-container');
  if (!container) { console.log(message); return; }
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}

// ---------- indicador offline ----------
// A batalha local (solo/duo no mesmo aparelho) funciona 100% sem internet.
// Só "BUSCAR POKÉMON" (PokeAPI) e "ONLINE" (sinalização entre aparelhos)
// precisam de rede — por isso avisamos e desabilitamos só esses botões.
function updateOnlineStatusUI() {
  const online = navigator.onLine;
  document.getElementById('offline-banner')?.classList.toggle('show', !online);
  const searchBtn = document.getElementById('btn-search-new');
  const onlineBtn = document.getElementById('btn-online');
  if (searchBtn) searchBtn.disabled = !online;
  if (onlineBtn) onlineBtn.disabled = !online;
}
window.addEventListener('online', updateOnlineStatusUI);
window.addEventListener('offline', updateOnlineStatusUI);

// ---------- telas ----------
const screens = {}; ['tutorial','intro','mode','select','search','online','battle','switch','victory','defeat'].forEach(id => { screens[id] = document.getElementById(`screen-${id}`); });
function showScreen(id) { Object.values(screens).forEach(s => s?.classList.remove('active')); screens[id]?.classList.add('active'); }
// rosterNatures: mapa índice-do-roster -> natureza escolhida na tela de
// seleção de time, pros ~43 Pokémon do roster inicial (que antes sempre
// batalhavam com natureza neutra fixa, sem UI pra mudar).
const uiState = { mode:null, difficulty:'normal', turnInProgress:false, playerParty:[], playerParty1:null, awaitingSecondTeam:false, roster:[], selectedForTeam:[], rosterNatures:{}, playerAction:null, opponentAction:null, currentPlayer:1, searchResult:null, searchMoves:[], selectedSearchMoves:[], audioCtx:null, myTeamSent:false, peerTeam:null };
// ---------- cores por tipo (pra golpes/chips) ----------
// Paleta oficial de cores por tipo (mesma usada nos jogos/site oficial) —
// pedido: as cores antigas de água/voador/normal ficavam muito parecidas.
const TYPE_COLORS = {
  // Elétrico escurecido (era #F8D030) — pedido do usuário: o amarelo vivo
  // original confundia com o dourado (#ffcc00) usado no resto da interface
  // (títulos, bordas de botão). Ver também a borda extra em updateMoveButtons().
  'Fogo':'#F08030', 'Água':'#6890F0', 'Grama':'#78C850', 'Elétrico':'#D4A017',
  'Psíquico':'#F85888', 'Lutador':'#C03028', 'Sombrio':'#705848', 'Fantasma':'#705898',
  'Dragão':'#7038F8', 'Voador':'#A890F0', 'Inseto':'#A8B820', 'Aço':'#B8B8D0',
  'Fada':'#EE99AC', 'Pedra':'#B8A038', 'Veneno':'#A040A0', 'Terra':'#E0C068', 'Normal':'#A8A878',
  'Gelo':'#98D8D8'
};
function typeColor(englishType) { return TYPE_COLORS[TYPE_TRANSLATION[englishType] || englishType] || '#3b6ea5'; }

// ---------- sons (osciladores simples, sem arquivo de áudio nenhum) ----------
function playTone(freq, dur, type='square', vol=0.08, delay=0) {
  try {
    if (!uiState.audioCtx) uiState.audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    const ctx = uiState.audioCtx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    g.gain.value = vol; o.frequency.value = freq; o.type = type;
    const t0 = ctx.currentTime + delay;
    o.start(t0); o.stop(t0 + dur);
  } catch(e) {}
}
const sfx = {
  click: () => playTone(600, 0.05),
  denied: () => playTone(200, 0.2),
  attack: () => playTone(320, 0.09, 'sawtooth'),
  hit: () => playTone(140, 0.15, 'square', 0.1),
  critHit: () => { playTone(180, 0.1, 'square', 0.12); playTone(260, 0.12, 'square', 0.1, 0.08); },
  miss: () => playTone(220, 0.2, 'sine', 0.06),
  faint: () => { playTone(300, 0.12, 'sine', 0.08); playTone(180, 0.12, 'sine', 0.08, 0.1); playTone(90, 0.25, 'sine', 0.08, 0.2); },
  switchIn: () => { playTone(400, 0.08, 'triangle', 0.07); playTone(560, 0.1, 'triangle', 0.07, 0.08); },
  victory: () => { [523,659,784,1047].forEach((f,i) => playTone(f, 0.2, 'square', 0.09, i*0.14)); },
  defeat: () => { [392,330,262,196].forEach((f,i) => playTone(f, 0.25, 'sine', 0.08, i*0.18)); }
};

// ---------- vibração (polimento pedido: feedback tátil em ações importantes) ----------
// Só dispara em aparelhos/navegadores que suportam a API (a maioria dos
// Android; iOS Safari não suporta — o try/catch garante que isso nunca vira
// um erro visível, só silenciosamente não vibra onde não dá).
function vibrate(pattern) { try { navigator.vibrate?.(pattern); } catch(e) {} }
const haptics = {
  hit: () => vibrate(15),
  critHit: () => vibrate([10,40,20]),
  faint: () => vibrate(60),
  victory: () => vibrate([20,40,20,40,40]),
  defeat: () => vibrate(80)
};

// ---------- tutorial (só na primeira vez, sempre pulável) ----------
const TUTORIAL_SLIDES = [
  { title:'Bem-vindo à Liga Pixel!', text:'Monte um time de até 6 Pokémon e batalhe usando o mesmo motor de cálculo dos jogos oficiais.' },
  { title:'Escolha os golpes', text:'Cada golpe tem a cor do seu tipo e mostra o quanto de dano ele deve causar (~% do HP do adversário).' },
  { title:'3 jeitos de jogar', text:'Sozinho contra a IA, com um amigo no mesmo aparelho (passando a vez), ou online com outro celular compartilhando um link de convite.' },
  { title:'Pronto!', text:'Você pode voltar aqui quando quiser — é só limpar os dados do app. Bora batalhar!' }
];
let tutorialStep = 0;
function renderTutorialSlide() {
  const slide = TUTORIAL_SLIDES[tutorialStep];
  document.getElementById('tutorial-content').innerHTML =
    `<h2 class="pixel-title" style="font-size:14px;">${escapeHtml(slide.title)}</h2><p style="font-size:16px;color:#ccc;">${escapeHtml(slide.text)}</p>`;
  document.getElementById('tutorial-dots').innerHTML = TUTORIAL_SLIDES.map((_,i) =>
    `<span style="width:8px;height:8px;border-radius:50%;background:${i===tutorialStep?'#ffcc00':'#444'};display:inline-block;"></span>`).join('');
  document.getElementById('btn-tutorial-next').textContent = tutorialStep === TUTORIAL_SLIDES.length-1 ? 'COMEÇAR' : 'PRÓXIMO';
}
function finishTutorial() {
  try { localStorage.setItem('liga_pixel_tutorial_seen', '1'); } catch(e) {}
  showScreen('intro');
}
document.getElementById('btn-tutorial-skip').addEventListener('click', finishTutorial);
document.getElementById('btn-tutorial-next').addEventListener('click', () => {
  if (tutorialStep < TUTORIAL_SLIDES.length-1) { tutorialStep++; renderTutorialSlide(); sfx.click(); }
  else finishTutorial();
});
/** Chamado pelo main.js no boot: decide se mostra o tutorial (1ª vez), vai
 *  direto pra tela inicial, ou — se o app foi aberto a partir de um link de
 *  convite compartilhado por outro jogador (?join=...) — pula direto pro
 *  passo de entrar na sala, já com o código preenchido. Isso é o que faz o
 *  link de convite ser mais rápido que copiar/colar manual: só precisa
 *  confirmar. */
function showFirstScreen() {
  const joinCode = extractJoinCodeFromLocation();
  if (joinCode) {
    history.replaceState(null, '', location.pathname); // evita reusar o mesmo código se a página for recarregada
    showScreen('online');
    pendingCodePurpose = 'join';
    document.getElementById('paste-code-label').textContent = 'Código do convite já preenchido — confira e confirme:';
    document.getElementById('paste-code-input').value = joinCode;
    document.getElementById('paste-code-wrap').style.display = 'flex';
    return;
  }
  let seen = false;
  try { seen = localStorage.getItem('liga_pixel_tutorial_seen') === '1'; } catch(e) {}
  if (seen) { showScreen('intro'); return; }
  tutorialStep = 0; renderTutorialSlide(); showScreen('tutorial');
}

document.getElementById('btn-start').addEventListener('click', () => { sfx.click(); showScreen('mode'); });
document.getElementById('btn-back-mode').addEventListener('click', () => {
  document.getElementById('difficulty-wrap').style.display = 'none';
  document.getElementById('btn-single').style.display = '';
  showScreen('intro');
});
document.getElementById('btn-single').addEventListener('click', () => {
  document.getElementById('difficulty-wrap').style.display = 'flex';
  document.getElementById('btn-single').style.display = 'none';
});
document.getElementById('btn-single-confirm').addEventListener('click', () => {
  uiState.mode = 'single';
  uiState.difficulty = document.getElementById('difficulty-select').value;
  document.getElementById('difficulty-wrap').style.display = 'none';
  document.getElementById('btn-single').style.display = '';
  goSelect();
});
document.getElementById('btn-duo').addEventListener('click', () => { sfx.click(); uiState.mode='duo'; goSelect(); });
document.getElementById('btn-online').addEventListener('click', () => {
  if (!navigator.onLine) { toast('O modo online precisa de internet (ao menos para o primeiro contato).', true); return; }
  showScreen('online');
});

function goSelect() { uiState.roster = getFullRoster(); uiState.selectedForTeam = []; uiState.rosterNatures = {}; uiState.awaitingSecondTeam = false; renderRoster(); showScreen('select'); document.getElementById('team-count').textContent = '0/6 selecionados'; }
function renderRoster() {
  const grid = document.getElementById('roster-grid'); if (!grid) return; grid.innerHTML = '';
  const cap = uiState.awaitingSecondTeam ? uiState.playerParty1.length : 6;
  uiState.roster.forEach((mon, i) => {
    const card = document.createElement('div'); card.className = 'pokemon-card';
    if (uiState.selectedForTeam.includes(i)) card.classList.add('selected');
    // Dados de mon.name/types podem ter vindo da PokeAPI (busca) — nunca
    // confiar neles em innerHTML sem escapar. spriteFallback: se a sprite
    // animada não existir (Pokémon de gerações mais novas), troca pela
    // estática automaticamente.
    card.innerHTML = `<img src="${escapeHtml(mon.sprite)}" alt="${escapeHtml(mon.name)}" loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(mon.spriteStatic||'')}'"><span>${escapeHtml(mon.name)}</span><small>${escapeHtml(mon.types.join('/'))}</small>`;
    card.addEventListener('click', () => {
      const idx = uiState.selectedForTeam.indexOf(i);
      if (idx > -1) uiState.selectedForTeam.splice(idx, 1);
      else if (uiState.selectedForTeam.length < cap) uiState.selectedForTeam.push(i);
      else { sfx.denied(); return; }
      sfx.click();
      document.getElementById('team-count').textContent = `${uiState.selectedForTeam.length}/${cap} selecionados`;
      renderRoster();
    });
    // NOVO: natureza escolhível também pros Pokémon do roster inicial, não só
    // nos buscados na PokeAPI — só aparece pra quem já está selecionado pro
    // time, pra não lotar a grade inteira de selects. Cliques dentro do
    // select não podem borbulhar pro card (senão desmarcaria o Pokémon).
    if (uiState.selectedForTeam.includes(i)) {
      const natureSel = document.createElement('select');
      natureSel.className = 'search-box card-nature-select';
      natureSel.innerHTML = NATURES.map(n => `<option value="${n.name}">${escapeHtml(n.pt)}${n.boost ? ` (+${n.boost.toUpperCase()}/-${n.drop.toUpperCase()})` : ' (neutra)'}</option>`).join('');
      natureSel.value = uiState.rosterNatures[i] || mon.nature || 'Serious';
      natureSel.addEventListener('click', e => e.stopPropagation());
      natureSel.addEventListener('change', e => { e.stopPropagation(); uiState.rosterNatures[i] = e.target.value; });
      card.appendChild(natureSel);
    }
    grid.appendChild(card);
  });
}

document.getElementById('btn-start-battle').addEventListener('click', () => {
  // BUG CORRIGIDO (grave): o app original reaproveitava este mesmo botão pra
  // "CONFIRMAR TIME JOGADOR 2" atribuindo um handler extra via btn.onclick,
  // mas o addEventListener original CONTINUAVA ativo. Os dois disparavam no
  // mesmo clique e acabavam misturando o time do Jogador 1 com o do Jogador
  // 2 (os dois viravam o mesmo Pokémon!). Agora existe um único handler que
  // decide o que fazer com base em uiState.awaitingSecondTeam.
  if (uiState.awaitingSecondTeam) { confirmSecondTeam(); return; }
  if (uiState.selectedForTeam.length === 0) return;
  uiState.playerParty = uiState.selectedForTeam.map(i => ({...uiState.roster[i], nature: uiState.rosterNatures[i] || uiState.roster[i].nature || 'Serious'}));
  // BUG CORRIGIDO: no arquivo original, battleState.playerParty só era
  // preenchido no fluxo de confirmação do Jogador 2 (modo duo). No modo
  // solo (o mais comum!) a batalha começava com o time do jogador vazio —
  // por isso currentPlayerMon() vinha undefined, sem HP e sem golpes.
  battleState.playerParty = uiState.playerParty;
  if (uiState.mode === 'single') {
    const rest = uiState.roster.filter((_,i) => !uiState.selectedForTeam.includes(i));
    if (rest.length === 0) { toast('Adicione mais Pokémon ao roster!', true); return; }
    battleState.rivalParty = rest.sort(()=>Math.random()-0.5).slice(0, Math.min(3, rest.length)).map(m => ({...m}));
  } else if (uiState.mode === 'duo') { battleState.rivalParty = []; }
  battleState.playerActiveIndex = 0; battleState.rivalActiveIndex = 0;
  battleState.battleOver = false; battleState.winner = null;
  uiState.playerAction = null; uiState.currentPlayer = 1;
  if (uiState.mode === 'duo') { document.getElementById('duo-ready-overlay').classList.remove('hidden'); showScreen('battle'); renderBattleField(); disableControls(); }
  else if (uiState.mode === 'online') {
    // Corrigido: o app original nunca preenchia battleState.rivalParty no modo
    // online — cada aparelho precisa enviar o próprio time pelo canal WebRTC e
    // esperar o time do outro antes de começar a batalha.
    document.getElementById('btn-start-battle').disabled = true;
    toast('Time enviado! Esperando o outro jogador...');
    uiState.myTeamSent = true;
    sendAction({ type:'team', party: uiState.playerParty });
    tryStartOnlineBattle();
  }
  else { showScreen('battle'); if (uiState.mode === 'single') battleState.rivalActiveIndex = 0; setupTurn(); renderBattleField(); }
});

function tryStartOnlineBattle() {
  if (!uiState.myTeamSent || !uiState.peerTeam) return;
  battleState.playerParty = uiState.playerParty;
  battleState.rivalParty = uiState.peerTeam;
  battleState.playerActiveIndex = 0; battleState.rivalActiveIndex = 0;
  battleState.battleOver = false; battleState.winner = null;
  document.getElementById('btn-start-battle').disabled = false;
  showScreen('battle'); renderBattleField(); setupTurn();
}

function confirmSecondTeam() {
  if (uiState.selectedForTeam.length !== uiState.playerParty1.length) {
    toast(`O Jogador 2 também precisa escolher ${uiState.playerParty1.length} Pokémon.`, true);
    return;
  }
  battleState.rivalParty = uiState.selectedForTeam.map(i => ({...uiState.roster[i], nature: uiState.rosterNatures[i] || uiState.roster[i].nature || 'Serious'}));
  const btn = document.getElementById('btn-start-battle');
  btn.textContent = 'INICIAR BATALHA';
  uiState.awaitingSecondTeam = false;
  showScreen('battle');
  battleState.playerParty = uiState.playerParty1;
  renderBattleField(); enableControls(1);
}

document.getElementById('duo-ready-btn').addEventListener('click', () => {
  document.getElementById('duo-ready-overlay').classList.add('hidden');
  toast('Jogador 2, selecione seu time.');
  // Guarda o time do Jogador 1 num campo separado antes de zerar
  // uiState.playerParty pra montar o do Jogador 2 (evita a troca acidental
  // de referência que causava o bug acima).
  uiState.playerParty1 = uiState.playerParty;
  uiState.playerParty = []; uiState.selectedForTeam = []; uiState.rosterNatures = {}; renderRoster(); showScreen('select');
  uiState.awaitingSecondTeam = true;
  document.getElementById('team-count').textContent = `0/${uiState.playerParty1.length} selecionados`;
  document.getElementById('btn-start-battle').textContent = 'CONFIRMAR TIME JOGADOR 2';
});

document.getElementById('btn-search-new').addEventListener('click', () => showScreen('search'));
document.getElementById('btn-back-select').addEventListener('click', () => showScreen('mode'));
document.getElementById('btn-back-from-search').addEventListener('click', () => showScreen('select'));

document.getElementById('search-input-btn').addEventListener('click', async () => {
  const q = document.getElementById('search-input').value.trim(); if (!q) return;
  if (!navigator.onLine) { toast('Buscar Pokémon precisa de internet.', true); return; }
  const btn = document.getElementById('search-input-btn'); btn.disabled = true; btn.textContent = 'Carregando...';
  try {
    const data = await fetchPokemonRaw(q);
    if (!data) { toast('Pokémon não encontrado.', true); btn.disabled = false; btn.textContent = 'Buscar'; return; }
    uiState.searchResult = data; uiState.selectedSearchMoves = [];
    document.getElementById('search-result-container').innerHTML = `<img src="${escapeHtml(data.sprites.front_default)}" alt="${escapeHtml(data.name)}"><h3>${escapeHtml(data.name.toUpperCase())}</h3>`;
    document.getElementById('move-filter-wrap').style.display = 'flex';
    // Natureza e habilidade — natureza é uma lista fixa, habilidade já vem
    // no próprio resultado da busca (sem chamada extra à internet).
    const natureSel = document.getElementById('search-nature-select');
    natureSel.innerHTML = NATURES.map(n => `<option value="${n.name}">${escapeHtml(n.pt)}${n.boost ? ` (+${n.boost.toUpperCase()}/-${n.drop.toUpperCase()})` : ' (neutra)'}</option>`).join('');
    natureSel.value = 'Serious';
    const abilitySel = document.getElementById('search-ability-select');
    const abilities = abilitiesForSpecies(data);
    abilitySel.innerHTML = abilities.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()))}</option>`).join('') || '<option value="">(padrão)</option>';
    // Golpes bloqueados (mecânica complexa demais pro motor atual) somem da
    // lista — assim nunca dá pra montar um Pokémon com um golpe que o
    // sistema não sabe tratar direito.
    const moves = (await fetchMovesForPokemon(data)).filter(m => !BLOCKED_MOVE_NAMES.has(normalizeMoveKey(m.name)));
    uiState.searchMoves = moves; renderSearchMoves();
  } catch(e) { toast('Erro de conexão. Verifique sua internet e tente de novo.', true); }
  btn.disabled = false; btn.textContent = 'Buscar';
});

document.getElementById('search-type-filter').addEventListener('change', renderSearchMoves);
function renderSearchMoves() {
  const grid = document.getElementById('search-moves-grid'); if (!grid) return;
  const filter = document.getElementById('search-type-filter').value;
  const moves = filter ? uiState.searchMoves.filter(m => m.type === filter) : uiState.searchMoves;
  grid.innerHTML = '';
  moves.forEach(m => {
    const chip = document.createElement('div'); chip.className = 'move-chip';
    chip.style.borderLeft = `5px solid ${typeColor(m.type)}`;
    if (uiState.selectedSearchMoves.find(s => s.name === m.name)) chip.classList.add('selected');
    const displayName = moveDisplayName(m.name);
    const typeLabel = TYPE_TRANSLATION[m.type] || m.type;
    const meta = m.power > 0 ? `${typeLabel} · Poder ${m.power} · Prec. ${m.accuracy}%` : `${typeLabel} · Status`;
    chip.innerHTML = `<span class="move-chip-type" style="color:${typeColor(m.type)}">${escapeHtml(typeLabel)}</span><span>${escapeHtml(displayName)}</span><span class="move-chip-meta">${escapeHtml(meta)}</span>`;
    chip.addEventListener('click', () => {
      const idx = uiState.selectedSearchMoves.findIndex(s => s.name === m.name);
      if (idx > -1) uiState.selectedSearchMoves.splice(idx, 1);
      else if (uiState.selectedSearchMoves.length < 4) uiState.selectedSearchMoves.push(m);
      else { sfx.denied(); return; }
      sfx.click(); renderSearchMoves();
    });
    grid.appendChild(chip);
  });
}

document.getElementById('btn-save-pokemon').addEventListener('click', async () => {
  if (!uiState.searchResult || uiState.selectedSearchMoves.length===0) return;
  const nature = document.getElementById('search-nature-select').value;
  const ability = document.getElementById('search-ability-select').value;
  const mon = normalizeChosenPokemon(uiState.searchResult, uiState.selectedSearchMoves, nature, ability);
  saveToLocalDex(mon); toast(`${mon.name} salvo na Pokédex!`); showScreen('select');
  uiState.roster = getFullRoster(); renderRoster();
});

// CORRIGIDO (causa raiz de "o outro aparelho não conseguia entrar na
// sala"): faltava inteiramente o passo em que o ANFITRIÃO captura a
// resposta do convidado e chama completeConnection() — sem isso a conexão
// nunca fechava. "purpose" indica o que o código colado significa
// ('join' = convidado lendo o convite do anfitrião, 'answer' = anfitrião
// lendo a resposta do convidado).
let pendingCodePurpose = null;
let currentDisplayedCode = '';
let currentShareText = '';

// QR code REMOVIDO (pedido do usuário, depois de confirmar o diagnóstico:
// o payload do WebRTC gerava um código denso demais — versão 35, 157
// módulos — pra câmera de celular ler com confiança, ver CONTEXT_IA.md).
// No lugar: link de convite compartilhável via Web Share API nativa do
// Android (abre a folha de compartilhamento de verdade, sem precisar abrir
// o WhatsApp manualmente), com cópia de link como alternativa universal
// (desktop, navegadores sem suporte a Web Share) e colar manual sempre
// disponível dos dois lados.
function buildInviteLink(code) {
  return `${location.origin}${location.pathname}?join=${encodeURIComponent(code)}`;
}
function showCodeDisplay(code, label, shareText) {
  currentDisplayedCode = code;
  currentShareText = shareText;
  document.getElementById('room-code-display').style.display = 'flex';
  document.getElementById('code-label').textContent = label;
}
async function shareCurrentCode() {
  const url = buildInviteLink(currentDisplayedCode);
  if (navigator.share) {
    try { await navigator.share({ title: 'Liga Pixel', text: currentShareText, url }); }
    catch (e) { /* usuário cancelou a folha de compartilhamento — não é erro */ }
  } else {
    await copyCurrentCode();
  }
}
async function copyCurrentCode() {
  const url = buildInviteLink(currentDisplayedCode);
  try { await navigator.clipboard.writeText(url); toast('Link copiado! Envie por WhatsApp, Bluetooth etc.'); }
  catch (e) { toast('Não foi possível compartilhar nem copiar automaticamente.', true); }
}
// Aceita tanto o link de convite inteiro (ex: https://.../?join=XXXX)
// quanto só o código colado direto — no primeiro caso, extrai o parâmetro.
function extractCodeFromPastedText(raw) {
  const text = String(raw || '').trim();
  try {
    const url = new URL(text);
    const fromParam = url.searchParams.get('join');
    if (fromParam) return fromParam;
  } catch (e) { /* não é uma URL válida, trata como código cru */ }
  return text;
}
// Detecta se o app foi aberto a partir de um link de convite (?join=...)
// compartilhado por outro jogador — usado em showFirstScreen() pra pular
// direto pro passo de entrar na sala, já com o código preenchido.
function extractJoinCodeFromLocation() {
  try { return new URLSearchParams(location.search).get('join'); }
  catch (e) { return null; }
}
// CORRIGIDO (auditoria de multiplayer): antes, nada tratava a conexão
// caindo NO MEIO de uma partida online (tela apagou, Wi-Fi caiu, app foi
// pra segundo plano e o SO matou a conexão) — o jogador que ficasse
// esperando a vez/resposta do outro simplesmente nunca mais recebia nada,
// com os botões travados pra sempre (um "trava" real, específico do modo
// online, que nenhum teste anterior cobria). Agora, se o canal fechar
// enquanto uiState.mode já é 'online' (ou seja, depois que a partida
// começou), volta pro menu com aviso em vez de ficar preso.
function handleConnectionStateChange(state, connectedMsg) {
  if (state === 'open') { toast(connectedMsg); uiState.mode = 'online'; goSelect(); }
  else if (state === 'closed' && uiState.mode === 'online') {
    toast('Conexão com o oponente foi perdida. Partida encerrada.', true);
    battleState.playerParty = []; battleState.rivalParty = [];
    battleState.battleOver = false; battleState.winner = null;
    uiState.turnInProgress = false; uiState.playerAction = null; uiState.opponentAction = null;
    uiState.myTeamSent = false; uiState.peerTeam = null; uiState.mode = null;
    showScreen('mode');
  }
}
async function handleIncomingCode(purpose, rawCode) {
  const code = extractCodeFromPastedText(rawCode);
  if (!code) { toast('Cole um código válido.', true); return; }
  if (purpose === 'join') {
    try {
      const answerCode = await joinRoom(code);
      uiState.isHost = false;
      showCodeDisplay(answerCode, 'Sala encontrada! Mande esta resposta de volta pro anfitrião:', 'Aqui está minha resposta pra conectar na Liga Pixel!');
      onConnectionState(state => handleConnectionStateChange(state, 'Conectado!'));
    } catch (e) { toast('Código inválido ou sala expirada. Peça um novo.', true); }
  } else if (purpose === 'answer') {
    try {
      await completeConnection(code);
      document.getElementById('host-await-answer').style.display = 'none';
      toast('Código recebido! Conectando...');
    } catch (e) { toast('Código de resposta inválido. Peça pro convidado mandar de novo.', true); }
  }
}

document.getElementById('btn-back-online').addEventListener('click', () => showScreen('mode'));
document.getElementById('btn-create-room').addEventListener('click', async () => {
  try {
    const code = await createRoom();
    uiState.isHost = true;
    showCodeDisplay(code, 'Sala criada! Compartilhe o link com seu oponente:', 'Entra na minha sala da Liga Pixel!');
    document.getElementById('host-await-answer').style.display = 'flex';
    onConnectionState(state => handleConnectionStateChange(state, 'Oponente conectado!'));
  } catch(e) { toast('Erro ao criar sala. O modo online exige HTTPS (ou localhost).', true); }
});
document.getElementById('btn-share-code').addEventListener('click', shareCurrentCode);
document.getElementById('btn-copy-code').addEventListener('click', copyCurrentCode);
document.getElementById('btn-join-room').addEventListener('click', () => {
  pendingCodePurpose = 'join';
  document.getElementById('paste-code-label').textContent = 'Cole aqui o link/código que o anfitrião compartilhou:';
  document.getElementById('paste-code-input').value = '';
  document.getElementById('paste-code-wrap').style.display = 'flex';
});
document.getElementById('btn-paste-answer').addEventListener('click', () => {
  pendingCodePurpose = 'answer';
  document.getElementById('paste-code-label').textContent = 'Cole aqui a resposta que o convidado te mandou:';
  document.getElementById('paste-code-input').value = '';
  document.getElementById('paste-code-wrap').style.display = 'flex';
});
document.getElementById('btn-cancel-paste').addEventListener('click', () => { document.getElementById('paste-code-wrap').style.display = 'none'; });
document.getElementById('btn-paste-confirm').addEventListener('click', () => {
  const code = document.getElementById('paste-code-input').value;
  document.getElementById('paste-code-wrap').style.display = 'none';
  handleIncomingCode(pendingCodePurpose, code);
});

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function playEvent(ev) {
  const el = document.getElementById(`${domSideFor(ev.side || ev.defenderSide)}-mon`);
  if (ev.type === 'switchIn') {
    const container = document.getElementById(`${domSideFor(ev.side)}-mon`);
    const sprite = container?.querySelector('.sprite');
    sfx.switchIn();
    if (sprite) { sprite.classList.remove('shown'); await wait(120); }
    const mon = ev.side === 'player' ? currentPlayerMon() : currentRivalMon();
    if (mon) updateMonDisplay(ev.side, mon);
    container?.classList.add('anim-pop');
    await wait(450);
    container?.classList.remove('anim-pop');
    return;
  }
  if (ev.type === 'miss') {
    sfx.miss();
    await wait(300);
    return;
  }
  if (ev.type === 'heal') {
    const container = document.getElementById(`${domSideFor(ev.side)}-mon`);
    sfx.switchIn(); // reaproveita o "blip" ascendente, combina com cura
    if (container) setHpBar(container, ev.hpAfter, ev.maxHp);
    container?.classList.add('anim-pop');
    await wait(400);
    container?.classList.remove('anim-pop');
    return;
  }
  if (ev.type === 'status-move') {
    sfx.click();
    await wait(350);
    return;
  }
  if (ev.type === 'attack') {
    const attackerEl = document.getElementById(`${domSideFor(ev.side)}-mon`);
    const defenderEl = document.getElementById(`${domSideFor(ev.defenderSide)}-mon`);
    sfx.attack();
    attackerEl?.classList.add(ev.side === 'player' ? 'anim-attack-player' : 'anim-attack-rival');
    await wait(280);
    attackerEl?.classList.remove('anim-attack-player','anim-attack-rival');
    ev.crit ? sfx.critHit() : sfx.hit();
    ev.crit ? haptics.critHit() : haptics.hit();
    defenderEl?.classList.add(ev.crit ? 'anim-hit-crit' : 'anim-hit');
    const wrap = defenderEl?.querySelector('.sprite-wrap');
    if (wrap) {
      const popup = document.createElement('div');
      popup.className = 'dmg-popup' + (ev.crit ? ' crit' : '');
      popup.textContent = '-' + ev.dmg;
      wrap.appendChild(popup);
      setTimeout(() => popup.remove(), 900);
    }
    if (defenderEl) setHpBar(defenderEl, ev.hpAfter, ev.maxHp);
    await wait(450);
    defenderEl?.classList.remove('anim-hit','anim-hit-crit');
    return;
  }
  if (ev.type === 'faint') {
    const container = document.getElementById(`${domSideFor(ev.side)}-mon`);
    sfx.faint();
    haptics.faint();
    container?.querySelector('.sprite-wrap')?.classList.add('anim-faint');
    await wait(600);
    container?.querySelector('.sprite-wrap')?.classList.remove('anim-faint');
    const sprite = container?.querySelector('.sprite');
    sprite?.classList.remove('shown');
    return;
  }
}

// ---------- tela de batalha ----------
// Pré-carregamento de sprites (polimento pedido: evitar o "atraso" de
// carregar a imagem só na primeira vez que um Pokémon do banco entra em
// campo). new Image().src força o navegador a buscar/cachear a imagem sem
// precisar mostrá-la ainda. O Set evita repetir a mesma URL a cada
// renderBattleField() (chamado toda vez que a tela de batalha atualiza).
const preloadedSprites = new Set();
function preloadPartySprites(party) {
  party.forEach(m => {
    [m.sprite, m.spriteStatic].forEach(url => {
      if (url && !preloadedSprites.has(url)) { preloadedSprites.add(url); new Image().src = url; }
    });
  });
}
function renderBattleField() {
  preloadPartySprites([...(battleState.playerParty||[]), ...(battleState.rivalParty||[])]);
  const pm = currentPlayerMon();
  if (pm) updateMonDisplay('player', pm);
  const rm = currentRivalMon();
  if (rm) updateMonDisplay('rival', rm);
  updateMoveButtons();
}

function setHpBar(el, currentHp, maxHp) {
  const pct = maxHp ? (currentHp/maxHp)*100 : 0;
  const fill = el.querySelector('.hp-fill');
  fill.style.width = Math.max(0,pct)+'%';
  fill.classList.remove('mid','low');
  if (pct <= 20) fill.classList.add('low');
  else if (pct <= 50) fill.classList.add('mid');
  el.querySelector('.hp-text').textContent = `${Math.max(0,currentHp)||0}/${maxHp||0}`;
}

function updateMonDisplay(side, mon) {
  const el = document.getElementById(`${domSideFor(side)}-mon`);
  if (!el) return;
  // Corrigido: antes o lado "rival" nunca atualizava nome/sprite do Pokémon
  // ativo (ficava travado no texto fixo "Rival" e numa imagem de placeholder
  // que apontava pra um arquivo — ./rival.png — que nem existe no projeto).
  // Agora os dois lados mostram o Pokémon realmente ativo, com fallback pra
  // sprite estática se a animada não existir.
  const sprite = el.querySelector('.sprite');
  if (sprite && mon.sprite) {
    sprite.onerror = () => { sprite.onerror = null; sprite.src = mon.spriteStatic || mon.sprite; };
    sprite.src = mon.sprite;
    sprite.classList.add('shown');
  }
  const nameEl = el.querySelector('.name');
  if (nameEl) nameEl.textContent = mon.name || '';
  setHpBar(el, mon.currentHp, mon.maxHp);
  el.querySelector('.status').textContent = mon.status || '';
}

// No modo duo os dois jogadores humanos se revezam no MESMO celular. Battle-
// State sempre trata um lado como "player" e o outro como "rival" (papéis
// fixos), mas quem está com a vez de escolher muda. Esta função resolve
// "de quem são os golpes que devo mostrar agora" corretamente.
// CORRIGIDO: girar a tela (#app.rotated) só troca a ORIENTAÇÃO visual, não
// troca qual time aparece em qual elemento — #player-mon sempre mostrava
// battleState.playerParty (time do Jogador 1) e #rival-mon sempre
// battleState.rivalParty (time do Jogador 2), mesmo depois de girar. Como a
// rotação de 180° cancela o ângulo de visão do Jogador 2 (que está do lado
// oposto da mesa), o resultado pra ele era ver o time do Jogador 1 na
// posição "perto/embaixo" que deveria ser a dele. domSideFor() traduz um
// lado LÓGICO (dono dos dados: 'player'=J1, 'rival'=J2) pro lado VISUAL
// (id do elemento DOM a atualizar), invertendo os dois só quando a tela
// está de fato girada (duo + vez do Jogador 2).
function domSideFor(logicalSide) {
  if (uiState.mode === 'duo' && uiState.currentPlayer === 2) return logicalSide === 'player' ? 'rival' : 'player';
  return logicalSide;
}
function activeSideForTurn() { return (uiState.mode === 'duo' && uiState.currentPlayer === 2) ? 'rival' : 'player'; }
function activeMonForTurn() { return activeSideForTurn() === 'rival' ? currentRivalMon() : currentPlayerMon(); }
function targetMonForTurn() { return activeSideForTurn() === 'rival' ? currentPlayerMon() : currentRivalMon(); }

function updateMoveButtons() {
  // BUG CORRIGIDO: antes os botões sempre mostravam os golpes de
  // currentPlayerMon(), então no modo duo o Jogador 2 via (e usava!) os
  // golpes do Pokémon do Jogador 1 na vez dele.
  const mon = activeMonForTurn();
  const target = targetMonForTurn();
  document.querySelectorAll('.move-btn').forEach((btn,i) => {
    const move = mon?.moves[i];
    if (!move) { btn.innerHTML = '---'; btn.style.background = ''; btn.style.borderColor = ''; return; }
    // NOVO: cor do botão de acordo com o tipo do golpe (tipo real, vindo do
    // motor de cálculo — não do que foi digitado manualmente nos dados).
    btn.style.background = typeColor(move.type);
    // Pedido do usuário: o amarelo do tipo Elétrico (mesmo já escurecido)
    // ainda pode confundir com outros elementos dourados da interface — uma
    // borda branca de destaque deixa claro que não é só cor de fundo.
    btn.style.borderColor = move.type === 'electric' ? '#fff' : '';
    const typeLabel = TYPE_TRANSLATION[move.type] || move.type;
    const typeBadge = `<span class="move-type-badge">${escapeHtml(typeLabel)}</span>`;
    // NOVO: preview de dano estimado (% do HP do oponente) em cada golpe —
    // já que o motor real de cálculo está disponível, custa pouco mostrar.
    let dmgLabel = '';
    if (target && move.power > 0) {
      const est = estimateDamage(mon, target, move);
      const pct = target.maxHp ? Math.min(100, Math.round((est / target.maxHp) * 100)) : 0;
      dmgLabel = `<span class="move-dmg">~${pct}% HP</span>`;
    }
    btn.innerHTML = `${typeBadge}${escapeHtml(moveDisplayName(move.name).toUpperCase())}${dmgLabel}`;
  });
}
function enableControls(p=1) {
  document.querySelectorAll('.move-btn').forEach(b => b.disabled = false);
  document.getElementById('btn-switch').disabled = false;
  document.getElementById('player-label').textContent = uiState.mode==='duo' ? `Jogador ${p}` : '';
  // NOVO: no duo, a tela vira 180° na vez do Jogador 2 (que está sentado do
  // lado oposto da mesa) — não precisa girar o celular na mão, o app já
  // ajusta sozinho. Cliques continuam funcionando normalmente.
  document.getElementById('app')?.classList.toggle('rotated', uiState.mode === 'duo' && p === 2);
  // CORRIGIDO: precisa re-renderizar os dois Pokémon aqui, não só os botões
  // de golpe — domSideFor() decide qual time vai em qual elemento DOM
  // baseado em uiState.currentPlayer, então toda vez que a vez muda (mesmo
  // sem passar por resolveTurn(), como ao trocar de Pokémon por desmaio) a
  // exibição precisa ser recalculada, senão fica com o conteúdo da vez
  // anterior até o próximo evento de turno.
  renderBattleField();
}
function disableControls() { document.querySelectorAll('.move-btn').forEach(b => b.disabled = true); document.getElementById('btn-switch').disabled = true; }
document.querySelectorAll('.move-btn').forEach((btn,i) => { btn.addEventListener('click', () => { const mon = activeMonForTurn(); if (!mon?.moves[i]) return; onPlayerAction({ type:'move', move:mon.moves[i] }); }); });
/** Tela dedicada de troca (substitui o menu estreito de antes — pedido do
 *  usuário pra parecer mais com os jogos oficiais). Mostra o TIME INTEIRO
 *  (inclusive o ativo e os desmaiados, só que não clicáveis), sprite
 *  grande, HP visível e destaque de quem está ativo.
 *  side: 'player' ou 'rival' — de quem é o time mostrado.
 *  forced: true = troca obrigatória (Pokémon desmaiou), sem botão voltar;
 *  false = troca voluntária, com botão voltar.
 *  remote: true = esta tela está sendo mostrada no CONVIDADO, pra escolher
 *  o substituto do PRÓPRIO time depois que o anfitrião avisou que ele
 *  desmaiou — em vez de aplicar a troca localmente, manda a escolha de
 *  volta pela rede (o anfitrião que aplica de verdade, ele é quem roda
 *  resolveTurn()). */
function openSwitchScreen(side, forced, remote) {
  const party = side === 'rival' ? battleState.rivalParty : battleState.playerParty;
  const activeIdx = side === 'rival' ? battleState.rivalActiveIndex : battleState.playerActiveIndex;
  document.getElementById('switch-screen-title').textContent = forced ? 'ESCOLHA OUTRO POKÉMON' : 'TROCAR POKÉMON';
  document.getElementById('btn-switch-cancel').style.display = forced ? 'none' : '';
  const grid = document.getElementById('switch-grid'); grid.innerHTML = '';
  party.forEach((m, i) => {
    const fainted = m.currentHp <= 0;
    const isActive = i === activeIdx;
    const card = document.createElement('div');
    card.className = 'switch-card' + (isActive ? ' active' : '') + (fainted ? ' fainted' : '');
    const pct = m.maxHp ? Math.max(0, (m.currentHp / m.maxHp) * 100) : 0;
    const barClass = pct <= 20 ? 'low' : pct <= 50 ? 'mid' : '';
    const badge = isActive ? '<span class="switch-card-badge" style="color:#4caf50;">EM CAMPO</span>' : fainted ? '<span class="switch-card-badge" style="color:#f44336;">DESMAIOU</span>' : '';
    card.innerHTML = `
      <img src="${escapeHtml(m.sprite)}" alt="${escapeHtml(m.name)}" onerror="this.onerror=null;this.src='${escapeHtml(m.spriteStatic||'')}'">
      <span class="switch-card-name">${escapeHtml(m.name)}</span>
      ${badge}
      <div class="hp-bar"><div class="hp-fill ${barClass}" style="width:${Math.max(0,pct)}%"></div></div>
      <span class="hp-text">${Math.max(0,m.currentHp)}/${m.maxHp}</span>
    `;
    if (!isActive && !fainted) {
      card.addEventListener('click', () => {
        sfx.click();
        showScreen('battle');
        if (remote) {
          sendAction({ type:'faintChoiceResponse', index: i });
          toast('Escolha enviada! Aguardando o anfitrião...');
        } else if (forced) {
          setPlayerFaintChoice(i); renderBattleField();
          if (uiState.mode==='duo') { uiState.currentPlayer = 1; playPassTurn(1); }
          else setupTurn();
        } else {
          onPlayerAction({ type:'switch', index:i });
        }
      });
    }
    grid.appendChild(card);
  });
  showScreen('switch');
}
document.getElementById('btn-switch-cancel').addEventListener('click', () => { sfx.click(); showScreen('battle'); });
document.getElementById('btn-switch').addEventListener('click', () => openSwitchScreen(activeSideForTurn(), false));
function setupTurn() { if (uiState.mode==='single' || uiState.mode==='online') enableControls(1); else if (uiState.mode==='duo') enableControls(uiState.currentPlayer); }
// getRivalAction agora mora em battle-engine.js (usa o motor real pra escolher
// o golpe de maior dano esperado, não só o maior "power" bruto).
async function onPlayerAction(action) {
  if (battleState.battleOver) return;
  // BUG CORRIGIDO (o "trava tudo"): clicar duas vezes rápido no mesmo golpe
  // (ou em dois golpes em sequência muito rápida) podia disparar duas
  // resoluções de turno ao mesmo tempo — a segunda começava antes da
  // primeira terminar de desabilitar os botões, corrompendo o estado da
  // batalha e deixando os botões visualmente "acinzentados" (desabilitados)
  // pra sempre, sem nenhuma mensagem aparecer. uiState.turnInProgress
  // garante que só uma resolução de turno roda por vez.
  if (uiState.turnInProgress) return;
  if (uiState.mode==='online') {
    uiState.turnInProgress = true;
    disableControls();
    if (!uiState.isHost) {
      // Convidado: nunca calcula nada, só manda a ação e espera o anfitrião
      // mandar de volta o resultado já pronto (ver onReceiveAction abaixo).
      sendAction(action);
      uiState.turnInProgress = false; // aqui só terminamos de "enviar", quem processa é o onReceiveAction
      return;
    }
    // Anfitrião: guarda a própria ação; se a do convidado já tiver chegado,
    // resolve o turno agora. Senão, espera ela chegar (ver onReceiveAction).
    uiState.playerAction = action;
    if (uiState.opponentAction) {
      const guestAction = uiState.opponentAction; uiState.opponentAction = null;
      await runHostTurn(action, guestAction);
    } else {
      uiState.turnInProgress = false; // esperando o convidado, ainda não é "em progresso"
    }
    return;
  }
  let pAct=action, rAct;
  if (uiState.mode==='single') rAct = getRivalAction(uiState.difficulty || 'normal');
  else if (uiState.mode==='duo') { if (uiState.currentPlayer===1) { uiState.playerAction=action; playPassTurn(2); return; } else { pAct=uiState.playerAction; rAct=action; uiState.playerAction=null; } }
  await executeTurn(pAct, rAct);
}
async function executeTurn(pAct, rAct) {
  uiState.turnInProgress = true;
  disableControls();
  try {
    const result = await resolveTurn(pAct, rAct);
    await playEventsAndFinish(result);
  } catch (e) {
    // Rede de segurança: se QUALQUER coisa der errado no meio do turno, o
    // jogo não fica mais travado pra sempre — mostra um aviso e devolve o
    // controle pro jogador continuar jogando.
    console.error('Erro ao resolver turno:', e);
    toast('Algo deu errado nesse turno. Tente de novo.', true);
    setupTurn();
  } finally {
    uiState.turnInProgress = false;
  }
}
/** Anfitrião do modo online: calcula o turno de verdade (única fonte de
 *  aleatoriedade) e manda o resultado pronto pro convidado — que só reproduz
 *  a mesma animação/HP, sem rodar sua própria conta. */
async function runHostTurn(hostAction, guestAction) {
  uiState.turnInProgress = true;
  uiState.playerAction = null;
  try {
    const result = await resolveTurn(hostAction, guestAction);
    sendAction({ type:'result', log: result.log, events: flipEventsForPeer(result.events), snapshot: snapshotForPeer() });
    await playEventsAndFinish(result);
  } catch (e) {
    console.error('Erro ao resolver turno (anfitrião):', e);
    toast('Algo deu errado nesse turno. Tente de novo.', true);
    setupTurn();
  } finally {
    uiState.turnInProgress = false;
  }
}
/** Toca os eventos, atualiza o log e decide a próxima tela — usado tanto
 *  pelo fluxo local (solo/duo/anfitrião online) quanto pelo convidado
 *  (que recebe o resultado pronto em vez de calcular). */
async function playEventsAndFinish(result) {
  const logEl = document.getElementById('battle-log');
  logEl.innerHTML = result.log.map(m => `<p>${escapeHtml(m)}</p>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
  // NOVO: cada evento (troca, ataque, erro, desmaio) é animado em sequência,
  // com som e popup de dano — em vez de só aparecer o resultado final.
  for (const ev of result.events) { await playEvent(ev); }
  renderBattleField();
  // NOVO (pedido do usuário: a sequência de derrota acontecia rápido demais)
  // — uma pausa curta depois do desmaio dá tempo do jogador "sentir" o
  // momento (ataque -> dano -> HP cai -> desmaia -> ANIMAÇÃO TERMINA -> só
  // então corta pra próxima tela) em vez de já cortar pra vitória/derrota/
  // seleção no mesmo instante que a animação de desmaio termina.
  const lastEvent = result.events[result.events.length - 1];
  if (lastEvent?.type === 'faint') { await wait(500); }
  if (result.battleOver) { showBattleEnd(result.winner); return; }
  // BUG CORRIGIDO: só o lado "player" recebia a tela de troca ao desmaiar; no
  // modo duo o Jogador 2 (rivalParty) tinha o próximo Pokémon escolhido
  // automaticamente, sem chance de decidir. getFaintPendingSide() (de
  // battle-engine.js) diz qual lado está esperando uma escolha manual agora.
  if (getFaintPendingSide()) { openSwitchScreen(getFaintPendingSide(), true); }
  else if (uiState.mode==='duo') { uiState.currentPlayer=1; playPassTurn(1); }
  else { setupTurn(); }
}

/** Corrigido: em duo, "Parabéns, você venceu!" não dizia QUAL dos dois
 *  jogadores era — os dois estavam olhando o mesmo celular. Agora mostra o
 *  nome de quem ganhou/perdeu e o Pokémon que decidiu a partida. */
function showBattleEnd(winner) {
  document.getElementById('app')?.classList.remove('rotated');
  const winnerMon = winner === 'player' ? currentPlayerMon() : currentRivalMon();
  if (uiState.mode === 'duo') {
    const winnerLabel = winner === 'player' ? 'Jogador 1' : 'Jogador 2';
    const loserLabel = winner === 'player' ? 'Jogador 2' : 'Jogador 1';
    const id = winner === 'player' ? 'victory-message' : 'defeat-message';
    const el = document.getElementById(id);
    if (el) el.textContent = `${winnerLabel} venceu com ${winnerMon?.name || '???'}! ${loserLabel}, mais sorte na próxima.`;
  } else {
    const id = winner === 'player' ? 'victory-message' : 'defeat-message';
    const el = document.getElementById(id);
    if (el) el.textContent = winner === 'player'
      ? `${winnerMon?.name || 'Seu time'} garantiu a vitória!`
      : `Seu time não resistiu dessa vez. Tenta de novo!`;
  }
  showScreen(winner === 'player' ? 'victory' : 'defeat');
  winner === 'player' ? sfx.victory() : sfx.defeat();
  winner === 'player' ? haptics.victory() : haptics.defeat();
}
function playPassTurn(next) {
  // Corrigido (pedido explícito): antes isso mostrava uma tela cheia
  // bloqueando o jogo a CADA turno pedindo "passe o celular, toque aqui
  // quando pronto" — para duas pessoas sentadas com o mesmo celular na mesa,
  // isso é atrito desnecessário toda hora. Agora a troca é instantânea, só
  // com um aviso rápido (toast) de quem é a vez.
  uiState.currentPlayer = next;
  if (next === 2) { enableControls(2); } else { enableControls(1); uiState.playerAction = null; }
  toast(`Vez do Jogador ${next}`);
}
// Assim que o motor avisar que precisa de uma escolha de troca (Pokémon
// desmaiou e tem substituto), mostra o menu NA HORA — é isso que resolve o
// deadlock (ver comentário em handleFaint, battle-engine.js).
// RESOLVIDO: no modo online, quando quem desmaiou é o time do CONVIDADO
// ('rival', do ponto de vista do anfitrião, que é quem roda isso), o
// anfitrião não escolhe mais por ele — manda a decisão pela rede e espera
// a resposta (ver onReceiveAction: 'faintChoiceResponse' chama
// setPlayerFaintChoice(), que resolve a Promise que handleFaint() está
// esperando, exatamente como a escolha local faria).
onFaintChoiceNeeded((side) => {
  if (uiState.mode === 'online' && side === 'rival') {
    sendAction({ type:'faintChoiceRequest', party: battleState.rivalParty, activeIndex: battleState.rivalActiveIndex });
    toast('Aguardando o oponente escolher o substituto...');
  } else {
    openSwitchScreen(side, true);
  }
});

onReceiveAction((action) => {
  if (uiState.mode!=='online') return;
  if (action.type === 'team') { uiState.peerTeam = action.party; tryStartOnlineBattle(); return; }
  if (action.type === 'result') {
    // Convidado: aplica o resultado que o anfitrião já calculou, sem rodar
    // nenhuma conta própria — garante que os dois vejam exatamente a mesma
    // coisa (mesmo dano, mesmo crítico, mesma chance de status).
    applyPeerSnapshot(action.snapshot);
    playEventsAndFinish({ log: action.log, events: action.events, battleOver: battleState.battleOver, winner: battleState.winner });
    return;
  }
  // RESOLVIDO: antes, quando o Pokémon do CONVIDADO desmaiava, o anfitrião
  // escolhia o substituto automaticamente por ele (limitação documentada no
  // README). Agora o anfitrião manda um pedido explícito com o time do
  // convidado NAQUELE momento do turno (o convidado ainda não tem essa
  // atualização, porque o snapshot final só chega no fim do turno) — o
  // convidado escolhe na própria tela de troca e manda a resposta de volta.
  if (action.type === 'faintChoiceRequest') {
    battleState.playerParty = action.party;
    battleState.playerActiveIndex = action.activeIndex;
    openSwitchScreen('player', true, true);
    return;
  }
  if (action.type === 'faintChoiceResponse') {
    // Resolve a Promise que handleFaint() (battle-engine.js) está esperando
    // — o mesmo mecanismo usado pra escolha local, só que a "escolha" veio
    // da rede em vez de um clique direto na tela do anfitrião.
    setPlayerFaintChoice(action.index);
    return;
  }
  if (battleState.battleOver) return;
  if (uiState.isHost) {
    // Anfitrião recebendo a ação do convidado.
    if (uiState.playerAction) { const h = uiState.playerAction; uiState.playerAction = null; runHostTurn(h, action); }
    else { uiState.opponentAction = action; }
  }
});
['btn-play-again','btn-play-again-defeat'].forEach(id => { document.getElementById(id)?.addEventListener('click', () => { battleState.playerParty=[]; battleState.rivalParty=[]; battleState.battleOver=false; battleState.winner=null; showScreen('mode'); }); });
