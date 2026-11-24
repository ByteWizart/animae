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

## Riscos que continuam (decisão sua)
- **Login CSRF no retorno OAuth/e-mail** (`auth.js`, tokens no `#hash`): um link forjado pode logar a vítima na conta do atacante. É inerente ao fluxo implícito do Supabase; o ideal é migrar para PKCE com `@supabase/supabase-js`.
- Chaves de API e `service_role` ficam em texto puro no `dados.json` (permissão 0600). Prefira variáveis de ambiente.
- Sem Supabase configurado, o site é aberto: só há limites por IP e globais.
- Painel admin protegido por senha única + caminho secreto, sem 2FA.
- O limite do login é por IP; um ataque distribuído (muitos IPs) ainda consegue tentar senhas. Use senha longa (≥ 16 caracteres) ou `ADMIN_PASSWORD`.
