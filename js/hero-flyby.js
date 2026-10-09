/* ===================================================
   HERO-FLYBY.JS — Sequenza 3D della hero guidata dallo scroll
   Three.js disegna la ragazza su un canvas a tutta hero; una timeline
   GSAP legata a ScrollTrigger muove la telecamera lungo una curva
   (js/hero-percorso.js) e coordina testi, foto e fogli di carta.

   Scena 1  composizione originale, movimenti delicati
   Scena 2  la telecamera avanza e si sposta di lato
   Scena 3  passa accanto alla ragazza, che esce dall'inquadratura
   Scena 4  resta la foto del campo, poi salgono i fogli di carta

   Se il 3D non può partire (meno animazioni, risparmio dati, niente
   WebGL, errore di caricamento) la hero resta quella statica.
   =================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { creaPercorso } from './hero-percorso.js';

/* ---------- Parametri regolabili ---------- */
const CONFIG = {
  modello: 'models/woman.glb',

  fov: 30,
  // L'illustrazione ha un margine vuoto in alto: la figura ne occupa circa l'84%
  quotaFigura: 0.84,
  taglioBase: 0.03,

  // Lunghezza della sequenza, in altezze di schermo
  scrollDesktop: 4.2,
  scrollMobile: 3.6,
  inerzia: 0.9,         // secondi di ritardo morbido tra scroll e telecamera

  // Movimenti a riposo (scena 1), poi si spengono con lo scroll
  dondolioZ: 0.012,
  dondolioY: 0.028,
  respiro: 0.004,
  cursoreY: 0.14,
  cursoreX: 0.04,
  parallasse: 0.04,
  morbidezza: 2.2,
};

const hero = document.querySelector('.hero-viewport');
const canvas = hero && hero.querySelector('.hero-scena-3d');
const illustrazione = hero && hero.querySelector('.hero-ragazza');

function puoPartire() {
  if (!hero || !canvas || !illustrazione) return false;
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
  const camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.05, 30);

  /* Luce morbida e diffusa: niente riflessi o ombre dure,
     così i colori restano piatti come nel disegno */
  scena.add(new THREE.HemisphereLight(0xffffff, 0xeadfcb, 2.1));
  const sole = new THREE.DirectionalLight(0xfff3dd, 0.9);
  sole.position.set(-1.5, 2, 3);
  scena.add(sole);

  // Il perno sta alla base della figura: l'oscillazione parte da lì
  const perno = new THREE.Group();
  scena.add(perno);

  /* Stato animato dalla timeline: u = avanzamento sulla curva,
     quiete = quanto contano dondolio e cursore (1 all'inizio, 0 in volo) */
  const stato = { u: 0, quiete: 1 };
  let percorso = null;

  function inquadra() {
    const larghezza = canvas.clientWidth;
    const altezza = canvas.clientHeight;
    if (!larghezza || !altezza) return;
    renderer.setSize(larghezza, altezza, false);
    camera.aspect = larghezza / altezza;
    camera.updateProjectionMatrix();

    // La composizione iniziale ricalca il riquadro dell'illustrazione
    const rHero = hero.getBoundingClientRect();
    const rIll = illustrazione.getBoundingClientRect();
    percorso = creaPercorso(THREE, {
      aspetto: camera.aspect,
      fov: CONFIG.fov,
      altezzaFigura: CONFIG.quotaFigura * rIll.height / rHero.height,
      centroX: (rIll.left - rHero.left + rIll.width / 2) / rHero.width,
      taglioBase: CONFIG.taglioBase,
    });
    daRidisegnare = true;
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
  const posizione = new THREE.Vector3();
  const bersaglio = new THREE.Vector3();
  let visibile = true;
  let attivo = false;
  let idFrame = 0;
  let ultimoU = -1;
  let daRidisegnare = true;

  function disegna() {
    idFrame = requestAnimationFrame(disegna);
    if (!percorso) return;
    const dt = Math.min(orologio.getDelta(), 0.1);
    const t = orologio.elapsedTime;

    // In volo, a scroll fermo, l'immagine non cambia: niente lavoro inutile
    if (stato.quiete === 0 && stato.u === ultimoU && !daRidisegnare) return;
    ultimoU = stato.u;
    daRidisegnare = false;

    const k = 1 - Math.exp(-CONFIG.morbidezza * dt);
    attuale.x += (puntatore.x - attuale.x) * k;
    attuale.y += (puntatore.y - attuale.y) * k;

    // Periodi diversi e non multipli tra loro: il movimento non si ripete mai uguale
    const q = stato.quiete;
    perno.rotation.z = Math.sin(t * 0.62) * CONFIG.dondolioZ * q;
    perno.rotation.y = (Math.sin(t * 0.41 + 1.3) * CONFIG.dondolioY + attuale.x * CONFIG.cursoreY) * q;
    perno.rotation.x = attuale.y * CONFIG.cursoreX * q;
    perno.scale.y = 1 + Math.sin(t * 0.9) * CONFIG.respiro * q;

    // Posizione e orientamento dalla stessa u: restano sincronizzati
    percorso.posizioni.getPoint(stato.u, posizione);
    percorso.bersagli.getPoint(stato.u, bersaglio);
    posizione.x -= attuale.x * CONFIG.parallasse * q;
    posizione.y -= attuale.y * CONFIG.parallasse * 0.5 * q;
    camera.position.copy(posizione);
    camera.lookAt(bersaglio);

    renderer.render(scena, camera);
  }

  function aggiornaCiclo() {
    const deveGirare = attivo && visibile && !document.hidden;
    if (deveGirare && !idFrame) {
      orologio.getDelta(); // scarta il tempo passato in pausa
      daRidisegnare = true;
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

  /* ---------- Timeline principale, controllata dallo scroll ---------- */
  let timeline = null;

  function creaTimeline() {
    gsap.registerPlugin(ScrollTrigger);

    const schermi = mobile ? CONFIG.scrollMobile : CONFIG.scrollDesktop;
    const DURATA = 10;
    // I fogli salgono di un'altezza di schermo in "uno schermo" di scroll:
    // stessa velocità con cui poi scorre la pagina, quindi nessuno stacco
    const durataCarta = DURATA / schermi;
    const inizioCarta = DURATA - durataCarta;
    const inizioVolo = 0.3;
    const durataVolo = inizioCarta - 0.5 - inizioVolo;

    const testi = hero.querySelectorAll('.hero-testo, .hero-bottom-text, .hero-scroll-indicator, .api-container');

    timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: () => '+=' + Math.round(window.innerHeight * schermi),
        pin: true,
        scrub: CONFIG.inerzia,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    timeline
      // Scena 1 → 2: i testi lasciano spazio, i movimenti a riposo si spengono
      .to(testi, { autoAlpha: 0, duration: 1.2, ease: 'power1.in' }, inizioVolo)
      .to(stato, { quiete: 0, duration: 1.5 }, inizioVolo)
      // Scene 2 e 3: la telecamera percorre la curva (parte e arriva dolcemente)
      .to(stato, { u: 1, duration: durataVolo, ease: 'sine.inOut' }, inizioVolo)
      // La foto accompagna appena lo spostamento laterale della telecamera
      .to('.hero-bg', { xPercent: 1.5, scale: 1.06, duration: durataVolo, ease: 'sine.inOut' }, inizioVolo)
      // Scena 4: il velo scuro si dirada, la foto del campo resta protagonista
      .to(hero, { '--velo': 0, duration: durataVolo * 0.55 }, inizioVolo + 1)
      // Transizione: due fogli di carta ritagliata salgono e coprono la hero
      .to('.hero-carta-verde', { yPercent: -100, duration: durataCarta + 0.35 }, inizioCarta - 0.35)
      .to('.hero-carta-crema', { yPercent: -100, duration: durataCarta }, inizioCarta);
  }

  function attiva() {
    attivo = true;
    // ScrollTrigger gestisce da sé lo scroll: lo smooth nativo lo farebbe sfasare
    document.documentElement.style.scrollBehavior = 'auto';
    hero.style.transform = '';
    hero.classList.add('flyby-attivo');
    creaTimeline();
    aggiornaCiclo();
  }

  function tornaAlFallback() {
    attivo = false;
    aggiornaCiclo();
    if (timeline) {
      timeline.scrollTrigger.kill(true);
      timeline.progress(0).kill();
      timeline = null;
      gsap.set(hero.querySelectorAll('.hero-testo, .hero-bottom-text, .hero-scroll-indicator, .api-container, .hero-bg, .hero-carta'), { clearProps: 'all' });
      hero.style.removeProperty('--velo');
    }
    document.documentElement.style.scrollBehavior = '';
    hero.classList.remove('flyby-attivo');
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

    // La sequenza parte dalla cima della pagina: se nel frattempo si è già
    // scesi, si aspetta il ritorno in alto per non far saltare il contenuto
    if (window.scrollY < 4) {
      attiva();
    } else {
      const quandoInCima = () => {
        if (window.scrollY >= 4) return;
        window.removeEventListener('scroll', quandoInCima);
        attiva();
      };
      window.addEventListener('scroll', quandoInCima, { passive: true });
    }
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
