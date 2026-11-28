# Publicar o Animaê na Vercel

O projeto já vem pronto: `vercel.json`, `api/index.js` (a função) e `scripts/build.js` (o build estático). Continua rodando em servidor próprio com `node server.js`, sem mudar nada.

## Como funciona na Vercel

| O quê | Onde roda |
|---|---|
| Páginas, JS, CSS, imagens (`public/`) | **CDN da Vercel**, a partir de `dist/` (gerado por `npm run build`). Não gastam função. |
| `/api/*`, painel Admin, `/supabase-schema.sql` | **Uma função** (`api/index.js` → `server.js`) |
| Configurações do painel, saldos de créditos, chat de suporte | **Supabase** (a função não tem disco nem memória compartilhada) |

O que o build faz (`scripts/build.js`):
- troca `home.html` por `index.html` (`/`) e o gerador por `gerar.html` (`/gerar`); `/docs`, `/privacidade` e `/termos` funcionam sem `.html`;
- preenche `{{ORIGIN}}` e os contatos (antes o servidor fazia isso a cada pedido);
- coloca o CSP em cada página com o **hash de cada script inline** (a CDN não gera um nonce por pedido, como o `server.js` faz). Se você editar um `<script>` inline, rode o build de novo: o hash muda sozinho;
- versiona `js/` e `css/` com `?v=<hash>` e cache de 1 ano (`immutable`): o navegador só baixa de novo o que mudou;
- gera `sitemap.xml` e completa o `robots.txt` (quando o endereço do site é conhecido).

## Passo a passo

1. **Supabase**: no SQL Editor, rode `database/supabase-schema.sql` de novo (é idempotente). Ele cria a tabela nova `support_store`.
2. **Vercel**: *Add New > Project*, importe o repositório. Framework: *Other*. O `vercel.json` já define build e pasta de saída.
3. **Variáveis de ambiente**: copie o `.env.example` e preencha. As obrigatórias são `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `ADMIN_PATH` e uma chave de IA.
4. **Deploy**. Abra `https://seu-site/<ADMIN_PATH>` e entre com `ADMIN_PASSWORD`. Em *Conta e banco > Testar conexão*, confira as tabelas.
5. No Supabase (*Authentication > URL Configuration*), inclua o domínio da Vercel em *Site URL* / *Redirect URLs* (login com Google e e-mail).

Os logs de cada cold start (Vercel > Logs) mostram um `AVISO: falta definir: ...` se algo essencial estiver faltando.

## O que mudou no servidor (só quando roda na Vercel)

- **Sessão do painel assinada** (cookie HMAC, 8 h) em vez de ficar na memória; trocar a senha derruba todas as sessões.
- **Senha e endereço do painel vêm do ambiente** (`ADMIN_PASSWORD`, `ADMIN_PATH`): uma senha gerada no primeiro boot se perderia com o disco.
- **Configurações**: lidas do Supabase no início de cada pedido (cache de 30 s por instância) e gravadas antes de responder.
- **Créditos**: antes de cobrar, a linha da pessoa é lida no Supabase; depois, gravada. Instâncias diferentes enxergam o mesmo saldo.
- **Suporte**: um documento na tabela `support_store`, lido no máximo a cada 3 s por instância.
- **Voz (TTS)**: o MP3 sai em streaming (a Vercel limita respostas comuns a 4,5 MB).
- **Cache na CDN**: `/api/settings`, `/api/config`, `/api/tts/voices`, `/api/icon` e afins (20 s a 30 dias). Uma mudança no painel pode levar até ~1 min para aparecer para os visitantes.
- **IP do visitante**: `TRUST_PROXY=1` por padrão (a Vercel sobrescreve o `X-Forwarded-For`).
- A função aceita até **300 s** (`maxDuration` no `vercel.json`); a IA pode demorar. Em conta Hobby sem *Fluid Compute*, o máximo é 60 s: baixe o valor.

## Limites conhecidos (leia antes de abrir ao público)

1. **Limites por hora e anti-força-bruta são por instância.** Contadores de uso por IP/hora, tentativas de login e o limite global de visitantes sem conta ficam na memória de cada instância; com tráfego, várias instâncias somam mais que o limite configurado. O que protege de verdade o seu gasto é o **login obrigatório + créditos** (esses são compartilhados via Supabase). Para o login do painel e `/api/*`, ative também o **Vercel Firewall > Rate Limiting** (grátis em todos os planos, com limites básicos).
2. **Créditos**: a leitura e a gravação são feitas por pedido, mas sem transação. Dois pedidos da mesma pessoa, no mesmo instante e em instâncias diferentes, podem gastar o mesmo crédito. Para uma cota diária isso é aceitável; para cobrança em dinheiro, migre para uma função SQL atômica.
3. **Ficha do ajuste fino de voz**: é assinada, mas os contadores (3 regerações / 3 reescritas) ficam na memória da instância: no pior caso, 20 minutos de regerações extras.
4. **Suporte**: é um único documento; duas mensagens gravadas no mesmo instante por instâncias diferentes: a última vence. Serve para volume baixo/médio.
5. **Histórico de vídeos e registro da IA no painel** ficam na memória da instância (não vão ao Supabase). Quem está logado já tem os próprios vídeos na tabela `videos`.
6. **CSP das páginas** usa `https://*.supabase.co`. Se o seu Supabase tem domínio próprio, defina `SUPABASE_URL` também antes do build (ele entra no CSP).
7. **Sem Supabase com service_role**, a Vercel ainda funciona, mas configurações do painel, saldos e suporte viram "por instância" (somem em minutos). Só use assim para testar.

## Dicas de desempenho

- **Região da função**: por padrão `iad1` (EUA). Se o seu Supabase está em São Paulo, escolha *Gru1* em *Settings > Functions* (ou `"regions": ["gru1"]` no `vercel.json`): cada pedido faz 1 a 3 idas ao Supabase.
- Páginas e assets vêm da CDN; só a API consome função. `/api/settings` e afins são cacheados, então uma visita normal gera poucas invocações.
- Teste local do build: `npm run build` e abra `dist/`. Teste do servidor completo: `node server.js`.
