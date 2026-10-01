import * as THREE from 'three';

export type Phrase = 'hello' | 'good-morning' | 'thank-you';
type Point = [number, number, number];
type HandPose = { position: Point; forward: Point; normal: Point };
type Pose = { right: HandPose; left: HandPose; head: number };
type Key = { time: number; pose: Pose };

const hand = (position: Point, forward: Point = [0, -1, .15], normal: Point = [0, .15, 1]): HandPose => ({ position, forward, normal });
const idle: Pose = { right: hand([-.29, .84, .10]), left: hand([.29, .84, .10]), head: 0 };

// These authored poses illustrate the interaction. They are not motion capture
// or certified ASL. Approved GLB clips can replace them through the manifest.
function phraseKeys(phrase: Phrase): Key[] {
  const wave = (x: number): Pose => ({ right: hand([x, 1.39, .26], [0, 1, 0], [0, 0, 1]), left: idle.left, head: -.035 });
  const thanks = (out: number): Pose => ({
    right: hand([-.04, 1.34 - out * .16, .26 + out * .34], [0, 1 - out * .35, out * .7], [0, out * .65, -1]),
    left: idle.left, head: -.03,
  });
  const good = (down: number): Pose => ({
    right: hand([-.05, 1.34 - down * .27, .26 + down * .19], [0, 1 - down * .6, down], [0, down, -1]),
    left: hand([.13, 1.0, .46], [-1, 0, 0], [0, 1, 0]), head: 0,
  });
  const morning = (up: number): Pose => ({
    right: hand([-.04, 1.12 + up * .24, .43 + up * .03], [0, .12 + up * .7, 1], [0, 1, -.12 - up * .7]),
    left: hand([.17, 1.07, .44], [-1, 0, 0], [0, 1, 0]), head: -.025 * up,
  });
  if (phrase === 'hello') return [
    { time: 0, pose: idle }, { time: .75, pose: wave(-.39) },
    { time: 1.02, pose: wave(-.47) }, { time: 1.32, pose: wave(-.32) },
    { time: 1.62, pose: wave(-.47) }, { time: 1.92, pose: wave(-.34) },
    { time: 2.24, pose: wave(-.39) }, { time: 3.05, pose: idle },
  ];
  if (phrase === 'thank-you') return [
    { time: 0, pose: idle }, { time: .83, pose: thanks(0) },
    { time: 1.18, pose: thanks(0) }, { time: 2.13, pose: thanks(1) },
    { time: 2.42, pose: thanks(1) }, { time: 3.27, pose: idle },
  ];
  return [
    { time: 0, pose: idle }, { time: .75, pose: good(0) },
    { time: 1.15, pose: good(0) }, { time: 1.9, pose: good(1) },
    { time: 2.30, pose: morning(0) }, { time: 3.20, pose: morning(1) },
    { time: 3.65, pose: morning(1) }, { time: 4.50, pose: idle },
  ];
}

export const phraseDuration = (phrase: Phrase) => phraseKeys(phrase).at(-1)!.time;
const ease = (t: number) => t * t * (3 - 2 * t);

export class AvatarRig {
  readonly bones = new Map<string, THREE.Bone>();
  readonly rest = new Map<string, THREE.Quaternion>();
  private joints = new Map<string, THREE.Bone>();
  private faceOffset = 0;
  private bases = new Map<string, THREE.Quaternion>();
  constructor(readonly model: THREE.Object3D) {
    model.updateMatrixWorld(true);
    model.traverse(object => {
      if ((object as THREE.Bone).isBone) {
        const bone = object as THREE.Bone;
        this.bones.set(bone.name, bone); this.rest.set(bone.name, bone.quaternion.clone());
      }
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true; object.receiveShadow = true;
        const mesh = object as THREE.Mesh;
        if (Array.isArray(mesh.material)) mesh.material.forEach(m => { m.side = THREE.FrontSide; });
        else mesh.material.side = THREE.FrontSide;
      }
    });
    const names: Record<string, string> = { Head: 'head', Spine: 'spine_01', Spine2: 'spine_03' };
    for (const [side, suffix] of [['Right', 'r'], ['Left', 'l']]) {
      for (const [role, name] of Object.entries({ Arm: 'upperarm', ForeArm: 'lowerarm', Hand: 'hand', UpLeg: 'upperleg', Leg: 'lowerleg', Foot: 'foot', HandMiddle1: 'middle_01', HandIndex1: 'index_01', HandPinky1: 'pinky_01' })) names[side + role] = name + '_' + suffix;
    }
    for (const [role, name] of Object.entries(names)) {
      const bone = this.bones.get(name) ?? this.bones.get(role);
      if (!bone) throw new Error(`The avatar is missing the ${role} joint.`);
      this.joints.set(role, bone);
    }
    const head = this.model.worldToLocal(this.joint('Head').getWorldPosition(new THREE.Vector3()));
    this.faceOffset = head.y - .045 - 1.34;
    for (const side of ['Right', 'Left']) {
      const wrist = this.joint(side + 'Hand');
      const mid = this.joint(side + 'HandMiddle1');
      const index = this.joint(side + 'HandIndex1');
      const pinky = this.joint(side + 'HandPinky1');
      const middlePoint = wrist.worldToLocal(mid.getWorldPosition(new THREE.Vector3()));
      const indexPoint = wrist.worldToLocal(index.getWorldPosition(new THREE.Vector3()));
      const pinkyPoint = wrist.worldToLocal(pinky.getWorldPosition(new THREE.Vector3()));
      const forward = middlePoint.normalize();
      const across = indexPoint.sub(pinkyPoint).normalize();
      const normal = across.cross(forward).normalize().multiplyScalar(side === 'Right' ? 1 : -1);
      const right = forward.clone().cross(normal).normalize();
      this.bases.set(side, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, forward, normal)));
    }
  }
  private joint(name: string) { return this.joints.get(name)!; }
  reset() { for (const [name, q] of this.rest) this.bones.get(name)!.quaternion.copy(q); }
  private rotate(name: string, x: number, y = 0, z = 0) {
    const bone = this.joint(name); if (!bone) return;
    // Apply offsets in the avatar's anatomical frame. Bone-local axes differ
    // across rigs, including mirrored leg bones in the supplied character.
    const root = this.model.getWorldQuaternion(new THREE.Quaternion());
    const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
    const worldOffset = root.clone().multiply(offset).multiply(root.clone().invert());
    const desired = worldOffset.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    bone.quaternion.copy(bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired));
    bone.updateWorldMatrix(false, true);
  }
  private aim(bone: THREE.Bone, child: THREE.Bone, target: THREE.Vector3) {
    const position = bone.getWorldPosition(new THREE.Vector3());
    const current = child.getWorldPosition(new THREE.Vector3()).sub(position).normalize();
    const desired = target.clone().sub(position).normalize();
    const world = new THREE.Quaternion().setFromUnitVectors(current, desired).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    const parent = bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(parent.multiply(world)); bone.updateWorldMatrix(false, true);
  }
  private arm(side: 'Right' | 'Left', pose: HandPose) {
    const upper = this.joint(side + 'Arm');
    const lower = this.joint(side + 'ForeArm');
    const wrist = this.joint(side + 'Hand');
    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    const elbow = lower.getWorldPosition(new THREE.Vector3());
    const wristNow = wrist.getWorldPosition(new THREE.Vector3());
    const first = shoulder.distanceTo(elbow), second = elbow.distanceTo(wristNow);
    const target = this.model.localToWorld(new THREE.Vector3(...pose.position));
    const direction = target.clone().sub(shoulder);
    const distance = THREE.MathUtils.clamp(direction.length(), .04, (first + second) * .985);
    direction.normalize(); target.copy(shoulder).addScaledVector(direction, distance);
    const pole = this.model.localToWorld(new THREE.Vector3(side === 'Right' ? -.70 : .70, 1.03, .20)).sub(shoulder);
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    const cos = THREE.MathUtils.clamp((first * first + distance * distance - second * second) / (2 * first * distance), -.999, .999);
    const elbowTarget = shoulder.clone().addScaledVector(direction, first * cos).addScaledVector(pole, first * Math.sqrt(1 - cos * cos));
    this.aim(upper, lower, elbowTarget); this.aim(lower, wrist, target);

    const rootQ = this.model.getWorldQuaternion(new THREE.Quaternion());
    const forward = new THREE.Vector3(...pose.forward).normalize().applyQuaternion(rootQ);
    const normal = new THREE.Vector3(...pose.normal).normalize().applyQuaternion(rootQ);
    normal.addScaledVector(forward, -normal.dot(forward)).normalize();
    const across = forward.clone().cross(normal).normalize();
    const desired = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, forward, normal));
    desired.multiply(this.bases.get(side)!.clone().invert());
    wrist.quaternion.copy(wrist.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired));
    wrist.updateWorldMatrix(false, true);
  }
  pose(right: HandPose, left: HandPose, head = 0) {
    this.rotate('Head', head);
    this.model.updateMatrixWorld(true);
    this.arm('Right', right); this.arm('Left', left);
  }
  idle(time: number, reduced = false) {
    this.reset();
    const breathe = reduced ? 0 : Math.sin(time * 1.25) * .003;
    this.rotate('Spine2', breathe);
    this.pose(idle.right, idle.left, reduced ? 0 : Math.sin(time * .42) * .009);
  }
  walk(time: number, strength: number) {
    this.reset();
    const stride = Math.sin(time * 9.5) * strength;
    this.rotate('LeftUpLeg', stride * .34); this.rotate('RightUpLeg', -stride * .34);
    this.rotate('LeftLeg', Math.max(0, -stride) * .44);
    this.rotate('RightLeg', Math.max(0, stride) * .44);
    this.rotate('LeftFoot', -Math.max(0, -stride) * .12); this.rotate('RightFoot', -Math.max(0, stride) * .12);
    this.rotate('Spine', .015 * strength);
    this.pose(hand([-.29, .85, .1 + stride * .16]), hand([.29, .85, .1 - stride * .16]));
  }
  sign(phrase: Phrase, time: number) {
    this.reset();
    const keys = phraseKeys(phrase);
    const last = keys.at(-1)!;
    let a = keys[0], b = keys[1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (time >= keys[i].time) { a = keys[i]; b = keys[i + 1]; }
    }
    const f = ease(THREE.MathUtils.clamp((Math.min(time, last.time) - a.time) / (b.time - a.time), 0, 1));
    const interpolate = (one: HandPose, two: HandPose): HandPose => {
      const blend = (x: Point, y: Point): Point => [0, 1, 2].map(i => THREE.MathUtils.lerp(x[i], y[i], f)) as Point;
      return { position: blend(one.position, two.position), forward: blend(one.forward, two.forward), normal: blend(one.normal, two.normal) };
    };
    const align = (pose: HandPose): HandPose => ({ ...pose, position: [pose.position[0], pose.position[1] + this.faceOffset * THREE.MathUtils.clamp((pose.position[1] - .9) / .44, 0, 1), pose.position[2]] });
    this.pose(align(interpolate(a.pose.right, b.pose.right)), align(interpolate(a.pose.left, b.pose.left)), THREE.MathUtils.lerp(a.pose.head, b.pose.head, f));
  }
  inspect() {
    const out: Record<string, number[]> = {};
    for (const name of ['RightHand', 'LeftHand', 'RightForeArm', 'LeftForeArm']) out[name] = this.joint(name).getWorldPosition(new THREE.Vector3()).toArray();
    return out;
  }
}
