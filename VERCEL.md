# Deploy do Animaê na Vercel

## Importação
1. Envie este projeto para um repositório GitHub.
2. Na Vercel, importe o repositório e defina **Root Directory** como `animae-main` (se o repositório contiver essa pasta). Se enviar o conteúdo de `animae-main` diretamente para a raiz do repositório, deixe Root Directory como `.`.
3. Framework Preset: **Other**. Build Command: `npm run vercel-build` (ou deixe o padrão). Output Directory: deixe vazio. Install Command: `npm install`.
4. Faça o deploy. As rotas do site e da API são encaminhadas para `api/index.js`.

## Variáveis de ambiente
Configure em Project Settings → Environment Variables, pelo menos as chaves que o projeto utiliza. Recomendações:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (se o código/configuração atual utilizar esse nome; nunca exponha no navegador)
- `ADMIN_PASSWORD`
- `DATA_KEY` (segredo longo e estável; não troque depois de cifrar dados)
- `GEMINI_API_KEY` e/ou `GROQ_API_KEY`

Use os nomes exatos das variáveis que já configurou no projeto. Não coloque segredos em arquivos públicos nem no GitHub.

## Limitações importantes da Vercel
A Vercel executa Functions sem servidor persistente. O projeto usa arquivos locais para configurações, suporte e alguns estados; em produção, `/tmp/animae-data` é temporário e pode desaparecer entre instâncias/redeploys. Portanto, configure e teste a sincronização com Supabase antes de disponibilizar publicamente. A configuração e os saldos possuem integração com Supabase no código; o arquivo de suporte e outros dados estritamente locais não ganham persistência automaticamente.

Também há limites de duração e memória das Functions, e chamadas longas de IA/voz podem atingir esses limites. A Vercel não oferece uma porta TCP fixa: não configure `PORT`; a Function recebe as requisições HTTP diretamente.

Para uso público com estado confiável, múltiplas instâncias e operações longas, um serviço Node persistente (Render/Railway/VPS) é mais adequado. Esta adaptação permite testar o deploy na Vercel, mas não transforma armazenamento temporário em armazenamento permanente.
