/* ===================================================
   HERO-PERCORSO.JS — Traiettoria della telecamera nel flyby
   Modulo senza DOM: riceve THREE e le misure della composizione
   iniziale, restituisce due curve (posizione e punto guardato)
   percorse con lo stesso parametro, così restano sincronizzate.

   Unità: il modello è normalizzato ad altezza 1, base a y = 0,
   centrato su x/z, e guarda verso +Z.
   =================================================== */

// Punto d'interesse: il viso (la testa è spostata verso -X rispetto al busto)
const VISO = { x: -0.09, y: 0.84, z: 0 };

/**
 * @param {object} THREE
 * @param {object} c
 * @param {number} c.aspetto        larghezza / altezza del canvas
 * @param {number} c.fov            campo visivo verticale, in gradi
 * @param {number} c.altezzaFigura  quota dell'altezza del canvas occupata dalla figura all'inizio
 * @param {number} c.centroX        posizione orizzontale della figura all'inizio (0 = sinistra, 1 = destra)
 * @param {number} c.taglioBase     quanto della base resta sotto il bordo inferiore
 */
export function creaPercorso(THREE, c) {
  const V = THREE.Vector3;
  const tan = Math.tan(THREE.MathUtils.degToRad(c.fov / 2));

  /* ---------- Scena 1: stessa composizione dell'illustrazione ----------
     La telecamera guarda dritto davanti a sé ed è spostata di lato:
     la ragazza resta a sinistra senza essere ruotata. */
  const distanza = 1 / (2 * c.altezzaFigura * tan);
  const altezzaVista = 2 * distanza * tan;
  const larghezzaVista = altezzaVista * c.aspetto;
  const p0 = new V(
    larghezzaVista * (0.5 - c.centroX),
    c.taglioBase + altezzaVista / 2,
    distanza
  );
  const t0 = new V(p0.x, p0.y, 0);

  // Su schermi stretti la telecamera resta più lontana, altrimenti si vedrebbe solo un dettaglio
  const k = THREE.MathUtils.clamp(1.3 / c.aspetto, 1, 2.4);
  const kLato = Math.sqrt(k);

  /* ---------- Scene 2–4: avvicinamento, passaggio accanto, uscita ----------
     La telecamera attraversa davanti alla ragazza e le passa sulla sua destra (-X),
     guardando in avanti: non la inquadra mai da dietro, dove il modello non è disegnato.
     Distanza minima dalla superficie: circa 0.78 (verificata campionando il percorso). */
  const p2 = new V(VISO.x + 0.25, VISO.y - 0.05, 1.25 * k);
  const p1 = p0.clone().lerp(p2, 0.5).add(new V(0.1, 0, 0));
  const p3 = new V(VISO.x - 0.50 * kLato, VISO.y, 0.85 * k);
  const p4 = new V(VISO.x - 0.80 * kLato, VISO.y, 0.45);
  const p5 = new V(VISO.x - 0.95 * kLato, VISO.y, -0.05);
  const p6 = new V(VISO.x - 1.05 * kLato, VISO.y - 0.02, -0.7);
  const p7 = new V(VISO.x - 1.10 * kLato, VISO.y - 0.04, -1.4);

  const t2 = new V(-0.05, 0.80, 0);
  // Mentre avanza, lo sguardo scende verso il viso senza scoprire il taglio alla base
  const t1 = t0.clone().lerp(t2, 0.5);
  t1.y = Math.max(t2.y, c.taglioBase + 0.03 + p1.z * tan);
  const t3 = new V(-0.02, 0.82, 0);
  // Lo sguardo si stacca da lei e va in avanti: esce dal bordo destro, di tre quarti
  const t4 = new V(-0.35, 0.83, -0.25);
  const t5 = new V(p5.x + 0.15, 0.83, p5.z - 1.0);
  const t6 = new V(p6.x, 0.80, p6.z - 1.5);
  const t7 = new V(p7.x, 0.78, p7.z - 1.8);

  return {
    posizioni: new THREE.CatmullRomCurve3([p0, p1, p2, p3, p4, p5, p6, p7], false, 'centripetal'),
    bersagli: new THREE.CatmullRomCurve3([t0, t1, t2, t3, t4, t5, t6, t7], false, 'centripetal'),
  };
}
