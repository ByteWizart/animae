// Catálogo de provedores de IA com plano GRATUITO PERMANENTE: só entram serviços que liberam uma chave sem cartão
// e sem recarga (nada de "crédito de teste" que acaba). Todos falam o formato "chat/completions" da OpenAI,
// então o mesmo código atende a todos. Só roda no servidor (as chaves nunca vão para o navegador).
//
// Os planos gratuitos mudam sem aviso. Por isso:
//  - o campo "Modelo" aceita QUALQUER nome (a lista abaixo é só sugestão);
//  - o painel tem o botão "Carregar modelos", que pergunta ao próprio provedor quais modelos existem agora;
//  - cada provedor aceita "modelos de reserva": se um modelo sumir ou estourar o limite, o próximo é usado.
//
// Cada provedor pode ter a chave por variável de ambiente (prioridade) ou salva no painel.
// tpm = tokens por minuto que o site assume para o plano grátis (o prompt é compactado para caber).
// tune(body, model) = ajustes opcionais do corpo do pedido, específicos do provedor.
// families = famílias de IA que o provedor oferece (aparecem como etiquetas no painel).
// onlyFree = ao listar modelos, mostrar só os gratuitos (OpenRouter). account = precisa do ID da conta (Cloudflare).

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
  openrouter: {
    label: 'OpenRouter', families: ['Llama', 'DeepSeek', 'Qwen', 'Gemma', 'Nemotron'], env: ['OPENROUTER_API_KEY'], signup: 'https://openrouter.ai/keys',
    url: 'https://openrouter.ai/api/v1/chat/completions', onlyFree: true,
    model: 'openrouter/free', models: ['openrouter/free'],
    tpm: 30000, free: 'Sem cartão. Dezenas de modelos com sufixo :free, de várias empresas (cerca de 20 pedidos por minuto e 50 por dia). O modelo "openrouter/free" escolhe sozinho um modelo grátis disponível.',
    headers: { 'X-Title': 'Shorts Animados' },
  },
  cloudflare: {
    label: 'Cloudflare Workers AI', families: ['Llama', 'GPT-OSS', 'Qwen', 'Gemma'], env: ['CLOUDFLARE_API_TOKEN', 'CF_API_TOKEN'], signup: 'https://dash.cloudflare.com/profile/api-tokens',
    account: true, accountEnv: ['CLOUDFLARE_ACCOUNT_ID', 'CF_ACCOUNT_ID'], accountHelp: 'https://dash.cloudflare.com (o ID da conta aparece na barra lateral do painel)',
    url: 'https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1/chat/completions',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', models: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/openai/gpt-oss-120b', '@cf/openai/gpt-oss-20b', '@cf/meta/llama-3.1-8b-instruct'],
    tpm: 20000, free: 'Sem cartão: 10.000 "neurons" por dia (renova todo dia). Precisa do token da API (permissão Workers AI) e do ID da conta. Alguns modelos grandes exigem plano pago: troque de modelo se der erro.',
  },
  nvidia: {
    label: 'NVIDIA NIM', families: ['Llama', 'DeepSeek', 'Qwen', 'Kimi', 'Nemotron'], env: ['NVIDIA_API_KEY'], signup: 'https://build.nvidia.com/settings/api-keys',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    model: 'meta/llama-3.3-70b-instruct', models: ['meta/llama-3.3-70b-instruct', 'deepseek-ai/deepseek-v3.1', 'moonshotai/kimi-k2-instruct', 'qwen/qwen3-235b-a22b', 'openai/gpt-oss-120b'],
    tpm: 40000, free: 'Catálogo enorme (cerca de 80 modelos), ~40 pedidos por minuto, sem cartão. Uso permitido para teste e desenvolvimento.',
  },
  mistral: {
    label: 'Mistral', families: ['Mistral', 'Codestral'], env: ['MISTRAL_API_KEY'], signup: 'https://console.mistral.ai/api-keys',
    url: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-small-latest', models: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest', 'codestral-latest', 'open-mistral-nemo'],
    tpm: 50000, free: 'Plano grátis (modo Free) sem cartão, com crédito mensal. No plano grátis, a Mistral pode usar os textos para treino, a menos que você recuse nas configurações.',
  },
  cohere: {
    label: 'Cohere', families: ['Command'], env: ['COHERE_API_KEY', 'CO_API_KEY'], signup: 'https://dashboard.cohere.com/api-keys',
    url: 'https://api.cohere.ai/compatibility/v1/chat/completions',
    model: 'command-a-03-2025', models: ['command-a-03-2025', 'command-r-plus-08-2024', 'command-r-08-2024'],
    tpm: 30000, free: 'Chave de teste grátis, sem cartão: ~1.000 chamadas por mês e uso não comercial. Boa como reserva.',
  },
  zai: {
    label: 'Z.ai (GLM)', families: ['GLM'], env: ['ZAI_API_KEY', 'Z_AI_API_KEY'], signup: 'https://z.ai/manage-apikey/apikey-list',
    url: 'https://api.z.ai/api/paas/v4/chat/completions',
    model: 'glm-4.7-flash', models: ['glm-4.7-flash', 'glm-4.5-flash'],
    tpm: 60000, free: 'Modelos Flash grátis. Só 1 pedido por vez: com vários visitantes ao mesmo tempo, mantenha um provedor de reserva.',
    tune(b) { b.thinking = { type: 'disabled' }; }, // GLM "pensa" por padrão; desligado fica bem mais rápido e gasta menos
  },
  llm7: {
    label: 'LLM7.io', families: ['Mistral', 'Qwen', 'GLM', 'Nemotron'], env: ['LLM7_API_KEY'], keyOptional: true, signup: 'https://token.llm7.io',
    url: 'https://api.llm7.io/v1/chat/completions',
    model: 'default', models: ['default', 'fast', 'pro'],
    tpm: 15000, free: 'Serviço comunitário grátis, funciona até sem chave (com chave os limites sobem). Limites baixos e podem mudar sem aviso: use só como reserva.',
  },
  ollama: {
    label: 'Ollama (no seu PC)', families: ['Llama', 'Qwen', 'Gemma', 'GPT-OSS'], env: [], keyless: true, signup: 'https://ollama.com/download', editableUrl: true,
    url: 'http://localhost:11434/v1/chat/completions',
    model: 'llama3.1', models: ['llama3.1', 'qwen3', 'gemma3', 'gpt-oss:20b'],
    tpm: 200000, free: '100% grátis e offline, sem chave e sem limite: roda os modelos no seu computador (qualidade e velocidade dependem da máquina).',
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
function validUrl(u) {
  try {
    const x = new URL(String(u).trim());
    if (x.protocol === 'https:') return x.toString();
    if (x.protocol === 'http:' && /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i.test(x.hostname)) return x.toString();
  } catch {}
  return '';
}

// Nome de modelo: aceita qualquer coisa razoável (letras, números, / : @ . _ + - e espaços internos não).
const validModel = m => /^[^\s"'<>\\`]{1,160}$/.test(String(m || ''));

// Endereço da lista de modelos (GET /models) de um provedor, a partir do endereço do chat.
const modelsUrl = (P, chatUrl) => P.modelsUrl || String(chatUrl || '').replace(/\/chat\/completions\/?$/, '/models');

module.exports = { PROVIDERS, IDS, isId, validUrl, validModel, modelsUrl };
