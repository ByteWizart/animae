// Catálogo do formato de história + validador. Usado pela página de docs, pelo admin e pelo servidor.
// Funciona no navegador (window.SCHEMA) e no Node (require('./schema.js')).
(function (root) {
  const L = (id, label, desc, extra) => Object.assign({ id, label, desc }, extra || {});

  const LOOKS = [
    L('cartoon', 'Cartoon', 'Padrão: colorido e limpo. Humor e curiosidade leve.', { sw: ['#7ec8ff', '#ffd93b'] }),
    L('sketch', 'Lápis', 'Desenho a lápis em papel antigo, traço tremendo. Histórias e explicações.', { sw: ['#f2e8cc', '#33333a'] }),
    L('comic', 'Quadrinhos', 'Pontinhos de impressão. Ação, super-heróis, humor.', { sw: ['#fff3d6', '#e23b3b'] }),
    L('noir', 'Noir', 'Preto e branco, contraste alto e grão. Mistério, crime, suspense.', { sw: ['#1d1d1d', '#e8e8e8'] }),
    L('neon', 'Neon', 'Escuro com brilho e linhas de monitor. Tecnologia e ficção científica.', { sw: ['#1a0f5e', '#39f0ff'] }),
    L('retro', 'Retrô VHS', 'Fita VHS dos anos 80, tom quente. Nostalgia.', { sw: ['#ff8a5a', '#2a1030'] }),
    L('pixel', 'Pixel art', 'Videogame antigo. Games, humor, internet.', { sw: ['#3fa34d', '#222222'] }),
    L('blueprint', 'Planta azul', 'Grade e traço branco. Engenharia e como as coisas funcionam.', { sw: ['#2a6cff', '#ffffff'] }),
    L('pastel', 'Pastel', 'Cores suaves e claras. Histórias calmas, infantil, bem-estar.', { sw: ['#ffe0ef', '#bfe3ff'] }),
    L('vintage', 'Filme antigo', 'Sépia com grão. História, biografias, fatos do passado.', { sw: ['#b98b55', '#3a2a1a'] }),
  ];

  const ANIMS = [
    L('idle', 'Parado', 'Respira; gesticula sozinho quando há "talk".'),
    L('walk', 'Andar', 'Automático quando o personagem tem "to".'),
    L('run', 'Correr', 'Passos largos e inclinação.'),
    L('wave', 'Acenar', 'Cumprimento.'),
    L('point', 'Apontar', 'Chama atenção para algo.'),
    L('jump', 'Pular', 'Descoberta, surpresa boa.'),
    L('shock', 'Susto', 'Braços para cima, tremor.'),
    L('nervous', 'Nervoso', 'Tremendo, com gotas de suor.'),
    L('cheer', 'Comemorar', 'Braços para o alto, sorrindo.'),
    L('think', 'Pensar', 'Mão no queixo. Dúvida.'),
    L('laugh', 'Rir', 'Gargalhada.'),
    L('facepalm', 'Facepalm', 'Mão na testa. Erro, vergonha.'),
    L('dance', 'Dançar', 'Balança no ritmo.'),
    L('crouch', 'Agachar', 'Abaixa o corpo.'),
    L('clap', 'Palmas', 'Aplaude sorrindo. Aprovação, final feliz.'),
    L('shrug', 'Dar de ombros', 'Braços abertos, cara de "sei lá". Ironia, dúvida.'),
    L('bow', 'Reverência', 'Curva-se e fica abaixado. Agradecimento, fecho.'),
    L('flex', 'Mostrar força', 'Braços em V, sorrisão. Orgulho, vitória.'),
    L('sneak', 'Andar de fininho', 'Curvado e de lado, como quem não quer ser visto. Automático com "to".'),
    L('sleep', 'Dormir', 'Deitado com olhos fechados e "Z z z". Use flip para mudar o lado.'),
    L('faint', 'Desmaiar', 'Cai deitado em 0,7 s (olhos em espiral). Choque, exagero cômico.'),
    L('cry', 'Chorar', 'Mãos no rosto e lágrimas. Tristeza.'),
    L('punch', 'Soco', 'Golpe repetido para a frente. Raiva, ação.'),
    L('kick', 'Chute', 'Chuta repetidamente. Ação, comédia.'),
    L('salute', 'Continência', 'Mão na testa, postura firme.'),
    L('sit', 'Sentar', 'Senta no ar (pernas dobradas). Combine com chair/sofa/bed no mesmo y.'),
    L('lookaround', 'Olhar em volta', 'Gira os olhos para os lados, desconfiado.'),
    L('type', 'Digitar', 'Mãos mexendo rápido. Combine com laptop/desk.'),
    L('call', 'Falar ao telefone', 'Mão na orelha. Combine com hold "phone".'),
    L('cower', 'Encolher de medo', 'Agachado, braços na cabeça, tremendo.'),
    L('spin', 'Girar', 'Gira de alegria (efeito 3D simples).'),
    L('slump', 'Desanimado', 'Ombros caídos, cabeça baixa. Derrota.'),
    L('float', 'Flutuar', 'Levita com braços abertos. Magia, sonho, leveza.'),
    L('rage', 'Furioso', 'Pisa forte e treme. Raiva extrema.'),
    L('yawn', 'Bocejar', 'Mão na boca, cabeça para trás, olhos sonolentos. Sono, tédio.'),
    L('stretch', 'Espreguiçar', 'Braços para o alto, corpo arqueado. Acordar, alívio.'),
    L('robot', 'Dança do robô', 'Movimentos travados em ângulos retos. Tecnologia, humor.'),
    L('jumpingjack', 'Polichinelo', 'Pula abrindo braços e pernas. Exercício, energia.'),
    L('zombie', 'Zumbi', 'Braços esticados, cabeça caída, andar duro. Automático com "to".'),
    L('drunk', 'Cambaleando', 'Balança de um lado para o outro, tonto. Cansaço, comédia.'),
    L('headbang', 'Cabeça no ritmo', 'Balança a cabeça forte, com guitarra imaginária. Rock, empolgação.'),
    L('fistpump', 'Soco no ar', 'Punho para cima repetido. Vitória, "isso!".'),
    L('shiver', 'Tremer de frio', 'Braços cruzados no peito, tremendo. Frio, medo.'),
    L('crossarms', 'Braços cruzados', 'Braços cruzados e pé batendo. Impaciência, desconfiança.'),
    L('hips', 'Mãos na cintura', 'Postura de confiança, com ar de sabichão. Pose, orgulho.'),
    L('scratch', 'Coçar a cabeça', 'Mão na cabeça, cara de dúvida. Confusão.'),
    L('knock', 'Bater na porta', 'Braço à frente batendo. Chegada, visita.'),
    L('boxing', 'Boxe', 'Guarda alta, socos alternados. Briga, competição.'),
    L('stumble', 'Tropeçar', 'Quase cai para a frente com os braços girando e se recompõe. Comédia.'),
    L('slip', 'Escorregão', 'Pula para trás e cai deitado, tonto. Comédia, acidente (pesa uma vez só por cena).'),
    L('pray', 'Implorar', 'Mãos juntas no peito, olhar aflito. Pedido, esperança.'),
    L('toast', 'Brindar', 'Braço erguido balançando. Combine com hold "cup". Comemoração.'),
    L('meditate', 'Meditar', 'Sentado, olhos fechados, mãos nos joelhos. Calma, foco.'),
    L('eureka', 'Eureka', 'Pula com o dedo para o alto. Combine com mark "idea". Descoberta.'),
    L('surrender', 'Mãos ao alto', 'Braços esticados para cima, assustado. Rendição, susto.'),
    L('sneeze', 'Espirrar', 'Cabeça para trás e depois um espirro forte, repetido. Comédia, doença.'),
    L('disco', 'Disco', 'Dedo para cima e para baixo, alternando com requebrado. Festa.'),
    L('twist', 'Twist', 'Gira o corpo no ritmo, braços dobrados. Dança animada.'),
    L('march', 'Marchar', 'Pernas retas, braços em balanço alto. Automático com "to".'),
    L('limp', 'Mancar', 'Anda arrastando uma perna, com cara de dor. Automático com "to".'),
    L('tiptoe', 'Pontinha dos pés', 'Anda nas pontas, mãos no peito. Silêncio. Automático com "to".'),
    L('skip', 'Saltitar', 'Anda pulando de alegria. Criança, felicidade. Automático com "to".'),
    L('strut', 'Desfilar', 'Anda rebolando, queixo para cima. Confiança. Automático com "to".'),
  ];

  const MOODS = [
    L('smile', 'Sorriso', 'Padrão. Alias: happy.'),
    L('grin', 'Sorrisão', 'Dentes à mostra.'),
    L('laugh', 'Riso', 'Boca aberta.'),
    L('shock', 'Choque', 'Olhos pequenos, boca em O.'),
    L('worry', 'Preocupado', 'Sobrancelhas inclinadas. Alias: sad.'),
    L('angry', 'Bravo', 'Sobrancelhas para baixo.'),
    L('deadpan', 'Sem expressão', 'Boca reta.'),
    L('smirk', 'Sorriso de canto', 'Convencido, malandro.'),
    L('love', 'Apaixonado', 'Olhos de coração e bochechas rosadas.'),
    L('dizzy', 'Tonto', 'Olhos em espiral.'),
    L('sleepy', 'Sonolento', 'Pálpebras caídas.'),
    L('scared', 'Assustado', 'Pupilas minúsculas e boca tremida.'),
    L('cry', 'Choro', 'Boca aberta triste, bochechas coradas e lágrimas.'),
    L('silly', 'Língua de fora', 'Brincalhão, bobo.'),
  ];
  const MOOD_ALIASES = ['happy', 'sad'];

  const SCENERY = [
    L('hills', 'Colinas', 'Céu, nuvens e morros. Externa de dia.'),
    L('city', 'Cidade', 'Prédios com janelas acesas.'),
    L('space', 'Espaço', 'Estrelas piscando, sem chão.'),
    L('night', 'Noite', 'Estrelas com chão.'),
    L('room', 'Sala (3D simples)', 'Parede, piso em perspectiva. Aceita wall, floor, tex (brick|plank) e hy.'),
    L('none', 'Nenhum', 'Só o degradê de fundo.'),
    L('desert', 'Deserto', 'Dunas, sol grande e céu quente. Aceita scroll (movimento do fundo).', { bg: ['#ffcf8a', '#fff1d0'], ground: '#e8b66a' }),
    L('beach', 'Praia', 'Mar com ondas animadas, areia e sol. Pode usar o prop palm.', { bg: ['#7ec8ff', '#e6f7ff'], ground: '#f0d9a0' }),
    L('forest', 'Floresta', 'Camadas de árvores e raios de luz. Aceita scroll.', { bg: ['#bfe3a0', '#e9f7d5'], ground: '#3f8a4a' }),
    L('mountains', 'Montanhas', 'Picos com neve, ar de aventura. Aceita scroll.', { bg: ['#8ec5ff', '#f2f8ff'], ground: '#6f9a62' }),
    L('snowfield', 'Campo de neve', 'Pinheiros nevados e chão branco.', { bg: ['#bcd3f0', '#f4f8ff'], ground: '#eef4ff' }),
    L('street', 'Rua', 'Prédios, calçada e faixas da pista que correm com scroll. Ideal para carro, ônibus e corrida.', { bg: ['#9ec9ff', '#e8f4ff'], ground: '#4a4a55' }),
    L('underwater', 'Fundo do mar', 'Raios de luz, algas e peixes passando. Combine com fx bubbles.', { bg: ['#2a9bd6', '#0b3f7a'], ground: '#d9c58a' }),
    L('stage', 'Palco', 'Cortinas vermelhas e holofotes. Show, apresentação, prêmio.', { bg: ['#2a1038', '#0d0415'], ground: '#6a3a28' }),
    L('cyber', 'Cibernético', 'Grade neon e sol retrô (synthwave). Tecnologia, games.', { bg: ['#0b0630', '#2b0f6e'], ground: '#12062e' }),
    L('paper', 'Caderno', 'Folha pautada com margem. Ótimo para explicações e anotações.', { bg: ['#f6efd8', '#efe3c2'], ground: '#efe3c2' }),
    L('chalkboard', 'Lousa', 'Quadro-negro com moldura. Aulas e tutoriais.', { bg: ['#2f4a3c', '#243b2f'], ground: '#5a3b22' }),
    L('cave', 'Caverna', 'Rocha escura e cristais brilhando. Mistério, terror.', { bg: ['#2b2230', '#120d16'], ground: '#3a2f3f' }),
    L('lunar', 'Lua', 'Superfície lunar com a Terra ao fundo. Espaço, ficção.', { bg: ['#05050f', '#141432'], ground: '#a9a9b5' }),
    L('sunset', 'Pôr do sol', 'Sol grande, colinas escuras e pássaros. Emoção, final de história.', { bg: ['#ff7a59', '#ffd88a'], ground: '#3a2a4a' }),
    L('sky', 'Acima das nuvens', 'Céu azul, sol e mar de nuvens. Avião, balão, sonho. Aceita scroll.', { bg: ['#3d8bff', '#d6ecff'], ground: '#f6fbff' }),
    L('mars', 'Marte', 'Céu alaranjado, luas e chão avermelhado. Espaço, ficção.', { bg: ['#3a1520', '#ff9a66'], ground: '#b5502e' }),
    L('jungle', 'Selva', 'Árvores grossas, folhas grandes e cipós com raios de luz. Aceita scroll.', { bg: ['#1f5a3a', '#b5e68a'], ground: '#2f6a3a' }),
    L('farm', 'Fazenda', 'Colinas, celeiro, cerca e sol. Campo, animais. Aceita scroll.', { bg: ['#8ed0ff', '#eef8ff'], ground: '#6fbf5a' }),
    L('rooftop', 'Telhado à noite', 'Cidade iluminada ao fundo, lua e estrelas. Drama, romance. Aceita scroll.', { bg: ['#0b1030', '#4a3580'], ground: '#3a3f4f' }),
    L('studio', 'Estúdio', 'Fundo claro e limpo com luz suave. Apresentação, produto, explicação.', { bg: ['#f2f4fa', '#cdd5e4'], ground: '#e4e9f2' }),
  ];

  const FX = [
    L('rain', 'Chuva', 'Tensão, tristeza.'),
    L('snow', 'Neve', 'Calma, frio.'),
    L('fog', 'Neblina', 'Mistério.'),
    L('sparks', 'Faíscas', 'Alívio, magia.'),
    L('stars', 'Estrelinhas', 'Brilhos de 4 pontas piscando. Magia, sonho.'),
    L('bubbles', 'Bolhas', 'Bolhas subindo. Fundo do mar, sabão, sonho.'),
    L('leaves', 'Folhas', 'Folhas caindo. Outono, passagem do tempo.'),
    L('petals', 'Pétalas', 'Pétalas rosa caindo. Romance, primavera.'),
    L('fireflies', 'Vaga-lumes', 'Luzes amarelas flutuando. Noite calma, mistério suave.'),
    L('hearts', 'Corações', 'Corações subindo. Amor, carinho.'),
    L('embers', 'Brasas', 'Faíscas laranjas subindo. Fogo, perigo, guerra.'),
    L('lightning', 'Raios', 'Clarão e raio a cada ~2,6 s. Tempestade, tensão.'),
    L('glitch', 'Glitch', 'Defeito digital (tiras deslocadas). Hacker, erro, tecnologia.'),
    L('dust', 'Poeira', 'Partículas de luz flutuando. Atmosfera.'),
    L('godrays', 'Raios de luz', 'Feixes de luz diagonais. Esperança, revelação.'),
    L('matrix', 'Chuva digital', 'Letras verdes caindo. Hacker, simulação.'),
    L('coins', 'Moedas', 'Chuva de moedas. Dinheiro, prêmio.'),
    L('shockwave', 'Onda de choque', 'Anel que se expande no início da cena. Impacto, revelação.'),
    L('birds', 'Pássaros', 'Bando cruzando o céu.'),
    L('confetti', 'Confete', 'Comemoração.'),
    L('lines', 'Linhas de velocidade', 'Impacto, ação.'),
    L('fireworks', 'Fogos de artifício', 'Explosões coloridas no céu. Festa, vitória, ano novo.'),
    L('balloons', 'Balões', 'Balões coloridos subindo. Aniversário, alegria.'),
    L('speed', 'Velocidade', 'Riscos horizontais correndo. Corrida, pressa, ação.'),
    L('alert', 'Alerta vermelho', 'Bordas vermelhas pulsando. Perigo, urgência.'),
    L('bokeh', 'Luzes desfocadas', 'Círculos de luz suaves. Festa, sonho, noite.'),
    L('notes', 'Notas musicais', 'Notas subindo. Música, cantoria.'),
  ];

  const TRANSITIONS = [
    L('fade', 'Fade', 'Escurece e abre (padrão).'),
    L('flash', 'Flash', 'Clarão branco rápido.'),
    L('wipe', 'Cortina', 'Da esquerda para a direita.'),
    L('iris', 'Íris', 'Círculo abrindo.'),
    L('none', 'Corte seco', 'Sem transição.'),
    L('slide', 'Deslizar', 'Painel preto sai pela esquerda.'),
    L('slideup', 'Subir', 'Painel preto sobe.'),
    L('blinds', 'Persianas', 'Faixas verticais abrem.'),
    L('zoom', 'Zoom', 'A cena entra com zoom rápido.'),
    L('spin', 'Giro', 'A cena entra girando e aproximando.'),
    L('glitch', 'Glitch', 'Defeito digital ao entrar.'),
    L('whiteout', 'Branco', 'Sai do branco (lembrança, sonho).'),
    L('pixel', 'Pixelar', 'Imagem pixelada que ganha nitidez.'),
    L('shutter', 'Obturador', 'Duas barras abrem (cinema).'),
    L('push', 'Empurrar', 'A cena entra empurrando pela direita.'),
    L('pushup', 'Empurrar para cima', 'A cena entra de baixo.'),
    L('checker', 'Xadrez', 'Quadrados pretos encolhem em onda.'),
    L('diagonal', 'Diagonal', 'Cortina preta diagonal.'),
    L('curtain', 'Cortinas', 'Duas cortinas pretas abrindo do centro.'),
    L('clock', 'Relógio', 'Varredura circular, como ponteiro.'),
  ];

  const PROPS = [
    L('desk', 'Mesa', 'Móvel de chão (escala com a profundidade).', { floor: 1 }),
    L('monitor', 'Monitor', 'Tela azul com linhas animadas.', { floor: 1 }),
    L('plant', 'Planta', 'Vaso balançando.', { floor: 1 }),
    L('lamp', 'Luminária', 'Com brilho amarelo.', { floor: 1 }),
    L('door', 'Porta', 'Abre se "open" (segundos) for definido.', { floor: 1 }),
    L('box', 'Caixa', 'Caixa de papelão.', { floor: 1 }),
    L('window', 'Janela', 'Prédios ao fundo.'),
    L('frame', 'Quadro', 'Paisagem na parede.'),
    L('shelf', 'Estante', 'Livros coloridos.'),
    L('sign', 'Placa', 'Texto em "t". Cor em "color".'),
    L('car', 'Carro', '"color", "flip":true para virar. s≈300.'),
    L('tree', 'Árvore', 'y = base do tronco. "color" na copa.'),
    L('arrow', 'Seta', '"rot" em radianos.'),
    L('ring', 'Círculo de destaque', 'Contorno para chamar atenção.'),
    L('text', 'Rótulo', '"t" com 1–2 palavras.'),
    L('bar', 'Barra de progresso', '"v" de 0 a 1 e "dur".'),
    L('pisa', 'Torre de Pisa', '"lean" = inclinação em rad (0 reta, 0.07 realista, 0.1 bem torta); "lean2" + "leanAt" + "leanDur": ela entorta ou endireita durante a cena. y = chão. s≈640.'),
    L('eiffel', 'Torre Eiffel', 'y = chão. s≈560.'),
    L('pyramid', 'Pirâmide do Egito', 'y = chão. s≈520.'),
    L('crane', 'Guindaste de obra', 'y = chão; a carga balança sozinha. s≈640.'),
    L('icon', 'Ícone da biblioteca online', '"q":"rocket" (1–2 palavras em inglês) ou "id":"noto:rocket". Milhares de objetos coloridos; use quando nenhum objeto do catálogo servir. s≈260. Precisa do servidor com internet.'),
    L('emoji', 'Emoji', '"t":"😀".'),
    L('circle', 'Círculo', 'Forma simples.'),
    L('rect', 'Retângulo', 'Forma simples.'),
    L('star', 'Estrela', 'Forma simples.'),
    L('chair', 'Cadeira', 'Móvel de chão (y = chão).', { floor: 1 }),
    L('sofa', 'Sofá', 'Móvel de chão; largura ≈ 1,8·s.', { floor: 1 }),
    L('bed', 'Cama', 'Móvel de chão; largura ≈ 1,9·s.', { floor: 1 }),
    L('table', 'Mesa de centro', 'Móvel de chão.', { floor: 1 }),
    L('tv', 'Televisão', 'Tela colorida; "t" mostra texto na tela. Móvel de chão.', { floor: 1 }),
    L('laptop', 'Notebook', 'Tela azul com linhas animadas.'),
    L('clock', 'Relógio', '"h" e "m" (hora/minuto) ou "spin":true para ponteiros girando.'),
    L('calendar', 'Calendário', '"t" = dia, "m" = mês (ex.: "NOV").'),
    L('phone', 'Celular grande', '"t" mostra texto curto na tela; "screen" = cor da tela.'),
    L('bulb', 'Lâmpada de ideia', 'Brilha e pisca raios. Descoberta.'),
    L('coin', 'Moeda', 'Gira. "t" = símbolo (padrão $); "spin":false para parar.'),
    L('money', 'Maço de notas', 'Dinheiro.'),
    L('gift', 'Presente', '"color" muda a cor do embrulho.'),
    L('trophy', 'Troféu', 'Vitória, prêmio.'),
    L('key', 'Chave', 'Grande, para destaque (diferente do item hold "key").'),
    L('lock', 'Cadeado', '"open":true ou segundos em que abre. Segurança, segredo.'),
    L('magnifier', 'Lupa', 'Investigação, detalhe.'),
    L('book', 'Livro', '"open":true abre; "t" = título na capa.'),
    L('bomb', 'Bomba', 'Pavio com faísca. Perigo, suspense.'),
    L('envelope', 'Envelope', '"badge" mostra uma bolinha vermelha (ex.: "1").'),
    L('document', 'Documento', '"t" = título curto.'),
    L('flag', 'Bandeira', 'Balança ao vento; "color".'),
    L('balloon', 'Balão', 'Flutua; "color".'),
    L('umbrella', 'Guarda-chuva', '"color".'),
    L('check', 'Certo', 'Círculo verde com ✓ desenhado. Acerto, aprovado.'),
    L('cross', 'Errado', 'Círculo vermelho com X. Erro, reprovado.'),
    L('question', 'Interrogação', 'Grande e animada. Dúvida, pergunta.'),
    L('exclaim', 'Exclamação', 'Grande e animada. Alerta.'),
    L('heart', 'Coração', 'Pulsa. "color".'),
    L('skull', 'Caveira', 'Perigo, morte, terror leve.'),
    L('lightning', 'Raio', 'Energia, susto, eletricidade.'),
    L('fire', 'Fogo', 'Chama animada. Perigo, calor, urgência.'),
    L('drop', 'Gota', 'Água. "color".'),
    L('sun', 'Sol', 'Raios girando.'),
    L('moon', 'Lua', 'Crescente. Noite.'),
    L('cloud', 'Nuvem', 'Flutua levemente; "color" para nuvem de tempestade.'),
    L('rocket', 'Foguete', 'Chama animada; use "rot" para inclinar.'),
    L('ufo', 'Disco voador', '"beam":true liga o raio de abdução.'),
    L('planet', 'Planeta', 'Com anel; "color".'),
    L('gear', 'Engrenagem', 'Gira; "rpm" controla a velocidade.'),
    L('target', 'Alvo', 'Com flecha; "arrow":false tira a flecha.'),
    L('pin', 'Marcador de mapa', 'Pula levemente. Lugar, localização.'),
    L('wifi', 'Wi-Fi', '"v" de 0 a 3 = barras acesas.'),
    L('chart', 'Gráfico', 'Dados reais animados. "kind": bar | line | pie | donut; "data":[números] ou [{"v":10,"l":"A","c":"#hex"}]; "labels":[...]; "t" = título; "vals":true mostra valores; s ≈ 600.'),
    L('counter', 'Contador', 'Número que sobe. "from","to","pre" (ex.: "R$ "),"suf","dec","dur". Texto grande no centro.'),
    L('gauge', 'Medidor', 'Velocímetro verde-amarelo-vermelho. "v" de 0 a 1; "t" = rótulo.'),
    L('thermo', 'Termômetro', '"v" de 0 a 1.'),
    L('donut', 'Rosca de progresso', '"v" de 0 a 1 mostra a porcentagem; "color".'),
    L('battery', 'Bateria', '"v" de 0 a 1 (muda de cor).'),
    L('checklist', 'Lista de itens', '"items":["a","b",{"t":"c","ok":false}] aparecem um a um ("gap" s). ok:false vira X vermelho. s ≈ 600.'),
    L('burst', 'Explosão de quadrinhos', '"t" = palavra curta (POW!, UAU!). "color" do fundo.'),
    L('versus', 'VS', 'Explosão com "VS" entre dois lados.'),
    L('callout', 'Balão de anotação', '"t" (até ~8 palavras) e "tx","ty" = ponto para onde a seta aponta.'),
    L('chat', 'Conversa de celular', '"msgs":[{"w":0,"t":"oi"},{"w":1,"t":"olá"}] (w 0 = esquerda, 1 = direita), "gap" s entre mensagens, "name". s ≈ 560.'),
    L('notification', 'Notificação', '"t" título, "b" texto, "icon" 1 letra, "color". Desce do topo.'),
    L('headline', 'Manchete de notícia', '"tag" (ex.: URGENTE) e "t" manchete curta. s ≈ 500.'),
    L('stamp', 'Carimbo', '"t" (ex.: APROVADO, FALSO), "color". Bate na tela com impacto.'),
    L('mountain', 'Montanha', 'Cenário (y = base).'),
    L('cactus', 'Cacto', 'Cenário (y = base).'),
    L('flower', 'Flor', 'Balança; "color" das pétalas.'),
    L('house', 'Casa', '"color" das paredes. y = base.'),
    L('building', 'Prédio', 'Janelas piscando; "color". y = base.'),
    L('bush', 'Arbusto', '"color". y = base.'),
    L('rock', 'Pedra', '"color". y = base.'),
    L('palm', 'Palmeira', 'Balança. y = base.'),
    L('bus', 'Ônibus', '"color", "flip":true. Use "to" para andar.'),
    L('plane', 'Avião', '"flip":true.'),
    L('boat', 'Barco', 'Balança nas ondas.'),
    L('bike', 'Bicicleta', 'Rodas giram.'),
    L('cat', 'Gato', '"color"; "flip":true.'),
    L('dog', 'Cachorro', 'Rabo balançando; "color".'),
    L('bird', 'Pássaro', 'Bate as asas; "color".'),
    L('fish', 'Peixe', 'Nada balançando; "color".'),
    L('pizza', 'Pizza', 'Fatia.'),
    L('burger', 'Hambúrguer', ''),
    L('cake', 'Bolo', 'Vela acesa.'),
    L('apple', 'Maçã', '"color".'),
    L('coffee', 'Café', 'Fumaça subindo.'),
    L('bigtext', 'Texto grande', 'Título com contorno (build 13). "t" = texto, "s" = altura da letra (padrão 160), "color", "sc" (contorno), "sub" = legenda menor abaixo, "subColor", "w" = largura máx. Encolhe sozinho. Ótimo para números e palavras de impacto.'),
    L('highlight', 'Marca-texto', 'Faixa que desenha da esquerda para a direita (build 13). "w", "s" (altura), "color", "dur". Coloque atrás de um texto.'),
    L('steps', 'Etapas', 'Linha de bolinhas que acendem (build 13). "steps":["Ideia","Roteiro","Voz","Vídeo"], "dur" (s), "w", "color"; "v" de 0 a 1 fixa o progresso.'),
    L('headphones', 'Fone de ouvido', 'Fone vermelho ("color"). Música, podcast.'),
    L('camera', 'Câmera fotográfica', 'Dá um flash a cada 3 s. Foto, memória.'),
    L('microphone', 'Microfone', 'Entrevista, podcast, show.'),
    L('speaker', 'Caixa de som', 'Cones pulsando. Música, aviso.'),
    L('server', 'Servidor', 'Rack com luzes piscando. Tecnologia, hospedagem.'),
    L('database', 'Banco de dados', 'Pilha de cilindros; "color". Dados, armazenamento.'),
    L('codewin', 'Janela de código', 'Linhas de código aparecendo uma a uma. Programação.'),
    L('browser', 'Janela de navegador', '"t" = endereço do site. Internet.'),
    L('qr', 'QR code', '"seed" muda o desenho. Link, pagamento.'),
    L('shield', 'Escudo', 'Escudo com ✓; "color". Segurança, proteção.'),
    L('robot', 'Robô', 'Robozinho flutuando; "color". IA, automação.'),
    L('drone', 'Drone', 'Hélices girando. Tecnologia, entrega.'),
    L('satellite', 'Satélite', 'Painéis solares azuis. Espaço, sinal.'),
    L('flask', 'Frasco de laboratório', 'Líquido com bolhas; "color". Ciência, experimento.'),
    L('dna', 'DNA', 'Hélice girando. Biologia, genética.'),
    L('atom', 'Átomo', 'Elétrons orbitando. Física, ciência.'),
    L('magnet', 'Ímã', 'Ímã em U; "color". Atração, física.'),
    L('globe', 'Globo terrestre', 'Continentes girando; "color" do mar. Mundo, viagem.'),
    L('hourglass', 'Ampulheta', 'Areia caindo em 4 s; "color". Tempo, prazo.'),
    L('scale', 'Balança da justiça', 'Pratos balançando. Justiça, comparação.'),
    L('piggy', 'Cofrinho', 'Moeda entrando; "color". Economia, poupança.'),
    L('creditcard', 'Cartão de crédito', '"color". Compras, dívida.'),
    L('bag', 'Sacola de compras', '"t" = símbolo (padrão %); "color". Promoção, loja.'),
    L('cart', 'Carrinho de compras', 'Rodas girando. Compras, consumo.'),
    L('medal', 'Medalha', '"t" = número (padrão 1); "color". Prêmio, conquista.'),
    L('crown', 'Coroa', '"color". Realeza, primeiro lugar.'),
    L('diamond', 'Diamante', 'Brilha de tempos em tempos; "color". Luxo, valor.'),
    L('pricetag', 'Etiqueta de preço', '"t" = preço (ex.: R$9); "color". Preço, oferta.'),
    L('thumbsup', 'Joinha', 'Positivo, aprovado; "color".'),
    L('play', 'Botão play', 'Pulsa; "color". Vídeo, começar.'),
    L('subscribe', 'Botão inscrever-se', 'Vira INSCRITO e o sininho balança em 1,2 s. Chamada para ação (s ≈ 300).'),
    L('loading', 'Carregando', 'Círculo girando; "color". Espera, processamento.'),
    L('searchbar', 'Barra de busca', '"t" = texto que é digitado na barra (s ≈ 300).'),
    L('toggle', 'Interruptor', 'Liga sozinho em 0,8 s; "on":true/false fixa o estado.'),
    L('ecg', 'Batimento cardíaco', 'Linha de eletrocardiograma; "color". Saúde, suspense.'),
    L('podium', 'Pódio', 'Pódio 1º, 2º e 3º. Ranking, competição.'),
    L('thought', 'Balão de pensamento', '"t" opcional; sem "t" mostra reticências animadas. Dúvida, reflexão.'),
    L('rating', 'Estrelas de avaliação', '"v" de 0 a 5 (padrão 5). Review, qualidade.'),
    L('map', 'Mapa do tesouro', 'Mapa dobrado com X vermelho. Viagem, busca.'),
    L('compass', 'Bússola', 'Agulha balançando. Direção, aventura.'),
    L('treasure', 'Baú do tesouro', '"open":true ou segundos em que abre, com brilho e moedas. Descoberta.'),
    L('bell', 'Sino', 'Balança a cada 3 s; "color". Alerta, notificação.'),
    L('megaphone', 'Megafone', '"color". Anúncio, protesto.'),
    L('speech', 'Balão de fala grande', '"t" (até ~6 palavras) dentro do balão; "color" de fundo.'),
    L('trafficlight', 'Semáforo', 'Muda de cor a cada 1,2 s. Trânsito, decisão.'),
    L('stopsign', 'Placa de PARE', '"t" muda o texto; "color". Proibição, alerta.'),
    L('skateboard', 'Skate', '"color". Esporte, juventude.'),
    L('soccer', 'Bola de futebol', 'Gira sozinha ("roll":false para parar). Esporte.'),
    L('basketball', 'Bola de basquete', 'Gira sozinha; "color". Esporte.'),
    L('dumbbell', 'Haltere', '"color". Academia, força.'),
    L('rabbit', 'Coelho', 'Pula levemente; "color"; "flip":true.'),
    L('duck', 'Pato', 'Boiando; "color"; "flip":true.'),
    L('penguin', 'Pinguim', 'Balança andando. Frio, Antártida.'),
    L('owl', 'Coruja', 'Olhos se mexendo; "color". Sabedoria, noite.'),
    L('pig', 'Porco', '"color"; "flip":true. Fazenda.'),
    L('frog', 'Sapo', 'Pulinhos; "color". Lagoa, humor.'),
    L('shark', 'Tubarão', 'Nada com a cauda mexendo; "flip":true. Perigo, mar.'),
    L('turtle', 'Tartaruga', '"color" do casco; "flip":true. Calma, lentidão.'),
    L('butterfly', 'Borboleta', 'Asas batendo e voando; "color". Leveza, natureza.'),
    L('snail', 'Caracol', 'Antenas se mexendo; "color" da casca; "flip":true. Lentidão.'),
    L('doughnut', 'Rosquinha', 'Cobertura com granulado; "color". Doce, comida.'),
    L('icecream', 'Sorvete', '"color" da bola. Verão, doce.'),
    L('banana', 'Banana', '"color". Fruta, comédia.'),
    L('soda', 'Refrigerante', 'Bolhas subindo; "color". Bebida.'),
    L('fries', 'Batata frita', '"color" da caixinha. Fast food.'),
    L('egg', 'Ovo', 'Balança de leve; "color". Comida, origem.'),
    L('cookie', 'Biscoito', '"color". Doce.'),
    L('watermelon', 'Melancia', 'Fatia. Verão, fruta.'),
    L('truck', 'Caminhão', '"color" da cabine, "flip":true, s ≈ 320. Use "to" para andar.'),
    L('train', 'Trem', 'Locomotiva com vagões; "color", "flip":true, s ≈ 320. Use "to" para andar.'),
    L('helicopter', 'Helicóptero', 'Hélice girando; "color"; "flip":true. Resgate, ação.'),
    L('pine', 'Pinheiro', 'y = base; "color" da copa. Floresta.', { floor: 0 }),
    L('rainbow', 'Arco-íris', 'Desenha-se em 1,2 s; y = chão. s ≈ 600.'),
    L('volcano', 'Vulcão', 'Lava e fumaça saindo; "color". y = base.'),
    L('windmill', 'Moinho de vento', 'Hélices girando ("rpm"); y = base. Campo, energia.'),
    L('castle', 'Castelo', 'Torres com bandeira; "color". y = base. Contos, história.'),
    L('lighthouse', 'Farol', 'Facho de luz piscando; "color" das listras. y = base.'),
    L('campfire', 'Fogueira', 'Fogo animado com brilho. y = base. Acampamento, noite.'),
    L('streetlamp', 'Poste de luz', 'Luz acesa com brilho. y = base.'),
    L('fence', 'Cerca', '"color". y = base. Campo, casa.'),
  ];

  const MUSIC = [
    L('calm', 'Calma', 'Pad suave e notas lentas. Padrão. Explicações e curiosidades.'),
    L('happy', 'Alegre', 'Ritmo animado com bateria leve. Humor, boas notícias.'),
    L('tense', 'Tensa', 'Graves, pulso e batida de coração. Suspense, terror, urgência.'),
    L('epic', 'Épica', 'Forte e dramática. Superação, história, ação.'),
    L('mystery', 'Mistério', 'Notas esparsas e vazias. Enigmas, investigação.'),
    L('sad', 'Triste', 'Lenta e melancólica. Perdas, reflexão.'),
    L('chill', 'Lo-fi', 'Batida suave e relaxante. Rotina, bem-estar, tutorial.'),
    L('retro', 'Retrô 8-bit', 'Som de videogame antigo. Games, nostalgia, humor.'),
    L('none', 'Sem música', 'Só voz e efeitos.'),
  ];
  const SCENE_FEATURES = [
    L('title', 'Título animado', 'Na cena: "title":{"t":"TEXTO","anim":"slam|rise|type|pulse","at":0.3,"y":0.25,"size":150,"color":"#ffd93b","end":4}. Palavras de impacto, perguntas, números.'),
    L('lower', 'Terceiro inferior', 'Na cena: "lower":{"t":"Nome","sub":"cargo ou local","at":0.5,"end":4,"color":"#e23b3b"}. Identifica pessoa, lugar ou data (estilo telejornal).'),
    L('spot', 'Holofote', 'Na cena: "spot":{"x":540,"y":900,"r":380,"a":0.8} escurece tudo menos um círculo; "follow":0 segue o personagem 0. Foco dramático.'),
    L('bars', 'Barras de cinema', '"bars":0.08 na cena (ou em style) coloca faixas pretas em cima e embaixo.'),
    L('punch', 'Soco de zoom', 'Na cena: "punch":[{"t":2.1,"z":0.12}] dá um tranco de zoom que relaxa. Marque batidas e revelações.'),
    L('flashes', 'Clarões', 'Na cena: "flashes":[{"t":1.5,"dur":0.25,"color":"#ffffff"}].'),
    L('shakes', 'Tremores', 'Na cena: "shakes":[{"t":2,"dur":0.5,"amp":1.2}] (vários tremores; "shake" só treme no início).'),
    L('scroll', 'Fundo em movimento', 'Na cena: "scroll":150 (px/s) move colinas, nuvens, prédios e faixas da rua. Use com personagem correndo parado no meio (carro/corrida/viagem).'),
    L('hand', 'Câmera na mão', 'Dentro de "cam": "hand":1 faz um balanço leve de câmera na mão (documentário, tensão).'),
    L('tag', 'Etiqueta de nome', 'No personagem: "tag":"Léo","tagColor":"#ffd93b" mostra o nome sob os pés. Ajuda quando há 2 ou mais personagens.'),
    L('holdL', 'Item na mão esquerda', 'No personagem: "holdL":"book" (mesmos itens de hold).'),
    L('cape', 'Capa', 'No personagem: "cape":true ou cor "#hex" (qualquer roupa), ou "outfit":"cape".'),
    L('skin', 'Tom de pele e cabelo', 'No personagem: "skin":"#8d5524" (ex.: #f7e2d0, #e8c39e, #c68b59, #8d5524, #5c3a21), "hairc":"#hex", "hatc":"#hex" (cor do chapéu), "color":"#hex" (cor da roupa), "stripec" (listras), "num" (camisa jersey).'),
    L('post', 'Pós-efeitos de cinema', 'Build 13. Na cena ou em "style": "vignette":0.5 (cantos escuros), "grain":0.3 (grão de filme), "scanlines":0.25 (linhas de monitor), "grade":{"sat":1.2,"contrast":1.1,"bright":1,"hue":0} (cor; Chrome/Edge). Só em "style": "fadeIn":0.6, "fadeOut":0.8 (abre/fecha do preto) e "progress":{"color":"#ff5fa2","h":10,"y":0} (barra de progresso).'),
    L('music', 'Trilha', 'No topo do JSON: "style":{"music":"happy"} ou {"type":"tense","vol":0.8,"bpm":100}. Veja as trilhas disponíveis.'),
  ];
  const PROP_ANIMS = ['pop', 'float', 'spin', 'shake', 'pulse', 'fall', 'none', 'bounce', 'swing', 'wobble', 'grow', 'shrink', 'drift', 'blink', 'jelly', 'orbit', 'slidein', 'riseup', 'flipx', 'beat', 'zoomin'];
  const OUTFITS = ['suit', 'hoodie', 'leather', 'shirt', 'blazer', 'dress', 'lab', 'stripe', 'hawaii', 'vest', 'overalls', 'cape', 'jersey', 'police', 'chef', 'tux', 'jacket'];
  const HAIRS = ['short', 'swept', 'bob', 'grey', 'none', 'long', 'curly', 'ponytail', 'bun', 'spiky', 'mohawk'];
  const HATS = ['cap', 'top', 'crown', 'beanie', 'cowboy', 'hardhat', 'wizard', 'chef', 'party', 'grad', 'headphones', 'pirate', 'santa', 'halo', 'horns'];
  const HOLDS = ['phone', 'book', 'cup', 'box', 'key', 'sign', 'umbrella', 'flag', 'mic', 'flower', 'balloon', 'bag', 'wand', 'torch', 'camera', 'trophy', 'magnifier', 'sword', 'tablet', 'wrench', 'megaphone'];
  const MARKS = ['!', '?', 'idea', 'heart', 'zzz'];
  const SFX = [
    L('whoosh', 'Whoosh', 'Passagem rápida. Parâmetro: len.'),
    L('thud', 'Impacto', 'Grave. Parâmetros: f (Hz), len.'),
    L('ping', 'Ping', 'Nota curta. Parâmetros: f (Hz), len.'),
    L('rumble', 'Ruído grave', 'Tremor longo. Parâmetro: len.'),
    L('slide', 'Slide', 'Tom descendente.'),
    L('pop', 'Pop', 'Estalo curto. Objeto aparecendo.'),
    L('click', 'Clique', 'Clique seco de botão.'),
    L('tick', 'Tique', 'Tique de relógio. Contagem, pressa.'),
    L('coin', 'Moeda', 'Som de moeda (estilo videogame). Ganho, dinheiro.'),
    L('ding', 'Ding', 'Campainha cristalina. Acerto, notificação.'),
    L('bell', 'Sino', 'Sino longo. Parâmetro: f.'),
    L('success', 'Sucesso', 'Três notas subindo. Acertou, conseguiu.'),
    L('tada', 'Tcharam', 'Fanfarra curta. Revelação, conquista.'),
    L('fail', 'Fracasso', 'Trombone triste. Erro cômico.'),
    L('error', 'Erro', 'Buzina de erro. Errado, negado.'),
    L('alarm', 'Alarme', 'Sirene alternando. Parâmetro: len.'),
    L('cash', 'Caixa registradora', 'Ka-ching. Lucro, venda.'),
    L('boing', 'Boing', 'Mola. Comédia, pulo.'),
    L('sparkle', 'Brilho', 'Arpejo agudo. Magia, descoberta.'),
    L('laser', 'Laser', 'Raio descendente. Ficção, tiro.'),
    L('riser', 'Subida de tensão', 'Ruído crescente antes de uma revelação. Parâmetro: len.'),
    L('boom', 'Estrondo', 'Grave profundo. Impacto grande.'),
    L('explosion', 'Explosão', 'Ruído com queda lenta.'),
    L('splash', 'Splash', 'Água.'),
    L('shatter', 'Vidro quebrando', 'Estilhaços agudos.'),
    L('heartbeat', 'Batida de coração', 'Dois toques graves. Medo, suspense.'),
    L('typing', 'Digitação', 'Teclas. Parâmetro: len.'),
    L('camera', 'Foto', 'Clique de câmera.'),
    L('horn', 'Buzina', 'Buzina de carro.'),
    L('drumroll', 'Rufar', 'Rufar de tambor crescente. Parâmetro: len.'),
    L('scratch', 'Disco arranhando', 'Parada brusca, "pera aí".'),
    L('wind', 'Vento', 'Sopro longo. Parâmetro: len.'),
    L('steps', 'Passos', 'Passos repetidos. Parâmetro: len.'),
  ];

  const ids = a => a.map(x => (typeof x === 'string' ? x : x.id));
  const SET = {
    look: new Set(ids(LOOKS)), anim: new Set(ids(ANIMS)), mood: new Set([...ids(MOODS), ...MOOD_ALIASES]),
    scenery: new Set(ids(SCENERY)), fx: new Set(ids(FX)), tr: new Set(ids(TRANSITIONS)), prop: new Set(ids(PROPS)),
    propAnim: new Set(PROP_ANIMS), outfit: new Set(OUTFITS), hair: new Set(HAIRS), hat: new Set(HATS), hold: new Set(HOLDS),
    mark: new Set(MARKS), sfx: new Set(ids(SFX)), music: new Set(ids(MUSIC)),
  };

  // Retorna lista de { level: 'erro' | 'aviso', path, msg }.
  function validateStory(st) {
    const out = [], E = (path, msg) => out.push({ level: 'erro', path, msg }), W = (path, msg) => out.push({ level: 'aviso', path, msg });
    const num = v => typeof v === 'number' && isFinite(v);
    const oneOf = (path, v, set, what) => { if (v !== undefined && !set.has(v)) W(path, `${what}: valor desconhecido "${v}" (será ignorado ou usará o padrão)`); };
    if (!st || typeof st !== 'object' || Array.isArray(st)) { E('', 'A história precisa ser um objeto JSON.'); return out; }
    if (!num(st.total) || st.total <= 0) E('total', '"total" (duração em segundos) deve ser um número maior que 0.');
    if (!Array.isArray(st.scenes) || !st.scenes.length) { E('scenes', '"scenes" deve ser uma lista com pelo menos uma cena.'); return out; }
    if (st.style && st.style.look !== undefined) oneOf('style.look', st.style.look, SET.look, 'Estilo');
    if (st.style && st.style.music !== undefined) oneOf('style.music', typeof st.style.music === 'object' && st.style.music ? st.style.music.type : st.style.music, SET.music, 'Trilha');
    let prevEnd = null;
    st.scenes.forEach((s, i) => {
      const p = `scenes[${i}]`;
      if (!s || typeof s !== 'object') { E(p, 'Cena inválida.'); return; }
      if (!num(s.t0) || !num(s.t1)) E(p, '"t0" e "t1" devem ser números (segundos).');
      else {
        if (s.t1 <= s.t0) E(p, `"t1" (${s.t1}) precisa ser maior que "t0" (${s.t0}).`);
        if (prevEnd !== null && Math.abs(s.t0 - prevEnd) > 0.05) W(p, `Começa em ${s.t0}s mas a cena anterior termina em ${prevEnd}s (buraco ou sobreposição).`);
        prevEnd = s.t1;
      }
      if (s.scenery !== undefined) oneOf(`${p}.scenery`, s.scenery, SET.scenery, 'Cenário');
      if (s.look !== undefined) oneOf(`${p}.look`, s.look, SET.look, 'Estilo');
      if (s.tr !== undefined) oneOf(`${p}.tr`, s.tr, SET.tr, 'Transição');
      if (s.scenery !== 'room' && !Array.isArray(s.bg) && !(SCENERY.find(x => x.id === s.scenery) || {}).bg) W(p, 'Sem "bg" ([topo, base]); o fundo pode ficar indefinido.');
      (s.fx || []).forEach(f => oneOf(`${p}.fx`, f, SET.fx, 'Efeito'));
      if (s.caption !== undefined && typeof s.caption !== 'string') E(`${p}.caption`, '"caption" deve ser texto.');
      if (typeof s.caption === 'string' && num(s.t0) && num(s.t1) && s.t1 > s.t0) { const wps = s.caption.trim().split(/\s+/).filter(Boolean).length / (s.t1 - s.t0); if (wps > 3.4) W(`${p}.caption`, `Fala rápida demais para a cena (${wps.toFixed(1)} palavras/s; o ideal é até 3). Alongue a cena ou divida a frase.`); }
      if (s.title && typeof s.title === 'object' && !s.title.t) W(`${p}.title`, 'Título sem texto ("t").');
      if (s.cam && s.cam.keys) s.cam.keys.forEach((k, j) => { if (!num(k.t)) E(`${p}.cam.keys[${j}]`, 'Cada ponto de câmera precisa de "t" numérico.'); });
      (s.actors || []).forEach((a, j) => {
        const q = `${p}.actors[${j}]`;
        if (!num(a.x) || !num(a.y)) E(q, '"x" e "y" (posição dos pés) devem ser números.');
        else if ((a.x < -150 || a.x > 1230) && !a.to) W(q, `Personagem fora da tela (x=${a.x}); só use isso para entrar/sair andando.`);
        oneOf(`${q}.anim`, a.anim, SET.anim, 'Animação');
        oneOf(`${q}.mood`, a.mood, SET.mood, 'Humor');
        oneOf(`${q}.outfit`, a.outfit, SET.outfit, 'Roupa');
        oneOf(`${q}.hair`, a.hair, SET.hair, 'Cabelo');
        oneOf(`${q}.hat`, a.hat, SET.hat, 'Chapéu');
        oneOf(`${q}.hold`, a.hold, SET.hold, 'Item');
        (a.seq || []).forEach((k, n) => { if (!num(k.t)) E(`${q}.seq[${n}]`, 'Cada passo de "seq" precisa de "t".'); oneOf(`${q}.seq[${n}].anim`, k.anim, SET.anim, 'Animação'); oneOf(`${q}.seq[${n}].mood`, k.mood, SET.mood, 'Humor'); });
        (a.bubbles || []).forEach((b, n) => { if (b.mark !== undefined) oneOf(`${q}.bubbles[${n}].mark`, b.mark, SET.mark, 'Marca'); if (b.say && String(b.say).split(/\s+/).length > 5) W(`${q}.bubbles[${n}]`, 'Balão com mais de 5 palavras fica apertado.'); });
      });
      (s.props || []).forEach((pr, j) => {
        const q = `${p}.props[${j}]`;
        if (!pr.type) E(q, 'Objeto sem "type".'); else oneOf(`${q}.type`, pr.type, SET.prop, 'Objeto');
        if (!num(pr.x) || !num(pr.y)) E(q, '"x" e "y" devem ser números.');
        else if ((pr.type === 'sign' || pr.type === 'text') && pr.y > 1250 && pr.y < 1450) W(q, 'Placa/rótulo na faixa y 1250–1450, onde fica a legenda do vídeo.');
        if (pr.type === 'icon' && !String(pr.q || pr.id || '').trim()) E(q, 'O objeto "icon" precisa de "q" (palavra em inglês) ou "id".');
        if (pr.type === 'emoji') W(q, 'Evite o objeto "emoji": use os objetos desenhados do catálogo.');
        oneOf(`${q}.anim`, pr.anim, SET.propAnim, 'Animação de objeto');
      });
    });
    if (num(st.total) && prevEnd !== null && Math.abs(prevEnd - st.total) > 0.5) W('total', `"total" é ${st.total}s mas a última cena termina em ${prevEnd}s.`);
    (st.sfx || []).forEach((x, i) => {
      if (!SET.sfx.has(x.type)) W(`sfx[${i}]`, `Som desconhecido: "${x.type}".`);
      if (!num(x.t)) E(`sfx[${i}]`, 'Cada som precisa de "t" numérico.'); else if (num(st.total) && x.t > st.total) W(`sfx[${i}]`, `Toca em ${x.t}s, depois do fim do vídeo.`);
    });
    return out;
  }

  function summarize(st) {
    const sc = Array.isArray(st && st.scenes) ? st.scenes : [];
    return {
      total: st && typeof st.total === 'number' ? st.total : 0,
      scenes: sc.length,
      look: (st && st.style && st.style.look) || 'cartoon',
      actors: sc.reduce((n, s) => n + (s.actors || []).length, 0),
      props: sc.reduce((n, s) => n + (s.props || []).length, 0),
    };
  }

  const SCHEMA = { LOOKS, ANIMS, MOODS, MOOD_ALIASES, SCENERY, FX, TRANSITIONS, PROPS, PROP_ANIMS, OUTFITS, HAIRS, HATS, HOLDS, MARKS, SFX, MUSIC, SCENE_FEATURES, SET, validateStory, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = SCHEMA; else root.SCHEMA = SCHEMA;
})(typeof window !== 'undefined' ? window : globalThis);
