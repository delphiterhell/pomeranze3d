/* ===================================================
   TRANSIZIONE.JS — Dalla hero illustrata al campo reale (prova)
   Lo scroll tiene ferma la hero e muove una telecamera dentro il campo:

     1. i testi lasciano la scena, la ragazza esce di lato
     2. la telecamera scivola lentamente verso destra e avanza appena: alcune
        spighe e una zinnia della foto sono piani separati, a profondità
        diverse, e scorrono a velocità diverse (nessuno le viene incontro)
     3. il campo si trasforma poco alla volta in una nuova inquadratura
        dello stesso luogo (images/cleppi2.webp)
     4. quella foto prende posto nel riquadro della sezione "Chi sono",
        che nel frattempo è arrivata sotto la hero: la hero si dissolve

   Tutto dipende da un solo numero (l'avanzamento dello scroll), quindi
   la sequenza è identica in avanti e all'indietro.
   Parte solo se la scena della ragazza è attiva; con meno animazioni,
   senza WebGL o in caso di errore la pagina resta quella normale.
   =================================================== */

import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { calcolaCopertura, leggiPosizione } from './hero-scena-misure.js';
import {
  TEMPI, PROFONDITA_RAGAZZA, frazione, morbido, telecamera, proietta, calcolaCorsa,
} from './transizione-misure.js';

const CONFIG = {
  cartella: 'images/transizione/',
  scrollDesktop: 5,      // lunghezza della sequenza, in altezze di schermo
  scrollMobile: 4,
  inerzia: 0.6,          // secondi di ritardo morbido tra scroll e immagine
  sfocaturaMax: 5,       // px: la nuova foto compare appena morbida, poi si assesta
  ingrandimentoIniziale: 1.035,
  scivolata: 0.014,      // la nuova foto prosegue per un attimo il movimento laterale (frazione della larghezza)
  raggioRiquadro: 14,    // px, come .chi-sono-foto-mask
  posizioneFotoPiena: [50, 35],     // object-position a tutto schermo (%)
  posizioneFotoPienaMobile: [20, 35],   // in verticale si vede solo una fetta: quella con il viso
  posizioneFotoRiquadro: [0, 50],   // …e nel riquadro, come .chi-sono-foto-img
};

const hero = document.querySelector('.hero-viewport');
const canvas = hero && hero.querySelector('.tr-profondita');
const canvasRagazza = hero && hero.querySelector('.hero-scena-3d');
const fotoBox = hero && hero.querySelector('.tr-foto');
const foto = fotoBox && fotoBox.querySelector('img');
const crema = hero && hero.querySelector('.tr-crema');
const fotoSfondo = hero && hero.querySelector('.hero-bg-scena');
const sezione = document.getElementById('chi-sono');
const riquadro = sezione && sezione.querySelector('.chi-sono-foto-mask');

function puoPartire() {
  if (!hero || !canvas || !canvasRagazza || !foto || !crema || !fotoSfondo || !sezione || !riquadro) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const prova = document.createElement('canvas');
  return !!(prova.getContext('webgl2') || prova.getContext('webgl'));
}

/* La scena della ragazza aggiunge .scena-attiva alla hero quando è pronta */
function quandoScenaAttiva() {
  return new Promise((risolvi) => {
    if (hero.classList.contains('scena-attiva')) { risolvi(); return; }
    const oss = new MutationObserver(() => {
      if (!hero.classList.contains('scena-attiva')) return;
      oss.disconnect();
      risolvi();
    });
    oss.observe(hero, { attributes: true, attributeFilter: ['class'] });
  });
}

function quandoInCima() {
  return new Promise((risolvi) => {
    if (window.scrollY < 4) { risolvi(); return; }
    const controlla = () => {
      if (window.scrollY >= 4) return;
      window.removeEventListener('scroll', controlla);
      risolvi();
    };
    window.addEventListener('scroll', controlla, { passive: true });
  });
}

async function avvia() {
  /* ---------- Caricamento ---------- */
  const meta = await (await fetch(CONFIG.cartella + 'livelli.json')).json();
  const texLoader = new THREE.TextureLoader();
  const prepara = (t) => { t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t; };
  const [texSfondo, ...texLivelli] = await Promise.all([
    texLoader.loadAsync(CONFIG.cartella + 'sfondo-senza-livelli.webp'),
    ...meta.livelli.map((l) => texLoader.loadAsync(CONFIG.cartella + l.file)),
    new Promise((ok, no) => {
      if (foto.complete && foto.naturalWidth) { ok(); return; }
      foto.addEventListener('load', ok, { once: true });
      foto.addEventListener('error', () => no(new Error('foto della sezione non caricata')), { once: true });
      foto.src = foto.dataset.src;
    }),
  ]);
  await quandoScenaAttiva();
  await quandoInCima();   // la sequenza parte dalla cima: non si fa saltare il contenuto a chi è già sceso

  /* ---------- Campo a livelli ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false });
  } catch (errore) {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scena = new THREE.Scene();
  // Unità: l'altezza della hero vale 1 a distanza 1 dalla telecamera
  const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(0.5)), 1, 0.05, 60);

  const quadro = new THREE.PlaneGeometry(1, 1);
  const piano = (tex, profondita, ordine, trasparente) => {
    const m = new THREE.Mesh(quadro, new THREE.MeshBasicMaterial({ map: prepara(tex), transparent: trasparente, depthTest: false, depthWrite: false }));
    m.renderOrder = ordine;
    m.userData.profondita = profondita;
    scena.add(m);
    return m;
  };
  const sfondo = piano(texSfondo, meta.profonditaSfondo, 0, false);
  // dal più lontano al più vicino: l'ordine di disegno è quello della profondità
  const livelli = meta.livelli
    .map((l, i) => ({ ...l, tex: texLivelli[i] }))
    .sort((a, b) => b.profondita - a.profondita)
    .map((l, i) => ({ dati: l, mesh: piano(l.tex, l.profondita, i + 1, true) }));

  /* ---------- Misure (rifatte a ogni ridimensionamento) ---------- */
  const mobile = window.matchMedia('(max-width: 767px)').matches;
  const misure = { hero: { larghezza: 1, altezza: 1 }, corsa: { x: 0, y: 0 }, arrivo: { x: 0, y: 0, larghezza: 1, altezza: 1 } };

  // Mette un piano dove a telecamera ferma occupa il rettangolo dato (px della hero)
  function posa(mesh, r) {
    const { larghezza: W, altezza: H } = misure.hero;
    const d = mesh.userData.profondita;
    mesh.position.set(((r.x + r.larghezza / 2 - W / 2) / H) * d, -((r.y + r.altezza / 2 - H / 2) / H) * d, -d);
    mesh.scale.set((r.larghezza / H) * d, (r.altezza / H) * d, 1);
  }

  function misura() {
    const W = hero.clientWidth, H = hero.clientHeight;
    if (!W || !H) return;
    misure.hero = { larghezza: W, altezza: H };
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();

    // la foto a livelli ricalca il ritaglio CSS dello sfondo (object-fit: cover)
    const pos = leggiPosizione(getComputedStyle(fotoSfondo).objectPosition);
    const cop = calcolaCopertura(misure.hero, { larghezza: meta.larghezza, altezza: meta.altezza }, pos.x, pos.y);
    const aRiposo = (l) => ({ x: cop.sinistra + l.x * cop.scala, y: cop.alto + l.y * cop.scala, larghezza: l.larghezza * cop.scala, altezza: l.altezza * cop.scala });
    posa(sfondo, { x: cop.sinistra, y: cop.alto, larghezza: cop.larghezza, altezza: cop.altezza });
    livelli.forEach((l) => posa(l.mesh, aRiposo(l.dati)));
    // quanto può scivolare di lato la telecamera senza scoprire il bordo della foto
    misure.corsa = calcolaCorsa(misure.hero, cop, meta.profonditaSfondo);

    // dove deve arrivare la foto: il riquadro della sezione, quando la sezione è in cima allo schermo
    let x = 0, y = 0;
    for (let el = riquadro; el && el !== sezione; el = el.offsetParent) { x += el.offsetLeft; y += el.offsetTop; }
    misure.arrivo = { x: x + sezione.getBoundingClientRect().left, y, larghezza: riquadro.offsetWidth, altezza: riquadro.offsetHeight };
  }

  /* ---------- Un solo numero governa tutto ---------- */
  const testi = hero.querySelectorAll('.hero-testo, .hero-bottom-text, .hero-scroll-indicator, .api-container');
  const mostra = (el, opacita) => {
    el.style.opacity = opacita;
    el.style.visibility = opacita <= 0.001 ? 'hidden' : '';
  };
  const mescola = (a, b, t) => a + (b - a) * t;

  function applica(p) {
    const { larghezza: W, altezza: H } = misure.hero;
    const cam = telecamera(p, misure.corsa);

    // 1. testi e velo
    const oTesti = 1 - morbido(frazione(p, TEMPI.testi));
    testi.forEach((el) => mostra(el, oTesti));
    hero.style.setProperty('--velo', 1 - frazione(p, TEMPI.velo));

    // 2. la ragazza è un livello tra gli altri: scorre verso sinistra, esce e sfuma
    const rg = proietta({ x: 0, y: 0, larghezza: W, altezza: H }, misure.hero, PROFONDITA_RAGAZZA, cam);
    if (p > 0) {
      canvasRagazza.style.transform = `translate(${rg.x}px, ${rg.y}px) scale(${rg.scala})`;
      mostra(canvasRagazza, 1 - morbido(frazione(p, TEMPI.ragazza)));
    } else {
      // a scroll fermo in cima la scena della ragazza torna quella di sempre
      canvasRagazza.style.transform = '';
      canvasRagazza.style.opacity = '';
      canvasRagazza.style.visibility = '';
    }

    // 3. carrellata laterale nel campo a livelli
    const nuova = morbido(frazione(p, TEMPI.nuovaFoto));
    canvas.style.opacity = frazione(p, [0, 0.015]);
    if (p > 0 && nuova < 1) {
      camera.position.set(cam.x, -cam.y, -cam.z);
      renderer.render(scena, camera);
    }

    // 4. il campo si trasforma nella nuova inquadratura, che arriva appena morbida e si assesta
    const fuoco = morbido(frazione(p, TEMPI.fuoco));
    const q = morbido(frazione(p, TEMPI.atterraggio));
    const fine = frazione(p, TEMPI.consegna);
    mostra(fotoBox, nuova);
    const sfoca = (1 - fuoco) * CONFIG.sfocaturaMax;
    foto.style.filter = sfoca > 0.05 ? `blur(${sfoca.toFixed(2)}px)` : '';
    foto.style.transform = `translateX(${((1 - fuoco) * CONFIG.scivolata * W).toFixed(2)}px) scale(${mescola(CONFIG.ingrandimentoIniziale, 1, fuoco)})`;

    // 5. …poi prende posto nel riquadro della sezione, su fondo crema
    const a = misure.arrivo;
    fotoBox.style.left = `${mescola(0, a.x, q)}px`;
    fotoBox.style.top = `${mescola(0, a.y, q)}px`;
    fotoBox.style.width = `${mescola(W, a.larghezza, q)}px`;
    fotoBox.style.height = `${mescola(H, a.altezza, q)}px`;
    fotoBox.style.borderRadius = `${CONFIG.raggioRiquadro * q}px`;
    const piena = mobile ? CONFIG.posizioneFotoPienaMobile : CONFIG.posizioneFotoPiena;
    foto.style.objectPosition = `${mescola(piena[0], CONFIG.posizioneFotoRiquadro[0], q)}% ${mescola(piena[1], CONFIG.posizioneFotoRiquadro[1], q)}%`;
    // nella sezione la foto è 30px più alta del riquadro (serve al suo micro-parallax)
    foto.style.top = `${-15 * q}px`;
    foto.style.height = `calc(100% + ${30 * q}px)`;
    mostra(crema, morbido(frazione(p, TEMPI.crema)));

    // 6. consegna: la hero si dissolve sulla sezione vera, che è già lì sotto, allineata
    hero.style.opacity = 1 - fine;
    hero.style.visibility = fine >= 1 ? 'hidden' : '';
    hero.style.pointerEvents = p > 0.5 ? 'none' : '';
  }

  /* ---------- Scroll ---------- */
  gsap.registerPlugin(ScrollTrigger);
  document.documentElement.classList.add('transizione-attiva');
  hero.style.transform = '';
  hero.classList.add('transizione-attiva');
  misura();

  const stato = { p: 0 };
  const schermi = mobile ? CONFIG.scrollMobile : CONFIG.scrollDesktop;
  gsap.to(stato, {
    p: 1,
    ease: 'none',
    onUpdate: () => applica(stato.p),
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: () => '+=' + Math.round(window.innerHeight * schermi),
      pin: true,
      scrub: CONFIG.inerzia,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onRefresh: () => { misura(); applica(stato.p); },
    },
  });
  applica(0);

  canvas.addEventListener('webglcontextlost', (evento) => evento.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => applica(stato.p));
}

if (puoPartire()) {
  const parti = () => { avvia().catch((errore) => console.warn('Transizione non avviata: la pagina resta quella normale.', errore)); };
  if (document.readyState === 'complete') parti();
  else window.addEventListener('load', parti, { once: true });
}
