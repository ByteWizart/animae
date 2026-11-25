# Animaê: gerador de vídeos animados, verticais 9:16 ou horizontais 16:9 (no navegador, sem API paga)

Organizado em pastas (veja a estrutura abaixo). A única dependência é a opcional `msedge-tts` (voz com IA): rode `npm install` uma vez. Sem ela, tudo funciona, menos a voz com IA.

```
server.js            servidor (ponto de entrada: node server.js)
package.json         dependências
server/              código só do servidor: ai.js, providers.js, supabase.js, tts.js
admin/               painel administrativo (admin.html, servido no endereço secreto)
database/            supabase-schema.sql
public/              tudo o que o navegador recebe
  home.html, index.html, docs.html, favicon.svg
  css/               ui.css
  js/                theme, schema, audio, auth, guia, motor-extra, motor-extra2
  looks/             amostras dos 10 estilos
  exemplos/          histórias de exemplo (.json)
.dados/              criado ao rodar o servidor (configurações e chaves; não compartilhe)
```

| Arquivo | Para que serve |
|---|---|
| public/home.html | Página inicial (`/`): explica o site, os passos, recursos, estilos e perguntas frequentes |
| public/index.html | O gerador de vídeo, em `/gerar` |
| public/js/motor-extra.js | Motor extra (build 12): 29 animações de personagem, 80 objetos, 6 efeitos, 4 transições e 6 cenários. Carregado depois do script do index.html; para acrescentar algo, edite aqui e descreva no schema.js |
| public/js/motor-extra2.js | Motor extra 2 (build 13): objetos `bigtext`, `highlight` e `steps` e pós-efeitos de cinema (vinheta, grão, linhas de monitor, correção de cor, fade e barra de progresso). Carregado depois do motor-extra.js |
| public/js/guia.js | Graveto, o boneco-guia do tutorial (desenhado pelo motor dos vídeos; abre na primeira visita ao gerador) |
| public/docs.html | Documentação (guia, referência do JSON, solução de problemas), em `/docs` |
| admin/admin.html | Painel administrativo, em endereço secreto (IA, padrões, histórico, segurança) |
| server/ai.js | Integração com a IA (roteiro + JSON a partir da ideia do usuário), com troca automática de provedor |
| server/providers.js | Catálogo dos provedores de IA grátis e sem recarga (Gemini, Groq, LLM7 e Outro) |
| server.js | Servidor local + API do Admin |
| public/js/schema.js | Catálogo do formato de história e validador (usado por Docs, Admin e servidor) |
| server/tts.js | Voz com IA (texto do roteiro vira narração em MP3) |
| public/js/audio.js | Trilha e efeitos sonoros gerados por código + análise da voz (`analyzeVoice`: onde há fala e onde há pausa, com limiar adaptativo) |
| public/js/auth.js | Login no navegador (Supabase): janela de entrar/criar conta, sessão e biblioteca na nuvem |
| server/supabase.js | Ponte do servidor com o Supabase (confere o login, grava vídeos, lista usuários) |
| database/supabase-schema.sql | **Único SQL do projeto**: tabelas `videos`, `stories` (RLS por usuário) e `ai_config` (provedor padrão e modelos, só o servidor acessa). Rode uma vez no SQL Editor do Supabase |
| public/js/theme.js | Botão de tema claro/escuro (lua/sol na barra); a escolha fica salva no navegador |
| public/css/ui.css | Estilos compartilhados (visual novo: degradê violeta/rosa/âmbar, claro e escuro automático) |
| public/exemplos/historia-teste.json | História de exemplo simples |
| public/exemplos/historia-demo-v9.json | História de 30 s que mostra os recursos novos (rua em movimento, gráfico, chat, glitch, holofote, palco...). Carregue em Avançado > Carregar história |
| public/exemplos/historia-demo-16x9.json | Exemplo de 18 s no formato horizontal 16:9 (tela de 1920×1080). Carregue em Avançado > Carregar história |
| .dados/dados.json | Criado automaticamente numa pasta escondida que o servidor nunca serve: configurações, chaves de IA, histórico, senha (com hash) e endereço do painel. Não compartilhe. Para mudar o lugar, use DATA_DIR |

## Formato da tela (16:9 e 9:16)

Em **Painel > Padrões > Formato da tela** o administrador escolhe quais formatos o gerador oferece: só vertical 9:16, só horizontal 16:9 ou os dois (com o formato que abre selecionado). Com um só liberado, o seletor some do gerador, a IA monta tudo nesse formato e qualquer história enviada em outro formato é ajustada automaticamente. A regra vale também no servidor (`/api/ai/*`), então não dá para burlá-la pelo navegador. Fica salvo em `settings.aspects` e `settings.aspectDefault`.

## Créditos (cota diária por pessoa)

O gerador tem um sistema de créditos: **cada pessoa ganha 25 créditos por dia** e cada uso de IA ou de voz gasta créditos. Gravar o vídeo no navegador não gasta nada. Tudo é configurado em **Painel > Créditos**: liga/desliga, créditos por dia (quem tem conta e visitantes sem conta, separados) e o custo de cada ação (padrão: gerar roteiro 5, sugerir ideias 1, editar 2, avaliar 1, traduzir 2, gerar voz 3).

Como é protegido (tudo no servidor, o navegador só mostra o saldo):

- O crédito é descontado **antes** de chamar a IA, sem brechas para pedidos simultâneos, e **volta sozinho** se a IA ou a voz falharem. Pedido inválido não gasta.
- Quem tem conta (Supabase) é identificado pelo token conferido no servidor. Sem login, a cota é por IP (IPv6 agrupado pelo prefixo /64); o IP em si nunca é gravado, só um hash com sal.
- A cota do dia **não acumula** e renova à meia-noite no fuso de Brasília (mude com `CREDITS_TZ`, ex.: `America/Manaus`). Créditos de presente dados pelo admin não expiram e só são usados depois da cota do dia.
- O admin pode dar ou tirar créditos de presente (pelo e-mail da conta) e zerar o uso de alguém, na mesma aba. Também há a lista de quem gastou hoje.
- Os saldos ficam em `.dados/dados.json` e só quem usou hoje (ou tem presente) é guardado, então o arquivo não cresce sem parar. Continuam valendo os limites por hora da IA e da voz.

Para uma cota realmente "por usuário", ative o login (Admin > Conta e banco) e, se quiser, exija-o (`REQUIRE_LOGIN=1`): por IP, quem troca de rede ou de VPN ganha uma cota nova, e redes que compartilham o mesmo IP dividem a cota. Com o login obrigatório, e-mail confirmado no Supabase dificulta a criação de várias contas.

## Como usar

1. Instale o Node.js **18 ou mais novo**.
2. Na pasta, rode `npm install` (só na primeira vez) e depois `node server.js` (o terminal mostra os endereços, a senha inicial do painel e o endereço secreto).
3. Abra http://localhost:3000/gerar no Chrome ou Edge (PC) e aperte Ctrl+F5. O rodapé deve mostrar "build 11".
4. **Criar com IA**: descreva a ideia; a IA escreve o roteiro e o JSON. Grave a voz, carregue o áudio, "Ajustar ao áudio", "Prévia" e "Gerar vídeo" (aba aberta e visível: a gravação é em tempo real).
5. O arquivo é baixado sozinho (short.mp4 ou short.webm).

## Ativar a IA (Gemini, Groq, LLM7 e "Outro")

O site fala com qualquer provedor que aceite o formato de chat da OpenAI. O catálogo tem só três provedores prontos, mais o cartão **Outro** para plugar qualquer outra API:

| Provedor | Famílias de IA | Variável de ambiente | Onde criar a chave | Modelo padrão |
|---|---|---|---|---|
| **Google Gemini** | Gemini, Gemma | `GEMINI_API_KEY` | aistudio.google.com/apikey | `gemini-2.5-flash` |
| **Groq** | GPT-OSS, Qwen, Llama | `GROQ_API_KEY` | console.groq.com/keys | `openai/gpt-oss-120b` |
| **LLM7.io** | vários (comunitário) | `LLM7_API_KEY` (opcional) | token.llm7.io | `default` |
| **Outro (compatível com OpenAI)** | qualquer | `CUSTOM_API_KEY` | OpenRouter, Together, Kilo, LM Studio, Ollama, vLLM... | o que você informar (endereço terminando em `/chat/completions`) |

Os limites grátis mudam sem aviso: confira no site de cada provedor.

**Onde fica salvo:** o provedor **padrão**, as **reservas** e, por provedor, o **modelo**, os modelos de reserva, o TPM e o endereço do "Outro" ficam na tabela `ai_config` do Supabase (criada pelo mesmo `supabase-schema.sql`). Para isso o servidor precisa da chave `service_role` (Admin > Conta e banco, ou `SUPABASE_SERVICE_KEY`). Na primeira conexão o servidor cria a linha com a configuração que já estava valendo, e depois o banco manda: reiniciar ou trocar de servidor não perde nada, e mudanças feitas direto no banco valem em até 30 s. **As chaves de API não vão para o banco** (variável de ambiente ou `dados.json`). Sem Supabase, tudo continua só no `dados.json`, como antes.

- Informe a chave por variável de ambiente (prioridade) ou em **Admin > IA**. As chaves ficam só no servidor.
- **Aceita qualquer modelo.** O campo **Modelo** aceita qualquer nome. O botão **Carregar modelos** pergunta ao provedor o que ele oferece agora, com busca; **Usar** troca o modelo e **+ Reserva** adiciona aos modelos de reserva.
- **Modelos de reserva por provedor:** se um modelo sumir ou estourar o limite, o próximo do mesmo provedor é tentado antes de passar a outro provedor. Muitos limites são por modelo, então isso soma cotas.
- Em **Admin > IA** escolha o provedor **principal** e os de **reserva**. Se o principal estourar o limite grátis, recusar a chave, cair ou demorar demais, o site passa sozinho para a reserva. Pedidos grandes são enviados só a provedores com cota suficiente.
- Se o principal não tiver chave mas outro provedor tiver, o site usa o que estiver pronto (ex.: só `GEMINI_API_KEY` definida já basta).
- **Salvar e testar** confirma que chave e modelo funcionam.
- **TPM** (tokens por minuto) é o limite do seu plano; o prompt é compactado e a duração do vídeo reduzida para caber. Cada provedor traz um valor padrão que você pode ajustar.
- A **Groq** só libera ~8.000 tokens por minuto: com vários visitantes, use também o Gemini como reserva.
- Há limite de gerações por hora por IP (padrão 20) para proteger a cota.
- O servidor valida o JSON da IA e pede uma correção automática se vier com erro.
- Configurações antigas continuam valendo (a chave da Groq é migrada sozinha). Provedores que saíram do catálogo (OpenRouter, Cloudflare, NVIDIA, Mistral, Cohere, Z.ai, Ollama...) são apagados do `dados.json` ao iniciar; para usá-los, cadastre-os no cartão **Outro**.

## Login e banco de dados (Supabase)

Com o Supabase configurado, **só quem entrou na conta consegue usar a IA, a voz e gerar vídeos**. O servidor confere o login em cada pedido (IA, voz e histórico respondem 401 sem login) e o botão "Gerar vídeo" abre a janela de entrar. A "Prévia" continua livre.

1. Crie um projeto grátis em supabase.com e, no **SQL Editor**, rode o conteúdo de `supabase-schema.sql` (cria `videos`, `stories` e `ai_config`; nas duas primeiras cada pessoa só vê o que é dela).
2. Informe o **Project URL** e a chave **anon** em **Admin > Conta e banco** (ou `SUPABASE_URL` e `SUPABASE_ANON_KEY`). A chave **service_role** é opcional (`SUPABASE_SERVICE_KEY`): permite listar os usuários no painel. Ela fica só no servidor.
3. Em **Authentication** do Supabase, deixe *Email* ligado e coloque o endereço do seu site em *Site URL* e *Redirect URLs* (necessário para recuperar senha e para o Google). Para o botão do Google, ative o provedor lá e marque a opção no painel.
4. Clique em **Salvar e testar conexão**.

- **O que vai para o banco:** os vídeos gerados (histórico de cada conta) e a **biblioteca de histórias**, que passa a acompanhar a pessoa em qualquer aparelho. Quem já tinha histórias salvas no navegador é perguntado se quer enviá-las para a conta.
- **Limites por conta:** o limite de usos da IA por hora passa a valer por usuário (não mais por IP).
- `REQUIRE_LOGIN=0` deixa o login opcional. Sem Supabase configurado, o site funciona aberto, como antes.
- O painel administrativo continua com a própria senha (separada das contas dos usuários).

## Modo escuro e painel novo

- **Modo escuro:** botão de lua/sol no canto da barra, em todas as páginas. Sem escolha salva, o site segue o tema do sistema.
- **Painel (barra lateral):** Visão geral (vídeos, usos da IA, tempo médio, gráfico dos últimos 14 dias, **saúde dos provedores** com "Testar todos" e interruptor rápido da IA), Provedores de IA, **Atividade da IA** (últimos 200 usos: qual IA respondeu, tempo e erros), Padrões, Histórico (com **busca e paginação**) e Segurança.
- **Backup:** em Segurança, baixe as configurações (padrões + IA) com ou sem as chaves e restaure em outro servidor. Há também o botão para copiar o link secreto do painel.

## Páginas

- **/** Início: explica tudo sobre o site.
- **/gerar** Gerador (ideia, roteiro e voz, vídeo), com "Minha biblioteca" e **Avançado** (enviar sua gravação e editar o JSON). O Graveto ensina o uso na primeira visita; o link "Tutorial" da barra abre de novo.
- **/docs** Documentação (referência gerada do `schema.js`). O endereço antigo `/ajuda` redireciona para ela.
- **Painel administrativo**: **não tem link em nenhuma página** e `/admin` não existe. O endereço aleatório (ex.: `/painel-1a2b3c4d5e`) aparece no terminal a cada início. Troque em Segurança ou defina `ADMIN_PATH=meu-caminho`. Abas: Painel, IA, Padrões, Histórico, Segurança.

## Biblioteca do usuário

Fica no **localStorage do navegador de cada pessoa** (não existe no servidor). Guarda história + roteiro; tem abrir, baixar JSON, renomear, excluir e exportar/importar backup.

## Senha do painel

- Na primeira execução, uma senha aleatória aparece **uma vez** no terminal. Troque em Segurança.
- Alternativa: `ADMIN_PASSWORD=minhasenha node server.js` (prioridade).
- Esqueceu? Apague `.dados/dados.json` (apaga as chaves de IA, histórico e senha) e reinicie.
- Sessão de 8 h; trava de 1 min após 5 erros.

## Outras observações

- Porta diferente: `PORT=4000 node server.js`.
- O seletor de estilo grava "style.look" no JSON. Dá para trocar o estilo de uma cena só com "look" dentro da cena.
- "Ajustar ao áudio" reescala os tempos das cenas para a duração da voz. "Detectar pausas" lista os silêncios da voz.
- Se o gerador for aberto sem o servidor (só o arquivo public/index.html), ele funciona igual, mas sem IA, painel e histórico.


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


## Novidades do build 13

- **Motor extra 2 ligado ao gerador:** o `motor-extra2.js` agora é carregado pelo `index.html` (antes ficava de fora) e aparece no schema, nos Docs e no prompt da IA.
- **Objetos novos:** `bigtext` (título grande com contorno e legenda), `highlight` (marca-texto animado) e `steps` (etapas que acendem).
- **Pós-efeitos de cinema:** `vignette`, `grain`, `scanlines`, `grade`, `fadeIn`, `fadeOut` e `progress`, na cena ou em `style`. Histórias sem esses campos saem exatamente como antes.
- **Chaves novas do Supabase:** o site aceita `sb_publishable_...` (no lugar da anon) e `sb_secret_...` (no lugar da service_role), além das antigas `eyJ...`. As novas vão só no cabeçalho `apikey`, porque o Supabase não as aceita como `Authorization: Bearer`.


## Novidades do build 14: voz sincronizada

O "Ajustar ao áudio" foi refeito para casar o vídeo com a fala real, não só com a duração do arquivo:

- **Análise da voz adaptativa** (`analyzeVoice` em `audio.js`): o limiar de silêncio agora é relativo ao volume da própria gravação. Antes era um valor fixo, que errava com voz baixa, alta ou com ruído de fundo.
- **Cortes de cena em pausas reais:** a posição de cada corte é estimada em "segundos de fala" (por sílabas, sem contar as pausas) e depois encaixada nos buracos reais da voz por programação dinâmica, preferindo pausa longa depois de frase terminada. Antes a duração total era dividida por número de letras.
- **Legenda palavra por palavra pela fala** (`capT` na cena): cada palavra aparece quando é falada, respeitando as pausas de vírgula e ponto dentro da cena. Se o `capT` não existir (ou o texto da legenda mudar), vale o espaçamento antigo.
- **Boca segue o volume da voz:** com a voz carregada, a boca abre e fecha conforme o volume real. Sem voz, continua o movimento padrão.
- **Correção:** ao ajustar de novo, a janela `talk` e os tempos `leanAt`/`leanDur` agora são atualizados (antes ficavam com o tempo antigo, e a boca falava fora de hora). Com a opção "Boca do 1º personagem acompanha a fala" ligada, o `talk` é recalculado a cada ajuste.
- **Como usar:** gere ou carregue a voz, clique em "Ajustar ao áudio" (de novo sempre que trocar a voz ou o roteiro), depois "Prévia".


## Novidades do build 15: minutagem do roteiro manda

- Escreva os tempos no roteiro, um por linha, no começo da cena: `0:05 – 0:12 texto da cena`, `[0:05-0:12] texto` ou só o início (`0:12 texto`, o fim é o início da próxima). Aceita `m:ss`, `h:mm:ss` e decimais (`0:05,5`). Os separadores podem ser `-`, `–`, `—`, `->`, `até` ou `a`.
- Com a opção **"Seguir à risca a minutagem escrita no roteiro"** ligada (padrão), o botão **Ajustar ao áudio** usa esses tempos como cortes exatos: o 1º tempo vira a 1ª cena, o 2º a 2ª, e assim por diante. O tempo interno de cada cena (movimentos, balões, sons) é reescalado para caber. Sem tempos no roteiro, vale o ajuste automático pela fala (build 14).
- Funciona até sem voz carregada. Com voz, as legendas e a boca continuam seguindo a fala **dentro** de cada cena.
- O aviso no log diz quando o número de tempos é diferente do número de cenas, quando um tempo não vem depois do anterior ou quando o roteiro passa da duração da voz.
- **Voz com IA:** os tempos escritos (`0:05 – 0:12`, `[0:05]`) são removidos antes de narrar. Um horário no meio da frase (ex.: "às 10:30") continua sendo lido.


## Novidades do build 16: escolha entre 9:16 e 16:9

- **Seletor "Proporção da tela"** no passo 1 do gerador: Vertical 9:16 (Shorts, Reels, TikTok; tela de 1080×1920, o padrão) ou Horizontal 16:9 (YouTube; tela de 1920×1080). Não confundir com o campo "Formato" de "Mais opções", que é o tipo de conteúdo (curiosidade, notícia...). A escolha vale para a prévia, para a IA e para o vídeo gravado, e fica salva no JSON em `style.aspect` (`"16:9"`; sem o campo, é vertical).
- **Resolução:** vertical 720p = 720×1280 e 1080p = 1080×1920; horizontal 720p = 1280×720 e 1080p = 1920×1080.
- **IA:** recebe o formato e organiza as cenas para a tela escolhida (centro 960,540, chão em y≈850, legenda em y≈930 no horizontal). "Copiar prompt para outra IA" e "Melhorar com a IA" também respeitam o formato.
- **Motor:** chão, horizonte, legenda e título têm padrões próprios no horizontal; cenários, clima e efeitos preenchem toda a largura.
- **Atenção:** trocar o formato de uma história pronta não converte as posições. Gere de novo ou use "Melhorar com a IA".
- **Limpeza:** removidos `ajuda.html` (o endereço `/ajuda` continua redirecionando para `/docs`), `PROMPT-MOVIMENTOS.md` (substituído por "Copiar prompt para outra IA") e as histórias de teste `historia-demo-v12.json` e `historia-teste-build13.json`.
- **Visual do gerador:** o passo 1 ficou só com Proporção da tela, Duração e Gerar roteiro. Tipo de conteúdo, Tom, Idioma, Estilo visual, Trilha e Personagens ficam em "Mais opções", em grade de 3 colunas.
- **Home:** a seção "Dez estilos visuais" agora usa imagens renderizadas pelo próprio motor (pasta `looks/`, uma por estilo), com os mesmos nomes do gerador.


## Segurança (build 16)

- **Arquivos públicos por lista permitida:** o servidor só entrega os arquivos da lista `PUBLIC_NAMES` e a pasta `looks/`, sem diferenciar maiúsculas de minúsculas. Os dados ficam em `.dados/` (modo 700, arquivo 600), fora dessa lista. Versões antigas migram o `dados.json` da raiz sozinhas.
- **Atrás de proxy ou hospedagem** (Render, Railway, Nginx...): defina `TRUST_PROXY=1` (número de proxies confiáveis). Sem isso todos os visitantes parecem ter o mesmo IP e os limites por IP se misturam.
- **Sem login do Supabase**, visitantes usam IA e voz com limites por IP e um limite global por hora (`AI_ANON_PER_HOUR`, padrão 150; `TTS_ANON_PER_HOUR`, padrão 400). Para abrir ao público de verdade, configure o login.
- **Pedidos que mudam algo** (POST/PUT/DELETE) só valem se a origem for o próprio site. Para liberar outro endereço, use `ALLOWED_ORIGINS=https://um.com,https://outro.com`.
- **Cabeçalhos:** CSP restritiva (só o próprio site e o endereço do seu Supabase), `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS e cookie `Secure` quando o acesso é por HTTPS.
- **Login do admin:** 5 erros travam por 1 minuto, dobrando a cada nova rodada (máx. 15 min). A senha nova exige 10 caracteres. Sem terminal interativo, a senha inicial vai para `.dados/senha-inicial.txt` em vez do log.
- **IA:** o texto e o JSON do usuário são tratados como dados; o prompt manda ignorar instruções escondidos neles.
- Prefira definir as chaves por variável de ambiente (`GEMINI_API_KEY` etc.): assim nem chegam ao arquivo de dados.

## Segurança extra (opcional)
- `DATA_KEY`: grava as chaves de API cifradas no `dados.json`.
- **2FA** do painel: Admin > Segurança. Se perder o app, apague `auth.totp` do `dados.json` (ou o arquivo inteiro, como na senha esquecida) e reinicie.
- Veja `SEGURANCA.md` para a lista de correções.
