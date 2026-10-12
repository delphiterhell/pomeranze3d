/* ===================================================
   CHI-SONO-ANIM.JS — "Una finestra sul campo che si apre"
   Reveal editoriale/organico per la sezione "Chi sono" in home
   e leggera profondità nel passaggio dalla hero.
   =================================================== */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const sezione = document.getElementById('chi-sono');
  if (!sezione) return;

  const preferisceRiduzione = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =========================================================
     1) TITOLO — raggruppa le parole in righe reali
     Le righe dipendono dal wrapping naturale del testo (larghezza del
     contenitore, che cambia con il breakpoint), quindi si misurano a
     runtime invece di essere fissate nell'HTML: così il masked reveal
     riga-per-riga segue sempre l'andamento reale del testo.
     ========================================================= */
  const titolo = sezione.querySelector('.co-titolo');

  function raggruppaRighe() {
    if (!titolo) return;

    // Disfa un eventuale raggruppamento precedente (es. dopo un resize)
    titolo.querySelectorAll('.co-riga-inner').forEach(inner => {
      inner.replaceWith(...inner.childNodes);
    });
    titolo.querySelectorAll('.co-riga-mask').forEach(mask => {
      mask.replaceWith(...mask.childNodes);
    });

    const parole = Array.from(titolo.querySelectorAll('.co-word'));
    if (!parole.length) return;

    const righe = [];
    let rigaCorrente = [];
    let topCorrente = null;

    parole.forEach(parola => {
      const top = Math.round(parola.offsetTop);
      if (topCorrente === null || Math.abs(top - topCorrente) < 2) {
        rigaCorrente.push(parola);
        topCorrente = top;
      } else {
        righe.push(rigaCorrente);
        rigaCorrente = [parola];
        topCorrente = top;
      }
    });
    if (rigaCorrente.length) righe.push(rigaCorrente);

    righe.forEach((paroleRiga, indice) => {
      const mask = document.createElement('span');
      mask.className = 'co-riga-mask';
      const inner = document.createElement('span');
      inner.className = 'co-riga-inner';
      // Stagger di 120ms tra una riga e l'altra, a partire da 0.78s
      // (mentre la foto sta ancora finendo di aprirsi e la label è comparsa)
      inner.style.transitionDelay = `${0.78 + indice * 0.12}s`;

      paroleRiga[0].parentNode.insertBefore(mask, paroleRiga[0]);
      mask.appendChild(inner);
      paroleRiga.forEach(parola => inner.appendChild(parola));
    });
  }

  raggruppaRighe();

  // Rimisura quando i webfont finiscono di caricare (le larghezze possono
  // cambiare leggermente rispetto alla misurazione col font di fallback)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(raggruppaRighe).catch(() => {});
  }

  // Rimisura al resize (cambio breakpoint / rotazione dispositivo)
  let resizeTimerRighe;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimerRighe);
    resizeTimerRighe = setTimeout(raggruppaRighe, 200);
  });

  /* =========================================================
     2) FOGLIA — imposta lo stroke-draw del contorno SVG
     (path unico, solo stroke: perfetto per stroke-dasharray/offset)
     ========================================================= */
  const fogliaPath = sezione.querySelector('.co-foglia svg path');
  if (fogliaPath && !preferisceRiduzione && typeof fogliaPath.getTotalLength === 'function') {
    try {
      const lunghezza = fogliaPath.getTotalLength();
      fogliaPath.style.strokeDasharray = `${lunghezza}`;
      fogliaPath.style.strokeDashoffset = `${lunghezza}`;
    } catch (e) {
      // Se il calcolo fallisce per qualche motivo, la foglia resta
      // semplicemente visibile senza l'effetto di disegno: nessun danno.
    }
  }

  /* =========================================================
     3) FOTO — tween d'entrata (scale 1.06 → 1) + micro-parallax
     Stesso "transform" per entrambi gli effetti: il tween d'entrata
     parte una volta sola quando la sezione diventa visibile, il
     parallax continua ad aggiornarsi con lo scroll dopo.
     ========================================================= */
  const fotoImg = sezione.querySelector('.chi-sono-foto-img');
  const fotoMask = sezione.querySelector('.chi-sono-foto-mask');

  let scalaFoto = preferisceRiduzione ? 1 : 1.06;
  let parallaxY = 0;
  let fotoInView = false;

  function applicaTransformFoto() {
    if (fotoImg) {
      fotoImg.style.transform = `translateY(${parallaxY}px) scale(${scalaFoto})`;
    }
  }
  applicaTransformFoto();

  function avviaEntrataFoto() {
    if (preferisceRiduzione || !fotoImg) {
      scalaFoto = 1;
      applicaTransformFoto();
      return;
    }
    const durata = 1450; // ms, in linea con la mask (clip-path 1.45s)
    const partenza = 1.06;
    const arrivo = 1;
    const inizio = performance.now();

    function passo(ora) {
      const t = Math.min((ora - inizio) / durata, 1);
      // Approssima cubic-bezier(0.22, 1, 0.36, 1): decelerazione morbida
      // senza overshoot (easeOutQuint)
      const eased = 1 - Math.pow(1 - t, 5);
      scalaFoto = partenza + (arrivo - partenza) * eased;
      applicaTransformFoto();
      if (t < 1) requestAnimationFrame(passo);
    }
    requestAnimationFrame(passo);
  }

  if (fotoMask && !preferisceRiduzione) {
    const osservatoreParallax = new IntersectionObserver((voci) => {
      voci.forEach(voce => { fotoInView = voce.isIntersecting; });
    }, { rootMargin: '200px 0px 200px 0px' });
    osservatoreParallax.observe(fotoMask);
  }

  function aggiornaParallaxFoto() {
    if (!fotoInView || !fotoMask) return;
    const rect = fotoMask.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const centro = rect.top + rect.height / 2;
    // -1 (foto sopra il centro viewport) .. 1 (foto sotto il centro viewport)
    const distanza = (centro - vh / 2) / (vh / 2);
    const ampiezza = 15; // px, massimo ±15px = 30px totali di escursione
    parallaxY = Math.max(-ampiezza, Math.min(ampiezza, -distanza * ampiezza));
    applicaTransformFoto();
  }

  /* =========================================================
     4) HERO — leggerissimo scale-down mentre si scrolla verso
     la sezione successiva, per una sensazione di profondità
     (nessuno scroll-jacking: la hero scorre via normalmente,
     si limita a "rimpicciolire" un filo mentre esce di scena)
     ========================================================= */
  const hero = document.querySelector('.hero-viewport');

  function aggiornaScalaHero() {
    if (!hero) return;
    // Quando la hero è fissata da ScrollTrigger (flyby o transizione di prova): niente scale
    if (hero.classList.contains('flyby-attivo') || hero.classList.contains('transizione-attiva')) return;
    const rect = hero.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    // La transizione si distende su 1.6 altezze di viewport (invece di 1),
    // così lo scale-down è più graduale e meno percepibile da un istante all'altro
    const distanza = vh * 1.6;
    const scrollato = Math.min(Math.max(-rect.top, 0), distanza);
    const lineare = scrollato / distanza;
    // Smoothstep: parte e finisce più dolcemente rispetto a una rampa lineare
    const progresso = lineare * lineare * (3 - 2 * lineare);
    const scala = 1 - progresso * 0.015; // 1 → 0.985 (più delicato di prima)
    hero.style.transform = `scale(${scala})`;
  }

  /* =========================================================
     5) Un solo listener di scroll, con rAF, per parallax + hero
     ========================================================= */
  if (!preferisceRiduzione && (hero || fotoMask)) {
    let ticking = false;
    const aggiornaScroll = () => {
      aggiornaScalaHero();
      aggiornaParallaxFoto();
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(aggiornaScroll);
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    aggiornaScroll();
  }

  /* =========================================================
     6) Attiva la coreografia d'entrata una sola volta, allo scroll
     ========================================================= */
  if (preferisceRiduzione) {
    sezione.classList.add('co-visibile');
    return;
  }

  const osservatore = new IntersectionObserver((voci) => {
    voci.forEach(voce => {
      if (voce.isIntersecting) {
        voce.target.classList.add('co-visibile');
        avviaEntrataFoto();
        osservatore.unobserve(voce.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -60px 0px'
  });

  osservatore.observe(sezione);
});
