/* ==========================================================================
   POKEMON-DATA.JS
   - Constantes do motor de cálculo (nível, IVs/EVs, geração usada).
   - Roster inicial (Pokémon pré-carregados, todos na forma final/evoluída)
     com movesets fixos.
   - Integração com a PokeAPI para buscar e salvar novos Pokémon (Pokédex local).

   Depende de window.calc (carregado por lib/smogon-calc-engine.js, que deve
   vir ANTES deste arquivo no index.html).
   ========================================================================== */

// window.calc é exposto pelos dois arquivos vendorizados em lib/. Eles não são
// módulos ES (não têm "export"), por isso lemos tudo a partir do objeto global.
const { Generations, Pokemon, Move, calculate, Field } = window.calc;

const GEN = Generations.get(9);
const IVS = { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 };
const EVS = { hp:0, atk:0, def:0, spa:0, spd:0, spe:0 };
const LEVEL = 50;
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated';

function calcStats(b) {
  const hp = Math.floor((2 * b.hp + 31) * LEVEL / 100 + LEVEL + 10);
  const atk = Math.floor(((2 * b.atk + 31) * LEVEL / 100 + 5));
  const def = Math.floor(((2 * b.def + 31) * LEVEL / 100 + 5));
  const spa = Math.floor(((2 * b.spa + 31) * LEVEL / 100 + 5));
  const spd = Math.floor(((2 * b.spd + 31) * LEVEL / 100 + 5));
  const spe = Math.floor(((2 * b.spe + 31) * LEVEL / 100 + 5));
  return { maxHp:hp, currentHp:hp, attack:atk, defense:def, specialAttack:spa, specialDefense:spd, speed:spe };
}

// ========== ROSTER INICIAL ==========
// Pedido: trocar os Pokémon iniciais (1ª forma) por suas evoluções finais —
// removidos Bulbasaur/Charmander/Squirtle/Chikorita/Cyndaquil/Totodile/
// Treecko/Torchic/Mudkip/Turtwig/Chimchar/Piplup, adicionados Meganium/
// Typhlosion/Feraligatr/Sceptile/Swampert/Torterra/Infernape/Empoleon.
const RAW_ROSTER = {
  pikachu: { key:25, name:'Pikachu', types:['Elétrico'], baseStats:{hp:35,atk:55,def:40,spa:50,spd:50,spe:90},
    moves:[{name:'thunderbolt',type:'electric',power:90,accuracy:100,category:'special'},{name:'quick attack',type:'normal',power:40,accuracy:100,category:'physical',priority:1},{name:'iron tail',type:'steel',power:100,accuracy:75,category:'physical'},{name:'surf',type:'water',power:90,accuracy:100,category:'special'}]},
  charizard: { key:6, name:'Charizard', types:['Fogo','Voador'], baseStats:{hp:78,atk:84,def:78,spa:109,spd:85,spe:100},
    moves:[{name:'flamethrower',type:'fire',power:90,accuracy:100,category:'special'},{name:'air slash',type:'flying',power:75,accuracy:95,category:'special'},{name:'dragon claw',type:'dragon',power:80,accuracy:100,category:'physical'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'}]},
  blastoise: { key:9, name:'Blastoise', types:['Água'], baseStats:{hp:79,atk:83,def:100,spa:85,spd:105,spe:78},
    moves:[{name:'hydro pump',type:'water',power:110,accuracy:80,category:'special'},{name:'ice beam',type:'ice',power:90,accuracy:100,category:'special'},{name:'flash cannon',type:'steel',power:80,accuracy:100,category:'special'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'}]},
  venusaur: { key:3, name:'Venusaur', types:['Grama','Veneno'], baseStats:{hp:80,atk:82,def:83,spa:100,spd:100,spe:80},
    moves:[{name:'solar beam',type:'grass',power:120,accuracy:100,category:'special'},{name:'sludge bomb',type:'poison',power:90,accuracy:100,category:'special'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'sleep powder',type:'grass',power:0,accuracy:75,category:'status'}]},
  gengar: { key:94, name:'Gengar', types:['Fantasma','Veneno'], baseStats:{hp:60,atk:65,def:60,spa:130,spd:75,spe:110},
    moves:[{name:'shadow ball',type:'ghost',power:80,accuracy:100,category:'special'},{name:'sludge bomb',type:'poison',power:90,accuracy:100,category:'special'},{name:'thunderbolt',type:'electric',power:90,accuracy:100,category:'special'},{name:'psychic',type:'psychic',power:90,accuracy:100,category:'special'}]},
  machamp: { key:68, name:'Machamp', types:['Lutador'], baseStats:{hp:90,atk:130,def:80,spa:65,spd:85,spe:55},
    moves:[{name:'dynamic punch',type:'fighting',power:100,accuracy:50,category:'physical'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'stone edge',type:'rock',power:100,accuracy:80,category:'physical'},{name:'bullet punch',type:'steel',power:40,accuracy:100,category:'physical',priority:1}]},
  gyarados: { key:130, name:'Gyarados', types:['Água','Voador'], baseStats:{hp:95,atk:125,def:79,spa:60,spd:100,spe:81},
    moves:[{name:'waterfall',type:'water',power:80,accuracy:100,category:'physical'},{name:'ice fang',type:'ice',power:65,accuracy:95,category:'physical'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'dragon dance',type:'dragon',power:0,accuracy:100,category:'status'}]},
  dragonite: { key:149, name:'Dragonite', types:['Dragão','Voador'], baseStats:{hp:91,atk:134,def:95,spa:100,spd:100,spe:80},
    moves:[{name:'dragon claw',type:'dragon',power:80,accuracy:100,category:'physical'},{name:'hurricane',type:'flying',power:110,accuracy:70,category:'special'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'extreme speed',type:'normal',power:80,accuracy:100,category:'physical',priority:2}]},
  snorlax: { key:143, name:'Snorlax', types:['Normal'], baseStats:{hp:160,atk:110,def:65,spa:65,spd:110,spe:30},
    moves:[{name:'body slam',type:'normal',power:85,accuracy:100,category:'physical'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'crunch',type:'dark',power:80,accuracy:100,category:'physical'},{name:'rest',type:'psychic',power:0,accuracy:100,category:'status'}]},
  arcanine: { key:59, name:'Arcanine', types:['Fogo'], baseStats:{hp:90,atk:110,def:80,spa:100,spd:80,spe:95},
    moves:[{name:'flare blitz',type:'fire',power:120,accuracy:100,category:'physical'},{name:'extreme speed',type:'normal',power:80,accuracy:100,category:'physical',priority:2},{name:'wild charge',type:'electric',power:90,accuracy:100,category:'physical'},{name:'close combat',type:'fighting',power:120,accuracy:100,category:'physical'}]},
  lapras: { key:131, name:'Lapras', types:['Água','Gelo'], baseStats:{hp:130,atk:85,def:80,spa:85,spd:95,spe:60},
    moves:[{name:'ice beam',type:'ice',power:90,accuracy:100,category:'special'},{name:'hydro pump',type:'water',power:110,accuracy:80,category:'special'},{name:'thunderbolt',type:'electric',power:90,accuracy:100,category:'special'},{name:'sing',type:'normal',power:0,accuracy:55,category:'status'}]},
  onix: { key:95, name:'Onix', types:['Pedra','Terra'], baseStats:{hp:35,atk:45,def:160,spa:30,spd:45,spe:70},
    moves:[{name:'rock slide',type:'rock',power:75,accuracy:90,category:'physical'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'iron tail',type:'steel',power:100,accuracy:75,category:'physical'},{name:'stealth rock',type:'rock',power:0,accuracy:100,category:'status'}]},
  steelix: { key:208, name:'Steelix', types:['Aço','Terra'], baseStats:{hp:75,atk:85,def:200,spa:55,spd:65,spe:30},
    moves:[{name:'heavy slam',type:'steel',power:80,accuracy:100,category:'physical'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'crunch',type:'dark',power:80,accuracy:100,category:'physical'},{name:'curse',type:'ghost',power:0,accuracy:100,category:'status'}]},
  meganium: { key:154, name:'Meganium', types:['Grama'], baseStats:{hp:80,atk:82,def:100,spa:83,spd:100,spe:80},
    moves:[{name:'petal blizzard',type:'grass',power:90,accuracy:100,category:'physical'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'synthesis',type:'grass',power:0,accuracy:100,category:'status'},{name:'body slam',type:'normal',power:85,accuracy:100,category:'physical'}]},
  typhlosion: { key:157, name:'Typhlosion', types:['Fogo'], baseStats:{hp:78,atk:84,def:78,spa:109,spd:85,spe:100},
    moves:[{name:'flamethrower',type:'fire',power:90,accuracy:100,category:'special'},{name:'eruption',type:'fire',power:150,accuracy:100,category:'special'},{name:'shadow ball',type:'ghost',power:80,accuracy:100,category:'special'},{name:'quick attack',type:'normal',power:40,accuracy:100,category:'physical',priority:1}]},
  feraligatr: { key:160, name:'Feraligatr', types:['Água'], baseStats:{hp:85,atk:105,def:100,spa:79,spd:83,spe:78},
    moves:[{name:'waterfall',type:'water',power:80,accuracy:100,category:'physical'},{name:'ice punch',type:'ice',power:75,accuracy:100,category:'physical'},{name:'crunch',type:'dark',power:80,accuracy:100,category:'physical'},{name:'dragon dance',type:'dragon',power:0,accuracy:100,category:'status'}]},
  suicune: { key:245, name:'Suicune', types:['Água'], baseStats:{hp:100,atk:75,def:115,spa:90,spd:115,spe:85},
    moves:[{name:'hydro pump',type:'water',power:110,accuracy:80,category:'special'},{name:'ice beam',type:'ice',power:90,accuracy:100,category:'special'},{name:'calm mind',type:'psychic',power:0,accuracy:100,category:'status'},{name:'rest',type:'psychic',power:0,accuracy:100,category:'status'}]},
  sceptile: { key:254, name:'Sceptile', types:['Grama'], baseStats:{hp:70,atk:85,def:65,spa:105,spd:85,spe:120},
    moves:[{name:'leaf blade',type:'grass',power:90,accuracy:100,category:'physical'},{name:'x-scissor',type:'bug',power:80,accuracy:100,category:'physical'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'swords dance',type:'normal',power:0,accuracy:100,category:'status'}]},
  blaziken: { key:257, name:'Blaziken', types:['Fogo','Lutador'], baseStats:{hp:80,atk:120,def:70,spa:110,spd:70,spe:80},
    moves:[{name:'flare blitz',type:'fire',power:120,accuracy:100,category:'physical'},{name:'close combat',type:'fighting',power:120,accuracy:100,category:'physical'},{name:'brave bird',type:'flying',power:120,accuracy:100,category:'physical'},{name:'swords dance',type:'normal',power:0,accuracy:100,category:'status'}]},
  swampert: { key:260, name:'Swampert', types:['Água','Terra'], baseStats:{hp:100,atk:110,def:90,spa:85,spd:90,spe:60},
    moves:[{name:'waterfall',type:'water',power:80,accuracy:100,category:'physical'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'ice punch',type:'ice',power:75,accuracy:100,category:'physical'},{name:'stealth rock',type:'rock',power:0,accuracy:100,category:'status'}]},
  latios: { key:381, name:'Latios', types:['Dragão','Psíquico'], baseStats:{hp:80,atk:90,def:80,spa:130,spd:110,spe:110},
    moves:[{name:'dragon pulse',type:'dragon',power:85,accuracy:100,category:'special'},{name:'psychic',type:'psychic',power:90,accuracy:100,category:'special'},{name:'thunderbolt',type:'electric',power:90,accuracy:100,category:'special'},{name:'calm mind',type:'psychic',power:0,accuracy:100,category:'status'}]},
  rayquaza: { key:384, name:'Rayquaza', types:['Dragão','Voador'], baseStats:{hp:105,atk:150,def:90,spa:150,spd:90,spe:95},
    moves:[{name:'dragon ascent',type:'flying',power:120,accuracy:100,category:'physical'},{name:'dragon claw',type:'dragon',power:80,accuracy:100,category:'physical'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'extreme speed',type:'normal',power:80,accuracy:100,category:'physical',priority:2}]},
  torterra: { key:389, name:'Torterra', types:['Grama','Terra'], baseStats:{hp:95,atk:109,def:105,spa:75,spd:85,spe:56},
    moves:[{name:'seed bomb',type:'grass',power:80,accuracy:100,category:'physical'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'stone edge',type:'rock',power:100,accuracy:80,category:'physical'},{name:'synthesis',type:'grass',power:0,accuracy:100,category:'status'}]},
  infernape: { key:392, name:'Infernape', types:['Fogo','Lutador'], baseStats:{hp:76,atk:104,def:71,spa:104,spd:71,spe:108},
    moves:[{name:'flare blitz',type:'fire',power:120,accuracy:100,category:'physical'},{name:'close combat',type:'fighting',power:120,accuracy:100,category:'physical'},{name:'mach punch',type:'fighting',power:40,accuracy:100,category:'physical',priority:1},{name:'swords dance',type:'normal',power:0,accuracy:100,category:'status'}]},
  empoleon: { key:395, name:'Empoleon', types:['Água','Aço'], baseStats:{hp:84,atk:86,def:88,spa:111,spd:101,spe:60},
    moves:[{name:'hydro pump',type:'water',power:110,accuracy:80,category:'special'},{name:'flash cannon',type:'steel',power:80,accuracy:100,category:'special'},{name:'ice beam',type:'ice',power:90,accuracy:100,category:'special'},{name:'agility',type:'psychic',power:0,accuracy:100,category:'status'}]},
  giratina: { key:487, name:'Giratina', types:['Fantasma','Dragão'], baseStats:{hp:150,atk:100,def:120,spa:100,spd:120,spe:90},
    moves:[{name:'shadow force',type:'ghost',power:120,accuracy:100,category:'physical'},{name:'dragon claw',type:'dragon',power:80,accuracy:100,category:'physical'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'will-o-wisp',type:'fire',power:0,accuracy:85,category:'status'}]},
  eevee: { key:133, name:'Eevee', types:['Normal'], baseStats:{hp:55,atk:55,def:50,spa:45,spd:65,spe:55},
    moves:[{name:'quick attack',type:'normal',power:40,accuracy:100,category:'physical',priority:1},{name:'bite',type:'dark',power:60,accuracy:100,category:'physical'},{name:'swift',type:'normal',power:60,accuracy:100,category:'special'},{name:'shadow ball',type:'ghost',power:80,accuracy:100,category:'special'}]},
  vaporeon: { key:134, name:'Vaporeon', types:['Água'], baseStats:{hp:130,atk:65,def:60,spa:110,spd:95,spe:65},
    moves:[{name:'hydro pump',type:'water',power:110,accuracy:80,category:'special'},{name:'ice beam',type:'ice',power:90,accuracy:100,category:'special'},{name:'shadow ball',type:'ghost',power:80,accuracy:100,category:'special'},{name:'acid armor',type:'poison',power:0,accuracy:100,category:'status'}]},
  jolteon: { key:135, name:'Jolteon', types:['Elétrico'], baseStats:{hp:65,atk:65,def:60,spa:110,spd:95,spe:130},
    moves:[{name:'thunderbolt',type:'electric',power:90,accuracy:100,category:'special'},{name:'shadow ball',type:'ghost',power:80,accuracy:100,category:'special'},{name:'volt switch',type:'electric',power:70,accuracy:100,category:'special'},{name:'thunder wave',type:'electric',power:0,accuracy:90,category:'status'}]},
  flareon: { key:136, name:'Flareon', types:['Fogo'], baseStats:{hp:65,atk:130,def:60,spa:95,spd:110,spe:65},
    moves:[{name:'flare blitz',type:'fire',power:120,accuracy:100,category:'physical'},{name:'superpower',type:'fighting',power:120,accuracy:100,category:'physical'},{name:'quick attack',type:'normal',power:40,accuracy:100,category:'physical',priority:1},{name:'fire blast',type:'fire',power:110,accuracy:85,category:'special'}]},
  espeon: { key:196, name:'Espeon', types:['Psíquico'], baseStats:{hp:65,atk:65,def:60,spa:130,spd:95,spe:110},
    moves:[{name:'psychic',type:'psychic',power:90,accuracy:100,category:'special'},{name:'shadow ball',type:'ghost',power:80,accuracy:100,category:'special'},{name:'morning sun',type:'normal',power:0,accuracy:100,category:'status'},{name:'calm mind',type:'psychic',power:0,accuracy:100,category:'status'}]},
  umbreon: { key:197, name:'Umbreon', types:['Sombrio'], baseStats:{hp:95,atk:65,def:110,spa:60,spd:130,spe:65},
    moves:[{name:'foul play',type:'dark',power:95,accuracy:100,category:'physical'},{name:'toxic',type:'poison',power:0,accuracy:90,category:'status'},{name:'moonlight',type:'fairy',power:0,accuracy:100,category:'status'},{name:'protect',type:'normal',power:0,accuracy:100,category:'status'}]},
  leafeon: { key:470, name:'Leafeon', types:['Grama'], baseStats:{hp:65,atk:110,def:130,spa:60,spd:65,spe:95},
    moves:[{name:'leaf blade',type:'grass',power:90,accuracy:100,category:'physical'},{name:'x-scissor',type:'bug',power:80,accuracy:100,category:'physical'},{name:'swords dance',type:'normal',power:0,accuracy:100,category:'status'},{name:'synthesis',type:'grass',power:0,accuracy:100,category:'status'}]},
  glaceon: { key:471, name:'Glaceon', types:['Gelo'], baseStats:{hp:65,atk:60,def:110,spa:130,spd:95,spe:65},
    moves:[{name:'ice beam',type:'ice',power:90,accuracy:100,category:'special'},{name:'shadow ball',type:'ghost',power:80,accuracy:100,category:'special'},{name:'hail',type:'ice',power:0,accuracy:100,category:'status'},{name:'barrier',type:'psychic',power:0,accuracy:100,category:'status'}]},
  sylveon: { key:700, name:'Sylveon', types:['Fada'], baseStats:{hp:95,atk:65,def:65,spa:110,spd:130,spe:60},
    moves:[{name:'moonblast',type:'fairy',power:95,accuracy:100,category:'special'},{name:'psyshock',type:'psychic',power:80,accuracy:100,category:'special'},{name:'calm mind',type:'psychic',power:0,accuracy:100,category:'status'},{name:'wish',type:'normal',power:0,accuracy:100,category:'status'}]},
  luxray: { key:405, name:'Luxray', types:['Elétrico'], baseStats:{hp:80,atk:120,def:79,spa:95,spd:79,spe:70},
    moves:[{name:'wild charge',type:'electric',power:90,accuracy:100,category:'physical'},{name:'crunch',type:'dark',power:80,accuracy:100,category:'physical'},{name:'ice fang',type:'ice',power:65,accuracy:95,category:'physical'},{name:'volt switch',type:'electric',power:70,accuracy:100,category:'special'}]},
  lucario: { key:448, name:'Lucario', types:['Lutador','Aço'], baseStats:{hp:70,atk:110,def:70,spa:115,spd:70,spe:90},
    moves:[{name:'aura sphere',type:'fighting',power:80,accuracy:100,category:'special'},{name:'flash cannon',type:'steel',power:80,accuracy:100,category:'special'},{name:'extremespeed',type:'normal',power:80,accuracy:100,category:'physical',priority:2},{name:'swords dance',type:'normal',power:0,accuracy:100,category:'status'}]},
  scizor: { key:212, name:'Scizor', types:['Inseto','Aço'], baseStats:{hp:70,atk:130,def:100,spa:55,spd:80,spe:65},
    moves:[{name:'bullet punch',type:'steel',power:40,accuracy:100,category:'physical',priority:1},{name:'x-scissor',type:'bug',power:80,accuracy:100,category:'physical'},{name:'swords dance',type:'normal',power:0,accuracy:100,category:'status'},{name:'roost',type:'flying',power:0,accuracy:100,category:'status'}]},
  metagross: { key:376, name:'Metagross', types:['Aço','Psíquico'], baseStats:{hp:80,atk:135,def:130,spa:95,spd:90,spe:70},
    moves:[{name:'meteor mash',type:'steel',power:90,accuracy:90,category:'physical'},{name:'zen headbutt',type:'psychic',power:80,accuracy:90,category:'physical'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'bullet punch',type:'steel',power:40,accuracy:100,category:'physical',priority:1}]},
  salamence: { key:373, name:'Salamence', types:['Dragão','Voador'], baseStats:{hp:95,atk:135,def:80,spa:110,spd:80,spe:100},
    moves:[{name:'dragon claw',type:'dragon',power:80,accuracy:100,category:'physical'},{name:'hurricane',type:'flying',power:110,accuracy:70,category:'special'},{name:'earthquake',type:'ground',power:100,accuracy:100,category:'physical'},{name:'fire blast',type:'fire',power:110,accuracy:85,category:'special'}]},
  articuno: { key:144, name:'Articuno', types:['Gelo','Voador'], baseStats:{hp:90,atk:85,def:100,spa:95,spd:125,spe:85},
    moves:[{name:'ice beam',type:'ice',power:90,accuracy:100,category:'special'},{name:'hurricane',type:'flying',power:110,accuracy:70,category:'special'},{name:'roost',type:'flying',power:0,accuracy:100,category:'status'},{name:'reflect',type:'psychic',power:0,accuracy:100,category:'status'}]},
  zapdos: { key:145, name:'Zapdos', types:['Elétrico','Voador'], baseStats:{hp:90,atk:90,def:85,spa:125,spd:90,spe:100},
    moves:[{name:'thunderbolt',type:'electric',power:90,accuracy:100,category:'special'},{name:'hurricane',type:'flying',power:110,accuracy:70,category:'special'},{name:'heat wave',type:'fire',power:95,accuracy:90,category:'special'},{name:'roost',type:'flying',power:0,accuracy:100,category:'status'}]},
  moltres: { key:146, name:'Moltres', types:['Fogo','Voador'], baseStats:{hp:90,atk:100,def:90,spa:125,spd:85,spe:90},
    moves:[{name:'flamethrower',type:'fire',power:90,accuracy:100,category:'special'},{name:'hurricane',type:'flying',power:110,accuracy:70,category:'special'},{name:'solar beam',type:'grass',power:120,accuracy:100,category:'special'},{name:'roost',type:'flying',power:0,accuracy:100,category:'status'}]}
};

const ROSTER_INICIAL = Object.values(RAW_ROSTER).map(mon => ({
  ...mon,
  ...calcStats(mon.baseStats),
  sprite: `${SPRITE_BASE}/${mon.key}.gif`,
  // Fallback estático: nem todo Pokémon tem sprite animada na pasta gen5
  // (ex: Pokémon de gerações mais novas, como o Sylveon). Se a animada não
  // carregar, a interface troca por essa (artwork oficial da PokeAPI, que
  // cobre praticamente todo mundo).
  spriteStatic: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${mon.key}.png`,
  status: null,
  boosts: { atk:0, def:0, spa:0, spd:0, spe:0 }
}));

// ========== POKEAPI E CACHE ==========
const CACHE_KEY = 'pokedex_cache';
const CACHE_SCHEMA_VERSION = 2; // incremente se o formato de um Pokémon salvo mudar
const TYPE_TRANSLATION = {
  normal:'Normal', fire:'Fogo', water:'Água', electric:'Elétrico', grass:'Grama',
  ice:'Gelo', fighting:'Lutador', poison:'Veneno', ground:'Terra', flying:'Voador',
  psychic:'Psíquico', bug:'Inseto', rock:'Pedra', ghost:'Fantasma', dragon:'Dragão',
  dark:'Sombrio', steel:'Aço', fairy:'Fada'
};
const MOVE_NAME_PT = {
  'acid-armor': 'Armadura Ácida',
  'agility': 'Agilidade',
  'air-slash': 'Lâmina de Ar',
  'aura-sphere': 'Esfera Áurica',
  'barrier': 'Barreira',
  'bite': 'Mordida',
  'body-slam': 'Investida Corporal',
  'brave-bird': 'Ave Brava',
  'bullet-punch': 'Soco Bala',
  'calm-mind': 'Calma Mental',
  'close-combat': 'Combate Chegado',
  'crunch': 'Trituração',
  'curse': 'Maldição',
  'dragon-ascent': 'Ascensão do Dragão',
  'dragon-claw': 'Garra de Dragão',
  'dragon-dance': 'Dança do Dragão',
  'dragon-pulse': 'Pulso do Dragão',
  'dynamic-punch': 'Soco Dinâmico',
  'earthquake': 'Terremoto',
  'eruption': 'Erupção',
  'extreme-speed': 'Velocidade Extrema',
  'extremespeed': 'Velocidade Extrema',
  'fire-blast': 'Explosão de Fogo',
  'flamethrower': 'Lança-Chamas',
  'flare-blitz': 'Investida de Fogo',
  'flash-cannon': 'Canhão de Luz',
  'foul-play': 'Jogo Sujo',
  'hail': 'Granizo',
  'heat-wave': 'Onda de Calor',
  'heavy-slam': 'Investida Pesada',
  'hurricane': 'Furacão',
  'hydro-pump': 'Hidrobomba',
  'ice-beam': 'Raio de Gelo',
  'ice-fang': 'Presa de Gelo',
  'ice-punch': 'Soco de Gelo',
  'iron-tail': 'Cauda de Ferro',
  'leaf-blade': 'Folha Navalha',
  'mach-punch': 'Soco Mach',
  'meteor-mash': 'Investida de Meteoro',
  'moonblast': 'Explosão Lunar',
  'moonlight': 'Luar',
  'morning-sun': 'Sol da Manhã',
  'petal-blizzard': 'Nevasca de Pétalas',
  'protect': 'Proteção',
  'psychic': 'Psíquico',
  'psyshock': 'Psicochoque',
  'quick-attack': 'Ataque Rápido',
  'reflect': 'Refletir',
  'rest': 'Descanso',
  'rock-slide': 'Deslize de Pedra',
  'roost': 'Pouso',
  'seed-bomb': 'Bomba de Sementes',
  'shadow-ball': 'Bola Sombria',
  'shadow-force': 'Força Sombria',
  'sing': 'Canto',
  'sleep-powder': 'Pó do Sono',
  'sludge-bomb': 'Bomba de Lodo',
  'solar-beam': 'Raio Solar',
  'stealth-rock': 'Pedras Ocultas',
  'stone-edge': 'Aresta de Pedra',
  'superpower': 'Superpoder',
  'surf': 'Surfe',
  'swift': 'Estelar',
  'swords-dance': 'Dança das Espadas',
  'synthesis': 'Síntese',
  'thunder-wave': 'Onda de Choque',
  'thunderbolt': 'Raio',
  'toxic': 'Toxina',
  'volt-switch': 'Troca de Volt',
  'waterfall': 'Cachoeira',
  'wild-charge': 'Carga Selvagem',
  'will-o-wisp': 'Fogo-Fátuo',
  'wish': 'Desejo',
  'x-scissor': 'Tesourada-X',
  'zen-headbutt': 'Cabeçada Zen',
};
/** Nome de exibição de um golpe: traduzido se for um dos golpes do roster
 *  inicial (lista curada acima); senão mostra o nome original (golpes
 *  vindos da busca cobrem centenas de possibilidades — traduzir tudo
 *  exigiria um dicionário gigante ou uma chamada extra à internet, o que
 *  vai contra o funcionamento offline). */
function moveDisplayName(englishName) {
  const key = String(englishName||'').toLowerCase().trim().replace(/[\s_]+/g,'-');
  return MOVE_NAME_PT[key] || englishName.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Golpes com mecânica especial demais pro motor atual dar conta direito
// (multi-turno, clima duradouro pro campo todo, cópia de golpe/Pokémon,
// troca forçada, hazards que dependem de troca etc.). Ficam de fora da
// lista de golpes selecionáveis na tela de busca — assim o jogador nunca
// consegue montar um Pokémon com um golpe que o sistema não sabe tratar.
const BLOCKED_MOVE_NAMES = new Set([
  'transform','substitute','mimic','sketch','metronome','me-first','copycat',
  'assist','baton-pass','fly','dig','dive','bounce','phantom-force','shadow-force',
  'sky-attack','solar-blade','freeze-shock','sky-drop','razor-wind','skull-bash',
  'ice-burn','geomancy','future-sight','doom-desire','trick','switcheroo',
  'whirlwind','roar','dragon-tail','circle-throw','perish-song','destiny-bond',
  'spikes','toxic-spikes','sticky-web','trick-room','wonder-room','magic-room',
  'gravity'
]);

function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    // Migração simples: se o esquema salvo for de uma versão antiga, descarta
    // em vez de arriscar alimentar o motor de batalha com um objeto incompleto.
    if (raw.__schemaVersion !== CACHE_SCHEMA_VERSION) return {};
    const { __schemaVersion, ...pokemons } = raw;
    return pokemons;
  } catch(e) { return {}; }
}
function saveCache(c) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...c, __schemaVersion: CACHE_SCHEMA_VERSION })); }
  catch(e) { toast('Não foi possível salvar na Pokédex local (armazenamento cheio ou bloqueado).', true); }
}

async function fetchPokemonRaw(query) {
  const url = `https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(query.toLowerCase().trim())}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Pokémon não encontrado.');
  return r.json();
}

async function fetchMovesForPokemon(pokemonRaw, typeFilter = null) {
  if (!pokemonRaw?.moves) return [];
  const urls = [...new Set(pokemonRaw.moves.map(m => m.move.url))];
  const chunks = []; for (let i=0; i<urls.length; i+=10) chunks.push(urls.slice(i, i+10));
  let moves = [];
  for (const chunk of chunks) {
    const res = await Promise.all(chunk.map(async u => {
      try { const d = await (await fetch(u)).json(); return normalizeMove(d); } catch(e) { return null; }
    }));
    moves.push(...res.filter(Boolean));
  }
  if (typeFilter) moves = moves.filter(m => m.type === typeFilter.toLowerCase());
  moves.sort((a,b) => a.name.localeCompare(b.name));
  return moves;
}

function normalizeMove(d) {
  return {
    name: d.name, type: d.type?.name || 'normal', power: d.power ?? 0, accuracy: d.accuracy ?? 100,
    category: d.damage_class?.name || 'physical',
    ailment: d.meta?.ailment?.name ?? null, ailmentChance: d.meta?.ailment_chance ?? null,
    statChanges: d.stat_changes?.map(c => ({ stat: c.stat.name, change: c.change })) ?? null,
    moveTarget: d.target?.name || null
  };
}

// 25 naturezas oficiais. null = neutra (não muda nada).
const NATURES = [
  { name:'Hardy', pt:'Robusta', boost:null, drop:null },
  { name:'Lonely', pt:'Solitária', boost:'atk', drop:'def' },
  { name:'Brave', pt:'Corajosa', boost:'atk', drop:'spe' },
  { name:'Adamant', pt:'Adamante', boost:'atk', drop:'spa' },
  { name:'Naughty', pt:'Travessa', boost:'atk', drop:'spd' },
  { name:'Bold', pt:'Ousada', boost:'def', drop:'atk' },
  { name:'Docile', pt:'Dócil', boost:null, drop:null },
  { name:'Relaxed', pt:'Relaxada', boost:'def', drop:'spe' },
  { name:'Impish', pt:'Traquina', boost:'def', drop:'spa' },
  { name:'Lax', pt:'Frouxa', boost:'def', drop:'spd' },
  { name:'Timid', pt:'Medrosa', boost:'spe', drop:'atk' },
  { name:'Hasty', pt:'Apressada', boost:'spe', drop:'def' },
  { name:'Serious', pt:'Séria', boost:null, drop:null },
  { name:'Jolly', pt:'Alegre', boost:'spe', drop:'spa' },
  { name:'Naive', pt:'Ingênua', boost:'spe', drop:'spd' },
  { name:'Modest', pt:'Modesta', boost:'spa', drop:'atk' },
  { name:'Mild', pt:'Branda', boost:'spa', drop:'def' },
  { name:'Quiet', pt:'Quieta', boost:'spa', drop:'spe' },
  { name:'Bashful', pt:'Envergonhada', boost:null, drop:null },
  { name:'Rash', pt:'Precipitada', boost:'spa', drop:'spd' },
  { name:'Calm', pt:'Calma', boost:'spd', drop:'atk' },
  { name:'Gentle', pt:'Gentil', boost:'spd', drop:'def' },
  { name:'Sassy', pt:'Atrevida', boost:'spd', drop:'spe' },
  { name:'Careful', pt:'Cautelosa', boost:'spd', drop:'spa' },
  { name:'Quirky', pt:'Estranha', boost:null, drop:null }
];

function normalizeChosenPokemon(raw, moves, nature, ability) {
  const stats = {}; raw.stats.forEach(s => stats[s.stat.name] = s.base_stat);
  const hp = Math.floor((2*(stats.hp||0)+31) * LEVEL / 100 + LEVEL + 10);
  return {
    key: raw.id,
    name: raw.name.charAt(0).toUpperCase() + raw.name.slice(1),
    types: raw.types.map(t => TYPE_TRANSLATION[t.type.name] || t.type.name),
    // Pedido: sempre tentar animação primeiro. A PokeAPI também tem sprites
    // animadas (mesma pasta gen5 B/W) pra boa parte dos Pokémon — só cai pro
    // estático (front_default/artwork oficial) se a espécie não tiver.
    sprite: raw.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_default
      || `${SPRITE_BASE}/${raw.id}.gif`,
    spriteStatic: raw.sprites?.front_default
      || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${raw.id}.png`,
    maxHp: hp, currentHp: hp,
    attack: Math.floor(((2*(stats.attack||0)+31) * LEVEL / 100 + 5)),
    defense: Math.floor(((2*(stats.defense||0)+31) * LEVEL / 100 + 5)),
    specialAttack: Math.floor(((2*(stats['special-attack']||0)+31) * LEVEL / 100 + 5)),
    specialDefense: Math.floor(((2*(stats['special-defense']||0)+31) * LEVEL / 100 + 5)),
    speed: Math.floor(((2*(stats.speed||0)+31) * LEVEL / 100 + 5)),
    moves: moves.map(m => ({
      name: m.name, type: m.type, power: m.power, accuracy: m.accuracy, category: m.category,
      ailment: m.ailment, ailmentChance: m.ailmentChance, statChanges: m.statChanges, moveTarget: m.moveTarget
    })),
    nature: nature || 'Serious',
    ability: ability || null, // null = motor usa a 1ª habilidade oficial da espécie automaticamente
    status: null, boosts: { atk:0, def:0, spa:0, spd:0, spe:0, acc:0 }
  };
}

/** Habilidades da própria espécie, já vêm no resultado da busca — não
 *  precisa de mais nenhuma chamada de rede pra isso. */
function abilitiesForSpecies(raw) {
  return (raw.abilities || []).map(a => a.ability.name);
}

function saveToLocalDex(p) { const c = loadCache(); c[p.key] = p; saveCache(c); }
function getFullRoster() {
  const c = loadCache(); const map = {};
  ROSTER_INICIAL.forEach(p => map[p.key] = p);
  Object.values(c).forEach(p => map[p.key] = p);
  return Object.values(map);
}
