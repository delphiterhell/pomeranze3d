/* ===================================================
   TRANSIZIONE-MISURE.JS — Geometria della carrellata nel campo
   Funzioni pure (niente DOM, niente Three.js): descrivono dove sta
   la telecamera a ogni punto dello scroll e come ogni livello di
   vegetazione si proietta sullo schermo. Le usa la pagina e le usa
   la prova offline, così le due cose non possono divergere.

   Il movimento è una carrellata laterale: la telecamera scivola
   verso destra e avanza appena. Non punta nessun elemento: nessun
   livello le arriva vicino, quindi nulla diventa enorme o sfocato.

   Unità: l'altezza della hero vale 1 a distanza 1 dalla telecamera.
   Ogni livello è un piano parallelo allo schermo, a distanza
   "profondita" dalla telecamera all'inizio.
   =================================================== */

export const TEMPI = {
  // frazioni dello scroll totale della sequenza
  testi: [0.00, 0.08],        // i testi lasciano la scena
  carrellata: [0.02, 0.68],   // la telecamera scivola verso destra, lenta
  velo: [0.04, 0.30],         // il velo scuro si dirada
  ragazza: [0.16, 0.46],      // la ragazza esce a sinistra; sfuma solo mentre lascia l'inquadratura
  nuovaFoto: [0.44, 0.66],    // il campo si trasforma, poco alla volta, nella nuova fotografia
  fuoco: [0.44, 0.72],        // …che arriva appena morbida e si assesta
  crema: [0.80, 0.90],        // il fondo diventa quello della sezione
  atterraggio: [0.80, 0.95],  // la foto prende posto nella sezione
  consegna: [0.95, 1.00],     // la hero lascia vedere la sezione vera
};

export const PROFONDITA_RAGAZZA = 3.6;   // in primo piano come le spighe più vicine: scorre abbastanza da uscire a sinistra
export const AVANZAMENTO = 1.0;      // avanzamento prospettico, molto moderato (il livello più vicino è a 3.6)
const SCORRIMENTO_MAX = 0.09;        // spostamento massimo dello sfondo, in frazione della larghezza della hero

export const frazione = (p, [a, b]) => Math.max(0, Math.min(1, (p - a) / (b - a)));
export const morbido = (t) => t * t * (3 - 2 * t);

/**
 * Di quanto può spostarsi di lato la telecamera senza scoprire il bordo della fotografia.
 * L'avanzamento ingrandisce appena lo sfondo: quel margine è tutto lo spazio disponibile.
 * @param {{larghezza:number, altezza:number}} hero
 * @param {{sinistra:number, larghezza:number}} copertura  la foto com'è disposta a telecamera ferma (px)
 * @param {number} profonditaSfondo
 * @returns {{x:number, y:number}} spostamento finale della telecamera (unità)
 */
export function calcolaCorsa(hero, copertura, profonditaSfondo) {
  const distanzaFinale = profonditaSfondo - AVANZAMENTO;
  const scala = profonditaSfondo / distanzaFinale;
  const cx = hero.larghezza / 2;
  const bordoDestro = cx + (copertura.sinistra + copertura.larghezza - cx) * scala;
  const margine = Math.max(0, bordoDestro - hero.larghezza);
  const scorrimento = Math.min(margine * 0.85, hero.larghezza * SCORRIMENTO_MAX);
  return { x: scorrimento * distanzaFinale / hero.altezza, y: 0 };
}

/**
 * Posizione della telecamera a un dato punto dello scroll.
 * @param {number} p  avanzamento della sequenza, 0–1
 * @param {{x:number, y:number}} corsa  spostamento finale (da calcolaCorsa)
 */
export function telecamera(p, corsa) {
  const t = morbido(frazione(p, TEMPI.carrellata));   // parte e arriva dolcemente
  return { x: corsa.x * t, y: corsa.y * t, z: AVANZAMENTO * t };
}

/**
 * Dove finisce sullo schermo un piano che a riposo occupa il rettangolo dato.
 * @param {{x:number, y:number, larghezza:number, altezza:number}} riposo  rettangolo a telecamera ferma (px)
 * @param {{larghezza:number, altezza:number}} hero
 * @param {number} profondita
 * @param {{x:number, y:number, z:number}} cam
 * @returns {{x:number, y:number, larghezza:number, altezza:number, scala:number, distanza:number}}
 */
export function proietta(riposo, hero, profondita, cam) {
  const distanza = profondita - cam.z;
  const scala = profondita / distanza;
  const cx = hero.larghezza / 2, cy = hero.altezza / 2;
  // la telecamera si sposta di cam.x, cam.y (in unità = altezze di hero a distanza 1)
  const dx = -cam.x * hero.altezza / distanza;
  const dy = -cam.y * hero.altezza / distanza;
  return {
    x: cx + (riposo.x - cx) * scala + dx,
    y: cy + (riposo.y - cy) * scala + dy,
    larghezza: riposo.larghezza * scala,
    altezza: riposo.altezza * scala,
    scala,
    distanza,
  };
}
