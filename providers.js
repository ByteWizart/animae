// Catálogo de provedores de IA com plano gratuito. Todos falam o formato "chat/completions" da OpenAI,
// então o mesmo código atende a todos. Só roda no servidor (as chaves nunca vão para o navegador).
//
// Os planos gratuitos mudam sem aviso: se um modelo sumir, troque o nome em Admin > IA (campo "Modelo").
// Cada provedor pode ter a chave por variável de ambiente (prioridade) ou salva no painel.
//
// tpm = tokens por minuto que o site assume para o plano grátis (o prompt é compactado para caber).
// tune(body, model) = ajustes opcionais do corpo do pedido, específicos do provedor.

const PROVIDERS = {
  groq: {
    label: 'Groq', env: ['GROQ_API_KEY'], signup: 'https://console.groq.com/keys',
    url: process.env.GROQ_URL || 'https://api.groq.com/openai/v1/chat/completions',
    model: 'openai/gpt-oss-120b', models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    tpm: 8000, free: 'Grátis, sem cartão. Muito rápido, mas só ~8.000 tokens por minuto no gpt-oss-120b.',
    tune(b, m) { if (/gpt-oss/i.test(m)) { b.reasoning_effort = 'low'; b.include_reasoning = false; } },
  },
  zai: {
    label: 'Z.ai (GLM)', env: ['ZAI_API_KEY', 'Z_AI_API_KEY'], signup: 'https://z.ai/manage-apikey/apikey-list',
    url: 'https://api.z.ai/api/paas/v4/chat/completions',
    model: 'glm-4.7-flash', models: ['glm-4.7-flash', 'glm-4.5-flash', 'glm-4.7', 'glm-4.6'],
    tpm: 60000, free: 'Modelos Flash grátis, sem cartão. Só 1 pedido por vez: com vários visitantes, use outro provedor de reserva.',
    tune(b) { b.thinking = { type: 'disabled' }; }, // GLM "pensa" por padrão; desligado fica bem mais rápido e gasta menos
  },
  gemini: {
    label: 'Google Gemini', env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], signup: 'https://aistudio.google.com/apikey',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.5-flash', models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
    tpm: 200000, free: 'Plano grátis generoso no Google AI Studio, sem cartão. Limites por minuto e por dia dependem do modelo.',
    tune(b) { b.reasoning_effort = 'low'; },
  },
  cerebras: {
    label: 'Cerebras', env: ['CEREBRAS_API_KEY'], signup: 'https://cloud.cerebras.ai',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    model: 'gpt-oss-120b', models: ['gpt-oss-120b', 'llama-3.3-70b', 'qwen-3-32b'],
    tpm: 60000, free: 'Grátis, sem cartão, extremamente rápido e com cota diária grande.',
    tune(b, m) { if (/gpt-oss/i.test(m)) b.reasoning_effort = 'low'; },
  },
  openrouter: {
    label: 'OpenRouter', env: ['OPENROUTER_API_KEY'], signup: 'https://openrouter.ai/keys',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'z-ai/glm-4.7-flash:free', models: ['z-ai/glm-4.7-flash:free', 'openai/gpt-oss-120b:free', 'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen3-coder:free'],
    tpm: 40000, free: 'Dezenas de modelos com sufixo :free (cerca de 20 pedidos por minuto e 50 por dia; 1.000 por dia após colocar US$ 10 de crédito).',
    headers: { 'X-Title': 'Shorts Animados' },
  },
  mistral: {
    label: 'Mistral', env: ['MISTRAL_API_KEY'], signup: 'https://console.mistral.ai/api-keys',
    url: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-small-latest', models: ['mistral-small-latest', 'mistral-medium-latest', 'open-mistral-nemo'],
    tpm: 50000, free: 'Plano "Experiment" grátis (pede telefone e aceitar o uso dos dados para treino). Cerca de 1 pedido por segundo.',
  },
  nvidia: {
    label: 'NVIDIA NIM', env: ['NVIDIA_API_KEY'], signup: 'https://build.nvidia.com/settings/api-keys',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    model: 'openai/gpt-oss-120b', models: ['openai/gpt-oss-120b', 'meta/llama-3.3-70b-instruct', 'deepseek-ai/deepseek-v3.1', 'z-ai/glm-4.7'],
    tpm: 40000, free: 'Catálogo enorme, ~40 pedidos por minuto, sem cartão (pede verificação por telefone). Bom para uso de teste.',
  },
  github: {
    label: 'GitHub Models', env: ['GITHUB_MODELS_TOKEN', 'GITHUB_TOKEN'], signup: 'https://github.com/settings/personal-access-tokens',
    url: 'https://models.github.ai/inference/chat/completions',
    model: 'openai/gpt-4.1-mini', models: ['openai/gpt-4.1-mini', 'openai/gpt-4.1', 'meta/llama-3.3-70b-instruct', 'deepseek/deepseek-v3-0324'],
    tpm: 8000, free: 'Grátis com sua conta do GitHub (token com permissão "models"). Limite de tokens por pedido pequeno.',
  },
  sambanova: {
    label: 'SambaNova', env: ['SAMBANOVA_API_KEY'], signup: 'https://cloud.sambanova.ai/apis',
    url: 'https://api.sambanova.ai/v1/chat/completions',
    model: 'Meta-Llama-3.3-70B-Instruct', models: ['Meta-Llama-3.3-70B-Instruct', 'DeepSeek-V3.1', 'gpt-oss-120b'],
    tpm: 20000, free: 'Plano grátis com limite por minuto baixo; ótimo como reserva.',
  },
  huggingface: {
    label: 'Hugging Face', env: ['HF_TOKEN', 'HUGGINGFACE_API_KEY'], signup: 'https://huggingface.co/settings/tokens',
    url: 'https://router.huggingface.co/v1/chat/completions',
    model: 'openai/gpt-oss-120b', models: ['openai/gpt-oss-120b', 'meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen3-235B-A22B-Instruct-2507', 'zai-org/GLM-4.7'],
    tpm: 20000, free: 'Crédito grátis mensal para quem tem conta (token com permissão de "Inference Providers").',
  },
  ollama: {
    label: 'Ollama (no seu PC)', env: [], keyless: true, signup: 'https://ollama.com/download', editableUrl: true,
    url: 'http://localhost:11434/v1/chat/completions',
    model: 'llama3.1', models: ['llama3.1', 'qwen3', 'gpt-oss:20b', 'glm-4.7-flash'],
    tpm: 200000, free: '100% grátis e offline, sem chave: roda modelos no seu computador (qualidade e velocidade dependem da máquina).',
  },
  custom: {
    label: 'Outro (compatível com OpenAI)', env: ['CUSTOM_API_KEY'], editableUrl: true, keyOptional: true,
    url: '', model: '', models: [],
    tpm: 30000, free: 'Qualquer serviço que aceite o formato da OpenAI (LM Studio, vLLM, Together, DeepInfra, Cloudflare Workers AI...). Informe o endereço completo terminando em /chat/completions.',
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

module.exports = { PROVIDERS, IDS, isId, validUrl };
