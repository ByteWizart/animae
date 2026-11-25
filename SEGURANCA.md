# Correções de segurança (auditoria)

## Corrigido
| # | Gravidade | Onde | Problema → correção |
|---|-----------|------|---------------------|
| 1 | Alta | `server.js` (CSP) | `script-src 'unsafe-inline'` deixava qualquer XSS executar código (e roubar o token do Supabase no localStorage). Agora os scripts usam **nonce por resposta**; sem `'unsafe-inline'` em scripts. |
| 2 | Alta | `public/index.html` | XSS armazenado: a biblioteca inseria `id`, datas e totais **sem escapar** (backup importado ou linha da nuvem maliciosa). Tudo escapado; a importação agora valida tipos, tamanho e quantidade. |
| 3 | Alta | `server.js` login | Com scrypt assíncrono, chutes de senha **simultâneos** furariam o bloqueio. A tentativa agora é contada **antes** de conferir a senha (30 chutes paralelos → 4 passam, 26 bloqueados). Também: scrypt não bloqueia mais o servidor e a comparação de `ADMIN_PASSWORD` não revela o tamanho da senha. |
| 4 | Média | `server.js` limites | Condição de corrida: pedidos simultâneos passavam pelo limite por hora de IA/voz/histórico e pelo máximo de vozes em paralelo (a checagem vinha antes do `await`). Vaga reservada antes de qualquer espera. |
| 5 | Média | `server/providers.js` | `validUrl` aceitava `http://10.evil.com` e `http://localhost.evil.com` como "rede local" (chave de API em texto puro pela internet). Agora exige IP literal local ou `localhost`; bloqueia `usuario:senha@`. |
| 6 | Média | `server.js` `/api/ai/prompt` | Endpoint público vazava as "instruções da casa" privadas do admin. Removido. |
| 7 | Média | `server/ai.js` | Mensagens de erro do provedor iam para o visitante sem filtro (podem ecoar pedaços de chave). Agora tokens longos são ocultados e o texto é limitado. |
| 8 | Média | `/api/icon` | Cache em disco sem teto (disco cheio) e SVG de terceiros sem checagem. Máx. 3000 arquivos; SVG com `<script>`, `on*=`, `javascript:` etc. é recusado. |
| 9 | Baixa | `server.js` | `{generate:1,…}[aiOp]` aceitava `constructor`/`__proto__` como operação; `FORMATS/TONES/LANGS` idem (agora sem protótipo). |
| 10 | Baixa | `server.js` | Corpo JSON `null`/array causava erro 500; agora 400. Sem timeouts de requisição (slowloris): definidos. Leitura do painel sem try/catch podia derrubar o processo. |
| 11 | Baixa | `server/tts.js` | `/api/tts/voices` abria uma conexão externa a cada chamada quando o serviço falhava; agora dedupe + pausa de 5 min. |
| 12 | Média | `database/supabase-schema.sql` | Qualquer conta grátis podia gravar linhas gigantes/ilimitadas. Adicionados limites de tamanho (CHECK), teto de linhas por usuário (trigger) e `revoke` do papel `anon`. **Rode o SQL de novo no Supabase.** |
| 13 | Média | `package.json` | `axios 1.21.1` (dependência do msedge-tts) tem vulnerabilidades conhecidas. Adicionado `overrides` para `^1.13.0`: **rode `npm install`** para atualizar o lockfile. |

## Segunda rodada (riscos que tinham ficado de fora)
| # | Onde | O que foi feito |
|---|------|-----------------|
| 14 | `public/js/auth.js` | **Login CSRF corrigido com PKCE.** O retorno do Google/e-mail agora usa `?code=` e só vale no navegador que iniciou o pedido (o `code_verifier` fica guardado lá). Tokens no `#hash` não são mais aceitos e são removidos do endereço. |
| 15 | `server.js` + Admin > Segurança | **2FA (TOTP)** para o painel: Google Authenticator, Authy, 1Password etc. Aceita ±30 s de relógio, não aceita reutilizar o mesmo código, e a resposta não revela se errou a senha ou o código. Ativação e desativação pelo painel. |
| 16 | `server.js` login | **Força bruta distribuída:** no máximo 3 conferências simultâneas e, se houver muitas falhas somadas de todos os IPs, cada tentativa passa a esperar (até 5 s), sem trancar o admin legítimo. |
| 17 | `server.js` | **Chaves cifradas em disco:** com `DATA_KEY` no ambiente, as chaves de IA, a `service_role` e o segredo do 2FA são gravadas com AES-256-GCM. Errar a `DATA_KEY` encerra o servidor (não apaga nada). |

Como usar: `DATA_KEY=uma-frase-longa node server.js` (guarde essa frase: sem ela as chaves cifradas não abrem). Para o 2FA: Admin > Segurança > Ativar 2FA.

## Limitações que continuam
- Sem Supabase configurado, o site é aberto a qualquer visitante (só há limites por IP e globais).
- Com `DATA_KEY` na mesma máquina/painel de hospedagem do `dados.json`, a proteção é contra vazamento do arquivo (backup, repositório), não contra quem já controla o servidor.
- No Supabase, ative *Confirm email* e confira *Redirect URLs*: o PKCE exige que o link de retorno seja o mesmo domínio do site.

## Créditos

- O saldo e o desconto existem só no servidor (`server/credits.js`). O navegador recebe o saldo apenas para exibir; qualquer valor enviado por ele é ignorado.
- O desconto é síncrono e acontece antes de chamar a IA ou a voz, então pedidos simultâneos não gastam o mesmo crédito; falhas devolvem o crédito uma única vez.
- IPs de visitantes nunca vão para o disco: só um hash com sal. O número de pessoas guardadas tem teto e entradas antigas são removidas.
- As rotas de presente/zerar crédito exigem o login do admin e o mesmo teste de origem das demais rotas que alteram dados.

## Cupons

- Quem decide tudo é o servidor (`server/cupons.js`): o navegador só envia o código. O resgate é síncrono, então pedidos simultâneos não passam do limite de usos nem do limite por pessoa.
- A contagem por pessoa fica no registro de créditos da pessoa (persistida), e a mensagem de erro é a mesma para código inexistente e desligado. Tentativas por IP são limitadas.
- Criar, editar, desligar e apagar cupons exigem o login do admin e o teste de origem das demais rotas que alteram dados. A lista de códigos nunca é pública.
- Sem login (Supabase), a identidade é o IP: use "só com conta" para cupons valiosos.

## Chat de suporte

- Rotas públicas só criam/leem a **própria** conversa (token de 192 bits no navegador; o servidor guarda só o SHA-256). Não existe rota pública que liste conversas.
- Responder e administrar conversas exige a sessão do admin (`/api/admin/support/*`).
- Conteúdo de visitantes é sempre renderizado como texto (`textContent` no site; escape no painel), e a política CSP continua sem `unsafe-inline` para scripts.
- Limites por IP e por conversa, campo-isca, tamanho máximo, tetos de armazenamento e limpeza automática contra spam e enchimento do disco.
