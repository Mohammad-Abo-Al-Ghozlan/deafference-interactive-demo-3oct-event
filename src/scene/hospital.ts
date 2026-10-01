import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function randomSource(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function surfaceTexture(kind: 'stone' | 'wood') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const random = randomSource(kind === 'wood' ? 17 : 92);
  ctx.fillStyle = kind === 'wood' ? '#8d6950' : '#ede9df';
  ctx.fillRect(0, 0, 512, 512);
  if (kind === 'stone') {
    const data = ctx.getImageData(0, 0, 512, 512);
    for (let i = 0; i < data.data.length; i += 4) {
      const n = (random() - .5) * 12;
      data.data[i] += n; data.data[i + 1] += n; data.data[i + 2] += n;
    }
    ctx.putImageData(data, 0, 0);
    for (let i = 0; i < 650; i++) {
      ctx.fillStyle = `rgba(130,114,91,${random() * .045})`;
      ctx.fillRect(random() * 512, random() * 512, random() * 45 + 2, random() + .6);
    }
  } else {
    for (let i = 0; i < 500; i++) {
      const x = random() * 512;
      ctx.strokeStyle = `rgba(${random() > .5 ? '45,24,10' : '227,197,153'},${random() * .15})`;
      ctx.lineWidth = .3 + random() * 1.2;
      ctx.beginPath(); ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + random() * 15, 130, x - random() * 12, 300, x + random() * 5, 512);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function makeLabel(text: string, width: number, height: number, color = '#514b43', fontSize = 70) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `500 ${fontSize}px Manrope, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(text, 512, 128);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
}

export function createHospital(scene: THREE.Scene) {
  const room = new THREE.Group(); room.name = 'Hospital reception'; scene.add(room);
  const stoneMap = surfaceTexture('stone');
  const woodMap = surfaceTexture('wood');
  const materials = {
    plaster: new THREE.MeshStandardMaterial({ color: '#f4f1e9', roughness: .88 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneMap, roughness: .53, color: '#f7f3eb', bumpMap: stoneMap, bumpScale: .003 }),
    floor: new THREE.MeshPhysicalMaterial({ map: stoneMap, color: '#eae6da', roughness: .33, clearcoat: .25, clearcoatRoughness: .5 }),
    wood: new THREE.MeshStandardMaterial({ map: woodMap, bumpMap: woodMap, bumpScale: .006, roughness: .56, color: '#c6a982' }),
    metal: new THREE.MeshStandardMaterial({ color: '#a8a8a1', metalness: .8, roughness: .33 }),
    dark: new THREE.MeshStandardMaterial({ color: '#242b2d', roughness: .55 }),
    chair: new THREE.MeshStandardMaterial({ color: '#9cafa9', roughness: .88 }),
    seams: new THREE.MeshStandardMaterial({ color: '#d1cdc2', roughness: 1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#deedf1', metalness: .03, roughness: .15, transparent: true, opacity: .15, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: '#ffdeb5' }),
  };
  function box(size: [number, number, number], position: [number, number, number], material: THREE.Material, radius = 0, parent: THREE.Object3D = room) {
    const geometry = radius ? new RoundedBoxGeometry(...size, 2, radius) : new THREE.BoxGeometry(...size);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  function pipe(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material, parent: THREE.Object3D = room) {
    const delta = to.clone().sub(from);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), material);
    mesh.position.copy(from).add(to).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    mesh.castShadow = true; parent.add(mesh); return mesh;
  }

  // Architecture is real WebGL geometry; the background is not a photograph.
  box([12, .12, 15], [0, -.07, -1], materials.floor);
  for (let x = -6; x <= 6; x += 1.5) box([.008, .002, 15], [x, -.005, -1], materials.seams);
  for (let z = -8; z < 7; z += 1.5) box([12, .002, .008], [0, -.004, z], materials.seams);
  box([7.4, 3.6, .18], [1.3, 1.8, -4.6], materials.plaster);
  box([1.1, 3.6, .18], [-5.45, 1.8, -4.6], materials.plaster);
  box([1.6, .95, .18], [-4.1, 3.13, -4.6], materials.plaster);
  box([.18, 3.6, 11], [5.08, 1.8, -.8], materials.plaster);
  box([11, .15, 12], [0, 3.63, -.8], materials.plaster);
  box([1.6, 3.3, .1], [-4.1, 1.6, -8.2], materials.plaster);
  box([.1, 3.3, 3.6], [-4.95, 1.6, -6.4], materials.plaster);
  const corridorSign = makeLabel('CONSULTATIONS  →', 1.35, .28, '#79857c', 45);
  corridorSign.position.set(-4.1, 2.55, -8.12); room.add(corridorSign);

  // Warm walnut wall with dimensional battens and a fine shadow gap.
  box([6.3, 3.5, .06], [1.4, 1.75, -4.46], materials.wood);
  const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(.065, 3.5, .06), materials.wood, 95);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 95; i++) { dummy.position.set(-1.75 + i * .067, 1.75, -4.4); dummy.updateMatrix(); slats.setMatrixAt(i, dummy.matrix); }
  slats.castShadow = true; slats.receiveShadow = true; room.add(slats);
  const reception = makeLabel('R E C E P T I O N', 2.65, .42, '#e9e1d6', 62);
  reception.position.set(.95, 2.34, -4.345); room.add(reception);

  // Glazed entrance and daylight, with physical frames and handles.
  for (let z = -3.7; z < 4.4; z += 1.5) {
    box([.055, 3.5, .055], [-5.02, 1.75, z], materials.metal);
    box([.018, 3.4, 1.43], [-5.04, 1.75, z + .75], materials.glass);
    box([.06, .04, 1.5], [-5.0, .06, z + .75], materials.metal);
    box([.06, .04, 1.5], [-5.0, 3.42, z + .75], materials.metal);
    box([.024, .035, 1.45], [-5, 1.1, z + .75], materials.glass);
  }
  pipe(new THREE.Vector3(-4.94, .95, 1.15), new THREE.Vector3(-4.94, 1.45, 1.15), .015, materials.metal);
  const outdoor = new THREE.MeshStandardMaterial({ color: '#c0c7b2', roughness: 1 });
  box([4, .07, 15], [-7.2, -.03, -2], new THREE.MeshStandardMaterial({ color: '#d9d7c8', roughness: 1 }));
  for (let z = -5; z <= 4; z += 2) {
    const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(.8, 2), outdoor);
    shrub.position.set(-7.5, .6, z); shrub.scale.set(.8, 1.2, 1.1); room.add(shrub);
  }

  // Curved limestone desk. Rounded footprint is extruded upwards in world space.
  const shape = new THREE.Shape();
  const left = -2.0, right = 2.0, front = .57, back = -.5, r = .3;
  shape.moveTo(left + r, back); shape.lineTo(right - r, back);
  shape.quadraticCurveTo(right, back, right, back + r); shape.lineTo(right, front - r);
  shape.quadraticCurveTo(right, front, right - r, front); shape.lineTo(left + r, front);
  shape.quadraticCurveTo(left, front, left, front - r); shape.lineTo(left, back + r);
  shape.quadraticCurveTo(left, back, left + r, back);
  const desk = new THREE.Group(); desk.position.set(1.15, 0, -2.6); room.add(desk);
  const deskMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.05, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .018, bevelThickness: .018, curveSegments: 20 }), materials.stone);
  deskMesh.rotation.x = -Math.PI / 2; deskMesh.castShadow = true; deskMesh.receiveShadow = true; desk.add(deskMesh);
  box([3.65, .045, .98], [0, 1.095, -.02], materials.stone, .018, desk);
  box([3.54, .024, .016], [0, .145, .58], materials.glow, .006, desk);
  box([3.50, .10, .04], [0, .069, .56], materials.wood, .007, desk);
  for (let x = -1.7; x <= 1.8; x += .65) box([.003, .83, .004], [x, .63, .589], materials.seams, 0, desk);
  const deskLight = new THREE.PointLight('#ffdbad', 1.1, 3, 2); deskLight.position.set(1.15, .17, -1.88); room.add(deskLight);
  // Computer, keyboard, desk lamp and understated counter details.
  const monitor = box([.71, .44, .044], [.15, 1.42, -.17], materials.dark, .018, desk);
  monitor.rotation.x = -.12;
  box([.055, .19, .06], [.15, 1.15, -.17], materials.metal, .009, desk);
  box([.32, .018, .19], [.15, 1.12, -.17], materials.dark, .008, desk);
  box([.55, .02, .17], [.12, 1.12, .23], materials.dark, .008, desk);
  const screen = makeLabel('Welcome', .59, .30, '#d8e3db', 70); screen.position.set(.15, 1.42, -.143); screen.rotation.x = -.12; desk.add(screen);
  const smallLabel = makeLabel('01', .17, .1, '#685d51', 120); smallLabel.position.set(-1.45, 1.14, .12); smallLabel.rotation.x = -Math.PI / 3; desk.add(smallLabel);
  box([.26, .20, .05], [-1.45, 1.19, .08], materials.plaster, .015, desk);

  // Upholstered waiting chairs with metallic legs and shaped armrests.
  function chair(x: number, z: number, yaw = 0) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = yaw; room.add(group);
    box([.60, .13, .56], [0, .43, 0], materials.chair, .055, group);
    const backrest = box([.60, .43, .11], [0, .69, -.23], materials.chair, .06, group); backrest.rotation.x = -.10;
    for (const side of [-1, 1]) {
      for (const depth of [-.19, .19]) pipe(new THREE.Vector3(side * .23, .03, depth), new THREE.Vector3(side * .22, .41, depth), .016, materials.metal, group);
      box([.046, .05, .48], [side * .32, .64, -.015], materials.wood, .015, group);
      pipe(new THREE.Vector3(side * .30, .42, .18), new THREE.Vector3(side * .30, .63, .18), .012, materials.metal, group);
    }
  }
  chair(-3.35, -2.9, .12); chair(-4.10, -2.65, .12);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .04, 40), materials.wood); table.position.set(-2.57, .46, -2.65); room.add(table);
  pipe(new THREE.Vector3(-2.57, .04, -2.65), new THREE.Vector3(-2.57, .44, -2.65), .025, materials.metal);
  box([.21, .011, .26], [-2.58, .488, -2.65], materials.plaster);

  // Ficus: leaf geometry, individual stems, and an instanced organic canopy.
  const rng = randomSource(46);
  function plant(x: number, z: number, scale = 1) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); room.add(group);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(.25, .18, .50, 32), materials.stone); pot.position.y = .25; pot.castShadow = true; group.add(pot);
    const soil = new THREE.Mesh(new THREE.CircleGeometry(.236, 30), new THREE.MeshStandardMaterial({ color: '#342d23' })); soil.rotation.x = -Math.PI / 2; soil.position.y = .502; group.add(soil);
    const bark = new THREE.MeshStandardMaterial({ color: '#675445', roughness: .95 });
    pipe(new THREE.Vector3(0, .47, 0), new THREE.Vector3(.03, 1.7, -.04), .02, bark, group);
    const leafGeo = new THREE.SphereGeometry(1, 16, 10);
    const leafMat = new THREE.MeshStandardMaterial({ color: '#536c47', roughness: .8 });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, 90);
    for (let i = 0; i < 90; i++) {
      const theta = rng() * Math.PI * 2, h = 1.1 + rng() * .85;
      const radius = .18 + rng() * .38;
      dummy.position.set(Math.cos(theta) * radius, h, Math.sin(theta) * radius);
      dummy.rotation.set(rng() * .8, theta, -.3 + rng() * 1.3);
      dummy.scale.set(.08, .006, .15); dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix);
      leaves.setColorAt(i, new THREE.Color().setHSL(.23 + rng() * .045, .20 + rng() * .15, .20 + rng() * .12));
      if (i % 9 === 0) pipe(new THREE.Vector3(0, h - .25, 0), dummy.position.clone(), .006, bark, group);
    }
    leaves.castShadow = true; group.add(leaves);
  }
  plant(-4.15, -3.72, 1.1); plant(3.55, -3.4, 1.25);
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(.10, .078, .22, 24), materials.plaster); vase.position.set(2.68, 1.23, -2.7); room.add(vase);

  // Ceiling coves and broad daylight. No postprocessing glow obscures the hands.
  box([5.9, .025, .08], [1.4, 3.44, -4.26], materials.glow);
  box([.08, .025, 9], [-4.80, 3.44, -.4], materials.glow);
  box([2.0, .015, .16], [1.3, 3.5, -1.6], new THREE.MeshBasicMaterial({ color: '#fafaf4' }));
  scene.add(new THREE.HemisphereLight('#f5f6f1', '#d3c5ac', 1.15));
  const sun = new THREE.DirectionalLight('#ffeed3', 3.2); sun.position.set(-4, 5, 3); sun.target.position.set(0, .8, -2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: .2, far: 18 });
  sun.shadow.bias = -.0003; sun.shadow.normalBias = .015; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#ffffff', 1.1); fill.position.set(2, 3, 5); scene.add(fill);
  return room;
}
