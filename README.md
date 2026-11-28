# Animaê: gerador de vídeos animados, verticais 9:16 ou horizontais 16:9 (no navegador, sem API paga)

> **Publicar na Vercel?** Veja [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md). O projeto roda lá como CDN (páginas) + uma função (API), com o Supabase guardando o estado.

Organizado em pastas (veja a estrutura abaixo). A única dependência é a opcional `msedge-tts` (voz com IA): rode `npm install` uma vez. Sem ela, tudo funciona, menos a voz com IA.

```
server.js            servidor (ponto de entrada: node server.js; na Vercel, importado por api/index.js)
api/index.js         função serverless da Vercel (chama o server.js)
scripts/build.js     build estático para a Vercel (public/ -> dist/)
vercel.json          rotas, cache e cabeçalhos da Vercel
.env.example         variáveis de ambiente
package.json         dependências
server/              código só do servidor: ai.js, providers.js, supabase.js, tts.js, credits.js, cupons.js, suporte.js
admin/               painel administrativo (admin.html, servido no endereço secreto)
database/            supabase-schema.sql
public/              tudo o que o navegador recebe
  home.html, index.html, docs.html, favicon.svg
  css/               ui.css
  js/                theme, schema, audio, auth, guia, motor-extra, motor-extra2, suporte (chat), cupom (resgate)
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
| database/supabase-schema.sql | **Único SQL do projeto**: tabelas `videos`, `stories` (RLS por usuário), `admin_config` (todas as configurações do painel) e `credit_balances` (saldos de créditos); as duas últimas só o servidor acessa. Rode uma vez no SQL Editor do Supabase |
| server/cupons.js | Cupons: cria, valida e resgata códigos que dão créditos e vantagens (veja "Cupons" abaixo) |
| server/suporte.js | Chat de suporte: conversas dos visitantes, respostas do admin, limites contra spam (veja "Chat de suporte") |
| public/js/suporte.js | Botão de chat nas páginas públicas (home, gerador, docs) |
| public/js/cupom.js | Janela "Resgatar cupom" do gerador (botão **Cupom**, ao lado do saldo) |
| public/js/theme.js | Botão de tema claro/escuro (lua/sol na barra); a escolha fica salva no navegador |
| public/css/ui.css | Estilos compartilhados (visual novo: degradê violeta/rosa/âmbar, claro e escuro automático) |
| public/exemplos/historia-teste.json | História de exemplo simples |
| public/exemplos/historia-demo-v9.json | História de 30 s que mostra os recursos novos (rua em movimento, gráfico, chat, glitch, holofote, palco...). Carregue em Avançado > Carregar história |
| public/exemplos/historia-demo-16x9.json | Exemplo de 18 s no formato horizontal 16:9 (tela de 1920×1080). Carregue em Avançado > Carregar história |
| .dados/dados.json | Criado automaticamente numa pasta escondida que o servidor nunca serve: configurações, chaves de IA, histórico, senha (com hash) e endereço do painel. Não compartilhe. Para mudar o lugar, use DATA_DIR |

## Formato da tela (16:9 e 9:16)

Em **Painel > Padrões > Formato da tela** o administrador escolhe quais formatos o gerador oferece: só vertical 9:16, só horizontal 16:9 ou os dois (com o formato que abre selecionado). Com um só liberado, o seletor some do gerador, a IA monta tudo nesse formato e qualquer história enviada em outro formato é ajustada automaticamente. A regra vale também no servidor (`/api/ai/*`), então não dá para burlá-la pelo navegador. Fica salvo em `settings.aspects` e `settings.aspectDefault`.

## Duração exata na velocidade natural da voz (build 17)

Ao escolher **30 s** (ou 20, 45, 60) em "Duração", a caixa "Vídeo e voz com exatamente a duração escolhida, na velocidade natural da voz" (ligada por padrão) trava tudo nesse tempo **sem acelerar nem desacelerar a voz**. Quem muda de tamanho é o roteiro:

- **A IA escreve com o tamanho certo.** O navegador mede quantas palavras por segundo a voz escolhida lê de verdade (guarda em `localStorage`, chave `animae.wps`) e manda para a IA (`wps`). O servidor calcula a faixa de palavras (`wordsFor` em `server/ai.js`, voz ocupando ~94% do tempo) e, se a IA errar a contagem em mais de 12%, reescreve na hora (`fit`), sem custo extra.
- **A voz é medida de verdade.** Em "Gerar voz", o navegador mede a duração natural da fala (`voiceMeasure` em `public/js/audio.js`). Se o roteiro não cabe, a IA reescreve o roteiro e as legendas das cenas (`POST /api/ai/fit`) com a quantidade de palavras certa e a voz é gerada de novo, até 3 vezes. Há o botão "Desfazer ajuste do roteiro".
- **A duração fecha só com silêncio.** `fitVoiceNatural` aumenta ou encurta as pausas entre frases e vírgulas e apara as pontas: a fala nunca é esticada (o antigo `fitVoiceExact`, com `wsolaStretch`, foi removido). Só aceita o que soa natural (cerca de 12% de pausa a mais ou 7% a menos); acima disso o roteiro é reescrito em vez de encher a fala de buracos.
- **Custo e segurança.** A primeira voz custa o normal (`tts`) e devolve uma ficha (`X-Fit-Token`) com direito a 3 regerações da voz e 3 reescritas do roteiro por 20 minutos, sem custo e sem contar no limite por hora. A ficha é amarrada à mesma conta/IP e se esgota sozinha; sem ficha o `/api/ai/fit` responde 403.
- **Sem IA ou com áudio próprio:** a voz continua natural e fecha a duração com pausas; se o roteiro for curto ou longo demais, o gerador avisa quantas palavras faltam ou sobram. Se a fala não couber nem com as pausas no mínimo, nada é cortado e o vídeo acompanha a fala.
- **Gravação.** O áudio começa junto com o gravador e uma fonte de silêncio mantém a faixa de áudio viva até o fim (antes ela parava ~60 ms antes). O arquivo sai com a duração escolhida com erro de até ~0,03 s (medido: 20,00 s e 30,03 s). O gerador mostra a duração real do arquivo.

Desmarque a caixa para a voz sair crua (duração = a da voz).

## Upgrade do gerador (build 18)

Tudo roda no navegador, sem custo de crédito:

- **Modelos prontos** (8): Curiosidade, Mito ou verdade, Top 5, Dica rápida, História engraçada, Suspense, Motivacional e Diálogo. Cada um ajusta formato, tom, duração e número de personagens e preenche uma ideia com um trecho `[entre colchetes]` já selecionado para você trocar pelo tema. Se você já escreveu a sua ideia, ela é mantida e só as opções mudam.
- **Medidor do roteiro:** abaixo do roteiro mostra as palavras, quantos segundos a voz leva (com as palavras por segundo medidas na sua voz) e se cabe na duração escolhida ("Cabe em 30 s", "Curto: faltam ~N palavras" ou "Longo: sobram ~N palavras").
- **Desfazer e refazer** (↶ ↷ no passo 2): cada mudança que a IA aplica (gerar, ajustar o tamanho, editar, traduzir) guarda a versão anterior; até 12 versões.
- **Rascunho automático:** a ideia, o roteiro, o JSON e as opções são salvos neste navegador (`animae.draft.v1`, até 14 dias). Ao voltar, aparece "Continuar" ou "Descartar".
- **Legendas em arquivo (.srt)** com os mesmos tempos das legendas do vídeo (alinhadas à voz), em trechos de até 2 linhas, e **capa em PNG** no tamanho escolhido do vídeo, com o título por cima (opcional).

## Preview de link, privacidade, termos e contato

- **Preview de link (Discord, WhatsApp, Telegram, X):** as páginas `/`, `/gerar`, `/docs`, `/privacidade` e `/termos` têm as tags `og:title`, `og:description`, `og:image` (+ `og:url`, tamanho e `twitter:card`). A imagem é `public/og.jpg` (1200x630, ~88 KB). Essas tags precisam de endereço **absoluto**: o servidor troca `{{ORIGIN}}` pelo endereço do site. **Em produção defina `PUBLIC_URL`** (ex.: `https://animae.com.br`). Sem ela, usa o `Host` do pedido, só se ele tiver cara de domínio (qualquer outro valor vira `localhost`), e atrás de proxy (`TRUST_PROXY`) o protocolo que o proxy informa. Depois de trocar a imagem ou o texto, o Discord guarda o card em cache por um tempo; para forçar, mude a URL (`?v=2`) ou use o depurador de links de cada rede.
- **Contato no rodapé:** defina `CONTACT_EMAIL` (vira `mailto:`) ou `CONTACT_URL` (um link). Sem nenhuma das duas, o link "Contato" abre o chat de suporte do próprio site. O e-mail ou link configurado também aparece na seção "Contato" das páginas de privacidade e termos.
- **Privacidade (`/privacidade`) e Termos (`/termos`):** descrevem o que o software faz hoje (o que fica no navegador, o que vai para IA, voz e Supabase, o que o servidor guarda, retenção do suporte). Se você mudar o que o site coleta, atualize a página. São um texto-base, não aconselhamento jurídico: vale uma revisão antes de divulgar.

## Créditos (cota por pessoa, renovação configurável)

O gerador tem um sistema de créditos: **cada pessoa ganha 25 créditos por dia** e cada uso de IA ou de voz gasta créditos. Gravar o vídeo no navegador não gasta nada. Tudo é configurado em **Painel > Créditos**: liga/desliga, créditos por dia (quem tem conta e visitantes sem conta, separados) e o custo de cada ação (padrão: gerar roteiro 5, sugerir ideias 1, editar 2, avaliar 1, traduzir 2, gerar voz 3).

Como é protegido (tudo no servidor, o navegador só mostra o saldo):

- O crédito é descontado **antes** de chamar a IA, sem brechas para pedidos simultâneos, e **volta sozinho** se a IA ou a voz falharem. Pedido inválido não gasta.
- Quem tem conta (Supabase) é identificado pelo token conferido no servidor. Sem login, a cota é por IP (IPv6 agrupado pelo prefixo /64); o IP em si nunca é gravado, só um hash com sal.
- **De quanto em quanto tempo renova** (Admin > Créditos > "Renovar os créditos", salvo no Supabase): *todo dia à meia-noite* (fuso de Brasília; mude com `CREDITS_TZ`, ex.: `America/Manaus`) ou *a cada N horas* (1, 2, 3, 6, 12, 24 h, 2, 3 ou 7 dias, ou qualquer valor de 1 a 720 h). No modo por horas, o tempo de cada pessoa começa a contar no **primeiro uso** dela; passadas N horas, volta à cota cheia. A cota **não acumula**. Créditos de presente dados pelo admin não expiram e só são usados depois da cota do dia.
- Na lista do painel há dois botões por pessoa (e dois para todos): **Restaurar cota** devolve a cota cheia do período (zera o *gasto*) e **Zerar créditos** deixa a pessoa com **0** até a próxima renovação (e tira os presentes). Os botões "de todos" valem para quem aparece na lista.
- O admin pode dar ou tirar créditos de presente (pelo e-mail da conta) e zerar o uso de alguém, na mesma aba. Também há a lista de quem gastou hoje.
- O saldo aparece na hora: o último valor fica guardado no navegador (por conta) e é corrigido assim que o servidor responde; o servidor também deixou de conferir o mesmo login várias vezes ao mesmo tempo.
- **Os saldos não recarregam ao reiniciar:** com o Supabase ligado (chave `service_role`), o saldo de cada pessoa (usado hoje e créditos de presente) é guardado na tabela `credit_balances`. Ao iniciar, o servidor lê o banco antes de abrir a porta; depois, cada uso é enviado em ~1,5 s. O código do visitante (hash do IP) usa um sal que também fica guardado no banco (`admin_config`), então o mesmo visitante continua sendo a mesma pessoa depois de reiniciar ou trocar de servidor. Se o banco estiver fora do ar ao iniciar, o servidor usa o `dados.json`, tenta de novo a cada 30 s e, quando conseguir ler, junta os dois (vale o registro mais recente de cada pessoa). Pensado para **um servidor ativo por vez**. Sem Supabase, os saldos ficam só no `.dados/dados.json` (em hospedagem que apaga arquivos, volta tudo a cada reinício).
- Os saldos também ficam em `.dados/dados.json` e só quem usou hoje (ou tem presente) é guardado, então o arquivo não cresce sem parar. Continuam valendo os limites por hora da IA e da voz.

Para uma cota realmente "por usuário", ative o login (Admin > Conta e banco) e, se quiser, exija-o (`REQUIRE_LOGIN=1`): por IP, quem troca de rede ou de VPN ganha uma cota nova, e redes que compartilham o mesmo IP dividem a cota. Com o login obrigatório, e-mail confirmado no Supabase dificulta a criação de várias contas.

## Cupons (créditos e outras vantagens)

Em **Painel > Cupons** o administrador cria códigos que as pessoas resgatam no botão **Cupom** do gerador (ao lado do saldo de créditos). Um cupom pode dar, juntos ou separados:

| Vantagem | O que faz |
|---|---|
| **Créditos de presente** | Somam ao saldo, não expiram e só são gastos depois da cota do período. |
| **Créditos extras por período** | Aumentam a cota (ex.: +10 por dia) durante N dias. |
| **Desconto nas ações** | X% a menos no custo de IA e voz durante N dias (arredonda o custo para cima; o gerador já mostra o preço com desconto). |
| **Uso ilimitado** | IA e voz de graça por N horas. |

E tem regras: **limite total de usos**, **usos por pessoa**, **validade**, ligar/desligar, "só quem tem conta" (recomendado) e uma anotação sua. Dá para criar **vários códigos únicos de uma vez** (cada um de 1 uso, com prefixo, ex.: `NATAL-7K2M-QX9P`), copiar o código ou um **link** que já abre o cupom no gerador (`/gerar?cupom=CODIGO`). O resgate ignora maiúsculas, espaços e hífens.

Como é protegido (tudo no servidor):

- O resgate é síncrono (nada de `await` entre conferir e aplicar): dez pessoas resgatando o último uso de um cupom ao mesmo tempo resultam em **um** sucesso.
- O limite "por pessoa" fica no registro de créditos da pessoa, então sobrevive a reinícios (e ao Supabase). Quem usou cupom não é apagado da limpeza automática.
- Tentativas por IP são limitadas (15 por hora; resgates que dão certo não contam) e "não existe" e "desligado" dão a mesma mensagem, para não ajudar a adivinhar códigos.
- Sem conta, a "pessoa" é o IP: quem troca de rede ganharia o cupom de novo. Por isso o padrão é **só com conta** (vale quando o login do Supabase está ligado).
- **Zerar créditos** de uma pessoa (aba Créditos) também tira as vantagens de cupom dela.
- Os cupons ficam no `dados.json` e, com o Supabase ligado, também em `admin_config` (junto das outras configurações). As vantagens ativas e os cupons já usados por cada pessoa vão na coluna `x` de `credit_balances`: **rode o `supabase-schema.sql` de novo** para criá-la (sem ela o painel avisa, e esses dados só valem até reiniciar).

## Chat de suporte (qualquer pessoa escreve, só o admin responde)

Um botão de chat aparece nas páginas públicas (início, gerador e docs). **Qualquer visitante pode mandar mensagem, com ou sem conta.** Só o administrador responde, em **Painel > Suporte** (lista de conversas, contador de não lidas no menu, responder, encerrar/reabrir, apagar e "limpar encerradas").

- Cada visitante tem uma conversa própria, ligada a um **token aleatório guardado no navegador dele**; o servidor só guarda o hash. Ele só enxerga a própria conversa, e a resposta aparece quando ele abre o chat (o botão mostra um selo com as respostas novas). Se a pessoa estiver logada, o admin vê o e-mail da conta.
- Responder, listar, encerrar e apagar são rotas `/api/admin/support/*`, só com a sessão do admin: um visitante não consegue responder nem se passar pelo suporte.
- Tudo que o visitante escreve é mostrado como **texto** (nunca HTML), no site e no painel.
- Anti-spam: 20 mensagens por hora e 4 conversas novas por hora por IP, no máximo 8 mensagens seguidas sem resposta, 1000 caracteres por mensagem, campo-isca contra robôs, teto de conversas e de mensagens e limpeza automática de conversas paradas há 90 dias.
- As conversas ficam em `.dados/suporte.json` (separado das configurações). Em hospedagem que apaga arquivos a cada reinício, defina `DATA_DIR` para um disco persistente, senão as conversas somem.

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

**Onde fica salvo:** com o Supabase ligado, a configuração da IA (e todas as outras do painel) fica na tabela `admin_config`; veja a seção "Configurações do painel no Supabase" abaixo. Sem Supabase, tudo continua só no `dados.json`, como antes.

- Informe a chave por variável de ambiente (prioridade) ou em **Admin > IA**. As chaves nunca vão para o navegador (e, com Supabase, são guardadas na `admin_config`, que só o servidor lê; defina `DATA_KEY` para irem cifradas).
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

## Configurações do painel no Supabase

**Todas as configurações do Admin são salvas no Supabase**, na tabela `admin_config` (uma linha, criada pelo `supabase-schema.sql`): formato da tela e legendas, IA (liga/desliga, provedor, reservas, modelos, TPM, limite por hora, instruções da casa, chaves de API), voz, créditos (cota e custos), senha do painel (só o hash), 2FA, endereço secreto do painel e opções de login.

- É automático: qualquer mudança feita no painel vai para o banco em cerca de 1 s. Reiniciar ou trocar de servidor (inclusive hospedagem que apaga arquivos) não perde nada: ao iniciar, o servidor lê o banco primeiro. Mudanças feitas direto no banco valem em até 30 s.
- Na primeira conexão, o servidor envia a configuração que já estava valendo (e migra a tabela `ai_config` antiga, se existir).
- Precisa da chave `service_role` (Admin > Conta e banco, ou `SUPABASE_SERVICE_KEY`). Sem ela, tudo fica só no `dados.json`.
- A tabela não tem nenhuma policy: visitantes e contas de usuários não acessam. Como ela guarda as chaves de API, defina `DATA_KEY` no servidor para elas irem **cifradas** (AES-256-GCM) também para o banco.
- **Não vão para o banco:** o endereço e as chaves de acesso ao próprio Supabase (precisam existir antes de conectar: variáveis de ambiente ou Admin > Conta e banco), o histórico de vídeos e o registro da IA. (Os saldos de créditos têm tabela própria: `credit_balances`, veja "Créditos".)
- Se o banco estiver fora do ar ao iniciar, o servidor usa o `dados.json` e **não** envia nada até conseguir ler o banco (para nunca apagar o que está lá). O painel mostra o erro e o envio é repetido a cada 30 s.
- Atenção: ao apontar para um projeto Supabase que já tem configurações de outro servidor, as do banco passam a valer (inclusive a senha do painel).

## Login e banco de dados (Supabase)

Com o Supabase configurado, **só quem entrou na conta consegue usar a IA, a voz e gerar vídeos**. O servidor confere o login em cada pedido (IA, voz e histórico respondem 401 sem login) e o botão "Gerar vídeo" abre a janela de entrar. A "Prévia" continua livre.

1. Crie um projeto grátis em supabase.com e, no **SQL Editor**, rode o conteúdo de `supabase-schema.sql` (cria `videos`, `stories`, `admin_config` e `credit_balances`; nas duas primeiras cada pessoa só vê o que é dela).
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
