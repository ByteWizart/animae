# Bloco extra para o SEU prompt (cole logo depois da seção "=== CAMPOS ===")

=== MOVIMENTOS AVANÇADOS (use sempre que fizer sentido) ===
- O personagem pode MUDAR de animação e humor durante a cena com "seq" (tempos relativos ao início da cena, em ordem):
  "actors":[{"x":420,"y":1480,"h":440,"anim":"idle","mood":"smile","talk":[0.3,5.5],
    "seq":[{"t":1.5,"anim":"point"},{"t":3,"anim":"think","mood":"worry"},{"t":4.5,"anim":"shock","look":0.8}]}]
  A troca é suave (0,3 s). "look" vai de -1 (esquerda) a 1 (direita) e muda para onde os olhos olham.
- Animações disponíveis: idle, walk, run, wave, point, jump, shock, nervous, cheer, think (mão no queixo), laugh (rindo), facepalm (mão na testa), dance, crouch (agachado). Combine com o sentido da frase: dúvida = think, erro = facepalm, descoberta = jump/cheer, medo = nervous, susto = shock.
- Quando o personagem tem "to" (deslocamento), ele ANDA sozinho. Não precisa colocar anim "walk". Para percurso com várias paradas, "to" aceita lista:
  "to":[{"x":300,"dur":1.5,"move":0.3},{"x":700,"y":1300,"dur":2,"move":2}]
  (move = quando começa, dur = quanto dura; y menor = mais longe e menor em cenas room).
- Durante "talk", se o personagem está em idle, ele gesticula com os braços sozinho. Então prefira idle + talk nas falas longas e use seq para pontuar com ações.
- Câmera com vários pontos (em vez de z0/z1): "cam":{"keys":[{"t":0,"z":1,"x":540,"y":960,"r":0},{"t":2,"z":1.3,"x":420,"y":1050,"r":-1.5},{"t":5,"z":1.1,"x":540,"y":960,"r":0}]}
  Sempre preencha z, x, y e r em cada ponto. Use aproximação (z maior) nos momentos de tensão e afastamento no final.
- Ritmo: a cada 2 a 3 segundos de uma cena, algo deve mudar (nova animação, humor, olhar, ponto de câmera ou objeto entrando com "at").
- Humores: smile, grin, laugh, shock, worry, angry, deadpan (happy = smile, sad = worry).

=== EXTRAS DE EXPRESSÃO E AMBIENTE (cole junto) ===
- Balões e marcas sobre a cabeça: "bubbles":[{"t":1,"end":3,"say":"Calma..."},{"t":3.2,"end":5,"mark":"?"}] no personagem. say = balão de fala curto (até 4 palavras); mark = "!" (alerta), "?" (dúvida), "idea" (lâmpada), "heart" (coração), "zzz" (sono). Use para reforçar emoção sem poluir.
- Item na mão: "hold":"phone|book|cup|box|key|sign" (para sign, "holdT":"TEXTO"). Escolha só se combina com a frase.
- Sumir: "end":segundos (relativo à cena) em personagem ou objeto faz ele desaparecer suave.
- Clima e atmosfera na cena: "fx":["rain"|"snow"|"fog"|"sparks"|"confetti"|"lines"] (pode combinar), "tint":"#3040ff22" (cor com transparência sobre a cena: azul = frio/noite, vermelho = perigo, âmbar = nostalgia).
- Transições novas: "tr":"wipe" (cortina da esquerda para a direita) e "iris" (círculo abrindo), além de fade e flash.
- Câmera seguindo o personagem: "cam":{"follow":0,"z0":1.2,"z1":1.4,"fy":380} (0 = primeiro personagem da cena).
- Objetos novos: "arrow" (seta, use "rot" em radianos), "ring" (círculo vazado para destacar algo), "text" (rótulo flutuante, "t":"TEXTO", 1 a 2 palavras), "bar" (barra de progresso que enche, "v" de 0 a 1 e "dur"). Qualquer objeto aceita "alpha" de 0 a 1.
- Estilo da legenda no vídeo todo: "style":{"caption":{"size":120,"color":"#ffffff","alt":"#ffd93b","y":0.69,"stroke":"#000000","upper":false}} no topo do JSON ("alt" alterna a cor a cada palavra). Para mudar só numa cena: "cs":{"y":0.2,"size":100}.
- Dica de direção: a cada ideia nova da narração, um elemento visual novo (marca, objeto, mudança de câmera ou de animação). Cenas de tensão: tint escuro + fx "rain"/"fog" + câmera aproximando. Cenas de alívio: cores claras, "sparks"/"confetti", câmera abrindo.
- Objetos de cenário prontos (2D): "car" (carro, use "color" e "flip":true para virar; "x","y" = centro, "s" ~300) e "tree" (árvore, y = base). Em personagem dentro de carro use "still":true para ele não balançar as pernas quando o carro se move.

=== ESTILOS VISUAIS (escolha UM por vídeo, conforme o tema) ===
No topo do JSON: "style":{"look":"sketch","caption":{...}}. Para mudar só numa cena (ex.: lembrança, sonho, flashback): "look":"noir" dentro da cena.
Estilos disponíveis em "look":
- "cartoon": padrão, colorido e limpo (humor, curiosidade leve).
- "sketch": desenho a lápis em papel antigo, com traço tremendo (histórias, explicações, ar de caderno).
- "comic": quadrinhos com pontinhos de impressão (ação, super-heróis, humor).
- "noir": preto e branco com muito contraste e grão (mistério, crime, suspense, terror).
- "neon": escuro com brilho e linhas de monitor (tecnologia, ficção científica, noite).
- "retro": fita VHS dos anos 80, tom quente com listras e ruído (nostalgia, curiosidades antigas).
- "pixel": pixel art de videogame antigo (games, humor, internet).
- "blueprint": planta azul com grade, traço branco (engenharia, como as coisas funcionam, projetos).
- "pastel": cores suaves e claras (histórias calmas, infantil, bem-estar).
- "vintage": filme antigo sépia com grão (história, biografias, fatos do passado).
Combine o estilo com o clima da narração; use "tint" e "fx" só com moderação nos estilos escuros para não escurecer demais.


=== RECURSOS NOVOS (build 9) ===
Dica: o botão "Copiar prompt para outra IA" no gerador já entrega o prompt completo e atualizado. Abaixo, o resumo para colar no seu.
- Novas animações: clap, shrug, bow, flex, sneak, sleep, faint, cry, punch, kick, salute, sit, lookaround, type, call, cower, spin, slump, float, rage.
- Novos humores: smirk, love, dizzy, sleepy, scared, cry, silly.
- Aparência: hat beanie|cowboy|hardhat|wizard|chef|party|grad|headphones|pirate|santa|halo|horns; hair long|curly|ponytail|bun|spiky|mohawk; outfit dress|lab|stripe|hawaii|vest|overalls|cape|jersey|police|chef|tux|jacket; skin:"#hex"; tag:"Nome"; holdL; hold umbrella|flag|mic|flower|balloon|bag|wand|torch|camera|trophy|magnifier|sword|tablet|wrench|megaphone.
- Cenários: desert, beach, forest, mountains, snowfield, street, underwater, stage, cyber, paper, chalkboard, cave, lunar, sunset. "scroll":150 na cena faz o fundo andar.
- Efeitos fx: stars, bubbles, leaves, petals, fireflies, hearts, embers, lightning, glitch, dust, godrays, matrix, coins, shockwave, birds. Transições tr: slide, slideup, blinds, zoom, spin, glitch, whiteout, pixel, shutter, push, pushup.
- Objetos com dados: chart {"kind":"bar|line|pie|donut","data":[..],"labels":[..],"t":"título","vals":true}, counter {"from":0,"to":1000,"pre":"R$ "}, checklist {"items":[..]}, chat {"msgs":[{"w":0,"t":".."}]}, gauge/thermo/donut {"v":0.7}, stamp, headline, callout {"t","tx","ty"}, notification, clock, calendar.
- Cena: "title":{"t":"TEXTO","anim":"slam"} | "lower":{"t":"Nome","sub":"cargo"} | "spot":{"x","y","r"} | "bars":0.08 | "punch":[{"t":2,"z":0.12}] | "flashes":[{"t":2}] | "shakes":[{"t":2,"dur":0.4}] | cam:{"hand":1}.
- Trilha: "style":{"music":"happy"} (calm, happy, tense, epic, mystery, sad, chill, retro, none). Sons novos: pop, click, tick, coin, ding, bell, success, tada, fail, error, alarm, cash, boing, sparkle, laser, riser, boom, explosion, splash, shatter, heartbeat, typing, camera, horn, drumroll, scratch, wind, steps.
