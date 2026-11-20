# Gerador de Shorts Animados (no navegador, sem API paga)

1. Instale o Node.js (qualquer versão recente).
2. Na pasta do projeto: `node server.js`
3. Abra http://localhost:3000 no Chrome ou Edge (PC).
4. Escolha o arquivo de voz, clique em "Gerar vídeo" e deixe a aba aberta e visível.
   O vídeo é gravado em tempo real: 22 s de vídeo levam cerca de 22 s.
5. O arquivo é baixado automaticamente (short.mp4 ou short.webm, conforme o navegador).

- "Detectar pausas" lista os silêncios da voz, para você ajustar o tempo das cenas no JSON.
- "Medir velocidade" mede o tempo de desenho no seu computador.
- Cenas disponíveis: A a G (veja scenes.js). Cada cena tem início, fim e tipo no JSON.
- Sem dependências, sem chaves de API, sem internet depois de aberto.
