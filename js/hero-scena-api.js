/* ===================================================
   HERO-SCENA-API.JS — Versione sperimentale di hero-scena.js
   Identica all'originale (ragazza, zinnia, erba), con in più le api
   tridimensionali di js/api-3d.js al posto di quelle SVG. Usata solo
   da index-api-3d.html. Le api sono disegnate dallo stesso renderer,
   in due passate: dietro alla ragazza e davanti (la sola visitatrice).
   Se la scena non parte, tornano le api SVG originali (js/bees.js).

   Sulla hero vengono disegnati, in un canvas trasparente:
     1. la ragazza, con scheletro e animazione "Annusa_fiore" (models/ragazza-annusa.glb)
     2. la zinnia fotografica, un piano rivolto alla telecamera (models/zinnia-foto.glb)
     3. la vegetazione in primo piano: gli stessi pixel della foto di sfondo,
        ridisegnati sopra la base del busto e dello stelo, così i due
        sembrano stare dentro il campo e non sopra.
   Lo sfondo passa alla copia della foto senza la zinnia A (ora accanto a lei).

   Se la scena non può partire (meno animazioni, risparmio dati, niente
   WebGL, errore di caricamento) la hero resta quella statica originale.
   =================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { calcolaCamera, calcolaCopertura, leggiPosizione } from './hero-scena-misure.js';
import { creaApi } from './api-3d.js';

/* ---------- Parametri regolabili ---------- */
const CONFIG = {
  // false: volano le api SVG originali (js/bees.js); true: quelle tridimensionali di js/api-3d.js
  api3d: false,

  ragazza: 'models/ragazza-annusa.glb',
  zinnia: 'models/zinnia-foto.glb',

  // L'illustrazione ha un margine vuoto in alto: la figura ne occupa circa l'84%
  quotaFigura: 0.84,
  taglioBase: 0.03,

  attesaIniziale: 1.5,   // secondi fermi, a scena caricata, prima del gesto (uno solo per caricamento)
  ritornoRiposo: 0.8,    // secondi di dissolvenza dall'ultimo fotogramma alla posa iniziale
  pausaTraCicli: 3.5,    // ritmo dei voli delle api 3D (gesto + pausa), indipendente dalla ragazza

  // Vegetazione in primo piano, in frazioni dell'altezza del busto dal bordo inferiore:
  // comincia a comparire a "alto" e copre del tutto sotto "pieno".
  // L'erba più luminosa passa davanti per prima, i vuoti scuri lasciano vedere la figura.
  erba: { alto: 0.40, pieno: 0.04, pesoQuota: 0.9, pesoLuce: 0.9, soglia0: 0.5, soglia1: 0.8 },

  // Velo scuro della hero (.hero-viewport::after in components.css): va replicato sull'erba
  velo: { colore: [20, 30, 10], inizio: 0.05, meta: 0.40, fine: 0.60 },
};

const hero = document.querySelector('.hero-viewport');
const canvas = hero && hero.querySelector('.hero-scena-3d');
const illustrazione = hero && hero.querySelector('.hero-ragazza');
const fotoScena = hero && hero.querySelector('.hero-bg-scena');

/* Ripiego: le api SVG originali. bees.js si protegge da solo dai doppioni
   e non fa nulla se l'utente preferisce meno animazioni */
let ripiegoCaricato = false;
function apiSvg() {
  if (ripiegoCaricato) return;
  ripiegoCaricato = true;
  const script = document.createElement('script');
  script.src = 'js/bees.js';
  document.body.appendChild(script);
}

function puoPartire() {
  if (!hero || !canvas || !illustrazione || !fotoScena) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (navigator.connection && navigator.connection.saveData) return false;
  const prova = document.createElement('canvas');
  return !!(prova.getContext('webgl2') || prova.getContext('webgl'));
}

/* Erba in primo piano: un triangolo a tutto schermo che ricampiona la foto di sfondo
   con lo stesso ritaglio del CSS (object-fit: cover) e la stessa velatura */
const ERBA_VERTICI = /* glsl */`
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const ERBA_FRAMMENTI = /* glsl */`
  uniform sampler2D uFoto;
  uniform vec2 uHero;        // dimensioni della hero in px CSS
  uniform float uDpr;
  uniform vec4 uCopertura;   // sinistra, alto, larghezza, altezza della foto in px CSS
  uniform float uBasso;      // bordo inferiore della figura (px dall'alto)
  uniform float uBusto;      // altezza del busto in px
  uniform float uLimiteX;    // oltre questa x l'erba non serve
  uniform vec4 uErba;        // alto, pieno, pesoQuota, pesoLuce
  uniform vec2 uSoglie;
  uniform vec3 uVeloColore;
  uniform vec3 uVelo;        // opacità a sinistra, al centro, a destra

  void main() {
    vec2 px = vec2(gl_FragCoord.x / uDpr, uHero.y - gl_FragCoord.y / uDpr);
    vec2 uv = (px - uCopertura.xy) / uCopertura.zw;
    vec3 foto = texture2D(uFoto, vec2(uv.x, 1.0 - uv.y)).rgb;

    float yAlto = uBasso - uErba.x * uBusto;
    float yPieno = uBasso - uErba.y * uBusto;
    float quota = clamp((px.y - yAlto) / (yPieno - yAlto), 0.0, 1.0);
    float luce = dot(foto, vec3(0.299, 0.587, 0.114));
    float a = quota <= 0.0 ? 0.0 : smoothstep(uSoglie.x, uSoglie.y, quota * uErba.z + luce * uErba.w);
    a *= 1.0 - smoothstep(uLimiteX, uLimiteX + 60.0, px.x);
    if (a <= 0.003) discard;

    // stessa velatura del CSS, altrimenti l'erba risulterebbe più chiara dello sfondo
    float t = px.x / uHero.x;
    float velo = t < 0.5 ? mix(uVelo.x, uVelo.y, t / 0.5) : mix(uVelo.y, uVelo.z, (t - 0.5) / 0.5);
    gl_FragColor = vec4(mix(foto, uVeloColore, velo), a);
  }
`;

function caricaImmagine(img, src) {
  return new Promise((risolvi, rifiuta) => {
    if (img.getAttribute('src') === src && img.complete && img.naturalWidth) { risolvi(); return; }
    img.addEventListener('load', () => risolvi(), { once: true });
    img.addEventListener('error', () => rifiuta(new Error('foto non caricata: ' + src)), { once: true });
    img.src = src;
  });
}

/* Il gesto "Annusa_fiore" una sola volta (LoopOnce, fermo sull'ultimo fotogramma).
   Il busto torna da solo alla posa iniziale, il foulard si ferma un po' più in là
   (fino a 1,3°): alla fine si dissolve verso una posa ferma ricavata dal primo
   fotogramma della clip stessa, senza toccare il GLB */
function avviaGesto(mixer, clip, ritorno) {
  const gesto = mixer.clipAction(clip);
  gesto.setLoop(THREE.LoopOnce, 1);
  gesto.clampWhenFinished = true;
  gesto.play();

  const tracceRiposo = clip.tracks.map((traccia) => {
    const n = traccia.getValueSize();
    return new traccia.constructor(traccia.name, [0], Array.from(traccia.values.slice(0, n)));
  });
  // Durata 1 e non 0: con durata nulla il mixer dividerebbe per zero nel calcolo dei giri
  const riposo = mixer.clipAction(new THREE.AnimationClip(clip.name + '_riposo', 1, tracceRiposo));

  mixer.addEventListener('finished', function fine(evento) {
    if (evento.action !== gesto) return;
    mixer.removeEventListener('finished', fine);
    riposo.play();
    riposo.crossFadeFrom(gesto, ritorno, false);
  });
}

async function avvia() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (errore) {
    apiSvg();
    return; // niente WebGL: resta la hero statica
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;   // tre passate per fotogramma: api dietro, scena, ape davanti

  const scena = new THREE.Scene();
  // Ortografica: la zinnia resta esattamente dove arriva il naso, a qualsiasi misura dello schermo
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  camera.position.z = 5;

  /* ---------- Caricamento: i due modelli e la foto senza la zinnia, insieme ---------- */
  const loader = new GLTFLoader();
  const srcFoto = fotoScena.dataset.src;
  let gltfRagazza, gltfZinnia, texFoto;
  try {
    [gltfRagazza, gltfZinnia, texFoto] = await Promise.all([
      loader.loadAsync(CONFIG.ragazza),
      loader.loadAsync(CONFIG.zinnia),
      new THREE.TextureLoader().loadAsync(srcFoto),
      caricaImmagine(fotoScena, srcFoto),
    ]);
  } catch (errore) {
    console.warn('Hero: scena non caricata, resta la versione statica.', errore);
    renderer.dispose();
    apiSvg();
    return;
  }

  /* ---------- Ragazza: colori piatti, come dipinti (nessuna luce) ---------- */
  const ragazza = gltfRagazza.scene;
  ragazza.traverse((nodo) => {
    if (!nodo.isMesh) return;
    const mappa = nodo.material.map;
    if (mappa) mappa.anisotropy = renderer.capabilities.getMaxAnisotropy();
    nodo.material = new THREE.MeshBasicMaterial({ map: mappa });
    nodo.frustumCulled = false; // le ossa la spostano: il riquadro a riposo non basta
  });
  scena.add(ragazza);

  /* ---------- Zinnia: il ritaglio fotografico, senza alcuna deformazione ---------- */
  const zinnia = gltfZinnia.scene;
  zinnia.traverse((nodo) => {
    if (!nodo.isMesh) return;
    const mappa = nodo.material.map;
    if (mappa) mappa.anisotropy = renderer.capabilities.getMaxAnisotropy();
    nodo.material = new THREE.MeshBasicMaterial({ map: mappa, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    nodo.renderOrder = 2;
  });
  scena.add(zinnia);

  /* ---------- Vegetazione in primo piano ---------- */
  texFoto.colorSpace = THREE.NoColorSpace;   // i pixel passano identici a quelli dello sfondo
  texFoto.generateMipmaps = false;
  texFoto.minFilter = THREE.LinearFilter;
  texFoto.magFilter = THREE.LinearFilter;
  const e = CONFIG.erba;
  const v = CONFIG.velo;
  const erba = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)),
    new THREE.ShaderMaterial({
      vertexShader: ERBA_VERTICI,
      fragmentShader: ERBA_FRAMMENTI,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uFoto: { value: texFoto },
        uHero: { value: new THREE.Vector2(1, 1) },
        uDpr: { value: 1 },
        uCopertura: { value: new THREE.Vector4(0, 0, 1, 1) },
        uBasso: { value: 1 },
        uBusto: { value: 1 },
        uLimiteX: { value: 1 },
        uErba: { value: new THREE.Vector4(e.alto, e.pieno, e.pesoQuota, e.pesoLuce) },
        uSoglie: { value: new THREE.Vector2(e.soglia0, e.soglia1) },
        uVeloColore: { value: new THREE.Vector3(v.colore[0] / 255, v.colore[1] / 255, v.colore[2] / 255) },
        uVelo: { value: new THREE.Vector3(v.inizio, v.meta, v.fine) },
      },
    })
  );
  erba.frustumCulled = false;
  erba.renderOrder = 10;   // sempre per ultima, sopra ragazza e fiore
  scena.add(erba);

  /* ---------- Allineamento a illustrazione e fotografia ---------- */
  function inquadra() {
    const rHero = hero.getBoundingClientRect();
    const rIll = illustrazione.getBoundingClientRect();
    if (!rHero.width || !rHero.height || !rIll.height) return;
    renderer.setSize(rHero.width, rHero.height, false);

    const misureHero = { larghezza: rHero.width, altezza: rHero.height };
    const riquadro = { sinistra: rIll.left - rHero.left, basso: rIll.bottom - rHero.top, larghezza: rIll.width, altezza: rIll.height };
    const cam = calcolaCamera(misureHero, riquadro, CONFIG.quotaFigura, CONFIG.taglioBase);
    camera.left = -cam.mezzaLarghezza;
    camera.right = cam.mezzaLarghezza;
    camera.top = cam.mezzaAltezza;
    camera.bottom = -cam.mezzaAltezza;
    camera.position.x = cam.x;
    camera.position.y = cam.y;
    camera.updateProjectionMatrix();

    const pos = leggiPosizione(getComputedStyle(fotoScena).objectPosition);
    const cop = calcolaCopertura(misureHero, { larghezza: texFoto.image.width, altezza: texFoto.image.height }, pos.x, pos.y);
    const u = erba.material.uniforms;
    u.uHero.value.set(rHero.width, rHero.height);
    u.uDpr.value = renderer.getPixelRatio();
    u.uCopertura.value.set(cop.sinistra, cop.alto, cop.larghezza, cop.altezza);
    u.uBasso.value = riquadro.basso;
    u.uBusto.value = riquadro.altezza * CONFIG.quotaFigura;
    u.uLimiteX.value = riquadro.sinistra + riquadro.larghezza * 1.35;

    /* Api: i percorsi si adattano a dove stanno davvero testi e ragazza */
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const relativo = (r) => ({ sinistra: r.left - rHero.left, alto: r.top - rHero.top, destra: r.right - rHero.left, basso: r.bottom - rHero.top });
    const testi = [...hero.querySelectorAll('.hero-testo, .hero-bottom-text')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width && r.height)
      .map(relativo);
    const figura = { sinistra: riquadro.sinistra, alto: riquadro.basso - riquadro.altezza * CONFIG.quotaFigura, destra: riquadro.sinistra + riquadro.larghezza, basso: riquadro.basso };
    const sottoHeader = header ? Math.max(0, header.getBoundingClientRect().bottom - rHero.top) : 0;
    const titolo = testi[0] || { sinistra: rHero.width * 0.52, alto: rHero.height * 0.33, destra: rHero.width * 0.95, basso: rHero.height * 0.67 };
    const fascia = Math.min(figura.alto, testi[1] ? testi[1].alto : figura.alto);
    const ancore = mobile
      ? { xs: [0, figura.destra, rHero.width], ys: [sottoHeader, titolo.alto, titolo.basso, Math.max(fascia, titolo.basso + 40), rHero.height] }
      : { xs: [Math.min(figura.destra, titolo.sinistra - 40), titolo.sinistra, rHero.width], ys: [sottoHeader, titolo.alto, titolo.basso, rHero.height] };
    if (api) api.inquadra({
      larghezza: rHero.width,
      altezza: rHero.height,
      vista: { sinistra: camera.position.x + camera.left, destra: camera.position.x + camera.right, alto: camera.position.y + camera.top, basso: camera.position.y + camera.bottom },
      mobile,
      ancore,
      zone: [...testi, figura],
      copertura: cop,
    });
  }

  /* ---------- Animazioni ---------- */
  const mixerRagazza = new THREE.AnimationMixer(ragazza);
  const clipRagazza = gltfRagazza.animations[0];
  if (clipRagazza) avviaGesto(mixerRagazza, clipRagazza, CONFIG.ritornoRiposo);
  const durata = clipRagazza ? clipRagazza.duration : 0;

  // Le api volano con lo stesso orologio: la visitatrice arriva sulla zinnia durante la pausa
  // Modalità di prova, dall'indirizzo: ?demo = solo l'ape che passa vicino alla telecamera,
  // ?debug = tutte le api. In entrambe si vedono le traiettorie e un riquadro con profondità e ingrandimento
  // (vale anche #demo e #debug: alcuni server locali perdono il "?" togliendo ".html" dall'indirizzo)
  const richiesta = location.search + location.hash;
  const modo = { demo: /[?&#]demo\b/.test(richiesta), debug: /[?&#]debug\b/.test(richiesta) };
  const api = CONFIG.api3d ? creaApi({ durata, pausa: CONFIG.pausaTraCicli }, modo) : null;
  if (!api) apiSvg();
  let riquadroProva = null;
  if (api && (modo.demo || modo.debug)) {
    riquadroProva = document.createElement('pre');
    riquadroProva.style.cssText = 'position:absolute;left:50%;top:5.5rem;transform:translateX(-50%);z-index:5;margin:0;padding:6px 10px;border-radius:6px;background:rgba(20,30,10,.75);color:#fff;font:12px/1.4 monospace;pointer-events:none';
    hero.appendChild(riquadroProva);
  }
  const header = document.querySelector('.site-header');

  // Il vento sulla zinnia non si ferma mai: la clip torna al punto di partenza, quindi si ripete senza stacchi
  const mixerZinnia = new THREE.AnimationMixer(zinnia);
  if (gltfZinnia.animations[0]) mixerZinnia.clipAction(gltfZinnia.animations[0]).play();

  const orologio = new THREE.Clock();
  let tempo = -CONFIG.attesaIniziale;   // avanza solo mentre la scena è visibile
  let visibile = true;
  let attivo = false;
  let idFrame = 0;

  function dipingi() {
    renderer.clear();
    if (api) { renderer.render(api.dietro, api.camera); renderer.clearDepth(); }
    renderer.render(scena, camera);
    if (api) { renderer.clearDepth(); renderer.render(api.davanti, api.camera); }
  }

  function disegna() {
    idFrame = requestAnimationFrame(disegna);
    const dt = Math.min(orologio.getDelta(), 0.1);
    tempo += dt;

    // Gesto completo (nota il fiore, si gira, si china, annusa, torna) una sola volta, dopo l'attesa:
    // l'orologio avanza solo a scena visibile, quindi scroll, schede e resize lo sospendono senza riavviarlo
    mixerRagazza.update(Math.max(0, Math.min(dt, tempo)));
    mixerZinnia.update(dt);
    if (api) api.aggiorna(tempo, dt);
    if (riquadroProva) {
      const p = api.stato.profondita;
      riquadroProva.textContent = 'profondità ' + (p >= 0 ? '+' : '') + p.toFixed(2) + (p > 0.3 ? '  VICINA' : p < -0.5 ? '  lontana' : '')
        + '\ningrandimento prospettico ×' + api.stato.ingrandimento.toFixed(2);
    }

    dipingi();
  }

  // In prova: window.provaApi(secondi) porta la scena a quell'istante e la ridisegna, anche a scheda ferma
  if (riquadroProva) {
    window.provaApi = (secondi) => {
      tempo = secondi;
      orologio.getDelta();
      if (idFrame) cancelAnimationFrame(idFrame);
      idFrame = 0;
      disegna();
      return riquadroProva.textContent;
    };
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

  // Ferma quando la hero è fuori schermo o la scheda è nascosta
  new IntersectionObserver((voci) => {
    visibile = voci[0].isIntersecting;
    aggiornaCiclo();
  }).observe(hero);
  document.addEventListener('visibilitychange', aggiornaCiclo);
  new ResizeObserver(inquadra).observe(hero);
  new ResizeObserver(inquadra).observe(illustrazione);
  // Il titolo cambia larghezza quando arriva il suo font: i percorsi vanno rimisurati
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(inquadra);

  canvas.addEventListener('webglcontextlost', (evento) => {
    evento.preventDefault();
    attivo = false;
    aggiornaCiclo();
    hero.classList.remove('scena-attiva');   // torna la hero statica
    apiSvg();
  });

  /* ---------- Via: primo fotogramma a riposo, poi dissolvenza al posto dell'illustrazione ---------- */
  inquadra();
  mixerRagazza.setTime(0);
  if (api) api.aggiorna(tempo, 0);
  renderer.compile(scena, camera);
  dipingi();
  attivo = true;
  hero.classList.add('scena-attiva');
  inquadra();   // su mobile la classe sposta il riquadro della ragazza (css/hero-api-3d.css): si rimisura
  aggiornaCiclo();
}

if (puoPartire()) {
  // Dopo il load: modelli e foto non rallentano la comparsa della pagina
  const parti = () => { avvia().catch((errore) => { console.warn('Hero: scena non avviata.', errore); apiSvg(); }); };
  if (document.readyState === 'complete') parti();
  else window.addEventListener('load', parti, { once: true });
} else {
  apiSvg();
}
