# Gerador de Shorts Animados (no navegador, sem API paga)

Pasta única, sem subpastas. Arquivos: index.html (o programa), audio.js, server.js, package.json e PROMPT-MOVIMENTOS.md.

1. Instale o Node.js (qualquer versão recente).
2. Abra um terminal nesta pasta e rode: node server.js
3. Abra http://localhost:3000 no Chrome ou Edge (PC).
4. Escolha a voz, carregue o .json da história (ou cole na caixa), escolha 720p/30 fps (mais leve) e clique em "Gerar vídeo". Deixe a aba aberta e visível: a gravação é em tempo real.
5. O arquivo é baixado sozinho (short.mp4 ou short.webm).

- "Ajustar ao áudio" reescala os tempos das cenas para a duração da voz.
- "Detectar pausas" lista os silêncios da voz, para a IA cortar as cenas nas pausas.
- PROMPT-MOVIMENTOS.md é o bloco para colar no seu prompt de IA (movimentos, balões, clima, câmera, legenda).
