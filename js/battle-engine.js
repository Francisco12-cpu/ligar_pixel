/* ==========================================================================
   BATTLE-ENGINE.JS
   Regras do jogo: turnos, trocas, desmaios, efeitos secundários (status/boosts)
   e comunicação P2P (WebRTC) para o modo online. Não mexe em DOM — quem
   desenha a tela é o ui.js.

   Depende de: pokemon-data.js (GEN, Pokemon, Move, calculate, LEVEL, IVS, EVS).
   ========================================================================== */

const battleState = {
  playerParty: [], rivalParty: [],
  playerActiveIndex: 0, rivalActiveIndex: 0,
  battleOver: false, winner: null,
  weather: null, weatherTurns: 0 // clima é um detalhe pequeno, dura 5 turnos e some
};
function currentPlayerMon() { return battleState.playerParty[battleState.playerActiveIndex]; }
function currentRivalMon() { return battleState.rivalParty[battleState.rivalActiveIndex]; }

function toCalcPokemon(mon) {
  return new Pokemon(GEN, mon.name, {
    level: LEVEL, ivs: IVS, evs: EVS, nature: mon.nature || 'Serious',
    ability: mon.ability || undefined,
    curHP: mon.currentHp, status: mon.status || '',
    boosts: {
      atk: mon.boosts?.atk ?? 0, def: mon.boosts?.def ?? 0,
      spa: mon.boosts?.spa ?? 0, spd: mon.boosts?.spd ?? 0, spe: mon.boosts?.spe ?? 0
    }
  });
}
function toCalcMove(move) { return new Move(GEN, move.name); }

/** Dano esperado (média da faixa de dano) de `move` de `attackerMon` contra
 *  `defenderMon`, usando o motor real do Smogon Calc. Usado pela IA e pelo
 *  preview de dano na tela de batalha. Retorna 0 para golpes de status. */
function estimateDamage(attackerMon, defenderMon, move) {
  try {
    // CORRIGIDO: golpes de poder variável (Investida Pesada, Baixo Chute,
    // Nó de Grama etc.) têm calcMove.bp=0 quando o Move é criado isolado
    // (o poder real só existe depois de saber quem é o alvo) — o guard
    // antigo usava isso pra decidir "é golpe de status, devolve 0" e
    // acabava tratando golpes de dano de verdade como se não causassem
    // nada. move.power (nosso próprio dado, vindo do roster/PokeAPI) já é
    // 0 de verdade só pros golpes de status — é o discriminador certo, e é
    // o mesmo que o preview do botão em ui.js já usa.
    if (!move.power) return 0;
    const atker = toCalcPokemon(attackerMon);
    const defer = toCalcPokemon(defenderMon);
    const calcMove = toCalcMove(move);
    const result = calculate(GEN, atker, defer, calcMove, currentField());
    const dmg = Array.isArray(result.damage) ? result.damage : [result.damage];
    return dmg.reduce((s, d) => s + d, 0) / dmg.length;
  } catch (e) { return 0; }
}

// ========== EFEITOS DE GOLPES DE STATUS (curados à mão) ==========
// Golpes buscados via PokeAPI já trazem ailment/ailmentChance/statChanges
// prontos (ver normalizeMove em pokemon-data.js). Esta tabela cobre os
// golpes de status do roster inicial, que não têm esse dado embutido, MAIS
// alguns casos especiais (cura, autobuff, proteção) que a PokeAPI não
// resolve sozinha do jeito que a gente precisa.
// target:'self' = afeta quem usou o golpe. Sem target = afeta o oponente.
const CURATED_MOVE_EFFECTS = {
  'swords-dance': { target:'self', boosts:{atk:2} },
  'calm-mind': { target:'self', boosts:{spa:1,spd:1} },
  'dragon-dance': { target:'self', boosts:{atk:1,spe:1} },
  'agility': { target:'self', boosts:{spe:2} },
  'acid-armor': { target:'self', boosts:{def:2} },
  'barrier': { target:'self', boosts:{def:2} },
  'withdraw': { target:'self', boosts:{def:1} },
  'curse': { target:'self', boosts:{atk:1,def:1,spe:-1} },
  'reflect': { target:'self', boosts:{def:1} }, // aproximação: não é a redução de dano oficial pro time todo, é um bônus de defesa
  'light-screen': { target:'self', boosts:{spd:1} }, // idem, aproximação
  'smokescreen': { boosts:{acc:-1} }, // reduz a precisão de ataque do oponente
  'roost': { heal:0.5 },
  'synthesis': { heal:0.5 },
  'moonlight': { heal:0.5 },
  'morning-sun': { heal:0.5 },
  'wish': { heal:0.5 },
  'rest': { heal:1, selfStatus:'slp' },
  'aromatherapy': { curesTeamStatus:true },
  'heal-bell': { curesTeamStatus:true },
  'protect': { protect:true },
  'detect': { protect:true },
  'rain-dance': { weather:'Rain' },
  'sunny-day': { weather:'Sun' },
  'sandstorm': { weather:'Sand' },
  'hail': { weather:'Hail' },
  'snowscape': { weather:'Snow' },
  'thunder-wave': { ailment:'par', chance:90 },
  'will-o-wisp': { ailment:'brn', chance:85 },
  'toxic': { ailment:'psn', chance:90 },
  'spore': { ailment:'slp', chance:100 },
  'sleep-powder': { ailment:'slp', chance:100 },
  'hypnosis': { ailment:'slp', chance:60 },
  'sing': { ailment:'slp', chance:55 },
  'yawn': { ailment:'slp', chance:100 }, // simplificado: no jogo oficial o sono só chega no próximo turno; aqui é imediato
  'body-slam': { ailment:'par', chance:30 },
  'thunder': { ailment:'par', chance:30 },
  'flamethrower': { ailment:'brn', chance:10 },
  'scald': { ailment:'brn', chance:30 },
  'lava-plume': { ailment:'brn', chance:30 },
  'sludge-bomb': { ailment:'psn', chance:30 },
  'discharge': { ailment:'par', chance:30 },
  'ice-punch': { ailment:'frz', chance:10 },
  'ice-beam': { ailment:'frz', chance:10 },
  'blizzard': { ailment:'frz', chance:10 }
  // Golpes fora dessa lista e sem dado próprio da PokeAPI simplesmente não
  // têm efeito secundário — o dano ainda funciona normalmente.
};
function normalizeMoveKey(name) { return String(name||'').toLowerCase().trim().replace(/[\s_]+/g,'-'); }

// Traduz os nomes de atributo por extenso que a PokeAPI usa em statChanges
// (stat.name) pras siglas curtas que o resto do sistema entende (boosts.atk
// etc.). 'evasion' mapeia pra 'eva' por consistência, mas nada no sistema
// ainda LÊ boosts.eva pra afetar chance de acerto — isso é uma lacuna
// separada, documentada no CONTEXT_IA.md, não coberta por este mapeamento.
const API_STAT_KEY_MAP = {
  attack:'atk', defense:'def', 'special-attack':'spa', 'special-defense':'spd',
  speed:'spe', accuracy:'acc', evasion:'eva'
};

function applyMoveSecondaryEffects(attacker, defender, move, log) {
  const curated = CURATED_MOVE_EFFECTS[normalizeMoveKey(move.name)];
  // Corrigido: antes, um golpe buscado via PokeAPI que também existisse na
  // tabela curada (ex: "Flamethrower" com ailmentChance da API E na tabela
  // acima) tinha DUAS chances independentes de causar status — inflando a
  // probabilidade real. Agora é sempre uma OU outra fonte, nunca as duas.
  const hasApiAilment = move.ailment && move.ailmentChance;
  if (hasApiAilment) {
    if (Math.random()*100 < move.ailmentChance && !defender.status) {
      const map = { paralysis:'par', burn:'brn', poison:'psn', sleep:'slp', freeze:'frz' };
      defender.status = map[move.ailment] || '';
      log.push(`${defender.name} ficou ${defender.status}!`);
    }
  } else if (curated?.ailment && !defender.status && Math.random()*100 < curated.chance) {
    defender.status = curated.ailment;
    log.push(`${defender.name} ficou ${curated.ailment}!`);
  }
  // BUG CORRIGIDO: statChanges de golpes que buscam buffar quem usou (Dança
  // das Espadas, Calma Mental, Dança do Dragão etc.) estavam sendo aplicados
  // no ALVO (adversário) em vez de em quem usou o golpe — ou seja, esses
  // golpes literalmente ajudavam o time errado. Agora respeita quem é o
  // alvo real do golpe.
  const apiTarget = move.moveTarget === 'user' ? attacker : defender;
  if (move.statChanges) {
    move.statChanges.forEach(ch => {
      // CORRIGIDO: a PokeAPI manda os nomes de atributo por extenso
      // ('attack', 'special-attack', 'evasion'...), mas todo o resto do
      // sistema (boosts.atk/def/spa/spd/spe, lido em toCalcPokemon()) só
      // entende as siglas curtas. Sem esse mapeamento, o boost era escrito
      // numa chave que nada lia — o log dizia "atributos alterados" mas o
      // efeito real era zero pra qualquer golpe buscado fora da tabela
      // curada (a maioria dos golpes de buff/debuff).
      const key = API_STAT_KEY_MAP[ch.stat] || ch.stat;
      if (!apiTarget.boosts) apiTarget.boosts = { atk:0, def:0, spa:0, spd:0, spe:0, acc:0 };
      apiTarget.boosts[key] = Math.min(6, Math.max(-6, (apiTarget.boosts[key]||0) + ch.change));
    });
    log.push(`${apiTarget.name} teve seus atributos alterados!`);
  }
  if (curated?.boosts) {
    const target = curated.target === 'self' ? attacker : defender;
    if (!target.boosts) target.boosts = { atk:0, def:0, spa:0, spd:0, spe:0, acc:0 };
    Object.entries(curated.boosts).forEach(([stat, change]) => {
      target.boosts[stat] = Math.min(6, Math.max(-6, (target.boosts[stat]||0) + change));
    });
    log.push(`${target.name} teve seus atributos alterados!`);
  }
  if (curated?.curesTeamStatus) {
    const party = attacker === currentPlayerMon() ? battleState.playerParty : battleState.rivalParty;
    party.forEach(m => { m.status = null; });
    log.push(`Toda a equipe de ${attacker.name} foi curada de problemas de status!`);
  }
}

function processSwitch(side, index) {
  const party = side === 'player' ? battleState.playerParty : battleState.rivalParty;
  const field = side === 'player' ? 'playerActiveIndex' : 'rivalActiveIndex';
  const old = party[battleState[field]];
  if (!party[index] || party[index].currentHp <= 0) return { log: ['Troca inválida!'], ok: false };
  battleState[field] = index;
  return { log: [`${old.name}, volte!`, `Vai, ${party[index].name}!`], ok: true };
}

let faintResolve = null;
let faintPendingSide = null;
let onFaintChoiceNeededCb = null;
/** ui.js chama isso uma vez, no carregamento, pra saber IMEDIATAMENTE quando
 *  precisa mostrar o menu de troca por desmaio — em vez de só descobrir
 *  depois que resolveTurn() retorna (que é o que causava o travamento). */
function onFaintChoiceNeeded(cb) { onFaintChoiceNeededCb = cb; }

/** side: 'player' ou 'rival' — de quem é o Pokémon que desmaiou.
 *  manual: true = espera humano escolher (chamar setFaintChoice); false = IA
 *  escolhe sozinha o próximo Pokémon vivo. No modo duo os dois lados são
 *  jogadores humanos, então os dois precisam de "manual". */
async function handleFaint(side, manual) {
  const party = side === 'player' ? battleState.playerParty : battleState.rivalParty;
  const activeField = side === 'player' ? 'playerActiveIndex' : 'rivalActiveIndex';
  const activeIdx = battleState[activeField];
  const fainted = party[activeIdx];
  const aliveIdx = party.findIndex((m,i) => m.currentHp > 0 && i !== activeIdx);
  if (aliveIdx === -1) {
    battleState.battleOver = true;
    battleState.winner = side === 'player' ? 'rival' : 'player';
    return { log: [`${fainted.name} desmaiou! ${battleState.winner==='player'?'Você':'O rival'} venceu!`] };
  }
  if (manual) {
    faintPendingSide = side;
    return new Promise(resolve => {
      faintResolve = (idx) => {
        if (party[idx]?.currentHp > 0) {
          battleState[activeField] = idx;
          faintPendingSide = null;
          resolve({ log: [`${fainted.name} desmaiou!`, `Vai, ${party[idx].name}!`] });
        } else faintResolve = resolve;
      };
      // BUG CRÍTICO CORRIGIDO (o "trava pra sempre"): antes, a tela que
      // mostra as opções de troca só era chamada DEPOIS que resolveTurn()
      // retornava — mas resolveTurn() estava, nesse exato momento, PARADO
      // esperando essa mesma escolha pra poder retornar. Ou seja: o jogo
      // esperava a interface, e a interface esperava o jogo terminar de
      // esperar. Um impasse (deadlock) — nunca havia clique duplo envolvido,
      // acontecia sempre que o próprio Pokémon desmaiava tendo substituto no
      // time. Agora avisamos a interface NA HORA (via este callback), ainda
      // dentro do turno em andamento, então o menu aparece de verdade.
      onFaintChoiceNeededCb?.(side);
    });
  } else {
    battleState[activeField] = aliveIdx;
    return { log: [`${fainted.name} desmaiou!`, `O rival enviou ${party[aliveIdx].name}!`] };
  }
}
function setPlayerFaintChoice(idx) { if (faintResolve) { faintResolve(idx); faintResolve = null; } }
function getFaintPendingSide() { return faintPendingSide; }

function currentField() { return new Field({ weather: battleState.weather || undefined }); }

async function resolveTurn(playerAction, rivalAction) {
  if (battleState.battleOver) return { log:['Batalha encerrada.'], events:[], battleOver:true, winner:battleState.winner };
  const log = [];
  const events = [];
  // Clima dura um número limitado de turnos, igual no jogo oficial.
  if (battleState.weather && --battleState.weatherTurns <= 0) {
    log.push('O clima voltou ao normal.');
    battleState.weather = null;
  }
  // Proteção (Protect/Detect) só vale pro turno em que foi usada.
  if (currentPlayerMon()) currentPlayerMon().protected = false;
  if (currentRivalMon()) currentRivalMon().protected = false;
  if (playerAction.type === 'switch') {
    const before = currentPlayerMon()?.name;
    const r = processSwitch('player', playerAction.index);
    log.push(...r.log);
    if (r.ok) events.push({ type:'switchIn', side:'player', name: currentPlayerMon().name, outName: before });
  }
  if (rivalAction.type === 'switch') {
    const before = currentRivalMon()?.name;
    const r = processSwitch('rival', rivalAction.index);
    log.push(...r.log);
    if (r.ok) events.push({ type:'switchIn', side:'rival', name: currentRivalMon().name, outName: before });
  }
  const pMove = playerAction.type==='move' ? playerAction.move : null;
  const rMove = rivalAction.type==='move' ? rivalAction.move : null;
  const willP = pMove && playerAction.type!=='switch';
  const willR = rMove && rivalAction.type!=='switch';
  const attackers = [];
  if (willP) attackers.push({ side:'player', attacker:currentPlayerMon(), defender:currentRivalMon(), move:pMove });
  if (willR) attackers.push({ side:'rival', attacker:currentRivalMon(), defender:currentPlayerMon(), move:rMove });

  // Corrigido: cada Pokémon/golpe é convertido para o formato do calculadora
  // UMA única vez (antes eram construídos de novo dentro do sort E de novo no
  // loop de execução). Também: em caso de empate de velocidade, o desempate
  // aleatório é decidido uma única vez fora do comparator do sort — um
  // comparator que retorna valores diferentes em chamadas repetidas para o
  // mesmo par é um bug sutil (viola o contrato de Array.prototype.sort).
  attackers.forEach(a => {
    a.calcAttacker = toCalcPokemon(a.attacker);
    a.calcDefender = toCalcPokemon(a.defender);
    a.calcMove = toCalcMove(a.move);
  });
  const coinFlip = Math.random() < 0.5 ? -1 : 1;
  attackers.sort((a, b) => {
    if (a.calcMove.priority !== b.calcMove.priority) return b.calcMove.priority - a.calcMove.priority;
    let sa = a.calcAttacker.stats.spe, sb = b.calcAttacker.stats.spe;
    if (a.calcAttacker.status === 'par') sa = Math.floor(sa * 0.25);
    if (b.calcAttacker.status === 'par') sb = Math.floor(sb * 0.25);
    if (sa !== sb) return sb - sa;
    return coinFlip;
  });

  for (const a of attackers) {
    if (a.defender.currentHp <= 0) continue;
    // BUG CORRIGIDO: se o ATACANTE já desmaiou nesse mesmo turno (por causa
    // do golpe anterior do outro lado) e foi trocado automaticamente, a
    // ação antiga dele (armazenada no início do turno) ainda tentava
    // executar — um Pokémon desmaiado "atacando" com o próximo golpe.
    if (a.attacker.currentHp <= 0) continue;
    const move = a.calcMove;
    const defenderSide = a.side === 'player' ? 'rival' : 'player';

    // Fumaça (Smokescreen) etc.: reduz a precisão de quem vai atacar.
    const accStage = a.attacker.boosts?.acc || 0;
    const accMultiplier = accStage < 0 ? (1 / (1 - accStage * 0.34)) : (1 + accStage * 0.34);
    const effectiveAccuracy = Math.min(100, (a.move.accuracy ?? 100) * accMultiplier);
    if (move.accuracy !== true && Math.random()*100 > effectiveAccuracy) {
      log.push(`${a.attacker.name} usou ${a.move.name}, mas errou!`);
      events.push({ type:'miss', side:a.side, attackerName:a.attacker.name, moveName:a.move.name });
      continue;
    }

    const isStatusMove = a.move.category === 'status' || !move.bp;
    if (isStatusMove) {
      const curated = CURATED_MOVE_EFFECTS[normalizeMoveKey(a.move.name)];
      if (curated?.protect) {
        a.attacker.protected = true;
        log.push(`${a.attacker.name} se protegeu!`);
        events.push({ type:'status-move', side:a.side, moveName:a.move.name, moveType:a.move.type });
      } else if (curated?.weather) {
        battleState.weather = curated.weather;
        battleState.weatherTurns = 5;
        const weatherLabel = { Rain:'chuva', Sun:'sol forte', Sand:'tempestade de areia', Hail:'granizo', Snow:'neve' }[curated.weather] || curated.weather;
        log.push(`${a.attacker.name} usou ${a.move.name}! O clima agora é ${weatherLabel}.`);
        events.push({ type:'status-move', side:a.side, moveName:a.move.name, moveType:a.move.type });
      } else if (curated?.heal) {
        const before = a.attacker.currentHp;
        a.attacker.currentHp = curated.heal >= 1 ? a.attacker.maxHp
          : Math.min(a.attacker.maxHp, a.attacker.currentHp + Math.round(a.attacker.maxHp * curated.heal));
        if (curated.selfStatus) a.attacker.status = curated.selfStatus;
        const healed = a.attacker.currentHp - before;
        log.push(`${a.attacker.name} usou ${a.move.name} e recuperou ${healed} HP${curated.selfStatus === 'slp' ? ', caindo no sono' : ''}!`);
        events.push({ type:'heal', side:a.side, hpAfter:a.attacker.currentHp, maxHp:a.attacker.maxHp });
      } else {
        log.push(`${a.attacker.name} usou ${a.move.name}!`);
        events.push({ type:'status-move', side:a.side, moveName:a.move.name, moveType:a.move.type });
      }
      applyMoveSecondaryEffects(a.attacker, a.defender, a.move, log);
      continue;
    }

    if (a.defender.protected) {
      log.push(`${a.defender.name} se protegeu do ataque!`);
      events.push({ type:'status-move', side:a.side, moveName:a.move.name, moveType:a.move.type });
      continue;
    }

    // Recalcula o atacante/defensor no estado atual (o HP pode ter mudado se
    // o outro lado já agiu neste turno).
    const atker = toCalcPokemon(a.attacker);
    const defer = toCalcPokemon(a.defender);
    const result = calculate(GEN, atker, defer, move, currentField());
    // BUG CORRIGIDO: golpes de múltiplos hits (ex: Debulhadeira, Investida em
    // Ondas) fazem calculate() devolver uma MATRIZ DE MATRIZES (uma faixa de
    // dano por acerto), não uma lista simples. O código antigo tratava isso
    // como se fosse uma lista simples e acabava somando um array inteiro ao
    // HP em vez de um número — resultado virava NaN e o Pokémon "quebrava".
    let dmg, hitsLanded;
    if (Array.isArray(result.damage) && Array.isArray(result.damage[0])) {
      hitsLanded = result.damage.length;
      dmg = result.damage.reduce((sum, rolls) => sum + rolls[Math.floor(Math.random()*rolls.length)], 0);
    } else if (Array.isArray(result.damage)) {
      hitsLanded = 1;
      dmg = result.damage[Math.floor(Math.random()*result.damage.length)];
    } else {
      hitsLanded = 1;
      dmg = result.damage;
    }
    const faint = a.defender.currentHp - dmg <= 0;
    a.defender.currentHp = Math.max(0, a.defender.currentHp - dmg);
    const hitsText = hitsLanded > 1 ? ` Acertou ${hitsLanded} vezes!` : '';
    log.push(`${a.attacker.name} usou ${a.move.name}!${hitsText} ${result.critical?'Crítico! ':''}Causou ${dmg} de dano.`);
    events.push({
      type:'attack', side:a.side, moveType:a.move.type, attackerName:a.attacker.name, moveName:a.move.name,
      dmg, crit: !!result.critical, defenderSide, hpAfter: a.defender.currentHp, maxHp: a.defender.maxHp
    });
    applyMoveSecondaryEffects(a.attacker, a.defender, a.move, log);
    if (faint) {
      log.push(`${a.defender.name} desmaiou!`);
      events.push({ type:'faint', side: defenderSide, name: a.defender.name });
      const faintSide = a.defender === currentPlayerMon() ? 'player' : 'rival';
      // No modo duo os dois lados são controlados por humanos (o mesmo
      // aparelho, passado de mão em mão) — os dois merecem escolher pra
      // quem trocar, em vez de só o lado "player" ter esse controle.
      // RESOLVIDO: no modo online, faintSide==='rival' é o CONVIDADO (só o
      // anfitrião roda resolveTurn() — ver decisão de arquitetura #5 no
      // CONTEXT_IA.md) — antes isso escolhia automaticamente por ele.
      // Agora também é "manual": onFaintChoiceNeededCb (ver onFaintChoiceNeeded
      // em js/ui.js) detecta que é o lado remoto e manda a decisão pela rede
      // em vez de abrir a tela local, mas o mecanismo de espera (a Promise
      // abaixo, resolvida só quando a escolha chega) é o mesmo de sempre.
      const manual = faintSide === 'player' || (typeof uiState !== 'undefined' && (uiState?.mode === 'duo' || uiState?.mode === 'online'));
      const fr = await handleFaint(faintSide, manual);
      log.push(...fr.log);
      if (battleState.battleOver) return { log, events, battleOver:true, winner:battleState.winner };
      const newMon = faintSide === 'player' ? currentPlayerMon() : currentRivalMon();
      if (newMon) events.push({ type:'switchIn', side: faintSide, name: newMon.name });
    }
  }
  return { log, events, battleOver:battleState.battleOver, winner:battleState.winner };
}

/** IA simples: escolhe o golpe com maior dano esperado real (via calculate),
 *  em vez de só olhar o "power" bruto — já considera STAB, tipo, clima etc.
 *  A dificuldade muda o comportamento:
 *  - facil: 50% das vezes escolhe um golpe aleatório em vez do melhor.
 *  - normal: sempre escolhe o golpe de maior dano esperado.
 *  - dificil: igual ao normal, mas também sabe trocar — se o Pokémon ativo
 *    está com menos de 25% de HP e existe outro saudável no time, troca em
 *    vez de arriscar continuar atacando. */
function getRivalAction(difficulty) {
  const active = currentRivalMon();
  const target = currentPlayerMon();
  if (!active?.moves?.length) return { type:'switch', index:0 };
  if (difficulty === 'dificil' && active.currentHp / active.maxHp < 0.25) {
    const healthier = battleState.rivalParty.findIndex((m,i) => i !== battleState.rivalActiveIndex && m.currentHp > active.maxHp * 0.5);
    if (healthier !== -1) return { type:'switch', index: healthier };
  }
  if (difficulty === 'facil' && Math.random() < 0.5) {
    return { type:'move', move: active.moves[Math.floor(Math.random()*active.moves.length)] };
  }
  let best = active.moves[0], bestDmg = -1;
  for (const m of active.moves) {
    const dmg = estimateDamage(active, target, m);
    if (dmg > bestDmg) { bestDmg = dmg; best = m; }
  }
  return { type:'move', move:best };
}

// ========== MODO ONLINE: ANFITRIÃO AUTORITATIVO ==========
// Corrigido: antes, cada celular calculava o resultado do turno de forma
// independente (cada um "rolava seus próprios dados" com Math.random()) —
// em tese os dois podiam chegar a números diferentes pro mesmo turno. Agora
// só quem CRIOU a sala (o "anfitrião") calcula; o outro celular só recebe o
// resultado já pronto e reproduz a mesma animação/HP, garantindo que os
// dois vejam exatamente a mesma coisa.
//
// battleState sempre é local a cada aparelho: "player" = eu, "rival" = o
// outro. No anfitrião, resolveTurn(minhaAção, açãoDoConvidado) já produz o
// resultado certo pro PRÓPRIO ponto de vista dele. Pra mandar pro convidado,
// os papéis "player"/"rival" do resultado (que são do ponto de vista do
// anfitrião) precisam ser invertidos, porque pro convidado é o oposto.
function flipSide(side) { return side === 'player' ? 'rival' : side === 'rival' ? 'player' : side; }
function flipEventsForPeer(events) {
  return events.map(ev => ({
    ...ev,
    side: flipSide(ev.side),
    defenderSide: ev.defenderSide ? flipSide(ev.defenderSide) : undefined
  }));
}
function snapshotForPeer() {
  return {
    playerParty: battleState.rivalParty, rivalParty: battleState.playerParty,
    playerActiveIndex: battleState.rivalActiveIndex, rivalActiveIndex: battleState.playerActiveIndex,
    battleOver: battleState.battleOver, winner: flipSide(battleState.winner)
  };
}
function applyPeerSnapshot(snapshot) {
  battleState.playerParty = snapshot.playerParty;
  battleState.rivalParty = snapshot.rivalParty;
  battleState.playerActiveIndex = snapshot.playerActiveIndex;
  battleState.rivalActiveIndex = snapshot.rivalActiveIndex;
  battleState.battleOver = snapshot.battleOver;
  battleState.winner = snapshot.winner;
}

// ========== P2P (WEBRTC) ==========
// Sinalização manual via link/código compartilhado (sem servidor): o
// offer/answer do WebRTC vai codificado em base64 dentro de um link de
// convite (Web Share API/copiar/colar — ver js/ui.js). Funciona pela
// internet (STUN do Google) e também na mesma rede local/hotspot sem
// internet, já que o navegador tenta candidatos locais (host/mDNS) antes de
// precisar do STUN — mas em redes locais mais restritas a conexão pode
// falhar sem um STUN/TURN acessível. Ver README para detalhes.
const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let pc = null, dc = null, onActionCb = null, onConnectionStateCb = null;
function setupDC(ch) {
  ch.onopen = () => { console.log('Conectado'); onConnectionStateCb?.('open'); };
  ch.onclose = () => onConnectionStateCb?.('closed');
  ch.onmessage = e => { try { const a = JSON.parse(e.data); if (onActionCb) onActionCb(a); } catch(ex) {} };
}
// CORRIGIDO: isso esperava 'complete' sem limite de tempo nenhum. Numa rede
// onde o STUN demora ou está bloqueado, o navegador pode nunca terminar de
// reunir todos os candidatos (ou demorar dezenas de segundos) — e sem
// timeout, createRoom()/joinRoom() ficavam pendurados pra sempre, sem
// nenhum feedback pro usuário (nem erro, nem o código aparecia). 5s é tempo de
// sobra pra reunir os candidatos locais (host) que já bastam pra conectar
// na mesma rede; se o STUN não respondeu até lá, segue com o que já tem.
async function waitIceGatheringComplete(peer, timeoutMs = 5000) {
  if (peer.iceGatheringState === 'complete') return;
  await new Promise(r => {
    const timer = setTimeout(() => { peer.removeEventListener('icegatheringstatechange', check); r(); }, timeoutMs);
    const check = () => { if (peer.iceGatheringState === 'complete') { clearTimeout(timer); peer.removeEventListener('icegatheringstatechange', check); r(); } };
    peer.addEventListener('icegatheringstatechange', check);
  });
}
// O SDP completo (com TODOS os candidatos ICE que o navegador reúne — host
// UDP, host TCP, srflx via STUN, às vezes até candidatos de loopback/IPv6)
// vira um payload de ~1500-2000+ caracteres. Isso importava demais quando o
// código ia dentro de um QR (removido — ver CONTEXT_IA.md: gerava um QR
// denso demais, versão 35/157 módulos, pra câmera de celular ler); agora
// que o código vira um link de convite compartilhado por texto, o tamanho
// já não é crítico, mas ainda vale cortar o excesso: candidatos TCP quase
// nunca são necessários pra um DataChannel (UDP já cobre a esmagadora
// maioria dos casos) — removê-los corta o payload em ~25% sem arriscar a
// conectividade (mantém TODOS os candidatos UDP intactos, só descarta o
// fallback TCP redundante), deixando o link mais curto pra compartilhar.
function trimSdp(description) {
  const sdp = description.sdp.split('\r\n').filter(line => !(/^a=candidate:/.test(line) && /\btcp\b/i.test(line))).join('\r\n');
  return { type: description.type, sdp };
}
async function createRoom() {
  pc = new RTCPeerConnection(ICE_CONFIG);
  dc = pc.createDataChannel('battle'); setupDC(dc);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceGatheringComplete(pc);
  return btoa(JSON.stringify(trimSdp(pc.localDescription)));
}
async function joinRoom(code) {
  pc = new RTCPeerConnection(ICE_CONFIG);
  pc.ondatachannel = e => { dc = e.channel; setupDC(dc); };
  await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(atob(code))));
  const ans = await pc.createAnswer();
  await pc.setLocalDescription(ans);
  await waitIceGatheringComplete(pc);
  return btoa(JSON.stringify(trimSdp(pc.localDescription)));
}
// CORRIGIDO (bug crítico, era a causa real de "o outro aparelho não
// conseguia entrar"): esta função já existia, mas NUNCA era chamada em
// lugar nenhum da interface (js/ui.js). Sem ela, o anfitrião nunca recebia
// de volta a resposta (answer) do convidado — a conexão WebRTC ficava
// esperando pra sempre uma metade do handshake que nunca chegava. Agora
// js/ui.js chama isso depois de colar a resposta do convidado (ver fluxo
// "COLAR RESPOSTA" na tela online).
async function completeConnection(code) { await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(atob(code)))); }
function sendAction(a) { if (dc?.readyState==='open') dc.send(JSON.stringify(a)); }
function onReceiveAction(cb) { onActionCb = cb; }
function onConnectionState(cb) { onConnectionStateCb = cb; }
