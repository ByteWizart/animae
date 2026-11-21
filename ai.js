
// Integração com Cloudflare Workers AI
// Mantém a configuração de modelo feita pelo site.
// Requer Node.js 18+.
const SCHEMA = require('./schema.js');

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_BASE_URL = 'https://api.cloudflare.com/client/v4/accounts';

function systemPrompt(opts) {
  const ids = a => a.map(x => (typeof x === 'string' ? x : x.id)).join(' | ');
  const target = opts.seconds, nScenes = Math.max(4, Math.round(target / 5.5));

  return `Você é roteirista e diretor de shorts verticais animados (formato 9:16, 1080x1920). Recebe a ideia do usuário e devolve UM objeto JSON com o roteiro falado e a história animada para o nosso gerador. Responda SOMENTE com JSON válido, sem markdown.

SAÍDA (estas três chaves):
{"titulo":"título curto","roteiro":"narração completa em texto corrido","story":{...}}

ROTEIRO
- Idioma: o mesmo da ideia do usuário (padrão: português do Brasil). Tom natural de narrador, frases curtas.
- Duração alvo: ${target} s (aprox. ${Math.round(target * 2.5)} palavras, ~2,5 palavras por segundo).
- Comece com um gancho nos primeiros 3 s e termine com um fecho forte (surpresa, piada ou chamada para ação).
- Não use emojis nem indicações de palco no roteiro.

STORY (o gerador é 2D, personagens-palito expressivos; tempos em segundos, posições em px numa tela 1080x1920)
- Use cerca de ${nScenes} cenas (de 3,5 a 7 s cada). "total" = soma das cenas. Cenas consecutivas: t0 de cada uma = t1 da anterior; a primeira começa em 0.
- Cada cena tem "caption" = o trecho EXATO do roteiro falado nela. Juntando todas as captions na ordem tem-se o roteiro inteiro.
- Campos de cena: t0, t1, bg:["#topo","#base"], scenery (${ids(SCHEMA.SCENERY)}), ground (cor do chão), tr (${ids(SCHEMA.TRANSITIONS)}), fx (lista de ${ids(SCHEMA.FX)}), tint ("#rrggbbaa" com transparência), shake (s), look (estilo só da cena), caption, cam, props[], actors[].
- scenery "room" aceita wall (cor), floor (cor), tex (brick|plank); não precisa de bg. Para cenas externas use hills/city/night/space com bg e ground.
- cam: {"z0":1,"z1":1.2,"x0":540,"x1":600,"y0":960,"y1":1050} (zoom 1–1.6, x 400–680, y 900–1150) ou {"keys":[{"t":0,"z":1,"x":540,"y":960,"r":0},...]} (preencha z,x,y,r em todos). Varie a câmera a cada cena; aproxime em tensão, afaste no final.
- actors[]: {"x","y"(pés),"h"(altura),"outfit":${ids(SCHEMA.OUTFITS)},"hair":${ids(SCHEMA.HAIRS)},"hat":${ids(SCHEMA.HATS)} (opcional),"glasses":true|false,"anim":${ids(SCHEMA.ANIMS)},"mood":${ids(SCHEMA.MOODS)},"talk":[ini,fim],"seq":[{"t","anim","mood","look"(-1 a 1)}],"to":{"x":..,"dur":..,"move":..} ou lista de trechos,"bubbles":[{"t","end","say":"até 4 palavras"} ou {"t","end","mark":${SCHEMA.MARKS.join('|')}}],"hold":${ids(SCHEMA.HOLDS)},"flip":true,"at","end"}.
  Valores típicos: y 1350–1560 (pés), h 420–560, x 150–930. Se o personagem tem "to", ele anda sozinho (não use walk).
- props[]: {"type":${ids(SCHEMA.PROPS.filter(p => p.id !== 'emoji'))},"x","y","s"(tamanho),"color","t"(texto de sign/text),"at"(quando entra),"anim":${ids(SCHEMA.PROP_ANIMS)},"alpha","front","rot","to"}.
  Em room: window/frame/shelf na parede (y 430–600, s 220–380); desk/monitor/plant/lamp/door/box no chão (y 1250–1330, s 300–420). "sign" e "text" com no máximo 2 palavras curtas (letras grandes estouram a tela): sign s≥300; text s≤300. NUNCA use props do tipo "emoji": ilustre ideias com os objetos prontos, formas (circle, rect, star), setas, anéis e placas curtas.
- Mantenha tudo dentro da tela. Deixe a região y 1250–1450 livre de sign/text: a legenda do vídeo fica por ali.
- Todos os tempos "at", "t", "end", "move" dentro de uma cena são relativos ao início da cena e devem ser menores que a duração dela.
- Ritmo: a cada 2–3 s algo muda (animação, humor, olhar, câmera ou objeto entrando). Cada ideia nova da narração ganha um elemento visual novo. Alterne transições (fade, flash, wipe, iris).
- "sfx": lista no topo [{"t","type":${ids(SCHEMA.SFX)},"f"(Hz p/ thud/ping),"len"}] com sons nas trocas de cena e nos momentos de impacto/descoberta.
- ESTILO: ${opts.look ? `use obrigatoriamente "style":{"look":"${opts.look}"}.` : `escolha UM em "style":{"look":...} conforme o tema: ${SCHEMA.LOOKS.map(l => l.id + ' (' + l.desc.split('.')[0] + ')').join('; ')}.`} Pode usar "look" numa cena só para flashback/sonho.
- Não inclua "style.caption" (o site já aplica o padrão).

EXEMPLO DE UMA CENA (apenas formato, crie as suas):
{"t0":0,"t1":5,"scenery":"room","wall":"#e8a05a","floor":"#7a4a2a","tex":"plank","tr":"fade","cam":{"z0":1,"z1":1.2,"x0":540,"x1":640,"y0":1000,"y1":1060},"caption":"Você levanta do sofá e esquece o que ia buscar.","props":[{"type":"window","x":800,"y":480,"s":380},{"type":"lamp","x":110,"y":1280,"s":300}],"actors":[{"x":260,"y":1480,"h":520,"outfit":"hoodie","hair":"short","glasses":true,"anim":"idle","mood":"smile","to":[{"x":820,"dur":3,"move":0.6}],"seq":[{"t":3.8,"anim":"think","mood":"worry"}],"bubbles":[{"t":3.8,"end":5,"mark":"?"}]}]}`;
}

const NUMK = new Set(['x', 'y', 's', 'h', 't', 't0', 't1', 'at', 'end', 'dur', 'move', 'z', 'z0', 'z1', 'x0', 'x1', 'y0', 'y1', 'r', 'r0', 'r1', 'rot', 'alpha', 'v', 'look', 'f', 'len', 'amp', 'open', 'shake', 'hy', 'gy', 'total', 'size']);

function coerceNums(o) {
  if (Array.isArray(o)) {
    o.forEach((v, i) => {
      if (v && typeof v === 'object') coerceNums(v);
      else if (typeof v === 'string' && v.trim() !== '' && isFinite(+v) && o.length <= 2) o[i] = +v;
    });
    return;
  }
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v && typeof v === 'object') coerceNums(v);
    else if (NUMK.has(k) && typeof v === 'string' && v.trim() !== '' && isFinite(+v)) o[k] = +v;
  }
}

const asArr = v => (Array.isArray(v) ? v : v == null ? [] : [v]);

function fixStory(st, look) {
  if (!st || typeof st !== 'object' || !Array.isArray(st.scenes)) return st;
  coerceNums(st);
  let cur = 0;

  st.scenes = st.scenes.filter(s => s && typeof s === 'object').map(s => {
    let d = (typeof s.t0 === 'number' && typeof s.t1 === 'number' ? s.t1 - s.t0 : 0);
    if (!(d > 0.5)) d = 4;

    s.t0 = +cur.toFixed(2);
    s.t1 = +(cur + d).toFixed(2);
    cur = s.t1;

    s.props = asArr(s.props).filter(p =>
      p && p.type !== 'emoji' &&
      SCHEMA.SET.prop.has(p.type) &&
      typeof p.x === 'number' &&
      typeof p.y === 'number'
    );

    s.actors = asArr(s.actors).filter(a =>
      a && typeof a.x === 'number' && typeof a.y === 'number'
    );

    s.actors.forEach(a => {
      a.seq = asArr(a.seq).filter(q => q && typeof q === 'object' && typeof q.t === 'number');
      a.bubbles = asArr(a.bubbles).filter(q => q && typeof q === 'object');

      if (!(Array.isArray(a.talk) && a.talk.length === 2 && a.talk.every(n => typeof n === 'number'))) {
        delete a.talk;
      }

      if (a.to && typeof a.to !== 'object') delete a.to;
      if (typeof a.h !== 'number') a.h = 520;
    });

    if (s.cam && (typeof s.cam !== 'object' || Array.isArray(s.cam))) delete s.cam;
    if (s.look && !SCHEMA.SET.look.has(s.look)) delete s.look;
    if (s.tr && !SCHEMA.SET.tr.has(s.tr)) delete s.tr;

    s.fx = asArr(s.fx).filter(f => SCHEMA.SET.fx.has(f));

    if (s.caption == null) delete s.caption;
    else s.caption = String(s.caption);

    if (s.scenery !== 'room' && !(Array.isArray(s.bg) && s.bg.length >= 2)) {
      s.bg = ['#7ec8ff', '#eaf7ff'];
    }

    s.props.forEach(p => {
      if (typeof p.s !== 'number') p.s = 240;
    });

    return s;
  });

  st.total = +cur.toFixed(2);
  st.style = st.style || {};
  delete st.style.caption;

  if (look && SCHEMA.SET.look.has(look)) st.style.look = look;
  else if (!SCHEMA.SET.look.has(st.style.look)) st.style.look = 'cartoon';

  st.sfx = asArr(st.sfx).filter(x =>
    x && typeof x.t === 'number' &&
    x.t >= 0 && x.t <= st.total &&
    SCHEMA.SET.sfx.has(x.type)
  );

  st.sfx.forEach(x => {
    if (x.type === 'ping' && !(x.f > 0)) x.f = 880;
    if (x.type === 'thud' && !(x.f > 0)) x.f = 70;
    if (x.type === 'rumble' && !(x.len > 0)) x.len = 1.5;
  });

  return st;
}

const httpErr = (code, msg) => ({ code, msg });

async function callCloudflare({ key, model, messages, maxTokens }) {
  const accountId = CLOUDFLARE_ACCOUNT_ID;
  const token = CLOUDFLARE_API_TOKEN || key;

  if (!accountId) {
    throw httpErr(500, 'Configure CLOUDFLARE_ACCOUNT_ID nas variáveis de ambiente.');
  }

  if (!token) {
    throw httpErr(500, 'Informe o token da Cloudflare na API Key do site ou configure CLOUDFLARE_API_TOKEN.');
  }

  if (!model) {
    throw httpErr(500, 'Selecione um modelo da Cloudflare no painel do site.');
  }

  const url = `${CLOUDFLARE_BASE_URL}/${accountId}/ai/v1/chat/completions`;

  const body = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' }
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 90e3);
    let r, j = {};

    try {
      r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: ctl.signal
      });

      try {
        j = await r.json();
      } catch {}
    } catch (e) {
      throw httpErr(
        504,
        e.name === 'AbortError'
          ? 'A Cloudflare demorou demais para responder. Tente novamente.'
          : 'Não foi possível conectar à Cloudflare.'
      );
    } finally {
      clearTimeout(timer);
    }

    if (r.ok) {
      const content = j.choices?.[0]?.message?.content;

      if (typeof content === 'string' && content.length) return content;
      if (content && typeof content === 'object') return JSON.stringify(content);

      throw httpErr(502, 'A Cloudflare não retornou o conteúdo esperado.');
    }

    const msg =
      j.error?.message ||
      j.errors?.map(e => e.message).filter(Boolean).join('; ') ||
      j.message ||
      '';

    if (r.status === 400 && /response_format|json/i.test(msg) && body.response_format) {
      delete body.response_format;
      continue;
    }

    if (r.status === 401 || r.status === 403) {
      throw httpErr(502, 'Token recusado pela Cloudflare. Confira o token e as permissões Workers AI.');
    }

    if (r.status === 404 || (r.status === 400 && /model/i.test(msg))) {
      throw httpErr(502, 'Modelo da Cloudflare não encontrado ou indisponível: ' + msg);
    }

    if (r.status === 429) {
      throw httpErr(429, 'A Cloudflare atingiu o limite de requisições ou Neurons. Tente novamente mais tarde.');
    }

    throw httpErr(502, 'Erro da Cloudflare (' + r.status + '): ' + (msg || 'sem detalhes'));
  }

  throw httpErr(502, 'A Cloudflare não respondeu corretamente.');
}

function parseModelJson(txt) {
  const t = String(txt).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  try {
    return JSON.parse(t);
  } catch {}

  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {}
  }

  return null;
}

async function generate({ key, model, maxTokens, idea, seconds, look }) {
  // O modelo continua vindo da configuração do site, igual acontecia com a Groq.
  const selectedModel = model || process.env.CLOUDFLARE_MODEL;

  const messages = [
    { role: 'system', content: systemPrompt({ seconds, look }) },
    { role: 'user', content: 'Ideia do vídeo:\n' + idea }
  ];

  let out = null, issues = [], raw = '';

  for (let round = 0; round < 2; round++) {
    raw = await callCloudflare({
      key,
      model: selectedModel,
      messages,
      maxTokens
    });

    const obj = parseModelJson(raw);

    if (!obj || !obj.story) {
      messages.push(
        { role: 'assistant', content: raw.slice(0, 4000) },
        { role: 'user', content: 'Sua resposta não foi um JSON válido com as chaves titulo, roteiro e story. Responda de novo, só com o JSON.' }
      );
      continue;
    }

    obj.story = fixStory(obj.story, look);
    issues = SCHEMA.validateStory(obj.story);

    const sc = obj.story.scenes || [];
    const withCap = sc.filter(s => s.caption && s.caption.trim()).length;

    if (sc.length < 3 || withCap < sc.length * 0.6) {
      issues.push({
        level: 'erro',
        path: 'scenes',
        msg: 'Poucas cenas (mínimo 3) ou cenas sem caption com o trecho do roteiro.'
      });
    }

    out = obj;
    const errs = issues.filter(i => i.level === 'erro');

    if (!errs.length) break;

    messages.push(
      { role: 'assistant', content: raw.slice(0, 12000) },
      {
        role: 'user',
        content: 'Há erros no story. Corrija e devolva o JSON completo de novo:\n' +
          errs.slice(0, 8).map(e => `- ${e.path}: ${e.msg}`).join('\n')
      }
    );
  }

  if (!out) {
    throw httpErr(502, 'A IA não devolveu um JSON utilizável. Tente reformular a ideia.');
  }

  const errs = issues.filter(i => i.level === 'erro');

  if (errs.length) {
    throw httpErr(502, 'A IA gerou uma história com erros (' + errs[0].path + ': ' + errs[0].msg + '). Tente de novo.');
  }

  const roteiro = String(
    out.roteiro ||
    out.story.scenes.map(s => s.caption).filter(Boolean).join(' ')
  ).trim();

  return {
    title: String(out.titulo || 'Sem título').slice(0, 80),
    script: roteiro,
    story: out.story,
    issues
  };
}

module.exports = { generate, fixStory, systemPrompt };
