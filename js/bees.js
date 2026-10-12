/* ===================================================
   BEES.JS — Api SVG animate nel hero
   =================================================== */

(function () {
  'use strict';

  /* Ferma tutto se l'utente preferisce meno animazioni */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const contenitore = document.querySelector('.api-container');
  if (!contenitore) return;

  /* Evita api duplicate se lo script viene eseguito più di una volta
     (es. richiamato due volte, bfcache, reload particolari) */
  if (contenitore.dataset.apiInizializzato === 'true') return;
  contenitore.dataset.apiInizializzato = 'true';
  contenitore.innerHTML = '';

  /* ---------- SVG di un'ape disegnata a mano ---------- */
  function creaSvgApe() {
    return `
      <svg viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <!-- Ali semitrasparenti -->
        <ellipse class="ala ala-sx" cx="11" cy="10" rx="10" ry="6"
          fill="rgba(200,230,255,0.55)" stroke="rgba(100,160,200,0.4)" stroke-width="0.6"
          transform-origin="18 14"/>
        <ellipse class="ala ala-dx" cx="29" cy="10" rx="10" ry="6"
          fill="rgba(200,230,255,0.55)" stroke="rgba(100,160,200,0.4)" stroke-width="0.6"
          transform-origin="22 14"/>
        <!-- Corpo: addome a strisce -->
        <ellipse cx="20" cy="22" rx="8" ry="11" fill="#F5C842"/>
        <!-- Strisce nere -->
        <rect x="12.2" y="18" width="15.6" height="3.5" rx="0.5" fill="#2a2a2a" opacity="0.85"/>
        <rect x="12.2" y="24" width="15.6" height="3.5" rx="0.5" fill="#2a2a2a" opacity="0.85"/>
        <!-- Testa -->
        <circle cx="20" cy="11" r="5.5" fill="#F5C842"/>
        <!-- Occhi -->
        <circle cx="17.5" cy="10" r="1.2" fill="#2a2a2a"/>
        <circle cx="22.5" cy="10" r="1.2" fill="#2a2a2a"/>
        <!-- Antenni -->
        <line x1="17" y1="6" x2="14" y2="2" stroke="#2a2a2a" stroke-width="0.8" stroke-linecap="round"/>
        <circle cx="14" cy="2" r="1" fill="#2a2a2a"/>
        <line x1="23" y1="6" x2="26" y2="2" stroke="#2a2a2a" stroke-width="0.8" stroke-linecap="round"/>
        <circle cx="26" cy="2" r="1" fill="#2a2a2a"/>
      </svg>
    `;
  }

  /* ---------- Configurazioni api ----------
     Mobile (<768px): 5 api distanziate; Desktop: 9 api.
     Con data-api="meno" sul contenitore non partono quelle segnate "extra"
     (ne restano 3 su mobile e 6 su desktop) e le altre partono da "vicino",
     attorno alla ragazza: le passano accanto e dietro, coperte dalla scena animata. */
  // matchMedia usa la stessa soglia dei breakpoint CSS (max-width:767px),
  // più affidabile di window.innerWidth per restare sempre in sync col layout
  const mobile = window.matchMedia('(max-width: 767px)').matches;

  /* Le api restano a destra della ragazza (che occupa la fascia sinistra
     dello hero) per non passarle mai dietro, dove si vedrebbero in trasparenza,
     e lontane dalla zona del bottone "Scopri i fiori" (basso a destra del testo).
     Solo 4 animazioni di volo esistono (vola-1..4 in components.css), riusate a rotazione. */
  const configApi = mobile
    ? [
        // Mobile: la ragazza occupa il basso-sinistra, il bottone è nascosto
        { startX: 45, startY: 12, animazione: 'vola-1', durata: '10s', ritardo: '-2s', dimensione: '24px', vicino: [48, 50] },
        { startX: 70, startY: 8,  animazione: 'vola-5', durata: '9s',  ritardo: '0s',  dimensione: '34px', extra: true },
        { startX: 90, startY: 20, animazione: 'vola-4', durata: '11s', ritardo: '-6s', dimensione: '26px', vicino: [72, 22] },
        { startX: 60, startY: 62, animazione: 'vola-9', durata: '13s', ritardo: '-3s', dimensione: '28px', extra: true },
        { startX: 82, startY: 80, animazione: 'vola-2', durata: '12s', ritardo: '-9s', dimensione: '30px', vicino: [58, 70] },
      ]
    : [
        // Desktop: 9 api su una griglia sfalsata, ognuna con una traiettoria diversa
        // (vola-1..9 in components.css), distribuite su tutta l'altezza/larghezza,
        // fuori dalla zona della ragazza (sinistra) e dalla zona del bottone (basso-destra)
        { startX: 42, startY: 10, animazione: 'vola-1', durata: '9s',  ritardo: '0s',  dimensione: '36px', vicino: [30, 14] },
        // Traiettoria lunga: giro grande e tondo
        { startX: 62, startY: 10, animazione: 'vola-10', durata: '18s', ritardo: '-4s', dimensione: '30px', extra: true },
        { startX: 82, startY: 10, animazione: 'vola-3', durata: '10s', ritardo: '-7s', dimensione: '34px', vicino: [60, 10] },
        // Traiettoria lunga: giro largo e schiacciato
        { startX: 52, startY: 35, animazione: 'vola-11', durata: '19s', ritardo: '-2s', dimensione: '32px', vicino: [38, 32] },
        { startX: 72, startY: 35, animazione: 'vola-5', durata: '12s', ritardo: '-6s', dimensione: '28px', vicino: [46, 50] },
        { startX: 42, startY: 60, animazione: 'vola-6', durata: '14s', ritardo: '-3s', dimensione: '34px', extra: true },
        // Traiettoria lunga: giro alto e stretto
        { startX: 62, startY: 60, animazione: 'vola-12', durata: '17s', ritardo: '-8s', dimensione: '30px', vicino: [40, 66] },
        { startX: 52, startY: 85, animazione: 'vola-8', durata: '12s', ritardo: '-5s', dimensione: '36px', vicino: [36, 86] },
        { startX: 72, startY: 85, animazione: 'vola-9', durata: '13s', ritardo: '-10s', dimensione: '30px', extra: true },
      ];

  /* ---------- Creazione delle api nel DOM ---------- */
  const meno = contenitore.dataset.api === 'meno';
  configApi.filter((cfg) => !(meno && cfg.extra)).forEach((cfg) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'ape';
    wrapper.innerHTML = creaSvgApe();

    /* Posizione di partenza (percentuale rispetto al contenitore) */
    const [x, y] = meno && cfg.vicino ? cfg.vicino : [cfg.startX, cfg.startY];
    wrapper.style.left = `${x}%`;
    wrapper.style.top  = `${y}%`;
    wrapper.style.width = cfg.dimensione;

    /* Animazione volo */
    wrapper.style.animation =
      `${cfg.animazione} ${cfg.durata} ${cfg.ritardo} ease-in-out infinite`;

    /* Animazione sbattito ali sulle ellissi */
    const ali = wrapper.querySelectorAll('.ala');
    ali.forEach((ala, i) => {
      const ritardoAla = i === 0 ? '0s' : '0.05s';
      ala.style.animation = `sbatti-ali 0.18s ${ritardoAla} linear infinite`;
      ala.style.transformOrigin = i === 0 ? '18px 14px' : '22px 14px';
    });

    contenitore.appendChild(wrapper);
  });

})();
