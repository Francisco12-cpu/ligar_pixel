/* ==========================================================================
   MAIN.JS
   Ponto de entrada: valida que o motor de cálculo (window.calc) carregou,
   esconde o splash de carregamento, mostra a tela inicial e registra o
   service worker (funcionamento offline).
   ========================================================================== */

function bootGame() {
  const splash = document.getElementById('boot-splash');
  if (!window.calc || !window.calc.Generations || !window.calc.Pokemon || !window.calc.Move || !window.calc.calculate) {
    // Isto é o que causava o botão "JOGAR" não fazer NADA na versão anterior:
    // o script do jogo inteiro falhava silenciosamente (import quebrado) e
    // nenhum listener de clique chegava a ser registrado. Agora qualquer
    // falha real de carregamento aparece aqui, de forma visível.
    if (splash) {
      splash.classList.add('error');
      splash.querySelector('p').textContent = 'Não foi possível carregar o motor de batalha. Verifique sua conexão (no primeiro acesso é necessária internet para baixar os arquivos) e tente novamente.';
    }
    return;
  }
  splash?.classList.add('hidden');
  updateOnlineStatusUI();
  showFirstScreen();
}

// Os <script> de lib/ e js/ são carregados de forma síncrona e em ordem no
// index.html, então quando este arquivo roda, window.calc já deveria existir.
// Ainda assim fazemos a checagem acima em vez de assumir que deu certo.
bootGame();

// Registra o service worker para o jogo funcionar offline depois da primeira
// visita. Só funciona servido por http(s) (não abrindo o arquivo direto,
// file://) — em file:// esta chamada falha silenciosamente e o jogo
// continua funcionando normalmente, só sem cache offline.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker não registrado:', err));
  });
}
