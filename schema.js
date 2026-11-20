// Catálogo do formato de história + validador. Usado pela página de ajuda, pelo admin e pelo servidor.
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
  ];

  const MOODS = [
    L('smile', 'Sorriso', 'Padrão. Alias: happy.'),
    L('grin', 'Sorrisão', 'Dentes à mostra.'),
    L('laugh', 'Riso', 'Boca aberta.'),
    L('shock', 'Choque', 'Olhos pequenos, boca em O.'),
    L('worry', 'Preocupado', 'Sobrancelhas inclinadas. Alias: sad.'),
    L('angry', 'Bravo', 'Sobrancelhas para baixo.'),
    L('deadpan', 'Sem expressão', 'Boca reta.'),
  ];
  const MOOD_ALIASES = ['happy', 'sad'];

  const SCENERY = [
    L('hills', 'Colinas', 'Céu, nuvens e morros. Externa de dia.'),
    L('city', 'Cidade', 'Prédios com janelas acesas.'),
    L('space', 'Espaço', 'Estrelas piscando, sem chão.'),
    L('night', 'Noite', 'Estrelas com chão.'),
    L('room', 'Sala (3D simples)', 'Parede, piso em perspectiva. Aceita wall, floor, tex (brick|plank) e hy.'),
    L('none', 'Nenhum', 'Só o degradê de fundo.'),
  ];

  const FX = [
    L('rain', 'Chuva', 'Tensão, tristeza.'),
    L('snow', 'Neve', 'Calma, frio.'),
    L('fog', 'Neblina', 'Mistério.'),
    L('sparks', 'Faíscas', 'Alívio, magia.'),
    L('confetti', 'Confete', 'Comemoração.'),
    L('lines', 'Linhas de velocidade', 'Impacto, ação.'),
  ];

  const TRANSITIONS = [
    L('fade', 'Fade', 'Escurece e abre (padrão).'),
    L('flash', 'Flash', 'Clarão branco rápido.'),
    L('wipe', 'Cortina', 'Da esquerda para a direita.'),
    L('iris', 'Íris', 'Círculo abrindo.'),
    L('none', 'Corte seco', 'Sem transição.'),
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
    L('emoji', 'Emoji', '"t":"😀".'),
    L('circle', 'Círculo', 'Forma simples.'),
    L('rect', 'Retângulo', 'Forma simples.'),
    L('star', 'Estrela', 'Forma simples.'),
  ];

  const PROP_ANIMS = ['pop', 'float', 'spin', 'shake', 'pulse', 'fall', 'none'];
  const OUTFITS = ['suit', 'hoodie', 'leather', 'shirt', 'blazer'];
  const HAIRS = ['short', 'swept', 'bob', 'grey', 'none'];
  const HATS = ['cap', 'top', 'crown'];
  const HOLDS = ['phone', 'book', 'cup', 'box', 'key', 'sign'];
  const MARKS = ['!', '?', 'idea', 'heart', 'zzz'];
  const SFX = [
    L('whoosh', 'Whoosh', 'Passagem rápida. Parâmetro: len.'),
    L('thud', 'Impacto', 'Grave. Parâmetros: f (Hz), len.'),
    L('ping', 'Ping', 'Nota curta. Parâmetros: f (Hz), len.'),
    L('rumble', 'Ruído grave', 'Tremor longo. Parâmetro: len.'),
    L('slide', 'Slide', 'Tom descendente.'),
  ];

  const ids = a => a.map(x => (typeof x === 'string' ? x : x.id));
  const SET = {
    look: new Set(ids(LOOKS)), anim: new Set(ids(ANIMS)), mood: new Set([...ids(MOODS), ...MOOD_ALIASES]),
    scenery: new Set(ids(SCENERY)), fx: new Set(ids(FX)), tr: new Set(ids(TRANSITIONS)), prop: new Set(ids(PROPS)),
    propAnim: new Set(PROP_ANIMS), outfit: new Set(OUTFITS), hair: new Set(HAIRS), hat: new Set(HATS), hold: new Set(HOLDS),
    mark: new Set(MARKS), sfx: new Set(ids(SFX)),
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
      if (s.scenery !== 'room' && !Array.isArray(s.bg)) W(p, 'Sem "bg" ([topo, base]); o fundo pode ficar indefinido.');
      (s.fx || []).forEach(f => oneOf(`${p}.fx`, f, SET.fx, 'Efeito'));
      if (s.caption !== undefined && typeof s.caption !== 'string') E(`${p}.caption`, '"caption" deve ser texto.');
      if (s.cam && s.cam.keys) s.cam.keys.forEach((k, j) => { if (!num(k.t)) E(`${p}.cam.keys[${j}]`, 'Cada ponto de câmera precisa de "t" numérico.'); });
      (s.actors || []).forEach((a, j) => {
        const q = `${p}.actors[${j}]`;
        if (!num(a.x) || !num(a.y)) E(q, '"x" e "y" (posição dos pés) devem ser números.');
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

  const SCHEMA = { LOOKS, ANIMS, MOODS, MOOD_ALIASES, SCENERY, FX, TRANSITIONS, PROPS, PROP_ANIMS, OUTFITS, HAIRS, HATS, HOLDS, MARKS, SFX, SET, validateStory, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = SCHEMA; else root.SCHEMA = SCHEMA;
})(typeof window !== 'undefined' ? window : globalThis);
