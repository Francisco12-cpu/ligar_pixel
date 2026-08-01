# Liga Pixel — Pokémon Battle PWA

Minigame de batalha estilo Pokémon com motor de cálculo de dano **real**
(o mesmo do [Damage Calculator do Smogon/Pokémon Showdown](https://calc.pokemonshowdown.com/)),
jogável offline, sozinho ou com amigos.

## Novidades desta rodada (reta final)

**Correções de mecânica de batalha:**
- **Bug do multi-hit corrigido**: golpes que acertam várias vezes (Debulhadeira etc.) causavam `NaN` no HP do alvo. O motor real já sabe calcular isso sozinho — o bug era só na forma como eu lia o resultado.
- **Rolagem dupla de status corrigida**: um golpe vindo da busca que coincidisse com a tabela de status curada tinha duas chances independentes de causar paralisia/queimadura/etc, inflando a probabilidade real.
- **Autobuff corrigido (bug sério)**: Dança das Espadas, Calma Mental, Dança do Dragão e similares estavam buffando o **adversário** em vez de quem usou o golpe.
- **Cura implementada de verdade**: Pouso, Síntese, Luar, Sol da Manhã, Descanso e Desejo agora recuperam HP de verdade.
- **Proteção implementada**: Proteção/Detectar bloqueiam o golpe do adversário naquele turno.
- **Clima implementado com o motor real** (não é aproximação — usa o mesmo `Field` oficial do Smogon Calc): Sol, Chuva, Areia, Granizo e Neve afetam o dano de verdade, do jeito oficial.
- **Golpes com mecânica complexa demais pro motor atual** (Transformar, Substituto, voar/cavar, hazards de entrada, etc.) agora ficam **fora da lista de golpes selecionáveis** na busca — não porque o sistema vai bugar, mas porque não têm efeito nenhum implementado ainda, e prefiro deixar isso explícito a fingir que funciona.

**Modo online:**
- **Servidor único de aleatoriedade**: agora só o celular que **criou a sala** calcula o resultado de cada turno (dano, crítico, status); o outro celular só recebe o resultado pronto e reproduz a mesma animação. Isso elimina de vez a chance dos dois aparelhos mostrarem números diferentes pro mesmo turno.
- **Bug corrigido**: os botões de golpe nunca eram reabilitados depois do primeiro turno no modo online.

**Interface:**
- **Tela gira 180° na vez do Jogador 2** (modo duo, dois jogadores frente a frente na mesma mesa) — não precisa girar o celular na mão.
- **Espaçamento mais respirado** na grade de seleção de time e no campo de batalha.
- **Paleta de cores por tipo trocada pela oficial dos jogos** (mais contraste entre tipos que ficavam parecidos, como água/voador/normal) + **selo do tipo** em cada botão de golpe, não só a cor de fundo.
- **Golpes do roster inicial traduzidos** (75 golpes). Golpes vindos da busca continuam em inglês (traduzir todos exigiria um dicionário gigante ou uma chamada extra à internet — o que ia contra o funcionamento offline), mas mostram o tipo/poder/precisão bem visíveis.
- **Natureza e habilidade** agora são escolhíveis ao adicionar um Pokémon pela busca (25 naturezas oficiais; habilidades vêm direto do resultado da busca, sem chamada extra à internet) e afetam o cálculo de dano de verdade.
- **Tutorial rápido** (4 telas) na primeira vez que abre, sempre com botão "Pular" visível. Não aparece de novo depois (fica salvo no aparelho).

## Sobre os ícones e o `rival.png`

Confirmado: não existe `rival.png` nenhum, nem enviado por você nem usado pelo projeto — era uma referência quebrada só no código antigo. Os ícones (`assets/icons/icon-192.png` e `icon-512.png`) são exatamente os dois tamanhos que um PWA/APK precisa — não precisa de mais nenhum. Pra trocar pelos seus, é só sobrescrever esses dois arquivos com o mesmo nome/tamanho.

## Como transformar em APK

1. **Hospede a pasta em algum lugar com HTTPS** — GitHub Pages, Netlify ou Vercel, todos grátis. Arraste a pasta ou conecte um repositório; qualquer um desses te dá uma URL tipo `https://seuapp.netlify.app`.
2. Abra essa URL uma vez no navegador do celular pra confirmar que carrega e que o service worker registra (você pode conferir em DevTools > Application > Service Workers, no computador).
3. Vá em **[pwabuilder.com](https://www.pwabuilder.com)**, cole a URL do passo 1, clique em "Start".
4. O PWABuilder vai analisar o `manifest.json` e o `sw.js` automaticamente (já estão prontos aqui) e vai gerar um pacote Android (APK ou AAB) pra baixar.
5. Transfira o APK pro celular (por cabo, ou link de download) e instale — pode ser preciso permitir "instalar de fontes desconhecidas" nas configurações do Android.
6. Pra mandar pros seus amigos, é só compartilhar esse mesmo arquivo `.apk` — cada um instala igual você fez.

**Depois de instalado, o app funciona 100% offline** (menos buscar Pokémon novo e o primeiro contato do modo online, que precisam de internet) — o Service Worker já guarda tudo no aparelho na primeira abertura.

Se preferir não hospedar em lugar nenhum público, dá pra rodar um servidor local só durante a geração do APK (ex: `python3 -m http.server` na sua própria máquina) e usar `ngrok` ou similar pra expor temporariamente com HTTPS — mas isso é mais trabalhoso; hospedar de graça no Netlify/GitHub Pages é o caminho mais simples e o que eu recomendo.

## Limitações conhecidas (deliberadamente não implementadas, documentadas)

- **Golpes na lista de bloqueio da busca** não têm efeito implementado (ver lista completa em `BLOCKED_MOVE_NAMES` no `pokemon-data.js`) — no roster inicial alguns desses golpes ainda aparecem (ex: Força Sombria da Giratina) porque já estavam lá antes; funcionam como um golpe comum (sem a mecânica especial), não quebram nada.
- **No modo online, quando o Pokémon do CONVIDADO desmaia**, o anfitrião escolhe automaticamente o próximo pra ele (não implementei o convidado escolher remotamente — exigiria uma pausa no meio do turno esperando resposta pela rede, o que aumentava bastante a complexidade). O jogador cujo Pokémon desmaiou sempre pode ver o que aconteceu, só não escolhe o substituto nesse caso específico.
- **Yawn (Sonolência)** foi simplificado pra causar sono imediatamente, em vez de só no próximo turno (como é oficialmente).

## Estrutura do projeto

```
index.html              shell da página (telas, sem lógica)
style.css                estilos
manifest.json             metadados do PWA (nome, ícone, cores)
sw.js                     service worker (cache offline)
lib/smogon-calc-engine.js  motor real de cálculo de dano (@smogon/calc, empacotado com esbuild)
js/pokemon-data.js         roster inicial + integração com a PokeAPI (busca/pokédex local) + traduções
js/battle-engine.js        regras de batalha (turnos, dano, status, cura, clima, IA, P2P/WebRTC)
js/ui.js                   telas, DOM, animações, sons, tutorial, handlers de clique
js/main.js                 ponto de entrada
assets/icons/              ícones do PWA (placeholders — troque pelos seus)
```

## Como rodar (pra testar antes de gerar o APK)

O jogo precisa ser servido por HTTP (não abrir o `index.html` direto com
duplo-clique) pra Service Worker e câmera funcionarem:

```bash
cd pasta-do-jogo
python3 -m http.server 8080
# abra http://localhost:8080 no navegador
```

## Testes que fiz nesta rodada

Simulei o app inteiro num navegador headless (jsdom) servido por HTTP local:
tutorial completo (primeira visita e visitas seguintes), multi-hit sem NaN,
autobuff no lado certo, cura funcionando, proteção bloqueando dano, clima
sendo definido corretamente, modo online com anfitrião calculando e
convidado recebendo o resultado idêntico (testado com duas sessões
separadas simulando os dois celulares), busca com natureza/habilidade e
filtro de golpes bloqueados, rotação de tela no duo, selos de tipo nos
botões, e uma batalha solo completa até o fim sem nenhum erro. Todos os
fluxos funcionaram como esperado.


