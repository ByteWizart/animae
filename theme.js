/* Tema claro/escuro. Carregue no <head> (antes do CSS pintar) para não piscar.
   Sem escolha salva, segue o sistema; ao clicar no botão da barra, a escolha fica salva neste navegador. */
(function () {
  var KEY = 'sa-theme', root = document.documentElement, mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function saved() { try { var v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : ''; } catch (e) { return ''; } }
  function current() { return saved() || (mq && mq.matches ? 'dark' : 'light'); }
  function apply() { root.setAttribute('data-theme', current()); var b = document.querySelector('.themebtn'); if (b) { var d = current() === 'dark'; b.setAttribute('aria-label', d ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'); b.title = b.getAttribute('aria-label'); } }
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (!saved()) apply(); });
  window.toggleTheme = function () { var n = current() === 'dark' ? 'light' : 'dark'; try { localStorage.setItem(KEY, n); } catch (e) {} apply(); };
  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('.topnav'); if (!nav || nav.querySelector('.themebtn')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'themebtn';
    b.innerHTML = '<svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg><svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    b.onclick = window.toggleTheme; nav.appendChild(b); apply();
  });
})();
