// Catálogo de provedores de IA: Groq, Google Gemini, LLM7.io e "Outro" (qualquer serviço compatível com a API da OpenAI,
// que é a aba para colocar outras APIs). Todos falam o formato "chat/completions", então o mesmo código atende a todos.
// Só roda no servidor (as chaves nunca vão para o navegador).
//
// O campo "Modelo" aceita QUALQUER nome (a lista abaixo é só sugestão) e o painel tem o botão "Carregar modelos",
// que pergunta ao próprio provedor quais modelos existem agora. Cada provedor aceita "modelos de reserva".
// O provedor padrão, o modelo de cada provedor, os reservas, o TPM e o endereço do "Outro" ficam salvos no Supabase
// (tabela ai_config, veja supabase-schema.sql). As chaves NÃO vão para o banco: use variável de ambiente ou o painel.
//
// tpm = tokens por minuto que o site assume para o plano grátis (o prompt é compactado para caber).
// tune(body, model) = ajustes opcionais do corpo do pedido, específicos do provedor.
// families = famílias de IA que o provedor oferece (aparecem como etiquetas no painel).
// editableUrl = o endereço (/chat/completions) pode ser informado no painel.

const PROVIDERS = {
  gemini: {
    label: 'Google Gemini', families: ['Gemini', 'Gemma'], env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], signup: 'https://aistudio.google.com/apikey',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.5-flash', models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemma-3-27b-it'],
    tpm: 200000, free: 'Só com conta Google, sem cartão. É a cota grátis mais generosa; os limites por minuto e por dia dependem do modelo (aparecem no AI Studio).',
    tune(b, m) { if (/gemini-(2\.5|3)/i.test(m)) b.reasoning_effort = 'low'; },
  },
  groq: {
    label: 'Groq', families: ['GPT-OSS', 'Qwen', 'Llama'], env: ['GROQ_API_KEY'], signup: 'https://console.groq.com/keys',
    url: process.env.GROQ_URL || 'https://api.groq.com/openai/v1/chat/completions',
    model: 'openai/gpt-oss-120b', models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
    tpm: 8000, free: 'Sem cartão. Muito rápido, mas só ~8.000 tokens por minuto (cota por modelo: use modelos de reserva para somar cotas).',
    tune(b, m) { if (/gpt-oss/i.test(m)) { b.reasoning_effort = 'low'; b.include_reasoning = false; } },
  },
  llm7: {
    label: 'LLM7.io', families: ['Mistral', 'Qwen', 'GLM', 'Nemotron'], env: ['LLM7_API_KEY'], keyOptional: true, signup: 'https://token.llm7.io',
    url: 'https://api.llm7.io/v1/chat/completions',
    model: 'default', models: ['default', 'fast', 'pro'],
    tpm: 15000, free: 'Serviço comunitário grátis, funciona até sem chave (com chave os limites sobem). Limites baixos e podem mudar sem aviso: use só como reserva.',
  },
  custom: {
    label: 'Outro (compatível com OpenAI)', families: ['qualquer modelo'], env: ['CUSTOM_API_KEY'], editableUrl: true, keyOptional: true,
    url: '', model: '', models: [],
    tpm: 30000, free: 'Qualquer serviço que aceite o formato da OpenAI (LM Studio, vLLM, Kilo, Together, DeepInfra...). Informe o endereço completo terminando em /chat/completions e o nome do modelo.',
  },
};

const IDS = Object.keys(PROVIDERS);
const isId = id => Object.prototype.hasOwnProperty.call(PROVIDERS, id);

// Aceita só http(s); http apenas para o próprio computador/rede local (evita chave em texto puro pela internet).
// Precisa ser um IP literal (ou "localhost"): um nome como "10.evil.com" ou "localhost.evil.com" NÃO é rede local.
const net = require('net');
function isLocalHost(h) {
  h = String(h || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  const v = net.isIP(h);
  if (v === 4) { const [a, b] = h.split('.').map(Number); return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31); }
  if (v === 6) return h === '::1' || /^f[cd][0-9a-f]{2}:/.test(h);
  return false;
}
function validUrl(u) {
  try {
    const x = new URL(String(u).trim());
    if (x.username || x.password) return ''; // sem usuário:senha embutido no endereço
    if (x.protocol === 'https:') return x.toString();
    if (x.protocol === 'http:' && isLocalHost(x.hostname)) return x.toString();
  } catch {}
  return '';
}

// Nome de modelo: aceita qualquer coisa razoável (letras, números, / : @ . _ + - e espaços internos não).
const validModel = m => /^[^\s"'<>\\`]{1,160}$/.test(String(m || ''));

// Endereço da lista de modelos (GET /models) de um provedor, a partir do endereço do chat.
const modelsUrl = (P, chatUrl) => P.modelsUrl || String(chatUrl || '').replace(/\/chat\/completions\/?$/, '/models');

module.exports = { PROVIDERS, IDS, isId, validUrl, validModel, modelsUrl };
