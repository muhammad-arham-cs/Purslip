import * as THREE from '/js/vendor/three.module.min.js';

(function () {
  'use strict';

  const canvas = document.getElementById('purseCanvas');
  if (!canvas) return;

  const stage = canvas.closest('.landing-stage-3d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch (_err) {
    if (stage) stage.classList.add('is-fallback');
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.35, 9.2);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xdbe6ff, 1.35);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xfff4d6, 2.6);
  keyLight.position.set(4.5, 6.5, 6.0);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x4ea8ff, 1.45);
  rimLight.position.set(-5.5, -2.5, 3.5);
  scene.add(rimLight);

  const brassPoint = new THREE.PointLight(0xe9b949, 2.1, 12);
  brassPoint.position.set(0.6, 1.2, 3.2);
  scene.add(brassPoint);

  const root = new THREE.Group();
  scene.add(root);

  function createRoundedRectShape(w, h, r) {
    const shape = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  }

  function makeSlipTexture(spec) {
    const c = document.createElement('canvas');
    c.width = 720;
    c.height = 440;
    const ctx = c.getContext('2d');

    // Background
    ctx.fillStyle = spec.bg;
    ctx.fillRect(0, 0, c.width, c.height);

    // Top accent bar
    ctx.fillStyle = spec.accent;
    ctx.fillRect(44, 38, 96, 6);

    // Header title
    ctx.fillStyle = spec.muted;
    ctx.font = '600 20px system-ui, -apple-system, sans-serif';
    ctx.fillText(spec.tag, 44, 82);

    // Main value
    ctx.fillStyle = spec.fg;
    ctx.font = '700 54px system-ui, -apple-system, sans-serif';
    ctx.fillText(spec.amount, 44, 152);

    // Subline
    ctx.fillStyle = spec.accent;
    ctx.font = '600 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(spec.sub, 44, 192);

    // Divider line
    ctx.strokeStyle = spec.rule;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(44, 224);
    ctx.lineTo(c.width - 44, 224);
    ctx.stroke();

    // Ledger bars
    spec.rows.forEach((row, idx) => {
      const y = 268 + idx * 54;
      ctx.fillStyle = spec.muted;
      ctx.font = '500 21px system-ui, -apple-system, sans-serif';
      ctx.fillText(row.label, 44, y);

      ctx.fillStyle = spec.fg;
      ctx.font = '600 21px system-ui, -apple-system, sans-serif';
      const w = ctx.measureText(row.val).width;
      ctx.fillText(row.val, c.width - 44 - w, y);

      // Progress track
      ctx.fillStyle = spec.rule;
      ctx.fillRect(44, y + 12, c.width - 88, 6);
      ctx.fillStyle = row.color || spec.accent;
      ctx.fillRect(44, y + 12, (c.width - 88) * row.fill, 6);
    });

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  function buildSlipMesh(spec, width, height) {
    const group = new THREE.Group();
    const shape = createRoundedRectShape(width, height, 0.22);
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.025,
      bevelThickness: 0.025,
    });
    geom.center();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: spec.cardColor,
      roughness: 0.32,
      metalness: 0.08,
    });
    const body = new THREE.Mesh(geom, bodyMat);
    group.add(body);

    const tex = makeSlipTexture(spec);
    const faceGeom = new THREE.PlaneGeometry(width - 0.14, height - 0.14);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex });
    const face = new THREE.Mesh(faceGeom, faceMat);
    face.position.z = 0.058;
    group.add(face);

    return group;
  }

  // Three floating slips
  const slipSpecs = [
    {
      cardColor: 0xf4f6fb,
      bg: '#f4f6fb',
      fg: '#0c172c',
      muted: '#526079',
      rule: '#dde3ee',
      accent: '#0f8a65',
      tag: 'NET WORTH · HOUSEHOLD',
      amount: 'PKR 1,482,500',
      sub: '+PKR 68,400 saved this month',
      rows: [
        { label: 'Meezan Current', val: 'PKR 412,000', fill: 0.72, color: '#0f8a65' },
        { label: 'HBL Savings', val: 'PKR 890,500', fill: 0.88, color: '#1b4f9c' },
        { label: 'Cash & Wallet', val: 'PKR 180,000', fill: 0.42, color: '#d49b27' },
      ],
    },
    {
      cardColor: 0x13233f,
      bg: '#13233f',
      fg: '#f2f5fb',
      muted: '#94a6c4',
      rule: '#243a60',
      accent: '#e9b949',
      tag: 'MONTHLY BUDGET · ROLLOVER',
      amount: 'PKR 94,200',
      sub: '68% of PKR 138,000 used',
      rows: [
        { label: 'Groceries & Home', val: 'PKR 42,000', fill: 0.7, color: '#e9b949' },
        { label: 'Utilities & Bills', val: 'PKR 31,200', fill: 0.62, color: '#38c898' },
        { label: 'Dining & Fuel', val: 'PKR 21,000', fill: 0.52, color: '#5b8def' },
      ],
    },
    {
      cardColor: 0x192d4e,
      bg: '#192d4e',
      fg: '#f2f5fb',
      muted: '#9bb0d1',
      rule: '#2b446c',
      accent: '#38c898',
      tag: 'EMERGENCY RESERVE · GOAL',
      amount: 'PKR 600,000',
      sub: '82% funded · 44 days ahead',
      rows: [
        { label: 'Saved so far', val: 'PKR 492,000', fill: 0.82, color: '#38c898' },
        { label: 'Remaining', val: 'PKR 108,000', fill: 0.18, color: '#e9b949' },
      ],
    },
  ];

  const slips = [];
  const slipConfigs = [
    { pos: [-0.35, 0.65, 0.35], rot: [-0.06, 0.18, -0.05], scale: 1.02, w: 3.55, h: 2.18 },
    { pos: [1.15, -0.25, -0.45], rot: [0.05, -0.24, 0.08], scale: 0.94, w: 3.4, h: 2.1 },
    { pos: [-1.25, -0.85, -0.85], rot: [0.08, 0.28, -0.11], scale: 0.88, w: 3.3, h: 2.04 },
  ];

  slipSpecs.forEach((spec, i) => {
    const cfg = slipConfigs[i];
    const mesh = buildSlipMesh(spec, cfg.w, cfg.h);
    mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
    mesh.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
    mesh.scale.setScalar(cfg.scale);
    mesh.userData = { basePos: mesh.position.clone(), baseRot: mesh.rotation.clone(), phase: i * 1.9 };
    root.add(mesh);
    slips.push(mesh);
  });

  // Brass coin stack (echoing the Purslip wallet logo)
  const coinGroup = new THREE.Group();
  coinGroup.position.set(1.25, 1.38, 1.15);
  coinGroup.rotation.set(0.42, -0.35, 0.14);
  root.add(coinGroup);

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xe9b949,
    roughness: 0.22,
    metalness: 0.86,
  });
  const brassRimMat = new THREE.MeshStandardMaterial({
    color: 0xfff0b8,
    roughness: 0.16,
    metalness: 0.92,
  });

  const coins = [];
  const coinCount = 4;
  for (let i = 0; i < coinCount; i++) {
    const cWrap = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.13, 48), brassMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.022, 16, 48), brassRimMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.068;
    cWrap.add(cyl);
    cWrap.add(ring);

    cWrap.position.y = i * 0.19;
    cWrap.position.x = Math.sin(i * 0.9) * 0.05;
    cWrap.userData = { baseY: cWrap.position.y, index: i };
    coinGroup.add(cWrap);
    coins.push(cWrap);
  }

  // Sculpted navy wallet clasp arc behind the slips
  const archGeom = new THREE.TorusGeometry(2.45, 0.045, 16, 96);
  const archMat = new THREE.MeshStandardMaterial({
    color: 0x3b66a8,
    roughness: 0.35,
    metalness: 0.65,
  });
  const arch = new THREE.Mesh(archGeom, archMat);
  arch.position.set(0, -0.1, -1.4);
  arch.rotation.set(0.35, -0.2, 0);
  root.add(arch);

  function syncSceneTheme() {
    const theme = document.documentElement.dataset.theme || 'dark';
    if (theme === 'light') {
      ambientLight.intensity = 1.65;
      keyLight.intensity = 2.2;
      archMat.color.setHex(0x1f4b8e);
    } else if (theme === 'night') {
      ambientLight.intensity = 1.15;
      keyLight.intensity = 2.8;
      archMat.color.setHex(0xd4a438);
    } else {
      ambientLight.intensity = 1.35;
      keyLight.intensity = 2.6;
      archMat.color.setHex(0x3b66a8);
    }
  }
  syncSceneTheme();
  window.addEventListener('purslip:themechange', syncSceneTheme);

  function resize() {
    const parent = canvas.parentElement || canvas;
    const w = Math.max(parent.clientWidth || 320, 260);
    const h = Math.max(parent.clientHeight || 360, 260);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull camera back slightly on narrow mobile viewports so slips never clip horizontally
    camera.position.z = w < 520 ? 10.8 : w < 860 ? 9.8 : 9.0;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // Pointer & scroll interaction
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let spinBoost = 0;

  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.tx = (e.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
      pointer.ty = (e.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
    },
    { passive: true }
  );

  canvas.addEventListener('click', () => {
    spinBoost = 0.22;
  });

  if (stage) stage.classList.add('is-ready');

  if (reducedMotion) {
    renderer.render(scene, camera);
    return;
  }

  let rafId = 0;
  const clock = new THREE.Clock();

  function animate() {
    rafId = window.requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    spinBoost *= 0.92;

    root.rotation.y = pointer.x * 0.28 + Math.sin(t * 0.45) * 0.08;
    root.rotation.x = -pointer.y * 0.16 + Math.cos(t * 0.35) * 0.05;

    slips.forEach((slip) => {
      const p = slip.userData.phase;
      slip.position.y = slip.userData.basePos.y + Math.sin(t * 1.15 + p) * 0.09;
      slip.rotation.z = slip.userData.baseRot.z + Math.cos(t * 0.9 + p) * 0.025 + spinBoost * 0.3;
    });

    coinGroup.rotation.y += 0.012 + spinBoost;
    coins.forEach((c) => {
      const idx = c.userData.index;
      c.position.y = c.userData.baseY + Math.sin(t * 2.1 + idx * 0.65) * 0.035;
    });

    arch.rotation.z = t * 0.08;

    renderer.render(scene, camera);
  }

  animate();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.cancelAnimationFrame(rafId);
    } else {
      clock.getDelta();
      animate();
    }
  });
})();
