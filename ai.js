// Integração com IAs gratuitas (Gemini, Groq, OpenRouter, Cloudflare, NVIDIA, Mistral, Cohere, Z.ai...; todas compatíveis com a API da OpenAI): ideia -> roteiro + direção + JSON de história.
// Roda só no servidor, para a chave nunca chegar ao navegador. Requer Node 18+ (fetch embutido). build 9
// Recebe `llm = { chain: [provedores] }`: tenta o primeiro e, se ele falhar (limite, chave, queda), passa para o próximo.
const SCHEMA = require('./schema.js');

/* ------------------------------------------------------------------ opções de criação ------------------------------------------------------------------ */
const FORMATS = {
  auto: { label: 'A IA escolhe', guide: '' },
  curiosidade: { label: 'Curiosidade', guide: 'Estrutura: gancho com pergunta ou fato absurdo → 2 a 3 pontos curtos, cada um com um objeto ou gráfico novo → virada ("mas o mais curioso é...") → fecho memorável. Use title/burst nas palavras de impacto e chart/counter quando houver número.' },
  historia: { label: 'História', guide: 'Estrutura: situação normal → problema → escalada → clímax → desfecho curto e surpreendente. Um protagonista fixo, mudanças de cenário a cada cena e expressões fortes (mood e seq).' },
  tutorial: { label: 'Tutorial / passo a passo', guide: 'Estrutura: promessa do resultado → 3 a 5 passos numerados (title "1", "2"... ou checklist) → resultado final. Um objeto novo por passo; cenário paper, chalkboard ou blueprint combina bem.' },
  noticia: { label: 'Notícia', guide: 'Estilo telejornal: headline (tag URGENTE) na abertura, lower com nome/local, dados em chart ou counter, contexto em 2 cenas e "o que muda para você" no fim. Tom claro e neutro; marque no campo aviso_fatos tudo que precisa ser conferido.' },
  lista: { label: 'Lista / Top N', guide: 'Estrutura: abertura prometendo a lista → N itens (3 a 5) em ordem crescente de impacto, cada um com title numerado, um objeto ilustrativo e uma frase → fecho com o melhor item ou pergunta aos espectadores.' },
  mito: { label: 'Mito ou verdade', guide: 'Estrutura: afirma o mito (stamp "MITO?") → suspense (tick, drumroll, riser) → revelação com stamp "FALSO" ou "VERDADE" e sfx tada/error → explicação em 2 cenas → fecho. Use check e cross.' },
  quiz: { label: 'Quiz', guide: 'Estrutura: pergunta com title → 3 alternativas A, B, C em callouts ou checklist → suspense (tick/drumroll) → resposta com check/cross, sfx success/error → explicação curta → chamada para comentar.' },
  humor: { label: 'Humor', guide: 'Estrutura: situação cotidiana → exagero crescente (regra de três) → punchline no último segundo. Expressões exageradas, shakes, burst, sfx boing/fail/pop, pausas antes da piada. Diálogo com 2 personagens funciona muito bem.' },
  motivacional: { label: 'Motivacional', guide: 'Estrutura: frase de impacto → imagem simbólica (mountain, sun, trophy, rocket) → crescendo emocional → chamada à ação. Cenários sunset, mountains, forest; música epic; câmera abrindo no final.' },
  terror: { label: 'Terror / suspense', guide: 'Estrutura: calma estranha → detalhe errado → tensão crescente (cam aproximando, tint escuro, fx fog/lightning, sfx heartbeat/rumble) → susto → final ambíguo. Estilo noir; música tense; poucas cores.' },
  explicacao: { label: 'Como funciona', guide: 'Estrutura: pergunta → analogia simples do dia a dia → mecanismo em 3 passos visuais (arrow, ring, gear, callout) → exemplo → resumo em uma frase. Cenários paper, chalkboard ou blueprint.' },
  dialogo: { label: 'Diálogo entre 2 personagens', guide: 'Dois personagens fixos com tag (nome) e visuais bem diferentes, conversando com bubbles "say" (até 4 palavras) alternados em tempos diferentes; o narrador resume. Gestos (seq) a cada fala; câmera alternando o foco.' },
  comparacao: { label: 'Comparação A vs B', guide: 'Estrutura: apresenta A e B com versus → 3 critérios (chart, counter, checklist ou check/cross) → veredito com stamp e trophy. Cores diferentes para cada lado, mantidas em todas as cenas.' },
};
const TONES = {
  auto: { label: 'A IA escolhe', guide: '', music: '' },
  humor: { label: 'Bem-humorado', guide: 'Leve, irônico, com exageros e pausas para a piada.', music: 'happy' },
  serio: { label: 'Sério e informativo', guide: 'Claro, direto, confiável; sem gírias; frases curtas.', music: 'calm' },
  epico: { label: 'Épico', guide: 'Grandioso, frases de impacto, crescendo.', music: 'epic' },
  calmo: { label: 'Calmo e relaxante', guide: 'Suave, ritmo lento, vocabulário simples.', music: 'chill' },
  sombrio: { label: 'Sombrio', guide: 'Grave, sugestivo, silêncios, detalhes inquietantes.', music: 'tense' },
  motivacional: { label: 'Motivacional', guide: 'Inspirador, na segunda pessoa, com chamada à ação.', music: 'epic' },
  infantil: { label: 'Infantil', guide: 'Palavras simples, cores vivas, personagens simpáticos, nada assustador.', music: 'happy' },
  sarcastico: { label: 'Sarcástico', guide: 'Seco, com ironia e comentários maliciosos.', music: 'chill' },
};
const LANGS = { 'pt-BR': 'português do Brasil', en: 'inglês', es: 'espanhol', fr: 'francês', de: 'alemão', it: 'italiano' };
const LOOK_MUSIC = { noir: 'mystery', neon: 'retro', retro: 'retro', pixel: 'retro', blueprint: 'chill', pastel: 'calm', vintage: 'sad', comic: 'happy', sketch: 'calm', cartoon: 'calm' };

/* ------------------------------------------------------------------ prompt ------------------------------------------------------------------ */
// Estimativa grosseira de tokens (português + JSON ~ 3 caracteres por token).
const estTok = t => Math.ceil(String(t).length / 3);
const msgTok = m => m.reduce((n, x) => n + estTok(x.content) + 8, 0);
// Escolhe o nível de compactação do prompt e o teto de saída para caber no limite de tokens por minuto (TPM) do provedor.
function budget({ build, user, maxTokens, tpm, minOut }) {
  tpm = tpm || 8000; minOut = minOut || 3800;
  let res = null;
  for (let level = 0; level <= 2; level++) {
    const sys = build(level), inTok = estTok(sys) + estTok(user) + 40, out = Math.min(maxTokens || 12000, tpm - inTok - 250);
    res = { sys, level, inTok, out };
    if (out >= minOut) break;
  }
  return res;
}
const idsOf = a => a.map(x => (typeof x === 'string' ? x : x.id)).join(' | ');

const FULL_DATA = `Móveis e prédios usam y = chão. Objetos pequenos têm x,y no centro. Props com dados:
  chart {"kind":"bar|line|pie|donut","data":[30,55,40],"labels":["A","B","C"],"t":"título","vals":true,"s":600}
  counter {"from":0,"to":1250000,"pre":"R$ ","suf":"","dec":0,"dur":1.6,"s":150}
  checklist {"items":["a","b",{"t":"c","ok":false}],"gap":0.7,"s":600}   chat {"msgs":[{"w":0,"t":"oi"},{"w":1,"t":"olá"}],"gap":1,"name":"Mãe","s":560}
  callout {"t":"até 8 palavras","tx":x_alvo,"ty":y_alvo,"s":260}   stamp {"t":"FALSO","color":"#e23b3b","s":360}   headline {"tag":"URGENTE","t":"manchete curta","s":500}
  gauge/thermo/donut/battery {"v":0 a 1}   clock {"h","m"} ou {"spin":true}   calendar {"t":"21","m":"NOV"}   burst/versus {"t":"POW!"}   notification {"t","b","icon"}   lock {"open":true}
  "sign" e "text": no máximo 2 palavras curtas (sign s≥300; text s≤300). NUNCA use "emoji". Monumentos e obras: pisa (Torre de Pisa; lean/lean2/leanAt/leanDur), eiffel, pyramid, crane. icon {"q":"locomotive"} (biblioteca online de milhares de objetos coloridos: q = 1–2 palavras em INGLÊS; use só quando nenhum objeto do catálogo servir; no máximo 3 por cena; s 220–320).`;
const SHORT_DATA = `Móveis e prédios: y = chão. Dados: chart{kind:bar|line|pie|donut,data:[n],labels:[],t,vals} counter{from,to,pre,suf} checklist{items:[]} chat{msgs:[{w:0|1,t}]} callout{t,tx,ty} stamp{t} headline{tag,t} gauge/thermo/donut{v 0-1} clock calendar burst{t}. sign/text: até 2 palavras. Nunca "emoji". icon{q:"palavra em inglês"} só se o catálogo não tiver o objeto.`;
function catalogText(level) {
  const S = SCHEMA;
  const nonEmoji = S.PROPS.filter(p => p.id !== 'emoji');
  return `CATÁLOGO (use SOMENTE estes valores; qualquer outro é ignorado)
- scenery: ${idsOf(S.SCENERY)}. "room" aceita wall, floor (cores), tex (brick|plank|tile|stripes|dots) e dispensa bg. Os demais externos aceitam bg:["#topo","#base"] e ground (cor do chão), mas têm cores próprias se você omitir.
- tr (transição de entrada da cena): ${idsOf(S.TRANSITIONS)}
- fx (lista): ${idsOf(S.FX)}. tint: "#rrggbbaa". Efeitos escuros ou agressivos (glitch, lightning, fog, rain) pedem moderação.
- look (estilo): ${idsOf(S.LOOKS)}. Pode usar "look" numa cena só, para flashback ou sonho.
- actors[]: {"x","y"(pés),"h"(altura),"outfit":${idsOf(S.OUTFITS)},"hair":${idsOf(S.HAIRS)},"hat":${idsOf(S.HATS)},"glasses":true,"skin":"#hex","hairc":"#hex","hatc":"#hex","color":"#hex"(roupa),"cape":true,"tag":"nome","anim":${idsOf(S.ANIMS)},"mood":${idsOf(S.MOODS)},"talk":[ini,fim],"seq":[{"t","anim","mood","look"(-1 a 1)}],"to":{"x","y","dur","move"} ou lista,"bubbles":[{"t","end","say":"até 4 palavras"} ou {"t","end","mark":${S.MARKS.join('|')}}],"hold":${idsOf(S.HOLDS)},"holdL":(mesmos itens),"holdT":"texto da placa","flip":true,"at","end","still":true}
  Valores típicos: y 1350–1560, h 420–560, x 150–930. Quem tem "to" anda sozinho (não use walk). Para sentar: anim sit com o mesmo y de chair/sofa/bed. skin sugeridos: #f7e2d0 #e8c39e #c68b59 #8d5524 #5c3a21.
- props[]: {"type":${idsOf(nonEmoji)},"x","y","s"(tamanho),"color","t","at","anim":${S.PROP_ANIMS.join('|')},"alpha","front","rot","flip","to"}.
  ${level >= 2 ? SHORT_DATA : FULL_DATA}
- cena: "title":{"t","anim":slam|rise|type|pulse,"at","y":0.25,"size":150,"color","end"} | "lower":{"t","sub","at","end"} | "spot":{"x","y","r","a","follow":índice} | "bars":0.08 | "punch":[{"t","z":0.12}] | "flashes":[{"t","dur","color"}] | "shakes":[{"t","dur","amp"}] | "scroll":px/s (fundo andando, para viagem/corrida) | cam.hand:1 (câmera na mão).
- cam: {"z0":1,"z1":1.2,"x0":540,"x1":600,"y0":960,"y1":1050,"r0":0,"r1":0} (zoom 1–1.6, x 400–680, y 900–1150) ou {"keys":[{"t","z","x","y","r"},...]} (preencha os 4 campos em cada ponto) ou {"follow":índice_do_ator,"z0","z1","fy":380}.
- sfx (lista no topo): [{"t","type":${idsOf(S.SFX)},"f"(Hz p/ thud/ping/bell),"len","amp"}]
- style.music: ${idsOf(S.MUSIC)}.`;
}

function systemPrompt(opts) {
  opts = opts || {};
  const S = SCHEMA, target = opts.seconds || 30, nScenes = Math.max(4, Math.round(target / 5.5));
  const fmt = FORMATS[opts.format] || FORMATS.auto, tone = TONES[opts.tone] || TONES.auto;
  const lang = LANGS[opts.lang] || LANGS['pt-BR'];
  const edit = opts.mode === 'edit', level = opts.level || 0;
  const lookRule = opts.look ? `ESTILO: use obrigatoriamente "style":{"look":"${opts.look}"}.` : `ESTILO: escolha UM em "style":{"look":...} conforme o tema: ${S.LOOKS.map(l => l.id + ' (' + l.desc.split('.')[0] + ')').join('; ')}.`;
  const musicRule = opts.music && S.SET.music.has(opts.music) ? `Trilha: use obrigatoriamente "music":"${opts.music}" em style.` : `Trilha: escolha em style.music conforme o clima${tone.music ? ' (sugestão: ' + tone.music + ')' : ''}: calm, happy, tense, epic, mystery, sad, chill, retro, none.`;
  const cast = opts.cast ? `Elenco: use exatamente ${opts.cast} personagem(ns) recorrente(s)${opts.cast > 1 ? ', cada um com tag (nome) e visual bem diferente' : ''}.` : 'Elenco: 1 a 3 personagens recorrentes; com 2 ou mais, use tag (nome) em cada um.';

  const head = edit
    ? `Você é diretor e roteirista de shorts verticais animados (9:16, 1080x1920). Recebe a HISTÓRIA ATUAL (roteiro + JSON "story") e uma INSTRUÇÃO DE EDIÇÃO. Devolva a história COMPLETA já atualizada. Mude só o que a instrução pede (e o que for consequência direta); preserve elenco, paleta, cenas e textos que não precisam mudar. Se o roteiro mudar, refaça as captions para que juntas formem o roteiro novo. Responda SOMENTE com JSON válido, sem markdown.

SAÍDA: {"titulo":"título curto","roteiro":"narração completa em texto corrido","story":{...},"resumo_mudancas":"o que mudou, em 1 ou 2 frases"}`
    : `Você é diretor e roteirista de shorts animados verticais (9:16, 1080x1920) para YouTube Shorts, Reels e TikTok. Transforma a ideia do usuário em UM objeto JSON com plano de direção, roteiro falado, a história animada ("story") que o nosso gerador desenha e um pacote de publicação. Responda SOMENTE com JSON válido (sem markdown, sem comentários, sem vírgula sobrando).

SAÍDA: exatamente estas chaves, NESTA ORDEM (primeiro planeje, depois escreva):
{"plano":{"conceito":"1 frase","gancho":"o que acontece nos 3 primeiros segundos","elenco":[{"id":0,"nome":"...","visual":"roupa, cabelo, chapéu, pele"}],"paleta":["#hex","#hex","#hex"],"motivo":"objeto ou ideia visual que se repete no vídeo","batidas":["cena 1: ...","cena 2: ..."]},
"titulo":"até 60 caracteres","roteiro":"narração completa em texto corrido","story":{...},
"publicacao":{"titulos":["3 títulos alternativos com gancho"],"descricao":"1 ou 2 frases","hashtags":["#a","#b","#c","#d","#e"],"direcao_voz":"como narrar: tom, ritmo, onde pausar e enfatizar","miniatura":"2 ou 3 palavras para a capa","aviso_fatos":"afirmações que o usuário deve conferir antes de postar, ou vazio"}}`;

  const roteiro = `ROTEIRO
- Idioma: ${lang}${opts.lang ? '' : ' (ou o mesmo idioma da ideia, se for outro)'}. Texto de narrador, natural, frases curtas, pensado para ser falado em voz alta. Não use emojis, indicações de palco nem aspas desnecessárias.
- Duração alvo: ${target} s (cerca de ${Math.round(target * 2.5)} palavras, 2,5 palavras por segundo). Cada cena deve ter no máximo 3 palavras por segundo.
- Primeiros 3 s: gancho (pergunta, contradição, número chocante ou promessa). Último trecho: fecho forte (surpresa, piada, frase memorável) ou chamada para comentar. Cada cena entrega UMA ideia nova.
- Não invente estatísticas, datas, nomes ou estudos. Se não tiver certeza de um dado, use formulação aproximada e liste em aviso_fatos.${tone.guide ? '\n- Tom: ' + tone.guide : ''}${fmt.guide ? '\n- Formato "' + fmt.label + '": ' + fmt.guide : ''}`;

  const story = `STORY (gerador 2D com personagens-palito expressivos; tempos em segundos; posições em px numa tela 1080x1920)
- Use cerca de ${nScenes} cenas de 3,5 a 7 s. "total" = soma. t0 de cada cena = t1 da anterior; a primeira começa em 0.
- Cada cena tem "caption" = trecho EXATO do roteiro falado nela; juntas formam o roteiro inteiro, na ordem.
- Campos de cena: t0, t1, scenery, bg, ground, wall, floor, tex, tr, fx, tint, shake, look, caption, cam, props[], actors[] e os recursos de cena do catálogo.
- Em todas as cenas: todos os tempos "at","t","end","move","dur" são relativos ao início da cena e menores que a duração dela. Mantenha tudo dentro da tela. A região y 1250–1450 fica livre de sign/text: a legenda do vídeo fica ali.
- ${cast} Mantenha o MESMO visual de cada personagem em todas as cenas (outfit, hair, hat, skin, color). Continuidade: se ele sai andando da direita, entra na cena seguinte pela esquerda ou no mesmo ponto.
- ${lookRule} Não inclua "style.caption" (o site já aplica o padrão). ${musicRule}`;

  const DIR_MIN = `DIREÇÃO\n- Algo muda a cada 2–3 s (seq, câmera, objeto entrando com "at", punch). Toda cena tem cam (alterne z 1.0/1.15/1.3). A cena 1 prende em 1 s (title slam, objeto grande ou ação forte).\n- Números → chart ou counter; pessoa/lugar → lower; lista → checklist; comparação → versus. Emoção → anim/mood/fx/sfx coerentes (medo: cower+scared+fog+heartbeat; alegria: cheer+confetti+success).\n- sfx em trocas de cena e impactos; música coerente.\nCHECAGEM: captions somam o roteiro; só valores do catálogo; sem "emoji"; sign/text até 2 palavras; legenda livre em y 1250–1450; tempos dentro da cena; JSON válido.`;
  const direcao = `DIREÇÃO (o que separa um short bom de um fraco)
- Ritmo: a cada 2–3 s algo muda (animação via seq, humor, olhar, ponto de câmera, objeto entrando com "at", punch de zoom). Cada ideia nova da narração ganha um elemento visual novo; nunca deixe uma cena parada.
- Câmera: toda cena tem cam. Alterne abertura (z 1.0), plano médio (1.15) e close (1.3–1.5). Aproxime em tensão, afaste no final, use punch nas viradas e hand:1 em suspense.
- Cena 1: precisa prender em 1 s: title (slam) com 1–3 palavras, ou objeto grande entrando, ou personagem em ação forte. Alterne transições e cenários (mas dentro da paleta); varie fx e tint com moderação.
- Emoção → recursos: medo = cower/nervous + mood scared + tint azul/escuro + fx fog + sfx heartbeat; alegria = cheer/dance/jump + confetti/hearts + sfx success; dúvida = think/shrug + mark ? + lookaround; descoberta = jump + bulb + sparkle; erro/vergonha = facepalm/slump + cross + sfx fail; raiva = rage/punch + burst + shakes; sono = sleep; amor = mood love + hearts.
- Dados: sempre que houver número, mostre em chart ou counter (e title para o número principal). Pessoa, lugar ou data: lower. Comparação: versus. Lista: checklist. Conversa por mensagem: chat. Resposta certa/errada: check/cross/stamp.
- Som: sfx em toda troca de cena (whoosh/pop/click), nos impactos (thud/boom), nas descobertas (ping/sparkle/ding) e nas revelações (riser antes, tada depois). Música coerente com o clima.
- Ilustre ideias com os objetos prontos do catálogo; não existe imagem externa.

CHECAGEM FINAL (mentalmente, antes de responder): captions somam o roteiro; nenhum valor fora do catálogo; sem props "emoji"; sign/text com até 2 palavras; legenda livre em y 1250–1450; tempos dentro da duração de cada cena; todo ator com x,y; JSON válido.`;

  const rec = [`EXEMPLO DE CENA (formato; crie as suas):
{"t0":0,"t1":5,"scenery":"room","wall":"#e8a05a","floor":"#7a4a2a","tex":"plank","tr":"fade","cam":{"z0":1,"z1":1.2,"x0":540,"x1":640,"y0":1000,"y1":1060,"hand":1},"caption":"Você levanta do sofá e esquece o que ia buscar.","title":{"t":"ESQUECEU?","anim":"slam","at":0.4,"y":0.22},"punch":[{"t":3.8,"z":0.1}],"props":[{"type":"window","x":800,"y":480,"s":380},{"type":"lamp","x":110,"y":1280,"s":300},{"type":"sofa","x":300,"y":1400,"s":380}],"actors":[{"x":260,"y":1480,"h":520,"outfit":"hoodie","hair":"short","glasses":true,"tag":"Léo","anim":"idle","mood":"smile","to":[{"x":820,"dur":3,"move":0.6}],"seq":[{"t":3.8,"anim":"think","mood":"worry"}],"bubbles":[{"t":3.8,"end":5,"mark":"?"}]}]}`];
  if (!opts.format || opts.format === 'auto' || /noticia|lista|comparacao|explicacao|curiosidade|quiz|mito/.test(opts.format))
    rec.push(`EXEMPLO DE CENA COM DADOS:
{"t0":5,"t1":10.5,"scenery":"paper","tr":"wipe","cam":{"z0":1.05,"z1":1.15},"caption":"Em cinco anos, o número quase dobrou.","props":[{"type":"chart","kind":"bar","x":540,"y":760,"s":640,"t":"Casos por ano","data":[12,18,25,40,60],"labels":["2020","21","22","23","24"],"vals":true,"at":0.3},{"type":"stamp","t":"ALERTA","x":820,"y":330,"s":300,"at":2.6}],"actors":[{"x":200,"y":1500,"h":460,"outfit":"lab","hair":"bun","skin":"#8d5524","anim":"point","mood":"worry","talk":[0.3,5]}],"lower":{"t":"Dra. Marina","sub":"Epidemiologista","at":0.8,"end":4.5},"flashes":[{"t":2.6,"dur":0.2}]}`);
  if (/humor|dialogo/.test(opts.format || ''))
    rec.push(`EXEMPLO DE DIÁLOGO:
{"t0":10.5,"t1":15,"scenery":"room","wall":"#4a7bd0","floor":"#d9c58a","tex":"stripes","tr":"slide","caption":"Ele jurou que dessa vez ia dar certo.","props":[{"type":"sofa","x":540,"y":1440,"s":420}],"actors":[{"x":330,"y":1480,"h":480,"outfit":"hoodie","hair":"spiky","tag":"Léo","anim":"idle","bubbles":[{"t":0.6,"end":2.2,"say":"Agora vai!"}],"seq":[{"t":2.4,"anim":"cheer","mood":"grin"}]},{"x":760,"y":1480,"h":500,"outfit":"dress","hair":"long","tag":"Ana","flip":true,"anim":"idle","mood":"deadpan","bubbles":[{"t":2.4,"end":4,"say":"Sei..."}],"seq":[{"t":2.6,"anim":"shrug"}]}]}`);

  const tarefa = edit ? '' : '\nTAREFA: crie o short para a ideia abaixo.';
  const extra = opts.extra ? `\n\nINSTRUÇÕES DA CASA (têm prioridade sobre o estilo padrão acima):\n${String(opts.extra).slice(0, 2000)}` : '';
  return [head, roteiro, story, catalogText(level), level >= 2 ? DIR_MIN : direcao].concat(level >= 1 ? [] : [rec.join('\n\n')]).join('\n\n') + tarefa + extra;
}

/* ------------------------------------------------------------------ limpeza e direção automática ------------------------------------------------------------------ */
// Modelos às vezes devolvem números como texto ("540"); o gerador espera tipos exatos.
const NUMK = new Set(['x', 'y', 's', 'h', 't', 't0', 't1', 'at', 'end', 'dur', 'move', 'z', 'z0', 'z1', 'x0', 'x1', 'y0', 'y1', 'r', 'r0', 'r1', 'rot', 'alpha', 'v', 'look', 'f', 'len', 'amp', 'open', 'shake', 'hy', 'gy', 'total', 'size', 'tx', 'ty', 'rpm', 'from', 'to', 'dec', 'gap', 'vol', 'bpm', 'bars', 'scroll', 'hand', 'cps', 'wrap', 'a', 'fy']);
function coerceNums(o) {
  if (Array.isArray(o)) { o.forEach((v, i) => { if (v && typeof v === 'object') coerceNums(v); else if (typeof v === 'string' && v.trim() !== '' && isFinite(+v) && o.length <= 2 && o.every(q => typeof q === 'string' ? isFinite(+q) : true) && false) o[i] = +v; }); return; }
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v && typeof v === 'object') coerceNums(v);
    else if (NUMK.has(k) && typeof v === 'string' && v.trim() !== '' && isFinite(+v)) o[k] = +v;
  }
}
const asArr = v => (Array.isArray(v) ? v : v == null ? [] : [v]);
const nWords = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

function retime(st, durs) {
  const old = st.scenes.map(s => ({ t0: s.t0, t1: s.t1 })); let cur = 0;
  st.scenes.forEach((s, i) => { s.t0 = +cur.toFixed(2); cur += durs[i]; s.t1 = +cur.toFixed(2); });
  st.sfx = asArr(st.sfx).filter(x => x && typeof x.t === 'number').map(x => { let i = old.findIndex(o => x.t >= o.t0 && x.t < o.t1); if (i < 0) i = old.length - 1; const o = old[i], f = durs[i] / Math.max(.01, o.t1 - o.t0); return { ...x, t: +(st.scenes[i].t0 + (x.t - o.t0) * f).toFixed(2) }; });
  st.total = +cur.toFixed(2);
}

// Garante tempos contínuos, total coerente e remove o que o gerador não sabe desenhar.
function fixStory(st, look, ctx) {
  if (!st || typeof st !== 'object' || !Array.isArray(st.scenes)) return st;
  coerceNums(st);
  const SET = SCHEMA.SET;
  let cur = 0;
  st.scenes = st.scenes.filter(s => s && typeof s === 'object').map(s => {
    let d = (typeof s.t0 === 'number' && typeof s.t1 === 'number' ? s.t1 - s.t0 : 0);
    if (!(d > 0.5)) d = 4;
    s.t0 = +cur.toFixed(2); s.t1 = +(cur + d).toFixed(2); cur = s.t1;
    s.props = asArr(s.props).filter(p => p && p.type !== 'emoji' && SET.prop.has(p.type) && typeof p.x === 'number' && typeof p.y === 'number');
    s.props = s.props.filter(p => !(p.type === 'chart' && !Array.isArray(p.data)) && !(p.type === 'chat' && !Array.isArray(p.msgs)) && !(p.type === 'checklist' && !Array.isArray(p.items)));
    s.actors = asArr(s.actors).filter(a => a && typeof a.x === 'number' && typeof a.y === 'number');
    s.actors.forEach(a => {
      a.seq = asArr(a.seq).filter(q => q && typeof q === 'object' && typeof q.t === 'number');
      a.bubbles = asArr(a.bubbles).filter(q => q && typeof q === 'object');
      if (!(Array.isArray(a.talk) && a.talk.length === 2 && a.talk.every(n => typeof n === 'number'))) delete a.talk;
      if (a.to && typeof a.to !== 'object') delete a.to;
      if (typeof a.h !== 'number') a.h = 520;
      if (a.anim && !SET.anim.has(a.anim)) a.anim = 'idle';
      if (a.mood && !SET.mood.has(a.mood)) delete a.mood;
      for (const [k, set] of [['outfit', SET.outfit], ['hair', SET.hair], ['hat', SET.hat], ['hold', SET.hold], ['holdL', SET.hold]]) if (a[k] && !set.has(a[k])) delete a[k];
      a.seq.forEach(q => { if (q.anim && !SET.anim.has(q.anim)) delete q.anim; if (q.mood && !SET.mood.has(q.mood)) delete q.mood; });
      a.bubbles.forEach(q => { if (q.say) q.say = String(q.say).split(/\s+/).slice(0, 4).join(' '); if (q.mark && !SET.mark.has(q.mark)) q.mark = '!'; });
      if (a.tag != null) a.tag = String(a.tag).slice(0, 14);
      if (!a.to && (a.x < -150 || a.x > 1230)) a.x = Math.min(960, Math.max(120, a.x));
    });
    if (s.cam && (typeof s.cam !== 'object' || Array.isArray(s.cam))) delete s.cam;
    if (s.look && !SET.look.has(s.look)) delete s.look;
    if (s.tr && !SET.tr.has(s.tr)) delete s.tr;
    s.fx = asArr(s.fx).filter(f => SET.fx.has(f));
    for (const k of ['title', 'lower', 'spot']) if (s[k] != null && !isObj(s[k])) delete s[k];
    if (s.title && !s.title.t) delete s.title;
    if (s.lower && !s.lower.t) delete s.lower;
    for (const k of ['punch', 'flashes', 'shakes']) { if (s[k] != null) { s[k] = asArr(s[k]).filter(q => isObj(q) && typeof q.t === 'number' && q.t >= 0 && q.t < d); if (!s[k].length) delete s[k]; } }
    if (s.caption == null) delete s.caption; else s.caption = String(s.caption);
    const pre = SCHEMA.SCENERY.find(x => x.id === s.scenery);
    if (s.scenery !== 'room' && !(Array.isArray(s.bg) && s.bg.length >= 2)) s.bg = (pre && pre.bg) ? pre.bg.slice() : ['#7ec8ff', '#eaf7ff'];
    s.props.forEach(p => {
      if (typeof p.s !== 'number') p.s = 240;
      if ((p.type === 'sign' || p.type === 'text') && p.t != null) p.t = String(p.t).split(/\s+/).slice(0, 3).join(' ').slice(0, 18);
      if ((p.type === 'sign' || p.type === 'text') && p.y > 1250 && p.y < 1450) p.y = 1180; // faixa da legenda
    });
    return s;
  });
  st.total = +cur.toFixed(2);
  st.style = isObj(st.style) ? st.style : {};
  delete st.style.caption;
  if (look && SET.look.has(look)) st.style.look = look;
  else if (!SET.look.has(st.style.look)) st.style.look = 'cartoon';
  const mu = isObj(st.style.music) ? st.style.music.type : st.style.music;
  if (ctx && ctx.music && SET.music.has(ctx.music)) st.style.music = ctx.music;
  else if (!SET.music.has(mu)) st.style.music = (ctx && ctx.toneMusic) || LOOK_MUSIC[st.style.look] || 'calm';
  st.sfx = asArr(st.sfx).filter(x => x && typeof x.t === 'number' && x.t >= 0 && x.t <= st.total && SET.sfx.has(x.type));
  st.sfx.forEach(x => { if (x.type === 'ping' && !(x.f > 0)) x.f = 880; if (x.type === 'thud' && !(x.f > 0)) x.f = 70; if (x.type === 'rumble' && !(x.len > 0)) x.len = 1.5; });
  return st;
}

// Pós-processamento determinístico: o que um bom diretor sempre confere e a IA às vezes esquece.
function autoDirect(st) {
  if (!st || !Array.isArray(st.scenes) || !st.scenes.length) return st;
  const sc = st.scenes;
  // 1) cenas com fala rápida demais ganham tempo (até +35%)
  const durs = sc.map(s => { const d = s.t1 - s.t0, w = nWords(s.caption); return (w / d > 3.4) ? Math.min(w / 3.0, d * 1.35) : d; });
  if (durs.some((d, i) => Math.abs(d - (sc[i].t1 - sc[i].t0)) > .01)) retime(st, durs);
  // 2) câmera em toda cena
  const camPool = [{ z0: 1, z1: 1.14, x0: 540, x1: 565, y0: 960, y1: 1010 }, { z0: 1.22, z1: 1, x0: 560, x1: 540, y0: 1040, y1: 960 }, { z0: 1, z1: 1.1, x0: 600, x1: 480, y0: 980, y1: 980 }];
  sc.forEach((s, i) => { if (!s.cam) s.cam = { ...camPool[i % 3] }; });
  // 3) transições variadas
  const cnt = {}; sc.forEach((s, i) => { if (i) cnt[s.tr || 'fade'] = (cnt[s.tr || 'fade'] || 0) + 1; });
  const dom = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  if (dom && cnt[dom] >= Math.ceil((sc.length - 1) * .6) && sc.length > 3) { const pool = ['flash', 'wipe', 'slide', 'iris', 'zoom', 'whiteout', 'push']; sc.forEach((s, i) => { if (i && i % 2 === 0 && (s.tr || 'fade') === dom) s.tr = pool[(i / 2 - 1) % pool.length]; }); }
  // 4) som em toda troca de cena
  const sfx = asArr(st.sfx), near = (t, a, b) => sfx.some(x => x.t >= t - a && x.t <= t + b), byTr = { flash: { type: 'thud', f: 70, len: .5 }, glitch: { type: 'click' }, whiteout: { type: 'sparkle', amp: .6 }, pixel: { type: 'pop' }, zoom: { type: 'whoosh', len: .35 }, spin: { type: 'whoosh', len: .4 } };
  sc.forEach((s, i) => { if (!near(s.t0, .15, .4)) sfx.push({ t: +(s.t0 + .02).toFixed(2), ...(byTr[s.tr] || { type: 'whoosh', len: .45, amp: i ? .8 : 1 }) }); });
  st.sfx = sfx.sort((a, b) => a.t - b.t);
  return st;
}

/* ------------------------------------------------------------------ chamadas ao provedor de IA ------------------------------------------------------------------ */
const httpErr = (code, msg) => ({ code, msg });
const failErr = (code, msg, cool) => ({ code, msg, failover: true, cool: cool || 60e3 }); // erro que justifica tentar outro provedor
const cooldown = new Map(); // id do provedor -> até quando evitá-lo depois de uma falha
const sleep = ms => new Promise(res => setTimeout(res, ms));

// Uma chamada a UM provedor (com as repetições que fazem sentido dentro dele).
async function callOne(p, { messages, maxTokens, temperature, json, canFailover }) {
  const body = { model: p.model, messages, temperature: temperature == null ? 0.7 : temperature, max_tokens: maxTokens };
  if (json !== false) body.response_format = { type: 'json_object' };
  if (typeof p.tune === 'function') p.tune(body, p.model); // ajustes do provedor (ex.: pouco raciocínio, "thinking" desligado)
  const extras = Object.keys(body).filter(k => !['model', 'messages', 'temperature', 'max_tokens', 'response_format'].includes(k));
  const headers = { 'Content-Type': 'application/json', ...(p.headers || {}) };
  if (p.key) headers.Authorization = 'Bearer ' + p.key;
  for (let attempt = 0; attempt < 5; attempt++) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 120e3);
    let r, j = {};
    try {
      r = await fetch(p.url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
      try { j = await r.json(); } catch {}
    } catch (e) {
      throw failErr(504, e.name === 'AbortError' ? p.label + ' demorou demais para responder.' : 'Não consegui falar com ' + p.label + ' (sem internet?).', 30e3);
    } finally { clearTimeout(timer); }
    if (r.ok) {
      const txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      return String(txt).replace(/<think>[\s\S]*?<\/think>/gi, ''); // alguns modelos devolvem o raciocínio dentro do texto
    }
    const msg = (j.error && (j.error.message || (typeof j.error === 'string' ? j.error : ''))) || j.message || '';
    if (r.status === 400 && /response_format|json/i.test(msg) && body.response_format) { delete body.response_format; continue; } // modelo sem modo JSON
    if (r.status === 400 && extras.some(k => k in body) && /reasoning|thinking|unknown|unrecognized|unsupported|extra|not permitted/i.test(msg)) { extras.forEach(k => delete body[k]); continue; }
    if (r.status === 401 || r.status === 403) throw { ...failErr(502, 'A chave de ' + p.label + ' foi recusada. Peça ao administrador para conferir a chave.', 600e3), wide: true };
    if (r.status === 402) throw failErr(502, p.label + ' pede crédito ou pagamento para o modelo ' + p.model + '. Troque por um modelo gratuito.', 600e3);
    if (r.status === 404 || (r.status === 400 && /model/i.test(msg))) throw failErr(502, 'Modelo de ' + p.label + ' indisponível: ' + msg, 600e3);
    // limite de tokens por minuto no formato da Groq ("Limit N, Requested M")
    const lim = /Limit (\d+)/i.exec(msg), req = /Requested (\d+)/i.exec(msg), wait = /try again in ([\d.]+)\s*(ms|s|m)/i.exec(msg);
    if ((r.status === 429 || r.status === 413) && /tokens/i.test(msg) && lim && req) {
      const L = +lim[1], R = +req[1];
      if (R > L) { // este pedido sozinho passa do limite por minuto: reduz a saída e tenta de novo
        const nm = body.max_tokens - (R - L) - 150;
        if (nm >= 2500) { body.max_tokens = nm; continue; }
        if (canFailover) throw failErr(502, `Pedido grande demais para o limite de ${L} tokens por minuto de ${p.label}.`, 300e3);
        throw httpErr(502, `O pedido é grande demais para o limite do seu plano de ${p.label} (${L} tokens por minuto). Reduza a duração ou o tamanho da ideia, ou use um modelo/provedor com limite maior.`);
      }
      if (wait && attempt < 4 && !canFailover) { const ms = Math.min(45000, Math.ceil(parseFloat(wait[1]) * (wait[2] === 'ms' ? 1 : wait[2] === 'm' ? 60000 : 1000)) + 400); await sleep(ms); continue; } // limite do minuto: espera e repete
    }
    if (r.status === 429) {
      if (canFailover) throw failErr(429, p.label + ' atingiu o limite de uso.', 60e3);
      if (wait && attempt < 4) { const ms = Math.min(45000, Math.ceil(parseFloat(wait[1]) * (wait[2] === 'ms' ? 1 : wait[2] === 'm' ? 60000 : 1000)) + 400); await sleep(ms); continue; }
      throw httpErr(429, p.label + ' atingiu o limite de uso. Tente novamente em instantes ou configure outro provedor de reserva no painel.');
    }
    if (r.status === 413) { if (canFailover) throw failErr(502, 'Pedido grande demais para ' + p.label + '.', 300e3); throw httpErr(502, 'O pedido ficou grande demais para ' + p.label + '. Reduza a duração ou o tamanho da ideia.'); }
    if (r.status === 408 || r.status >= 500) { if (canFailover || attempt >= 1) throw failErr(502, 'Erro de ' + p.label + ' (' + r.status + '): ' + (msg || 'instabilidade'), 60e3); await sleep(1500); continue; }
    throw httpErr(502, 'Erro de ' + p.label + ' (' + r.status + '): ' + (msg || 'sem detalhes'));
  }
  throw failErr(502, p.label + ' não respondeu corretamente.', 60e3);
}

// Tenta os provedores da cadeia, em ordem; passa ao próximo quando um deles falha por limite, chave, modelo ou queda.
async function callLLM({ llm, messages, maxTokens, temperature, json }) {
  const chain = (llm && llm.chain) || [];
  if (!chain.length) throw httpErr(503, 'Nenhum provedor de IA está configurado.');
  const need = msgTok(messages) + (maxTokens || 0), now = Date.now();
  let cands = chain.filter(p => (cooldown.get(p.id) || 0) <= now);
  if (!cands.length) cands = chain.slice(); // todos em pausa: tenta mesmo assim
  const fit = cands.filter(p => need <= (p.tpm || 8000)); // não manda pedido grande para quem tem cota pequena
  if (fit.length) cands = fit;
  let last = null;
  const dead = new Set(); // provedores cuja chave foi recusada: não adianta tentar outro modelo deles
  cands = cands.filter(p => !dead.has(p.pid));
  for (let i = 0; i < cands.length; i++) {
    const p = cands[i];
    if (dead.has(p.pid)) continue;
    try {
      const txt = await callOne(p, { messages, maxTokens, temperature, json, canFailover: cands.slice(i + 1).some(q => !dead.has(q.pid)) });
      if (llm) llm.lastUsed = p.label + ' · ' + p.model;
      cooldown.delete(p.id);
      return txt;
    } catch (e) {
      last = e;
      if (!e || !e.failover) throw e;
      cooldown.set(p.id, Date.now() + (e.cool || 60e3));
      if (e.wide) { dead.add(p.pid); for (const q of chain) if (q.pid === p.pid) cooldown.set(q.id, Date.now() + (e.cool || 60e3)); }
      console.warn('IA: ' + p.label + ' / ' + p.model + ' falhou (' + e.msg + ')' + (i < cands.length - 1 ? '; tentando o próximo provedor.' : '.'));
    }
  }
  throw httpErr(last.code || 502, last.msg);
}

function parseModelJson(txt) {
  const t = String(txt).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

const cleanStr = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
function cleanPublish(p) {
  p = isObj(p) ? p : {};
  return {
    titles: asArr(p.titulos).map(x => cleanStr(x, 90)).filter(Boolean).slice(0, 5),
    description: cleanStr(p.descricao, 400), hashtags: asArr(p.hashtags).map(x => cleanStr(x, 30)).filter(Boolean).slice(0, 10),
    voice: cleanStr(p.direcao_voz, 500), thumb: cleanStr(p.miniatura, 60), facts: cleanStr(p.aviso_fatos, 500),
  };
}
function cleanPlan(p) {
  p = isObj(p) ? p : {};
  return { concept: cleanStr(p.conceito, 300), hook: cleanStr(p.gancho, 300), motif: cleanStr(p.motivo, 200), palette: asArr(p.paleta).map(x => cleanStr(x, 12)).filter(Boolean).slice(0, 6),
    cast: asArr(p.elenco).filter(isObj).map(e => ({ name: cleanStr(e.nome, 30), look: cleanStr(e.visual, 140) })).slice(0, 4), beats: asArr(p.batidas).map(x => cleanStr(x, 200)).slice(0, 14) };
}

// Valida o JSON do modelo e devolve os problemas encontrados.
function checkResult(obj, look, ctx) {
  obj.story = fixStory(obj.story, look, ctx);
  autoDirect(obj.story);
  const issues = SCHEMA.validateStory(obj.story);
  const sc = obj.story.scenes || [], withCap = sc.filter(s => s.caption && s.caption.trim()).length;
  if (sc.length < 3 || withCap < sc.length * 0.6) issues.push({ level: 'erro', path: 'scenes', msg: 'Poucas cenas (mínimo 3) ou cenas sem "caption" com o trecho do roteiro.' });
  return { issues, errs: issues.filter(i => i.level === 'erro') };
}

async function runStory({ llm, maxTokens, messages, look, ctx, tpm }) {
  let out = null, issues = [], raw = '';
  for (let round = 0; round < 2; round++) {
    if (round > 0 && msgTok(messages) + maxTokens > (tpm || 8000)) break; // a conversa de correção não cabe na cota por minuto
    raw = await callLLM({ llm, messages, maxTokens });
    const obj = parseModelJson(raw);
    if (!obj || !obj.story) {
      messages.push({ role: 'assistant', content: raw.slice(0, 4000) }, { role: 'user', content: 'Sua resposta não foi um JSON válido com as chaves pedidas (incluindo "story"). Responda de novo, só com o JSON.' });
      continue;
    }
    const r = checkResult(obj, look, ctx);
    issues = r.issues; out = obj;
    if (!r.errs.length) break;
    messages.push({ role: 'assistant', content: raw.slice(0, 12000) }, { role: 'user', content: 'Há erros no story. Corrija e devolva o JSON completo de novo:\n' + r.errs.slice(0, 8).map(e => `- ${e.path}: ${e.msg}`).join('\n') });
  }
  if (!out) throw httpErr(502, 'A IA não devolveu um JSON utilizável. Tente reformular a ideia.');
  const errs = issues.filter(i => i.level === 'erro');
  if (errs.length) throw httpErr(502, 'A IA gerou uma história com erros (' + errs[0].path + ': ' + errs[0].msg + '). Tente de novo.');
  const script = String(out.roteiro || out.story.scenes.map(s => s.caption).filter(Boolean).join(' ')).trim();
  return { out, issues, script };
}

const optClean = o => ({
  seconds: [20, 30, 45, 60].includes(+o.seconds) ? +o.seconds : 30,
  look: SCHEMA.SET.look.has(o.look) ? o.look : '',
  format: FORMATS[o.format] ? o.format : 'auto', tone: TONES[o.tone] ? o.tone : 'auto',
  lang: LANGS[o.lang] ? o.lang : '', music: SCHEMA.SET.music.has(o.music) ? o.music : '',
  cast: [1, 2, 3].includes(+o.cast) ? +o.cast : 0, extra: o.extra || '',
});

/* ------------------------------------------------------------------ operações ------------------------------------------------------------------ */
async function generate({ llm, maxTokens, tpm, idea, extra, ...raw }) {
  tpm = tpm || 8000;
  const o = optClean({ ...raw, extra }), maxIdea = tpm <= 10000 ? 2800 : 6000;
  const user = 'Ideia do vídeo:\n' + String(idea).slice(0, maxIdea), need = sec => 1500 + sec * 100;
  let b = budget({ build: l => systemPrompt({ ...o, level: l }), user, maxTokens, tpm, minOut: need(o.seconds) }), notice = '';
  if (b.out < need(o.seconds)) { // reduz a duração até caber na cota de tokens por minuto
    const orig = o.seconds;
    for (const sec of [45, 30, 20]) if (sec < orig) { o.seconds = sec; b = budget({ build: l => systemPrompt({ ...o, level: l }), user, maxTokens, tpm, minOut: need(sec) }); if (b.out >= need(sec)) break; }
    if (o.seconds !== orig) notice = `Duração ajustada de ${orig} s para ${o.seconds} s: o limite de ${tpm} tokens por minuto do provedor de IA não comporta vídeos maiores de uma vez.`;
  }
  if (b.out < 2800) throw httpErr(413, 'A ideia é longa demais para o limite de tokens por minuto do provedor de IA. Resuma a ideia.');
  const messages = [{ role: 'system', content: b.sys }, { role: 'user', content: user }];
  const ctx = { music: o.music, toneMusic: (TONES[o.tone] || {}).music || '' };
  const { out, issues, script } = await runStory({ llm, maxTokens: b.out, messages, look: o.look, ctx, tpm });
  return { title: cleanStr(out.titulo || 'Sem título', 80), script, story: out.story, issues, plan: cleanPlan(out.plano), publish: cleanPublish(out.publicacao), notice };
}

// Edita uma história existente seguindo uma instrução ("deixe mais dinâmico", "troque para noite"...).
async function refine({ llm, maxTokens, tpm, story, script, instruction, extra, ...raw }) {
  tpm = tpm || 8000;
  const o = optClean({ ...raw, extra }), sj = JSON.stringify(story);
  const user = `INSTRUÇÃO DE EDIÇÃO:\n${instruction}\n\nROTEIRO ATUAL:\n${script || '(use as captions das cenas)'}\n\nSTORY ATUAL (JSON):\n${sj}`;
  const b = budget({ build: l => systemPrompt({ ...o, mode: 'edit', level: Math.max(1, l) }), user, maxTokens, tpm, minOut: Math.min(5200, Math.ceil(estTok(sj) * 1.15) + 500) });
  if (b.out < Math.ceil(estTok(sj) * 1.05) + 300) throw httpErr(413, `A história é grande demais para a IA editar dentro do limite de ${tpm} tokens por minuto do provedor de IA. Edite pelo JSON ou use um provedor/modelo com limite maior.`);
  const messages = [{ role: 'system', content: b.sys }, { role: 'user', content: user }];
  const { out, issues, script: sc } = await runStory({ llm, maxTokens: b.out, messages, look: o.look || '', ctx: { music: '', toneMusic: '' }, tpm });
  return { title: cleanStr(out.titulo || '', 80), script: sc, story: out.story, issues, summary: cleanStr(out.resumo_mudancas, 400) };
}

async function ideas({ llm, topic, count, format, tone, seconds }) {
  count = Math.min(10, Math.max(3, +count || 6));
  const sys = `Você é estrategista de conteúdo para shorts animados verticais (YouTube Shorts, Reels, TikTok). Gere ${count} ideias de vídeo diferentes entre si, cada uma com gancho forte nos 3 primeiros segundos e viável com personagens-palito 2D e objetos desenhados (sem fotos, sem pessoas reais, sem marcas). Varie os formatos. Não invente fatos duvidosos.
Formatos possíveis: ${Object.keys(FORMATS).filter(k => k !== 'auto').join(', ')}. Estilos visuais possíveis: ${idsOf(SCHEMA.LOOKS)}.
Responda SOMENTE JSON: {"ideias":[{"titulo":"até 60 caracteres","gancho":"a frase que abre o vídeo","ideia":"1 a 3 frases prontas para colar no campo Ideia (tema, tom, público)","formato":"um dos formatos","estilo":"um dos estilos","duracao":30}]}`;
  const user = `Assunto ou nicho: ${topic || 'curiosidades do dia a dia'}${format && FORMATS[format] && format !== 'auto' ? `\nFormato preferido: ${format}` : ''}${tone && TONES[tone] && tone !== 'auto' ? `\nTom: ${tone}` : ''}${seconds ? `\nDuração desejada: ${seconds} s` : ''}`;
  const raw = await callLLM({ llm, maxTokens: 3500, temperature: 0.95, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] });
  const obj = parseModelJson(raw);
  const list = obj && Array.isArray(obj.ideias) ? obj.ideias : [];
  const out = list.filter(isObj).map(i => ({ title: cleanStr(i.titulo, 80), hook: cleanStr(i.gancho, 200), idea: cleanStr(i.ideia, 600), format: FORMATS[i.formato] ? i.formato : 'auto', look: SCHEMA.SET.look.has(i.estilo) ? i.estilo : '', seconds: [20, 30, 45, 60].includes(+i.duracao) ? +i.duracao : 30 })).filter(i => i.idea.length > 8).slice(0, count);
  if (!out.length) throw httpErr(502, 'A IA não devolveu ideias utilizáveis. Tente de novo.');
  return { ideas: out };
}

// Resumo compacto da história (poupa tokens na avaliação).
function outline(st) {
  return asArr(st && st.scenes).map((s, i) => {
    const acts = asArr(s.actors).map(a => [a.anim || 'idle', a.mood, a.tag, asArr(a.seq).map(q => q.anim).join('>')].filter(Boolean).join(':'));
    return `${i + 1}) ${s.t0}-${s.t1}s [${s.scenery || '?'}${s.tr ? ' tr=' + s.tr : ''}] cam=${s.cam ? (s.cam.keys ? 'keys' : `${s.cam.z0 || 1}->${s.cam.z1 || 1}`) : 'nenhuma'} fx=${asArr(s.fx).join(',') || '-'} props=${asArr(s.props).map(p => p.type).join(',') || '-'} atores=${acts.join(' | ') || '-'} extras=${['title', 'lower', 'spot', 'punch', 'flashes', 'shakes', 'scroll'].filter(k => s[k]).join(',') || '-'}\n   fala: ${s.caption || ''}`;
  }).join('\n');
}
async function review({ llm, story, script, tpm }) {
  const sys = `Você é um diretor de shorts animados exigente e construtivo. Avalie o roteiro e a direção (resumo por cena) quanto a: gancho nos 3 primeiros segundos, ritmo (algo muda a cada 2–3 s), clareza, variedade de câmera/cenário/transição, uso de som e de recursos visuais (gráficos, títulos, efeitos), continuidade de elenco e fecho. Seja específico (cite o número da cena).
Os recursos existentes são: cenários ${idsOf(SCHEMA.SCENERY)}; fx ${idsOf(SCHEMA.FX)}; transições ${idsOf(SCHEMA.TRANSITIONS)}; trilhas ${idsOf(SCHEMA.MUSIC)}; e os recursos de cena title, lower, spot, bars, punch, flashes, shakes, scroll, cam.hand, além de objetos de dados (chart, counter, checklist, chat, callout, stamp, headline...).
Responda SOMENTE JSON: {"nota":0 a 10,"resumo":"2 frases","pontos_fortes":["..."],"problemas":[{"cena":número ou 0 para geral,"problema":"...","correcao":"o que fazer, usando recursos existentes"}],"instrucao_refino":"UMA instrução objetiva (até 700 caracteres) que aplique as correções mais importantes quando enviada a um editor automático"}`;
  const stl = (story && story.style) || {};
  const user = `ROTEIRO:\n${script || ''}\n\nDIREÇÃO POR CENA (total ${story && story.total}s, estilo ${stl.look || 'cartoon'}, trilha ${(isObj(stl.music) ? stl.music.type : stl.music) || 'nenhuma'}, sfx ${asArr(story && story.sfx).length}):\n${outline(story)}`;
  const raw = await callLLM({ llm, maxTokens: Math.max(1500, Math.min(3000, (tpm || 8000) - estTok(sys + user) - 400)), temperature: 0.4, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] });
  const o = parseModelJson(raw);
  if (!o) throw httpErr(502, 'A IA não devolveu uma avaliação utilizável. Tente de novo.');
  return { score: Math.max(0, Math.min(10, +o.nota || 0)), summary: cleanStr(o.resumo, 500), strengths: asArr(o.pontos_fortes).map(x => cleanStr(x, 200)).slice(0, 6),
    problems: asArr(o.problemas).filter(isObj).map(p => ({ scene: +p.cena || 0, problem: cleanStr(p.problema, 240), fix: cleanStr(p.correcao, 240) })).slice(0, 8), instruction: cleanStr(o.instrucao_refino, 800) };
}

// Traduz roteiro + todos os textos da tela, mantendo a estrutura (e os tempos) da história.
function collectTexts(st) {
  const refs = [], add = (o, k) => { if (o && typeof o[k] === 'string' && o[k].trim()) refs.push({ o, k }); };
  for (const s of asArr(st.scenes)) {
    add(s, 'caption'); if (s.title) add(s.title, 't'); if (s.lower) { add(s.lower, 't'); add(s.lower, 'sub'); }
    for (const p of asArr(s.props)) {
      if (['circle', 'rect', 'star', 'clock', 'calendar'].includes(p.type)) { if (p.type === 'calendar') add(p, 'm'); continue; }
      for (const k of ['t', 'b', 'pre', 'suf', 'name']) add(p, k);
      if (Array.isArray(p.labels)) p.labels.forEach((_, i) => add(p.labels, i));
      if (Array.isArray(p.data)) p.data.forEach(d => { if (isObj(d)) add(d, 'l'); });
      if (Array.isArray(p.items)) p.items.forEach((d, i) => { if (isObj(d)) add(d, 't'); else add(p.items, i); });
      if (Array.isArray(p.msgs)) p.msgs.forEach((d, i) => { if (isObj(d)) add(d, 't'); else add(p.msgs, i); });
    }
    for (const a of asArr(s.actors)) { add(a, 'tag'); add(a, 'holdT'); asArr(a.bubbles).forEach(b => add(b, 'say')); }
  }
  return refs;
}
async function translate({ llm, maxTokens, tpm, story, script, lang }) {
  tpm = tpm || 8000;
  if (!LANGS[lang]) throw httpErr(400, 'Idioma não suportado.');
  const st = JSON.parse(JSON.stringify(story)), refs = collectTexts(st);
  const items = [String(script || ''), ...refs.map(r => String(r.o[r.k]))];
  const total = items.reduce((n, t) => n + t.length, 0);
  if (estTok(JSON.stringify(items)) * 2 + 500 > tpm) throw httpErr(413, 'Há texto demais para traduzir de uma vez dentro do limite de tokens por minuto do provedor de IA.');
  const sys = `Você é tradutor de legendas e roteiros de vídeos curtos. Traduza cada item da lista para ${LANGS[lang]}, mantendo tom, sentido e brevidade (os textos precisam caber na tela e na fala no mesmo tempo; textos de 1 a 3 palavras continuam curtos). Preserve números, símbolos de moeda, hashtags e nomes próprios. O item 0 é o roteiro completo; os demais são textos da tela, na mesma ordem. Responda SOMENTE JSON: {"itens":["...","..."]} com exatamente ${items.length} itens, na mesma ordem.`;
  const raw = await callLLM({ llm, maxTokens: Math.max(1500, Math.min(maxTokens || 8000, tpm - estTok(JSON.stringify(items)) - 700)), temperature: 0.2, messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify({ itens: items }) }] });
  const o = parseModelJson(raw);
  if (!o || !Array.isArray(o.itens) || o.itens.length !== items.length) throw httpErr(502, 'A tradução voltou incompleta. Tente de novo.');
  refs.forEach((r, i) => { const v = cleanStr(o.itens[i + 1], 400); if (v) r.o[r.k] = v; });
  return { script: String(o.itens[0] || '').trim(), story: st };
}

// Pedido mínimo para testar uma chave/modelo no painel.
async function ping({ llm }) {
  const raw = await callLLM({ llm, maxTokens: 300, temperature: 0, messages: [{ role: 'user', content: 'Responda somente com este JSON: {"ok":true}' }] });
  if (!parseModelJson(raw)) throw httpErr(502, 'O provedor respondeu, mas não devolveu JSON. Tente outro modelo.');
  return raw.trim();
}

module.exports = { ping, generate, refine, ideas, review, translate, fixStory, autoDirect, systemPrompt, FORMATS, TONES, LANGS };
