/* ===================================================
   API-3D.JS — Le api della hero in tre dimensioni (Three.js)
   Versione sperimentale: sostituisce le api SVG di js/bees.js
   solo nella demo (index-api-3d.html, js/hero-scena-api.js).

   Le api ricalcano il disegno SVG originale (stesse proporzioni e
   stessi colori) ma sono solidi veri: volano lungo curve chiuse
   CatmullRomCurve3 nello spazio, viste da una telecamera prospettica,
   quindi rimpiccioliscono e ingrandiscono davvero con la distanza.

   Nessun DOM qui dentro: chi usa il modulo misura la hero e passa
   i numeri a inquadra(). Il renderer è quello della scena esistente.
   =================================================== */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------- Parametri regolabili ---------- */
const CONFIG = {
  // Colori dell'SVG originale (la striscia è il nero all'85% sopra il giallo)
  giallo: '#F5C842',
  nero: '#2a2a2a',
  striscia: '#48422e',
  ala: { colore: 'rgb(200, 230, 255)', alfa: 0.55 },
  bordoAla: { colore: 'rgb(150, 195, 228)', alfa: 0.7 },

  // Lunghezza del corpo alla distanza di riferimento, in frazione dell'altezza della hero
  // (sugli schermi alti e stretti conta la larghezza, altrimenti le api sarebbero enormi)
  taglia: 0.027,
  larghezzaMassima: 1.8,

  luci: { cielo: '#fff6e0', campo: '#4a4420', ambiente: 2.4, sole: '#ffe2b0', forzaSole: 1.6 },
  distanzaCamera: 3.2,   // distanza della telecamera, in mezze altezze della hero (campo visivo di circa 35°)

  // Rallentamento vicino ai fiori: a "raggio" dal fiore l'ape comincia a frenare
  // (frazione dell'altezza della hero, o di 1.1 larghezze se è più stretta), fino a "lentezza" in meno sulla velocità
  sosta: { raggio: 0.085, lentezza: 0.93 },
  margineZone: 28,       // px di rispetto attorno a testi e ragazza, per scegliere i fiori liberi
  sopraIlFiore: 0.022,   // l'ape si ferma poco sopra il fiore (frazione dell'altezza della hero)

  // Dove sta la zinnia accanto alla ragazza, nelle unità del modello (bordo destro della corolla)
  zinnia: [0.18, 0.592],
};

/* Fiori della fotografia di sfondo, in frazioni dell'immagine (x da sinistra, y dall'alto) */
const FIORI = {
  centro: [0.43, 0.59],
  basso: [0.305, 0.78],
  destra: [0.805, 0.846],
};

/* ---------- Percorsi ----------
   Ogni punto è [x, y, profondità] più eventuali opzioni.
   x e y sono "a zone", così i percorsi seguono l'impaginazione reale:
     desktop  x: 0 = bordo destro della ragazza, 1 = bordo sinistro del testo, 2 = bordo destro della hero
              y: 0 = sotto l'header, 1 = inizio del testo, 2 = fine del testo (bottone compreso), 3 = fondo
     mobile   x: 0 = bordo sinistro, 1 = bordo destro della ragazza, 2 = bordo destro
              y: 0 = sotto l'header, 1 = inizio del titolo, 2 = fine del titolo, 3 = inizio della fascia in basso, 4 = fondo
   La profondità va da -0.5 (lontano, nel campo) a +0.4 (vicino alla telecamera).
   { m: true }   → x e y sono nelle unità del modello, cioè relativi alla ragazza
   { fiore }     → se quel fiore della foto è libero l'ape va lì, altrimenti al punto indicato
   { sosta }     → l'ape rallenta passando di qui (true, oppure quanta velocità perde: 0–1)
   davanti: true → l'ape è disegnata sopra la ragazza invece che dietro                   */
const Z = CONFIG.zinnia;
const PERCORSI = {
  desktop: [
    // La visitatrice: un giro ogni tre gesti della ragazza, che finisce sulla zinnia appena annusata
    {
      visitatrice: true, cicli: 3, taglia: 1.0, ali: 8.5,
      punti: [
        [Z[0], Z[1], 0.06, { m: true, sosta: true }],
        [0.36, 0.52, 0.12, { m: true }],
        [0.55, 2.25, 0.3],
        [1.25, 2.6, 0.05, { sosta: 0.5 }],
        [0.8, 2.7, -0.25],
        [0.3, 1.7, -0.1],
        [0.5, 0.7, 0.25],
        [0.25, 1.1, -0.15, { sosta: 0.6 }],
        [0.41, 0.66, 0.0, { m: true }],
      ],
    },
    // Giro alto, sopra il titolo: a destra si ferma un momento in volo
    {
      periodo: 47, fase: 6, taglia: 1.08, ali: 7.6,
      punti: [
        [0.25, 0.5, -0.45], [0.9, 0.35, -0.2], [1.5, 0.5, 0.25],
        [1.85, 0.4, 0.05, { sosta: 0.9 }],
        [1.4, 0.3, -0.3], [0.7, 0.7, 0.1], [0.4, 1.3, 0.3, { sosta: 0.5 }], [0.2, 0.9, -0.1],
      ],
    },
    // Su e giù nel corridoio tra la ragazza e il testo, con due fiori del campo
    {
      periodo: 58, fase: 16, taglia: 0.94, ali: 9.2,
      punti: [
        [0.5, 0.55, 0.3], [0.7, 1.2, 0.1],
        [0.6, 1.7, -0.4, { fiore: 'centro', sosta: true }],
        [0.3, 2.1, -0.2],
        [0.35, 2.5, -0.35, { fiore: 'basso', sosta: true }],
        [0.7, 2.6, 0.1], [0.55, 1.9, 0.35, { sosta: 0.5 }], [0.3, 1.2, 0.15],
      ],
    },
    // In basso, sotto il bottone: va a un fiore lontano nel campo e torna
    {
      periodo: 39, fase: 10, taglia: 1.0, ali: 8.0,
      punti: [
        [0.6, 2.5, 0.3], [1.2, 2.62, 0.0],
        [1.6, 2.6, -0.4, { fiore: 'destra', sosta: true }],
        [1.85, 2.5, -0.6], [1.5, 2.78, 0.2], [0.9, 2.8, 0.35, { sosta: 0.6 }], [0.4, 2.7, 0.0],
      ],
    },
    // La protagonista: scende dal fondo del campo lungo il corridoio, attraversa di lato
    // vicino alla telecamera sotto il testo (la si vede di tre quarti, di fianco, di spalle)
    // e torna a perdersi lontano. È l'unica che si avvicina così tanto
    {
      protagonista: true, davanti: true, periodo: 66, fase: 30, taglia: 1.0, ali: 7.0,
      punti: [
        [1.0, 0.3, -1.2], [0.4, 0.7, -1.0, { sosta: 0.5 }], [0.25, 1.5, -0.6], [0.3, 2.3, 0.1],
        [0.75, 2.62, 0.44],
        [1.2, 2.66, 0.53, { sosta: 0.8 }],
        [1.65, 2.6, 0.34], [1.9, 2.45, -0.2], [1.8, 2.5, -0.9], [1.3, 2.5, -1.2],
        [0.6, 2.2, -1.2], [0.5, 1.2, -1.1], [0.7, 0.5, -1.2],
      ],
    },
  ],
  mobile: [
    {
      visitatrice: true, cicli: 3, taglia: 0.88, ali: 8.5,
      punti: [
        [Z[0], Z[1], 0.06, { m: true, sosta: true }],
        [0.3, 0.84, 0.12, { m: true }],
        [1.1, 2.5, 0.3],
        [1.6, 2.4, 0.0, { sosta: 0.6 }],
        [1.2, 2.7, -0.25],
        [0.6, 2.6, 0.1],
        [0.32, 0.86, 0.0, { m: true }],
      ],
    },
    // La protagonista, in alto sopra il titolo: dal fondo fin vicino alla telecamera e ritorno
    {
      protagonista: true, davanti: true, periodo: 53, fase: 7, taglia: 1.0, ali: 7.0,
      punti: [
        [0.3, 0.4, -1.1], [0.25, 0.7, -0.3], [0.7, 0.72, 0.35],
        [1.1, 0.7, 0.48, { sosta: 0.8 }],
        [1.6, 0.6, 0.26], [1.8, 0.4, -0.4], [1.3, 0.3, -1.1, { sosta: 0.5 }], [0.8, 0.3, -1.2],
      ],
    },
    // Nella fascia tra il titolo e la ragazza
    {
      periodo: 56, fase: 19, taglia: 0.94, ali: 9.2,
      punti: [
        [0.3, 2.5, 0.25], [1.0, 2.35, -0.1],
        [1.6, 2.6, -0.4, { fiore: 'centro', sosta: true }],
        [1.8, 2.4, -0.2], [1.3, 2.7, 0.2], [0.6, 2.65, 0.35, { sosta: 0.5 }],
      ],
    },
  ],
};

/* ---------- Geometrie: il disegno SVG fatto solido ----------
   Unità: 1 = lunghezza del corpo nel disegno SVG. Rispetto al disegno il corpo è
   più slanciato: circa un terzo più lungo, con l'addome e le ali più sottili.
   Assi dell'ape: +Z in avanti, +Y in alto.                          */

// Colora ogni faccia secondo la sua posizione lungo il corpo.
// Il volume lo danno le luci della scena: le normali restano, tranne che per le ali
function dipingi(geometria, scegli, { alfa } = {}) {
  const g = geometria.index ? geometria.toNonIndexed() : geometria;
  const pos = g.attributes.position;
  const passo = alfa === undefined ? 3 : 4;
  const colori = new Float32Array(pos.count * passo);
  for (let i = 0; i < pos.count; i += 3) {
    const colore = scegli((pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3);
    for (let k = i; k < i + 3; k++) {
      colori[k * passo] = colore.r;
      colori[k * passo + 1] = colore.g;
      colori[k * passo + 2] = colore.b;
      if (passo === 4) colori[k * passo + 3] = alfa;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colori, passo));
  if (alfa !== undefined) g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return g;
}

function creaCorpo() {
  const giallo = new THREE.Color(CONFIG.giallo);
  const nero = new THREE.Color(CONFIG.nero);
  const striscia = new THREE.Color(CONFIG.striscia);
  const tutto = (colore) => () => colore;
  const parti = [];

  // Addome: l'ellisse dell'SVG fatta ruotare e allungata; gli anelli cadono sui bordi delle due strisce
  const meta = 0.56;     // mezza lunghezza dell'addome
  const raggio = 0.195;  // mezza larghezza
  const strisce = [[-0.28, -0.1], [0.025, 0.2]];
  const quote = [-0.56, -0.515, -0.415, strisce[0][0], strisce[0][1], strisce[1][0], strisce[1][1], 0.35, 0.46, 0.527, 0.56];
  const profilo = quote.map((q) => new THREE.Vector2(raggio * Math.sqrt(Math.max(0, 1 - (q / meta) ** 2)), q));
  const addome = new THREE.LatheGeometry(profilo, 10).rotateX(Math.PI / 2);
  const inStriscia = (z) => strisce.some(([da, a]) => z > da && z < a);
  parti.push(dipingi(addome, (z) => (inStriscia(z) ? striscia : giallo)).translate(0, 0, -0.19));

  // Testa
  parti.push(dipingi(new THREE.SphereGeometry(0.16, 10, 8), tutto(giallo)).translate(0, 0, 0.42));

  for (const lato of [-1, 1]) {
    // Occhi
    parti.push(dipingi(new THREE.SphereGeometry(0.05, 8, 6), tutto(nero)).translate(lato * 0.095, 0.06, 0.54));

    // Antenna con il pallino in punta
    const base = new THREE.Vector3(lato * 0.06, 0.13, 0.5);
    const punta = new THREE.Vector3(lato * 0.16, 0.27, 0.7);
    const stelo = new THREE.CylinderGeometry(0.017, 0.017, base.distanceTo(punta), 4, 1, true);
    stelo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), punta.clone().sub(base).normalize()));
    const centro = base.clone().lerp(punta, 0.5);
    parti.push(dipingi(stelo, tutto(nero)).translate(centro.x, centro.y, centro.z));
    parti.push(dipingi(new THREE.SphereGeometry(0.04, 6, 4), tutto(nero)).translate(punta.x, punta.y, punta.z));
  }

  const corpo = mergeGeometries(parti);
  parti.forEach((p) => p.dispose());
  return corpo;
}

// Ala destra: l'ellisse dell'SVG resa più lunga e sottile, distesa in orizzontale, con l'origine sul cardine
function creaAla() {
  const velo = dipingi(new THREE.CircleGeometry(0.94, 14), () => new THREE.Color(CONFIG.ala.colore), { alfa: CONFIG.ala.alfa });
  const bordo = dipingi(new THREE.RingGeometry(0.94, 1, 14), () => new THREE.Color(CONFIG.bordoAla.colore), { alfa: CONFIG.bordoAla.alfa });
  const ala = mergeGeometries([velo, bordo]);
  velo.dispose();
  bordo.dispose();
  return ala.rotateX(-Math.PI / 2).scale(0.54, 1, 0.14).translate(0.46, 0, 0.07);
}

/* ---------- Orario di volo ----------
   Dice a che punto della curva (0–1, a lunghezza d'arco) si trova l'ape dopo "tau" secondi.
   Vicino alle soste la velocità cala; altrove varia appena, con un'andatura diversa
   per ogni ape ("seme"), così il volo non è mai uniforme. Con "durate" ogni tratto
   tra una sosta e la successiva dura esattamente quanto richiesto.                   */
const PASSI = 720;

function creaOrario(uSoste, ampiezza, lentezze, durate, seme = 0) {
  const u0 = uSoste.length ? uSoste[0] : 0;
  const tempi = new Float32Array(PASSI + 1);
  for (let i = 0; i < PASSI; i++) {
    const u = u0 + (i + 0.5) / PASSI;
    let freno = 0;
    uSoste.forEach((s, k) => {
      let d = Math.abs(u - s) % 1;
      if (d > 0.5) d = 1 - d;
      freno = Math.max(freno, lentezze[k] * Math.exp(-((d / ampiezza) ** 2)));
    });
    // frequenze intere: l'andatura si richiude senza scatti a fine giro
    const andatura = 1 + 0.13 * Math.sin(2 * Math.PI * 2 * u + seme) + 0.07 * Math.sin(2 * Math.PI * 5 * u + seme * 1.7);
    tempi[i + 1] = tempi[i] + 1 / ((1 - freno) * andatura);
  }

  // Ogni tratto viene riscalato sulla sua durata
  const confini = durate.length > 1 ? uSoste.map((s) => Math.round((s - u0) * PASSI)) : [0];
  confini.push(PASSI);
  const grezzi = Float32Array.from(tempi);
  let inizio = 0;
  for (let k = 0; k < confini.length - 1; k++) {
    const a = confini[k];
    const b = confini[k + 1];
    const scala = durate[k] / (grezzi[b] - grezzi[a]);
    for (let i = a + 1; i <= b; i++) tempi[i] = inizio + (grezzi[i] - grezzi[a]) * scala;
    inizio += durate[k];
  }

  return (tau) => {
    let basso = 0;
    let alto = PASSI;
    while (alto - basso > 1) {
      const meta = (basso + alto) >> 1;
      if (tempi[meta] <= tau) basso = meta; else alto = meta;
    }
    const tratto = tempi[alto] - tempi[basso];
    const resto = tratto > 0 ? (tau - tempi[basso]) / tratto : 0;
    return (u0 + (basso + resto) / PASSI) % 1;
  };
}

const modulo = (valore, base) => ((valore % base) + base) % base;
const tra = (valori, t) => {
  const i = Math.min(Math.max(Math.floor(t), 0), valori.length - 2);
  return valori[i] + (valori[i + 1] - valori[i]) * (t - i);
};

/* ---------- Le api ---------- */

/**
 * @param {{durata:number, pausa:number}} gesto  durata del gesto della ragazza e della pausa che lo segue (secondi)
 * @param {{demo?:boolean, debug?:boolean}} [modo]
 *        demo: vola solo la protagonista, con un giro più breve; debug: tutte le api.
 *        In entrambi i casi le traiettorie sono disegnate, dal blu (lontano) al rosso (vicino alla telecamera)
 */
export function creaApi(gesto, modo = {}) {
  const corpo = creaCorpo();
  const ala = creaAla();
  // Il corpo prende luce: girandosi cambia chiaroscuro, ed è questo a farlo leggere come un solido
  const matCorpo = new THREE.MeshLambertMaterial({ vertexColors: true });
  const matAla = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });

  // Due livelli: dietro alla ragazza (tutte le api) e davanti (solo la visitatrice, che si posa sulla zinnia)
  const dietro = new THREE.Scene();
  const davanti = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
  for (const livello of [dietro, davanti]) {
    // Cielo chiaro sopra, verde scuro del campo sotto, più una luce calda di taglio
    livello.add(new THREE.HemisphereLight(CONFIG.luci.cielo, CONFIG.luci.campo, CONFIG.luci.ambiente));
    const sole = new THREE.DirectionalLight(CONFIG.luci.sole, CONFIG.luci.forzaSole);
    sole.position.set(-0.4, 0.9, 0.7);
    livello.add(sole);
  }

  const quante = Math.max(PERCORSI.desktop.length, PERCORSI.mobile.length);
  const api = [];
  for (let i = 0; i < quante; i++) {
    const gruppo = new THREE.Group();
    gruppo.add(new THREE.Mesh(corpo, matCorpo));
    const ali = [1, -1].map((lato) => {
      const cardine = new THREE.Group();
      cardine.position.set(lato * 0.05, 0.13, 0.22);
      cardine.scale.x = lato;
      cardine.add(new THREE.Mesh(ala, matAla));
      gruppo.add(cardine);
      return cardine;
    });
    gruppo.visible = false;
    api.push({ gruppo, ali, curva: null, orario: null, percorso: null, partita: false, traccia: null });
  }

  const cicloGesto = gesto.durata + gesto.pausa;
  let ondeggio = 0;
  let distanzaCamera = 1;
  const matTraccia = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthTest: false });
  const stato = { profondita: 0, ingrandimento: 1 };   // della protagonista, per le modalità di prova

  /**
   * Ricostruisce i percorsi sulle misure correnti della hero.
   * @param {object} m
   * @param {number} m.larghezza, m.altezza   hero in px
   * @param {{sinistra:number,destra:number,alto:number,basso:number}} m.vista  ciò che inquadra la telecamera della scena, nelle sue unità
   * @param {boolean} m.mobile
   * @param {{xs:number[], ys:number[]}} m.ancore  confini delle zone, in px (vedi PERCORSI)
   * @param {Array<{sinistra:number,alto:number,destra:number,basso:number}>} m.zone  testi e ragazza, in px
   * @param {{sinistra:number,alto:number,larghezza:number,altezza:number}} m.copertura  la foto di sfondo, in px
   */
  function inquadra(m) {
    const larghezzaVista = m.vista.destra - m.vista.sinistra;
    const altezzaVista = m.vista.alto - m.vista.basso;
    const cx = (m.vista.sinistra + m.vista.destra) / 2;
    const cy = (m.vista.alto + m.vista.basso) / 2;
    const distanza = CONFIG.distanzaCamera * altezzaVista / 2;
    distanzaCamera = distanza;

    // Alla profondità zero questa telecamera inquadra esattamente come quella della scena
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(altezzaVista / 2 / distanza));
    camera.aspect = m.larghezza / m.altezza;
    camera.near = distanza * 0.1;
    camera.far = distanza * 4;
    camera.position.set(cx, cy, distanza);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // Un punto dello schermo (in unità della scena) portato alla profondità voluta, lungo la linea di vista
    const nelloSpazio = (x, y, d) => new THREE.Vector3(cx + (x - cx) * (1 - d), cy + (y - cy) * (1 - d), d * distanza);
    const daPixel = (px, py, d) => nelloSpazio(
      m.vista.sinistra + (px / m.larghezza) * larghezzaVista,
      m.vista.alto - (py / m.altezza) * altezzaVista,
      d
    );
    const libero = (px, py) => {
      const k = CONFIG.margineZone;
      if (px < k || px > m.larghezza - k || py < m.ancore.ys[0] + k || py > m.altezza - k) return false;
      return !m.zone.some((z) => px > z.sinistra - k && px < z.destra + k && py > z.alto - k && py < z.basso + k);
    };

    const misuraApe = Math.min(altezzaVista, CONFIG.larghezzaMassima * larghezzaVista);
    const misuraSosta = Math.min(altezzaVista, 1.1 * larghezzaVista);
    ondeggio = misuraApe * 0.006;
    let percorsi = m.mobile ? PERCORSI.mobile : PERCORSI.desktop;
    if (modo.demo) percorsi = percorsi.filter((p) => p.protagonista).map((p) => ({ ...p, periodo: 31, fase: 17 }));
    api.forEach((ape, i) => {
      const percorso = percorsi[i];
      ape.percorso = percorso || null;
      ape.gruppo.visible = !!percorso;
      if (ape.traccia) { ape.traccia.removeFromParent(); ape.traccia.geometry.dispose(); ape.traccia = null; }
      if (!percorso) return;
      (percorso.visitatrice || percorso.davanti ? davanti : dietro).add(ape.gruppo);

      const soste = [];
      const punti = percorso.punti.map(([x, y, d, opzioni = {}], indice) => {
        if (opzioni.sosta) soste.push({ indice, lentezza: opzioni.sosta === true ? CONFIG.sosta.lentezza : opzioni.sosta });
        if (opzioni.m) return nelloSpazio(x, y, d);
        if (opzioni.fiore) {
          const [fx, fy] = FIORI[opzioni.fiore];
          const px = m.copertura.sinistra + fx * m.copertura.larghezza;
          const py = m.copertura.alto + fy * m.copertura.altezza - CONFIG.sopraIlFiore * m.altezza;
          if (libero(px, py)) return daPixel(px, py, d);
        }
        return daPixel(tra(m.ancore.xs, x), tra(m.ancore.ys, y), d);
      });

      const curva = new THREE.CatmullRomCurve3(punti, true, 'centripetal');
      const fitte = 40;
      curva.arcLengthDivisions = punti.length * fitte;
      const lunghezze = curva.getLengths();
      const totale = lunghezze[lunghezze.length - 1];
      const uSoste = soste.map((sosta) => lunghezze[sosta.indice * fitte] / totale);
      const ampiezza = (CONFIG.sosta.raggio * misuraSosta) / totale;
      const durate = percorso.visitatrice ? [cicloGesto * percorso.cicli] : [percorso.periodo];

      ape.curva = curva;
      ape.orario = creaOrario(uSoste, ampiezza, soste.map((sosta) => sosta.lentezza), durate, i * 2.4);
      ape.periodo = durate.reduce((somma, d) => somma + d, 0);
      // La visitatrice è sul fiore a metà della pausa, quando la ragazza si è già rialzata
      ape.fase = percorso.visitatrice ? -(gesto.durata + gesto.pausa * 0.55) : percorso.fase;
      ape.gruppo.scale.setScalar(CONFIG.taglia * misuraApe * percorso.taglia);

      if (modo.debug || modo.demo) {
        const campioni = curva.getSpacedPoints(240);
        const tinte = [];
        const tinta = new THREE.Color();
        for (const c of campioni) {
          // da -1.2 (blu) a +0.7 (rosso)
          tinta.setHSL(0.66 * (1 - THREE.MathUtils.clamp((c.z / distanza + 1.2) / 1.9, 0, 1)), 1, 0.55);
          tinte.push(tinta.r, tinta.g, tinta.b);
        }
        const linea = new THREE.BufferGeometry().setFromPoints(campioni);
        linea.setAttribute('color', new THREE.Float32BufferAttribute(tinte, 3));
        ape.traccia = new THREE.Line(linea, matTraccia);
        ape.traccia.renderOrder = -1;
        davanti.add(ape.traccia);
      }
    });
  }

  const punto = new THREE.Vector3();
  const direzione = new THREE.Vector3();
  const piuAvanti = new THREE.Vector3();
  const matrice = new THREE.Matrix4();
  const meta = new THREE.Quaternion();
  const rollio = new THREE.Quaternion();
  const ORIGINE = new THREE.Vector3();
  const SU = new THREE.Vector3(0, 1, 0);
  const AVANTI = new THREE.Vector3(0, 0, 1);

  /**
   * @param {number} tempo  secondi della scena (lo stesso orologio del gesto della ragazza)
   * @param {number} dt     secondi dall'ultimo fotogramma
   */
  function aggiorna(tempo, dt) {
    api.forEach((ape, i) => {
      if (!ape.percorso || !ape.curva) return;
      const u = ape.orario(modulo(tempo + ape.fase, ape.periodo));
      ape.curva.getPointAt(u, punto);
      ape.curva.getTangentAt(u, direzione);
      ape.curva.getTangentAt((u + 0.012) % 1, piuAvanti);

      // Un filo di ondeggiamento, con ritmi diversi per ogni ape: nessun giro è identico al precedente
      punto.y += Math.sin(tempo * (1.9 + i * 0.37) + i * 2.1) * ondeggio;
      punto.x += Math.sin(tempo * (0.83 + i * 0.21) + i * 4.3) * ondeggio * 0.8;
      ape.gruppo.position.copy(punto);
      if (ape.percorso.protagonista) {
        stato.profondita = punto.z / distanzaCamera;
        stato.ingrandimento = 1 / (1 - stato.profondita);
      }

      // Muso nella direzione del volo (beccheggio attenuato), inclinata verso l'interno delle curve
      let svolta = Math.atan2(piuAvanti.x, piuAvanti.z) - Math.atan2(direzione.x, direzione.z);
      if (svolta > Math.PI) svolta -= 2 * Math.PI;
      if (svolta < -Math.PI) svolta += 2 * Math.PI;
      direzione.y *= 0.85;
      direzione.normalize();
      matrice.lookAt(direzione, ORIGINE, SU);
      meta.setFromRotationMatrix(matrice);
      rollio.setFromAxisAngle(AVANTI, THREE.MathUtils.clamp(-svolta * 4, -0.7, 0.7));
      meta.multiply(rollio);
      if (ape.partita) ape.gruppo.quaternion.slerp(meta, 1 - Math.exp(-dt * 8));
      else { ape.gruppo.quaternion.copy(meta); ape.partita = true; }

      // Ali: battito rapido, sempre sopra il dorso (a V), così si leggono anche di fianco
      const battito = 0.6 + 0.55 * Math.sin(tempo * ape.percorso.ali * 2 * Math.PI + i * 1.7);
      ape.ali[0].rotation.z = battito;
      ape.ali[1].rotation.z = -battito;
    });
  }

  function libera() {
    corpo.dispose();
    ala.dispose();
    matCorpo.dispose();
    matAla.dispose();
    matTraccia.dispose();
  }

  return { dietro, davanti, camera, inquadra, aggiorna, libera, api, stato };
}

export { CONFIG as CONFIG_API };
