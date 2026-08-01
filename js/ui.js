/* ==========================================================================
   UI.JS
   Tudo relacionado a TELA: trocar de tela, desenhar a grade de Pokémon,
   atualizar a barra de vida, mostrar toasts/diálogos, sons, QR code e os
   handlers de clique. Não decide regras de batalha — só mostra o que
   battle-engine.js calculou.
   ========================================================================== */

// ---------- utilidades ----------
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

/** Substitui alert(): mostra um toast não-bloqueante no rodapé do app.
 *  isError=true deixa a borda vermelha (falhas de rede, validação etc.). */
function toast(message, isError = false) {
  const container = document.getElementById('toast-container');
  if (!container) { console.log(message); return; }
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
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
const screens = {}; ['tutorial','intro','mode','select','search','online','battle','victory','defeat'].forEach(id => { screens[id] = document.getElementById(`screen-${id}`); });
function showScreen(id) { Object.values(screens).forEach(s => s?.classList.remove('active')); screens[id]?.classList.add('active'); }
const uiState = { mode:null, difficulty:'normal', playerParty:[], playerParty1:null, awaitingSecondTeam:false, roster:[], selectedForTeam:[], playerAction:null, opponentAction:null, currentPlayer:1, searchResult:null, searchMoves:[], selectedSearchMoves:[], audioCtx:null, myTeamSent:false, peerTeam:null };
// ---------- cores por tipo (pra golpes/chips) ----------
// Paleta oficial de cores por tipo (mesma usada nos jogos/site oficial) —
// pedido: as cores antigas de água/voador/normal ficavam muito parecidas.
const TYPE_COLORS = {
  'Fogo':'#F08030', 'Água':'#6890F0', 'Grama':'#78C850', 'Elétrico':'#F8D030',
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

// ---------- tutorial (só na primeira vez, sempre pulável) ----------
const TUTORIAL_SLIDES = [
  { title:'Bem-vindo à Liga Pixel!', text:'Monte um time de até 6 Pokémon e batalhe usando o mesmo motor de cálculo dos jogos oficiais.' },
  { title:'Escolha os golpes', text:'Cada golpe tem a cor do seu tipo e mostra o quanto de dano ele deve causar (~% do HP do adversário).' },
  { title:'3 jeitos de jogar', text:'Sozinho contra a IA, com um amigo no mesmo aparelho (passando a vez), ou online com outro celular via QR code.' },
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
/** Chamado pelo main.js no boot: decide se mostra o tutorial (1ª vez) ou
 *  vai direto pra tela inicial. */
function showFirstScreen() {
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

function goSelect() { uiState.roster = getFullRoster(); uiState.selectedForTeam = []; uiState.awaitingSecondTeam = false; renderRoster(); showScreen('select'); document.getElementById('team-count').textContent = '0/6 selecionados'; }
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
  uiState.playerParty = uiState.selectedForTeam.map(i => ({...uiState.roster[i]}));
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
  battleState.rivalParty = uiState.selectedForTeam.map(i => ({...uiState.roster[i]}));
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
  uiState.playerParty = []; uiState.selectedForTeam = []; renderRoster(); showScreen('select');
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

document.getElementById('btn-back-online').addEventListener('click', () => showScreen('mode'));
document.getElementById('btn-create-room').addEventListener('click', async () => {
  try {
    const code = await createRoom();
    uiState.isHost = true;
    document.getElementById('room-qr-display').style.display = 'flex';
    document.getElementById('qr-label').textContent = 'Mostre este QR ao oponente';
    QRCode.toCanvas(document.getElementById('qr-canvas'), code, { width:180 });
    onConnectionState(state => { if (state === 'open') { toast('Oponente conectado!'); uiState.mode = 'online'; goSelect(); } });
  } catch(e) { toast('Erro ao criar sala. O modo online exige HTTPS (ou localhost).', true); }
});
document.getElementById('btn-join-room').addEventListener('click', () => { document.getElementById('qr-scanner-wrap').style.display = 'flex'; startQRScanner(); });
document.getElementById('btn-qr-done').addEventListener('click', () => { document.getElementById('room-qr-display').style.display = 'none'; });
document.getElementById('btn-cancel-scan').addEventListener('click', () => { stopQRScanner(); document.getElementById('qr-scanner-wrap').style.display = 'none'; });
let scannerInterval = null;
function startQRScanner() {
  const video = document.getElementById('qr-scanner-video');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(stream => {
    video.srcObject = stream; video.play();
    const canvas = document.getElementById('qr-scanner-canvas'), ctx = canvas.getContext('2d');
    scannerInterval = setInterval(() => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);
        if (code) {
          stopQRScanner(); document.getElementById('qr-scanner-wrap').style.display = 'none';
          // Corrigido: sem .catch() aqui, um QR inválido/corrompido derrubava
          // a promise sem nenhum aviso pro usuário.
          joinRoom(code.data).then(answerCode => {
            uiState.isHost = false;
            document.getElementById('room-qr-display').style.display = 'flex';
            document.getElementById('qr-label').textContent = 'Mostre este QR de volta';
            QRCode.toCanvas(document.getElementById('qr-canvas'), answerCode, { width:180 });
            onConnectionState(state => { if (state === 'open') { toast('Conectado!'); uiState.mode = 'online'; goSelect(); } });
          }).catch(() => toast('QR code inválido ou sala expirada. Peça um novo.', true));
        }
      }
    }, 500);
  }).catch(() => toast('Permita o acesso à câmera para escanear o QR code.', true));
}
function stopQRScanner() { if (scannerInterval) { clearInterval(scannerInterval); scannerInterval = null; } const video = document.getElementById('qr-scanner-video'); if (video.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; } }

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function playEvent(ev) {
  const el = document.getElementById(`${ev.side || ev.defenderSide}-mon`);
  if (ev.type === 'switchIn') {
    const container = document.getElementById(`${ev.side}-mon`);
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
    const container = document.getElementById(`${ev.side}-mon`);
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
    const attackerEl = document.getElementById(`${ev.side}-mon`);
    const defenderEl = document.getElementById(`${ev.defenderSide}-mon`);
    sfx.attack();
    attackerEl?.classList.add(ev.side === 'player' ? 'anim-attack-player' : 'anim-attack-rival');
    await wait(280);
    attackerEl?.classList.remove('anim-attack-player','anim-attack-rival');
    ev.crit ? sfx.critHit() : sfx.hit();
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
    const container = document.getElementById(`${ev.side}-mon`);
    sfx.faint();
    container?.querySelector('.sprite-wrap')?.classList.add('anim-faint');
    await wait(600);
    container?.querySelector('.sprite-wrap')?.classList.remove('anim-faint');
    const sprite = container?.querySelector('.sprite');
    sprite?.classList.remove('shown');
    return;
  }
}

// ---------- tela de batalha ----------
function renderBattleField() {
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
  const el = document.getElementById(`${side}-mon`);
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
    if (!move) { btn.innerHTML = '---'; btn.style.background = ''; return; }
    // NOVO: cor do botão de acordo com o tipo do golpe (tipo real, vindo do
    // motor de cálculo — não do que foi digitado manualmente nos dados).
    btn.style.background = typeColor(move.type);
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
  updateMoveButtons();
}
function disableControls() { document.querySelectorAll('.move-btn').forEach(b => b.disabled = true); document.getElementById('btn-switch').disabled = true; }
document.querySelectorAll('.move-btn').forEach((btn,i) => { btn.addEventListener('click', () => { const mon = activeMonForTurn(); if (!mon?.moves[i]) return; onPlayerAction({ type:'move', move:mon.moves[i] }); }); });
document.getElementById('btn-switch').addEventListener('click', () => {
  const menu = document.getElementById('switch-menu'); menu.innerHTML = '';
  // BUG CORRIGIDO: a lista de troca também sempre mostrava o time do
  // "player", nunca o do Jogador 2 (rivalParty) quando era a vez dele.
  const side = activeSideForTurn();
  const party = side === 'rival' ? battleState.rivalParty : battleState.playerParty;
  const activeIdx = side === 'rival' ? battleState.rivalActiveIndex : battleState.playerActiveIndex;
  party.forEach((m,i) => {
    if (i===activeIdx || m.currentHp<=0) return;
    const b = document.createElement('button'); b.className = 'switch-option';
    b.innerHTML = `<img src="${escapeHtml(m.sprite)}" width="32" onerror="this.onerror=null;this.src='${escapeHtml(m.spriteStatic||'')}'"> ${escapeHtml(m.name)} (${m.currentHp}/${m.maxHp})`;
    b.addEventListener('click', () => { menu.classList.add('hidden'); onPlayerAction({ type:'switch', index:i }); });
    menu.appendChild(b);
  });
  menu.classList.remove('hidden');
});
function setupTurn() { if (uiState.mode==='single' || uiState.mode==='online') enableControls(1); else if (uiState.mode==='duo') enableControls(uiState.currentPlayer); }
// getRivalAction agora mora em battle-engine.js (usa o motor real pra escolher
// o golpe de maior dano esperado, não só o maior "power" bruto).
async function onPlayerAction(action) {
  if (battleState.battleOver) return;
  if (uiState.mode==='online') {
    disableControls();
    if (!uiState.isHost) {
      // Convidado: nunca calcula nada, só manda a ação e espera o anfitrião
      // mandar de volta o resultado já pronto (ver onReceiveAction abaixo).
      sendAction(action);
      return;
    }
    // Anfitrião: guarda a própria ação; se a do convidado já tiver chegado,
    // resolve o turno agora. Senão, espera ela chegar (ver onReceiveAction).
    uiState.playerAction = action;
    if (uiState.opponentAction) {
      const guestAction = uiState.opponentAction; uiState.opponentAction = null;
      await runHostTurn(action, guestAction);
    }
    return;
  }
  let pAct=action, rAct;
  if (uiState.mode==='single') rAct = getRivalAction(uiState.difficulty || 'normal');
  else if (uiState.mode==='duo') { if (uiState.currentPlayer===1) { uiState.playerAction=action; playPassTurn(2); return; } else { pAct=uiState.playerAction; rAct=action; uiState.playerAction=null; } }
  await executeTurn(pAct, rAct);
}
async function executeTurn(pAct, rAct) {
  disableControls();
  const result = await resolveTurn(pAct, rAct);
  await playEventsAndFinish(result);
}
/** Anfitrião do modo online: calcula o turno de verdade (única fonte de
 *  aleatoriedade) e manda o resultado pronto pro convidado — que só reproduz
 *  a mesma animação/HP, sem rodar sua própria conta. */
async function runHostTurn(hostAction, guestAction) {
  uiState.playerAction = null;
  const result = await resolveTurn(hostAction, guestAction);
  sendAction({ type:'result', log: result.log, events: flipEventsForPeer(result.events), snapshot: snapshotForPeer() });
  await playEventsAndFinish(result);
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
  if (result.battleOver) { showBattleEnd(result.winner); return; }
  // BUG CORRIGIDO: só o lado "player" recebia a tela de troca ao desmaiar; no
  // modo duo o Jogador 2 (rivalParty) tinha o próximo Pokémon escolhido
  // automaticamente, sem chance de decidir. getFaintPendingSide() (de
  // battle-engine.js) diz qual lado está esperando uma escolha manual agora.
  if (getFaintPendingSide()) { showSwitchForFaint(); }
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
}
function showSwitchForFaint() {
  const menu = document.getElementById('switch-menu'); menu.innerHTML = '';
  const side = getFaintPendingSide();
  const party = side === 'rival' ? battleState.rivalParty : battleState.playerParty;
  const activeIdx = side === 'rival' ? battleState.rivalActiveIndex : battleState.playerActiveIndex;
  party.forEach((m,i) => {
    if (i===activeIdx || m.currentHp<=0) return;
    const b = document.createElement('button'); b.className = 'switch-option';
    b.innerHTML = `${escapeHtml(m.name)} (${m.currentHp}/${m.maxHp})`;
    b.addEventListener('click', () => {
      menu.classList.add('hidden'); setPlayerFaintChoice(i); renderBattleField();
      if (uiState.mode==='duo') { uiState.currentPlayer = 1; playPassTurn(1); }
      else setupTurn();
    });
    menu.appendChild(b);
  });
  menu.classList.remove('hidden');
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
  if (battleState.battleOver) return;
  if (uiState.isHost) {
    // Anfitrião recebendo a ação do convidado.
    if (uiState.playerAction) { const h = uiState.playerAction; uiState.playerAction = null; runHostTurn(h, action); }
    else { uiState.opponentAction = action; }
  }
});
['btn-play-again','btn-play-again-defeat'].forEach(id => { document.getElementById(id)?.addEventListener('click', () => { battleState.playerParty=[]; battleState.rivalParty=[]; battleState.battleOver=false; battleState.winner=null; showScreen('mode'); }); });
