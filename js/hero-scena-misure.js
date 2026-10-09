/* ===================================================
   HERO-SCENA-MISURE.JS — Calcoli di allineamento della scena
   Funzioni pure, senza DOM né Three.js: dicono dove mettere la
   telecamera perché la ragazza ricalchi l'illustrazione, e come
   la fotografia è ritagliata dal CSS (object-fit: cover), così
   la vegetazione in primo piano combacia con lo sfondo a qualsiasi
   rapporto d'aspetto.

   Unità della scena: quelle del modello (la ragazza è alta 0.978).
   =================================================== */

export const ALTEZZA_MODELLO = 0.978;

/**
 * Telecamera ortografica: la figura occupa la stessa area dell'illustrazione.
 * @param {{larghezza:number, altezza:number}} hero  dimensioni della hero in px
 * @param {{sinistra:number, basso:number, larghezza:number, altezza:number}} riquadro
 *        riquadro dell'illustrazione dentro la hero (px, "basso" = distanza del bordo inferiore dall'alto)
 * @param {number} quotaFigura  parte dell'altezza del riquadro occupata dalla figura
 * @param {number} taglioBase   quanto della base del busto resta sotto il bordo (unità della scena)
 */
export function calcolaCamera(hero, riquadro, quotaFigura, taglioBase) {
  const pxPerUnita = (riquadro.altezza * quotaFigura) / ALTEZZA_MODELLO;
  const centroFiguraX = riquadro.sinistra + riquadro.larghezza / 2;
  return {
    pxPerUnita,
    mezzaLarghezza: hero.larghezza / (2 * pxPerUnita),
    mezzaAltezza: hero.altezza / (2 * pxPerUnita),
    x: (hero.larghezza / 2 - centroFiguraX) / pxPerUnita,
    y: taglioBase + (riquadro.basso - hero.altezza / 2) / pxPerUnita,
  };
}

/**
 * Come il browser disegna un'immagine con object-fit: cover.
 * @returns {{scala:number, sinistra:number, alto:number, larghezza:number, altezza:number}}
 *          posizione e misura dell'immagine intera, in px della hero (può uscire dai bordi)
 */
export function calcolaCopertura(hero, immagine, posizioneX, posizioneY) {
  const scala = Math.max(hero.larghezza / immagine.larghezza, hero.altezza / immagine.altezza);
  const larghezza = immagine.larghezza * scala;
  const altezza = immagine.altezza * scala;
  return {
    scala,
    larghezza,
    altezza,
    sinistra: (hero.larghezza - larghezza) * posizioneX,
    alto: (hero.altezza - altezza) * posizioneY,
  };
}

/** Legge "50% 40%" (valore calcolato di object-position) come frazioni 0–1. */
export function leggiPosizione(testo) {
  const parti = String(testo || '').trim().split(/\s+/).map((p) => parseFloat(p) / 100);
  const x = Number.isFinite(parti[0]) ? parti[0] : 0.5;
  const y = Number.isFinite(parti[1]) ? parti[1] : 0.5;
  return { x, y };
}
