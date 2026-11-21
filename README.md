# Gerador de Shorts Animados (no navegador, sem API paga)

Pasta única, sem subpastas e sem dependências (não precisa de npm install).

| Arquivo | Para que serve |
|---|---|
| index.html | O gerador de vídeo |
| ajuda.html | Central de ajuda (guia, referência do JSON, solução de problemas) |
| admin.html | Painel administrativo, em endereço secreto (IA, padrões, histórico, segurança) |
| ai.js | Integração com a Groq (roteiro + JSON a partir da ideia do usuário) |
| server.js | Servidor local + API do Admin |
| schema.js | Catálogo do formato de história e validador (usado por Ajuda, Admin e servidor) |
| audio.js | Trilha e efeitos sonoros gerados por código |
| ui.css | Estilos compartilhados |
| PROMPT-MOVIMENTOS.md | Bloco para colar no seu prompt de IA |
| historia-teste.json | História de exemplo |
| dados.json | Criado automaticamente: configurações, chave da Groq, histórico, senha (com hash) e endereço do painel. Não compartilhe |

## Como usar

1. Instale o Node.js **18 ou mais novo**.
2. Na pasta, rode: `node server.js` (o terminal mostra os endereços, a senha inicial do painel e o endereço secreto).
3. Abra http://localhost:3000 no Chrome ou Edge (PC) e aperte Ctrl+F5. O título deve mostrar "build 8".
4. **Criar com IA**: descreva a ideia; a Groq escreve o roteiro e o JSON. Grave a voz, carregue o áudio, "Ajustar ao áudio", "Prévia" e "Gerar vídeo" (aba aberta e visível: a gravação é em tempo real).
5. O arquivo é baixado sozinho (short.mp4 ou short.webm).

## Ativar a IA (Groq)

- Crie uma chave em https://console.groq.com e informe de um destes jeitos:
  - variável de ambiente: `GROQ_API_KEY=gsk_... node server.js` (prioridade), ou
  - no painel, aba **IA (Groq)**.
- A chave fica só no servidor. O modelo padrão é `llama-3.3-70b-versatile` (pode trocar no painel).
- Há limite de gerações por hora por IP (padrão 8, ajustável) para proteger sua cota.
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
