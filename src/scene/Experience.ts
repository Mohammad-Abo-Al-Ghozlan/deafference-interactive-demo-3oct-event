import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createHospital } from './hospital';
import { AvatarRig, phraseDuration, type Phrase } from './avatar';

export type Phase = 'loading' | 'entering' | 'ready' | 'playing' | 'error';
export type SceneState = { phase: Phase; progress: number; phrase: Phrase | null; validated: boolean; error?: string };
type ClipEntry = { file: string | null; clip: string | null; validated: boolean };
const durationEntrance = 4.4;
const smooth = (t: number) => t * t * (3 - 2 * t);

export class Experience {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, .06, 45);
  private avatar: THREE.Object3D | null = null;
  private rig: AvatarRig | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private clips = new Map<Phrase, { clip: THREE.AnimationClip; validated: boolean }>();
  private activeAction: THREE.AnimationAction | null = null;
  private frame = 0;
  private lastTime = 0;
  private time = 0;
  private entranceTime = 0;
  private playTime = 0;
  private lastEmit = 0;
  private disposed = false;
  private pointer = new THREE.Vector2();
  private observer: ResizeObserver;
  private mobile = false;
  private shadow: THREE.Mesh;
  private environment: THREE.Texture;
  paused = false;
  reducedMotion = false;
  speed = 1;
  state: SceneState = { phase: 'loading', progress: 0, phrase: null, validated: false };
  constructor(private host: HTMLElement, private onState: (state: SceneState) => void, reduced: boolean) {
    this.reducedMotion = reduced;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D hospital reception and signing avatar');
    this.renderer.domElement.setAttribute('role', 'img');
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#eeeee6');
    this.scene.fog = new THREE.Fog('#f3f0e7', 15, 32);
    const environmentRoom = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(environmentRoom, .05).texture;
    this.scene.environment = this.environment; this.scene.environmentIntensity = .4;
    environmentRoom.dispose(); pmrem.dispose();
    createHospital(this.scene);
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
    const ctx = shadowCanvas.getContext('2d')!; const gradient = ctx.createRadialGradient(64, 64, 1, 64, 64, 60);
    gradient.addColorStop(0, 'rgba(43,37,28,.26)'); gradient.addColorStop(.45, 'rgba(43,37,28,.12)'); gradient.addColorStop(1, 'rgba(43,37,28,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(.85, .68), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = .008; this.scene.add(this.shadow);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host); this.resize();
    host.addEventListener('pointermove', this.pointerMove); host.addEventListener('pointerleave', this.pointerLeave);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    this.frame = requestAnimationFrame(this.render);
    void this.load();
  }
  private pointerMove = (event: PointerEvent) => {
    const rect = this.host.getBoundingClientRect(); this.pointer.set((event.clientX - rect.left) / rect.width - .5, (event.clientY - rect.top) / rect.height - .5);
  };
  private pointerLeave = () => this.pointer.set(0, 0);
  private contextLost = (event: Event) => { event.preventDefault(); this.setState({ phase: 'error', error: 'The 3D view was interrupted. Reload to continue.' }); };
  private setState(next: Partial<SceneState>) { this.state = { ...this.state, ...next }; this.onState({ ...this.state }); }
  private async load() {
    try {
      const loader = new GLTFLoader(); const gltf = await loader.loadAsync('/models/avatar.glb');
      if (this.disposed) return;
      const character = gltf.scene;
      const box = new THREE.Box3().setFromObject(character);
      const size = box.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('The avatar has no usable geometry.');
      character.scale.setScalar(1.72 / size.y);
      character.updateMatrixWorld(true);
      character.position.y -= new THREE.Box3().setFromObject(character).min.y;
      // Motion targets use metres in this unscaled outer group. Keep the
      // character's original bones and bind matrices intact inside it.
      const avatar = new THREE.Group(); avatar.name = 'SignscapeAvatar'; avatar.add(character);
      this.avatar = avatar; this.scene.add(avatar); this.rig = new AvatarRig(avatar);
      this.mixer = new THREE.AnimationMixer(avatar);
      try {
        const response = await fetch('/animations/manifest.json');
        if (!response.ok) throw new Error('Animation manifest is unavailable');
        const manifest = await response.json() as Record<Phrase, ClipEntry>;
        await Promise.all((['hello', 'good-morning', 'thank-you'] as Phrase[]).map(async phrase => {
          const entry = manifest[phrase]; if (!entry?.file) return;
          if (!/^\/?animations\/[a-zA-Z0-9_\-./]+\.glb$/.test(entry.file) || entry.file.includes('..')) return;
          const animation = await loader.loadAsync('/' + entry.file.replace(/^\//, ''));
          const clip = entry.clip ? animation.animations.find(c => c.name === entry.clip) : animation.animations[0];
          if (!clip || !clip.tracks.length || !clip.tracks.every(track => {
            const binding = THREE.PropertyBinding.parseTrackName(track.name);
            return Boolean(binding.nodeName && avatar.getObjectByName(binding.nodeName));
          })) return;
          this.clips.set(phrase, { clip, validated: entry.validated === true });
        }));
      } catch { /* No approved clips: expose the authored preview honestly. */ }
      if (this.disposed) return;
      if (this.reducedMotion) this.arrive(); else this.replayEntrance();
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__signscape = { inspect: () => ({ ...this.state, hands: this.rig?.inspect(), avatarLoaded: Boolean(this.avatar), bones: this.rig?.bones.size }) };
    } catch (error) {
      if (!this.disposed) this.setState({ phase: 'error', error: error instanceof Error ? error.message : 'Could not load the avatar.' });
    }
  }
  private resize() {
    const { clientWidth: width, clientHeight: height } = this.host; if (!width || !height) return;
    this.mobile = width < 760 && height > width * .65;
    this.renderer.setSize(width, height); this.camera.aspect = width / height;
    this.camera.fov = this.mobile ? 40 : width / height > 2 ? 42 : 41;
    this.camera.updateProjectionMatrix();
  }
  private arrive() {
    if (this.avatar) { this.avatar.position.set(-1.30, 0, -.12); this.avatar.rotation.y = .12; }
    this.entranceTime = durationEntrance; this.setState({ phase: 'ready', progress: 0, phrase: null, validated: false });
  }
  replayEntrance() {
    if (!this.avatar) return;
    this.mixer?.stopAllAction(); this.activeAction = null; this.paused = false;
    this.entranceTime = 0; this.playTime = 0;
    if (this.reducedMotion) { this.arrive(); return; }
    this.setState({ phase: 'entering', progress: 0, phrase: null, validated: false });
  }
  play(phrase: Phrase) {
    if (!this.avatar || !this.rig || this.state.phase === 'entering') return;
    this.paused = false; this.playTime = 0; this.mixer?.stopAllAction(); this.activeAction = null;
    const entry = this.clips.get(phrase);
    if (entry && this.mixer) {
      this.rig.reset(); this.activeAction = this.mixer.clipAction(entry.clip);
      this.activeAction.setLoop(THREE.LoopOnce, 1); this.activeAction.clampWhenFinished = true; this.activeAction.reset().play();
    }
    this.setState({ phase: 'playing', progress: 0, phrase, validated: entry?.validated ?? false });
  }
  setReducedMotion(reduced: boolean) { this.reducedMotion = reduced; this.pointer.set(0, 0); if (reduced && this.state.phase === 'entering') this.arrive(); }
  private render = (stamp: number) => {
    if (this.disposed) return;
    const elapsed = this.lastTime ? Math.min((stamp - this.lastTime) / 1000, .25) : 0; this.lastTime = stamp;
    const dt = this.paused || document.hidden ? 0 : elapsed;
    this.time += dt;
    if (this.avatar && this.rig) {
      if (this.state.phase === 'entering') {
        this.entranceTime += dt;
        const p = Math.min(this.entranceTime / 3.35, 1); const walk = smooth(p);
        this.avatar.position.set(THREE.MathUtils.lerp(-3.95, -1.30, walk), Math.sin(this.entranceTime * 19) * .009 * Math.sin(p * Math.PI), THREE.MathUtils.lerp(1.2, -.12, walk));
        this.avatar.rotation.y = THREE.MathUtils.lerp(2.03, .12, smooth(THREE.MathUtils.clamp((this.entranceTime - 2.7) / 1.2, 0, 1)));
        const strength = Math.sin(Math.min(p * 1.35, 1) * Math.PI) * .85;
        if (p < .99) this.rig.walk(this.entranceTime, Math.max(strength, .15)); else this.rig.idle(this.time, this.reducedMotion);
        this.state.progress = Math.min(this.entranceTime / durationEntrance, 1);
        if (this.entranceTime >= durationEntrance) this.arrive();
      } else if (this.state.phase === 'playing' && this.state.phrase) {
        this.playTime += dt * this.speed;
        const duration = this.activeAction ? this.activeAction.getClip().duration : phraseDuration(this.state.phrase);
        if (this.activeAction) this.mixer!.update(dt * this.speed); else this.rig.sign(this.state.phrase, this.playTime);
        this.state.progress = Math.min(this.playTime / duration, 1);
        if (this.playTime >= duration) { this.mixer?.stopAllAction(); this.activeAction = null; this.setState({ phase: 'ready', progress: 1 }); }
      } else this.rig.idle(this.time, this.reducedMotion);
      this.shadow.position.x = this.avatar.position.x; this.shadow.position.z = this.avatar.position.z;
      if (this.state.phase !== 'playing') {
        this.avatar.traverse(object => {
          const mesh = object as THREE.SkinnedMesh;
          if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
          const blink = Math.max(0, 1 - Math.abs((this.time % 5.1) - 4.7) / .09);
          for (const name of ['eyesClosed', 'eyeBlinkLeft', 'eyeBlinkRight']) {
            const index = mesh.morphTargetDictionary[name]; if (index !== undefined) mesh.morphTargetInfluences[index] = blink;
          }
        });
      }
    }
    const entrance = smooth(Math.min(this.entranceTime / durationEntrance, 1));
    const parallax = this.state.phase === 'ready' && !this.reducedMotion && !this.mobile ? this.pointer.x * .08 : 0;
    if (this.mobile) {
      this.camera.position.set(-.85, 1.50, THREE.MathUtils.lerp(4.8, 3.7, entrance));
      this.camera.lookAt(-1.15, 1.02, -.30);
    } else {
      this.camera.position.set(THREE.MathUtils.lerp(.4, .1, entrance) + parallax, 1.60, THREE.MathUtils.lerp(5.6, 3.40, entrance));
      this.camera.lookAt(-.55, 1.15, -1.15);
    }
    this.renderer.render(this.scene, this.camera);
    if (stamp - this.lastEmit > 85 && (this.state.phase === 'playing' || this.state.phase === 'entering')) { this.onState({ ...this.state }); this.lastEmit = stamp; }
    this.frame = requestAnimationFrame(this.render);
  };
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect();
    this.host.removeEventListener('pointermove', this.pointerMove); this.host.removeEventListener('pointerleave', this.pointerLeave);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    this.mixer?.stopAllAction();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse(object => {
      const mesh = object as THREE.Mesh; if (!mesh.geometry) return; mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
        mat.dispose();
      }
    });
    textures.forEach(texture => texture.dispose()); this.environment.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
