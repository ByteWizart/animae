# Gerador de Shorts Animados (no navegador, sem API paga)

Pasta única, sem subpastas. A única dependência é a opcional `msedge-tts` (voz com IA): rode `npm install` uma vez. Sem ela, tudo funciona, menos a voz com IA.

| Arquivo | Para que serve |
|---|---|
| index.html | O gerador de vídeo |
| ajuda.html | Central de ajuda (guia, referência do JSON, solução de problemas) |
| admin.html | Painel administrativo, em endereço secreto (IA, padrões, histórico, segurança) |
| ai.js | Integração com a Groq (roteiro + JSON a partir da ideia do usuário) |
| server.js | Servidor local + API do Admin |
| schema.js | Catálogo do formato de história e validador (usado por Ajuda, Admin e servidor) |
| tts.js | Voz com IA (texto do roteiro vira narração em MP3) |
| audio.js | Trilha e efeitos sonoros gerados por código |
| ui.css | Estilos compartilhados |
| PROMPT-MOVIMENTOS.md | Bloco para colar no seu prompt de IA |
| historia-teste.json | História de exemplo simples |
| historia-demo-v9.json | História de 30 s que mostra os recursos novos (rua em movimento, gráfico, chat, glitch, holofote, palco...). Carregue em Avançado > Carregar história |
| dados.json | Criado automaticamente: configurações, chave da Groq, histórico, senha (com hash) e endereço do painel. Não compartilhe |

## Como usar

1. Instale o Node.js **18 ou mais novo**.
2. Na pasta, rode `npm install` (só na primeira vez) e depois `node server.js` (o terminal mostra os endereços, a senha inicial do painel e o endereço secreto).
3. Abra http://localhost:3000 no Chrome ou Edge (PC) e aperte Ctrl+F5. O rodapé deve mostrar "build 9".
4. **Criar com IA**: descreva a ideia; a Groq escreve o roteiro e o JSON. Grave a voz, carregue o áudio, "Ajustar ao áudio", "Prévia" e "Gerar vídeo" (aba aberta e visível: a gravação é em tempo real).
5. O arquivo é baixado sozinho (short.mp4 ou short.webm).

## Ativar a IA (Groq)

- Crie uma chave em https://console.groq.com e informe de um destes jeitos:
  - variável de ambiente: `GROQ_API_KEY=gsk_... node server.js` (prioridade), ou
  - no painel, aba **IA (Groq)**.
- A chave fica só no servidor. O modelo padrão é `openai/gpt-oss-120b` (pode trocar no painel).
- Há limite de gerações por hora por IP (padrão 20 em instalações novas, ajustável) para proteger sua cota.
- O servidor valida o JSON da IA e pede uma correção automática se vier com erro.

## Páginas

- **/** Gerador, com "Criar com IA" e "Minha biblioteca".
- **/ajuda** Central de ajuda (referência gerada do `schema.js`).
- **Painel administrativo**: **não tem link em nenhuma página** e `/admin` não existe. O endereço aleatório (ex.: `/painel-1a2b3c4d5e`) aparece no terminal a cada início. Troque em Segurança ou defina `ADMIN_PATH=meu-caminho`. Abas: Painel, IA (Groq), Padrões, Histórico, Segurança.

## Biblioteca do usuário

Fica no **localStorage do navegador de cada pessoa** (não existe no servidor). Guarda história + roteiro; tem abrir, baixar JSON, renomear, excluir e exportar/importar backup.

## Senha do painel

- Na primeira execução, uma senha aleatória aparece **uma vez** no terminal. Troque em Segurança.
- Alternativa: `ADMIN_PASSWORD=minhasenha node server.js` (prioridade).
- Esqueceu? Apague `dados.json` (apaga chave da Groq, histórico e senha) e reinicie.
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
- Com um plano com mais cota, ajuste **Tokens por minuto (TPM)** no painel (aba IA): o prompt completo, com exemplos, e vídeos de 45 a 60 s passam a ser usados.


## Novidades do build 10: voz com IA

- Em **Roteiro e voz** há o bloco **Voz com IA**: escolha a voz, a velocidade e o tom e clique em **Gerar voz com IA**. O texto do roteiro vira um MP3 que já fica carregado como narração (depois: Ajustar ao áudio, Prévia, Gerar vídeo). Dá para ouvir e baixar o MP3. Enviar a própria gravação continua funcionando.
- Usa as vozes neurais do serviço "Read Aloud" do Microsoft Edge via `msedge-tts`: não precisa de chave de API e não conta tokens. Textos longos são divididos em trechos e juntados.
- Limites de proteção do seu servidor (ajustáveis em `dados.json` ou por `PUT /api/admin/tts`): 60 vozes por hora por IP, 3 gerações ao mesmo tempo, 6000 caracteres por pedido.
- Rotas: `GET /api/tts/status`, `GET /api/tts/voices`, `POST /api/tts` (`{text, voice, rate, pitch}` devolve `audio/mpeg`).
- Aviso: é um serviço **não oficial**. Pode mudar ou bloquear sem aviso e os termos da Microsoft não preveem esse uso de forma explícita. Para uso comercial ou para algo que nunca pode falhar, troque por Azure Speech ou Google Cloud TTS (têm cota grátis mensal, mas com chave e limite).
