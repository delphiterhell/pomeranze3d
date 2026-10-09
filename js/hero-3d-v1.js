/* ===================================================
   HERO-3D.JS — La ragazza della hero in 3D (Three.js)
   L'illustrazione statica (images/ragazza.webp) resta nel DOM:
   definisce l'ingombro e fa da fallback finché il modello non è
   pronto, o per sempre se il 3D non può/non deve partire.
   =================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ---------- Parametri regolabili ---------- */
const CONFIG = {
  modello: 'models/woman.glb',

  // Inquadratura
  fov: 24,              // focale lunga: prospettiva appena accennata
  riempimento: 0.84,    // quota dell'altezza del riquadro occupata dalla figura
  taglioBase: 0.02,     // quanto della base resta sotto il bordo (nasconde il taglio)
  rotazioneBaseY: 0,    // radianti: orientamento di partenza del modello

  // Oscillazione naturale (radianti, molto piccola)
  dondolioZ: 0.012,
  dondolioY: 0.028,
  respiro: 0.004,

  // Risposta al cursore
  cursoreY: 0.16,       // quanto si volta a destra/sinistra
  cursoreX: 0.05,       // quanto si inclina su/giù
  parallasse: 0.035,    // spostamento della camera: dà profondità
  morbidezza: 2.2,      // più basso = più lenta e morbida
};

const scena3d = document.querySelector('.hero-ragazza-scena');
const canvas = scena3d && scena3d.querySelector('.hero-ragazza-canvas');
const hero = document.querySelector('.hero-viewport');

/* Il 3D parte solo se ha senso: altrimenti resta l'illustrazione */
function puoPartire() {
  if (!scena3d || !canvas || !hero) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (navigator.connection && navigator.connection.saveData) return false;
  const prova = document.createElement('canvas');
  return !!(prova.getContext('webgl2') || prova.getContext('webgl'));
}

function avvia() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (errore) {
    return; // niente WebGL: resta l'illustrazione
  }
  const mobile = window.matchMedia('(max-width: 767px)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.1, 20);

  /* Luce morbida e diffusa: niente riflessi o ombre dure,
     così i colori restano piatti come nel disegno */
  scena.add(new THREE.HemisphereLight(0xffffff, 0xeadfcb, 2.1));
  const sole = new THREE.DirectionalLight(0xfff3dd, 0.9);
  sole.position.set(-1.5, 2, 3);
  scena.add(sole);

  // Il perno sta alla base della figura: l'oscillazione parte da lì
  const perno = new THREE.Group();
  scena.add(perno);

  let altezzaVista = 1;
  let centroY = 0.5;
  let distanza = 3;

  function inquadra() {
    const larghezza = canvas.clientWidth;
    const altezza = canvas.clientHeight;
    if (!larghezza || !altezza) return;
    renderer.setSize(larghezza, altezza, false);
    camera.aspect = larghezza / altezza;

    // Il modello è normalizzato ad altezza 1 con la base a y = 0
    altezzaVista = 1 / CONFIG.riempimento;
    centroY = CONFIG.taglioBase + altezzaVista / 2;
    distanza = (altezzaVista / 2) / Math.tan(THREE.MathUtils.degToRad(CONFIG.fov / 2));
    camera.updateProjectionMatrix();
  }

  /* ---------- Cursore ---------- */
  const puntatore = { x: 0, y: 0 };   // bersaglio, da -1 a 1
  const attuale = { x: 0, y: 0 };     // valore smorzato
  window.addEventListener('pointermove', (evento) => {
    if (evento.pointerType === 'touch') return;
    const rect = hero.getBoundingClientRect();
    puntatore.x = THREE.MathUtils.clamp(((evento.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    puntatore.y = THREE.MathUtils.clamp(((evento.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    puntatore.x = 0;
    puntatore.y = 0;
  });

  /* ---------- Ciclo di disegno ---------- */
  const orologio = new THREE.Clock();
  let visibile = true;
  let attivo = false;
  let idFrame = 0;

  function disegna() {
    idFrame = requestAnimationFrame(disegna);
    const dt = Math.min(orologio.getDelta(), 0.1);
    const t = orologio.elapsedTime;

    const k = 1 - Math.exp(-CONFIG.morbidezza * dt);
    attuale.x += (puntatore.x - attuale.x) * k;
    attuale.y += (puntatore.y - attuale.y) * k;

    // Periodi diversi e non multipli tra loro: il movimento non si ripete mai uguale
    perno.rotation.z = Math.sin(t * 0.62) * CONFIG.dondolioZ;
    perno.rotation.y = CONFIG.rotazioneBaseY
      + Math.sin(t * 0.41 + 1.3) * CONFIG.dondolioY
      + attuale.x * CONFIG.cursoreY;
    perno.rotation.x = attuale.y * CONFIG.cursoreX;
    perno.scale.y = 1 + Math.sin(t * 0.9) * CONFIG.respiro;

    camera.position.set(
      -attuale.x * CONFIG.parallasse,
      centroY - attuale.y * CONFIG.parallasse * 0.5,
      distanza
    );
    camera.lookAt(0, centroY, 0);

    renderer.render(scena, camera);
  }

  function aggiornaCiclo() {
    const deveGirare = attivo && visibile && !document.hidden;
    if (deveGirare && !idFrame) {
      orologio.getDelta(); // scarta il tempo passato in pausa
      idFrame = requestAnimationFrame(disegna);
    } else if (!deveGirare && idFrame) {
      cancelAnimationFrame(idFrame);
      idFrame = 0;
    }
  }

  // Fermo quando la hero è fuori schermo o la scheda è nascosta
  new IntersectionObserver((voci) => {
    visibile = voci[0].isIntersecting;
    aggiornaCiclo();
  }).observe(hero);
  document.addEventListener('visibilitychange', aggiornaCiclo);
  new ResizeObserver(inquadra).observe(canvas);

  function tornaAlFallback() {
    attivo = false;
    aggiornaCiclo();
    scena3d.classList.remove('is-3d');
  }
  canvas.addEventListener('webglcontextlost', (evento) => {
    evento.preventDefault();
    tornaAlFallback();
  });

  /* ---------- Caricamento del modello ---------- */
  new GLTFLoader().load(CONFIG.modello, (gltf) => {
    const modello = gltf.scene;

    modello.traverse((nodo) => {
      if (!nodo.isMesh) return;
      const materiali = Array.isArray(nodo.material) ? nodo.material : [nodo.material];
      materiali.forEach((materiale) => {
        // Senza mappa d'ambiente le zone metalliche diventerebbero nere
        materiale.metalnessMap = null;
        materiale.metalness = 0;
        if (materiale.map) materiale.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
        materiale.needsUpdate = true;
      });
    });

    // Normalizza: altezza 1, centrata, base a y = 0 (il file non viene toccato)
    const scatola = new THREE.Box3().setFromObject(modello);
    const misura = scatola.getSize(new THREE.Vector3());
    const centro = scatola.getCenter(new THREE.Vector3());
    const scala = 1 / misura.y;
    modello.scale.setScalar(scala);
    modello.position.set(-centro.x * scala, -scatola.min.y * scala, -centro.z * scala);
    perno.add(modello);

    inquadra();
    renderer.compile(scena, camera);
    renderer.render(scena, camera);

    attivo = true;
    scena3d.classList.add('is-3d');
    aggiornaCiclo();
  }, undefined, (errore) => {
    console.warn('Hero 3D: modello non caricato, resta l\'illustrazione.', errore);
    renderer.dispose();
  });
}

if (puoPartire()) {
  // Dopo il load: il modello non rallenta la comparsa della pagina
  if (document.readyState === 'complete') avvia();
  else window.addEventListener('load', avvia, { once: true });
}
