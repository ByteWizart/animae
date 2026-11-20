# Gerador de Shorts Animados (no navegador, sem API paga)

Pasta única, sem subpastas e sem dependências (não precisa de npm install).

| Arquivo | Para que serve |
|---|---|
| index.html | O gerador de vídeo |
| ajuda.html | Central de ajuda (guia, referência do JSON, solução de problemas) |
| admin.html | Painel administrativo (padrões, biblioteca de histórias, histórico, segurança) |
| server.js | Servidor local + API do Admin |
| schema.js | Catálogo do formato de história e validador (usado por Ajuda, Admin e servidor) |
| audio.js | Trilha e efeitos sonoros gerados por código |
| ui.css | Estilos compartilhados |
| PROMPT-MOVIMENTOS.md | Bloco para colar no seu prompt de IA |
| historia-teste.json | História de exemplo |
| dados.json | Criado automaticamente: configurações, biblioteca, histórico e senha (com hash). Não compartilhe |

## Como usar

1. Instale o Node.js (qualquer versão recente).
2. Na pasta, rode: `node server.js`
3. Abra http://localhost:3000 no Chrome ou Edge (PC) e aperte Ctrl+F5. O título deve mostrar "build 7".
4. Escolha a voz, carregue o .json da história, escolha estilo, 720p/30 fps e clique em "Gerar vídeo". Deixe a aba aberta e visível: a gravação é em tempo real.
5. O arquivo é baixado sozinho (short.mp4 ou short.webm).

## Páginas

- **/** Gerador
- **/ajuda** Ajuda: início rápido, referência completa do JSON (gerada do `schema.js`), estilos, FAQ, busca.
- **/admin** Admin (exige senha):
  - **Painel**: vídeos gerados, tempo total, vídeos por estilo, status do sistema e dos arquivos.
  - **Biblioteca**: guarde histórias, valide o JSON (erros e avisos), abra no gerador, baixe, renomeie, exclua.
  - **Padrões**: estilo, resolução, fps e legenda iniciais do gerador, com pré-visualização.
  - **Histórico**: todos os vídeos gerados (filtro por estilo, exportar CSV).
  - **Segurança**: trocar a senha.

## Senha do Admin

- Na primeira execução, uma senha aleatória aparece **uma vez** no terminal. Troque em Admin > Segurança.
- Alternativa: defina a variável `ADMIN_PASSWORD` ao iniciar (`ADMIN_PASSWORD=minhasenha node server.js`). Ela tem prioridade.
- Esqueceu? Apague `dados.json` (apaga biblioteca e histórico) e reinicie.
- Sessão de 8 h, trava de 1 min após 5 erros.

## Outras observações

- Porta diferente: `PORT=4000 node server.js`.
- O seletor de estilo grava "style.look" no JSON. Dá para trocar o estilo de uma cena só com "look" dentro da cena.
- "Ajustar ao áudio" reescala os tempos das cenas para a duração da voz. "Detectar pausas" lista os silêncios da voz.
- Se o gerador for aberto sem o servidor (só o arquivo index.html), ele funciona igual, mas sem Admin, biblioteca e histórico.
