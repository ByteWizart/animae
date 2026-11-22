# Gerador de Shorts Animados (no navegador, sem API paga)

Pasta única, sem subpastas. A única dependência é a opcional `msedge-tts` (voz com IA): rode `npm install` uma vez. Sem ela, tudo funciona, menos a voz com IA.

| Arquivo | Para que serve |
|---|---|
| index.html | O gerador de vídeo |
| docs.html | Documentação (guia, referência do JSON, solução de problemas), em `/docs` |
| admin.html | Painel administrativo, em endereço secreto (IA, padrões, histórico, segurança) |
| ai.js | Integração com a IA (roteiro + JSON a partir da ideia do usuário), com troca automática de provedor |
| providers.js | Catálogo dos provedores de IA grátis (Groq, Z.ai, Gemini, Cerebras, OpenRouter...) |
| server.js | Servidor local + API do Admin |
| schema.js | Catálogo do formato de história e validador (usado por Docs, Admin e servidor) |
| tts.js | Voz com IA (texto do roteiro vira narração em MP3) |
| audio.js | Trilha e efeitos sonoros gerados por código |
| ui.css | Estilos compartilhados |
| PROMPT-MOVIMENTOS.md | Bloco para colar no seu prompt de IA |
| historia-teste.json | História de exemplo simples |
| historia-demo-v9.json | História de 30 s que mostra os recursos novos (rua em movimento, gráfico, chat, glitch, holofote, palco...). Carregue em Avançado > Carregar história |
| dados.json | Criado automaticamente: configurações, chaves de IA, histórico, senha (com hash) e endereço do painel. Não compartilhe |

## Como usar

1. Instale o Node.js **18 ou mais novo**.
2. Na pasta, rode `npm install` (só na primeira vez) e depois `node server.js` (o terminal mostra os endereços, a senha inicial do painel e o endereço secreto).
3. Abra http://localhost:3000 no Chrome ou Edge (PC) e aperte Ctrl+F5. O rodapé deve mostrar "build 9".
4. **Criar com IA**: descreva a ideia; a IA escreve o roteiro e o JSON. Grave a voz, carregue o áudio, "Ajustar ao áudio", "Prévia" e "Gerar vídeo" (aba aberta e visível: a gravação é em tempo real).
5. O arquivo é baixado sozinho (short.mp4 ou short.webm).

## Ativar a IA (vários provedores grátis)

O site fala com qualquer provedor que aceite o formato de chat da OpenAI. Já vêm configurados:

| Provedor | Variável de ambiente | Onde criar a chave | Modelo padrão |
|---|---|---|---|
| Groq | `GROQ_API_KEY` | console.groq.com | `openai/gpt-oss-120b` |
| **Z.ai (GLM)** | `ZAI_API_KEY` | z.ai (API keys) | `glm-4.7-flash` |
| Google Gemini | `GEMINI_API_KEY` | aistudio.google.com/apikey | `gemini-2.5-flash` |
| Cerebras | `CEREBRAS_API_KEY` | cloud.cerebras.ai | `gpt-oss-120b` |
| OpenRouter | `OPENROUTER_API_KEY` | openrouter.ai/keys | `z-ai/glm-4.7-flash:free` |
| Mistral | `MISTRAL_API_KEY` | console.mistral.ai | `mistral-small-latest` |
| NVIDIA NIM | `NVIDIA_API_KEY` | build.nvidia.com | `openai/gpt-oss-120b` |
| GitHub Models | `GITHUB_MODELS_TOKEN` | token do GitHub com permissão "models" | `openai/gpt-4.1-mini` |
| SambaNova | `SAMBANOVA_API_KEY` | cloud.sambanova.ai | `Meta-Llama-3.3-70B-Instruct` |
| Hugging Face | `HF_TOKEN` | huggingface.co/settings/tokens | `openai/gpt-oss-120b` |
| Ollama (no seu PC) | sem chave | ollama.com | `llama3.1` |
| Outro (compatível com OpenAI) | `CUSTOM_API_KEY` | LM Studio, vLLM, Together, Cloudflare Workers AI... | o que você informar |

- Informe a chave por variável de ambiente (prioridade) ou em **Admin > IA**. As chaves ficam só no servidor.
- Em **Admin > IA** escolha o provedor **principal** e os de **reserva**. Se o principal estourar o limite grátis, recusar a chave, cair ou demorar demais, o site passa sozinho para a reserva. Pedidos grandes são enviados só a provedores com cota suficiente.
- Se o principal não tiver chave mas outro provedor tiver, o site usa o que estiver pronto (ex.: só `ZAI_API_KEY` definida já basta).
- **Salvar e testar** confirma que chave e modelo funcionam. O campo **Modelo** aceita qualquer nome: os planos grátis mudam sem aviso, então se um modelo sumir é só trocar.
- **TPM** (tokens por minuto) é o limite do seu plano; o prompt é compactado e a duração do vídeo reduzida para caber. Cada provedor traz um valor padrão que você pode ajustar.
- A **Z.ai** libera os modelos Flash de graça, mas só com 1 pedido por vez: com vários visitantes ao mesmo tempo, deixe um provedor de reserva.
- Há limite de gerações por hora por IP (padrão 20) para proteger a cota.
- O servidor valida o JSON da IA e pede uma correção automática se vier com erro.
- Quem usava só a Groq não precisa fazer nada: a chave e o modelo antigos são migrados sozinhos para o provedor Groq.

## Páginas

- **/** Gerador, com "Criar com IA" e "Minha biblioteca".
- **/docs** Documentação (referência gerada do `schema.js`). O endereço antigo `/ajuda` redireciona para ela.
- **Painel administrativo**: **não tem link em nenhuma página** e `/admin` não existe. O endereço aleatório (ex.: `/painel-1a2b3c4d5e`) aparece no terminal a cada início. Troque em Segurança ou defina `ADMIN_PATH=meu-caminho`. Abas: Painel, IA, Padrões, Histórico, Segurança.

## Biblioteca do usuário

Fica no **localStorage do navegador de cada pessoa** (não existe no servidor). Guarda história + roteiro; tem abrir, baixar JSON, renomear, excluir e exportar/importar backup.

## Senha do painel

- Na primeira execução, uma senha aleatória aparece **uma vez** no terminal. Troque em Segurança.
- Alternativa: `ADMIN_PASSWORD=minhasenha node server.js` (prioridade).
- Esqueceu? Apague `dados.json` (apaga as chaves de IA, histórico e senha) e reinicie.
- Sessão de 8 h; trava de 1 min após 5 erros.

## Outras observações

- Porta diferente: `PORT=4000 node server.js`.
- O seletor de estilo grava "style.look" no JSON. Dá para trocar o estilo de uma cena só com "look" dentro da cena.
- "Ajustar ao áudio" reescala os tempos das cenas para a duração da voz. "Detectar pausas" lista os silêncios da voz.
- Se o gerador for aberto sem o servidor (só o arquivo index.html), ele funciona igual, mas sem IA, painel e histórico.


## Novidades do build 9

**IA (prompt e fluxo)**
- Prompt reescrito: a IA primeiro planeja (conceito, elenco, paleta, motivo visual, batidas) e só depois escreve roteiro e história; recebe o catálogo completo, regras de direção (ritmo, câmera, emoção → recursos, dados → gráficos, som) e exemplos de cena.
- Opções: formato (14), tom (9), idioma (6), trilha, número de personagens. Texto longo na ideia vira resumo em short.
- Pacote de publicação: 3 títulos, descrição, hashtags, direção de voz, texto de miniatura e lista de fatos a conferir.
- Novos botões: **Sugerir ideias**, **Copiar prompt para outra IA**, **Melhorar com a IA** (atalhos ou texto livre), **Avaliar a direção** (nota, problemas por cena, aplicar melhorias) e **Traduzir** (mantém tempos).
- Pós-processamento automático: corrige coordenadas e tipos, tira texto da faixa da legenda, garante câmera, varia transições, adiciona sons nas trocas de cena e dá mais tempo a cenas com fala rápida.
- Painel: campo "Instruções extras para a IA" (estilo da casa).

**Motor de desenho**
- 98 objetos (eram 24): gráficos (barra, linha, pizza, rosca), contador, medidor, termômetro, lista, conversa de celular, notificação, manchete, carimbo, balão de anotação, móveis, símbolos, veículos, animais, comida e mais.
- 20 cenários (eram 6), 21 efeitos (eram 6), 16 transições (eram 5), 34 animações (eram 14), 14 humores (eram 7).
- Personagens: 15 chapéus, 11 cabelos, 17 roupas, 21 itens de mão, capa, tom de pele, etiqueta de nome e item na mão esquerda.
- Recursos de cena: título animado, terceiro inferior, holofote, barras de cinema, soco de zoom, clarões, tremores, fundo em movimento (scroll) e câmera na mão.
- Som: 8 trilhas (calma, alegre, tensa, épica, mistério, triste, lo-fi, retrô) e 33 efeitos.
- **Ajustar ao áudio** agora alinha os cortes às pausas reais da voz, reescala os tempos internos das cenas e sincroniza a boca do 1º personagem com a fala.

**Limite de tokens por minuto (Groq)**
- O plano gratuito do `openai/gpt-oss-120b` aceita ~8.000 tokens por minuto (pedido + resposta). O site calcula o tamanho do prompt, compacta o catálogo quando preciso, ajusta o teto de resposta e, se necessário, reduz a duração (avisando na tela). Se a Groq ainda recusar, o servidor reduz a resposta e repete, ou espera o tempo indicado.
- Com um plano com mais cota (ou outro provedor), ajuste **Tokens por minuto (TPM)** no painel (aba IA): o prompt completo, com exemplos, e vídeos de 45 a 60 s passam a ser usados.


## Novidades do build 10: voz com IA

- Em **Roteiro e voz** há o bloco **Voz com IA**: escolha a voz, a velocidade e o tom e clique em **Gerar voz com IA**. O texto do roteiro vira um MP3 que já fica carregado como narração (depois: Ajustar ao áudio, Prévia, Gerar vídeo). Dá para ouvir e baixar o MP3. Enviar a própria gravação continua funcionando.
- Usa as vozes neurais do serviço "Read Aloud" do Microsoft Edge via `msedge-tts`: não precisa de chave de API e não conta tokens. Textos longos são divididos em trechos e juntados.
- Limites de proteção do seu servidor (ajustáveis em `dados.json` ou por `PUT /api/admin/tts`): 60 vozes por hora por IP, 3 gerações ao mesmo tempo, 6000 caracteres por pedido.
- Rotas: `GET /api/tts/status`, `GET /api/tts/voices`, `POST /api/tts` (`{text, voice, rate, pitch}` devolve `audio/mpeg`).
- Aviso: é um serviço **não oficial**. Pode mudar ou bloquear sem aviso e os termos da Microsoft não preveem esse uso de forma explícita. Para uso comercial ou para algo que nunca pode falhar, troque por Azure Speech ou Google Cloud TTS (têm cota grátis mensal, mas com chave e limite).

### Biblioteca de ícones online (também no build 10)

- Novo objeto de cena **`icon`**: `{"type":"icon","q":"rocket","x":540,"y":800,"s":260}` (use `q` com 1–2 palavras em inglês) ou `{"type":"icon","id":"noto:locomotive"}` para um ícone exato. Serve para qualquer coisa que os 98 objetos desenhados em código não cobrem. A IA do Groq passou a usá-lo sozinha quando o catálogo não tem o objeto.
- Fonte: API pública do **Iconify** (`api.iconify.design`), sem chave de API. A busca prefere o conjunto *Noto* (emojis coloridos do Google, estilo consistente) e cai para Fluent Emoji Flat, Twemoji, OpenMoji e Flat Color Icons.
- O servidor faz de proxy e guarda cada ícone em `.cache-icones/` (pasta oculta, não é servida): só a primeira vez usa internet, depois funciona offline. O gerador baixa os ícones antes de gravar o vídeo.
- Precisa abrir o site pelo servidor (`node server.js`). Se o ícone não carregar, o objeto simplesmente não aparece e o log avisa.
- Licenças: cada conjunto tem a sua (Noto: Apache 2.0; Twemoji: CC BY 4.0, exige crédito; OpenMoji: CC BY-SA 4.0). Confira antes de publicar de forma comercial.

### Qualidade dos vídeos (também no build 10)

- **Marcos e obras desenhados em código:** `pisa` (Torre de Pisa), `eiffel`, `pyramid` e `crane`. A Torre de Pisa aceita `lean` (inclinação em rad: 0 reta, 0.07 realista, 0.1 bem torta) e `lean2` + `leanAt` + `leanDur` para **entortar ou endireitar durante a cena**. A IA do Groq já sabe usar esses objetos.
- **Enquadramento automático:** ao ler a história, o gerador move personagens parados que ficariam cortados pela câmera e afasta os que estão colados (as etiquetas dos nomes não se sobrepõem). O log avisa quando corrige algo.
- **Correções:** cenários como `city`, `night` e `space` não quebram mais quando a cena não traz `bg`; colar o JSON completo da IA (plano, roteiro, story, publicacao) agora funciona e preenche o roteiro; `total` ausente ou 0 é recalculado; a duração inválida mostra uma mensagem em vez de erro técnico.
- **Dica para etiquetas:** use nomes curtos nos personagens (ex.: "Zé"), porque a etiqueta cresce com o nome.
