# Deafference Signscape

A single-screen, frontend-only 3D hospital reception experience for Deafference events. Built with React, TypeScript, Vite, and Three.js. Uses npm.

## Run

```bash
npm install
npm run dev
```

Open the URL printed by Vite. To display the demo on other devices on your venue's local network, run `npm run dev -- --host 0.0.0.0` and use the machine's LAN address.

```bash
npm run build
npm run preview
```

Deploy `dist/` to a static host. Models, branding, and fonts are served locally; there are no CDN dependencies or API keys. There is no backend, camera access, audio recording, speech recognition, or machine learning service in this demo.

## Experience

- The supplied GLB avatar walks into an actual WebGL reception room. The room is geometry, not a background screenshot.
- At reception, choose **Hello**, **Good morning**, or **Thank you**. Each selection plays a different authored motion preview.
- Replay the entrance, replay a phrase, pause/resume, or reduce playback speed.
- English and Arabic UI labels, full-screen control, keyboard shortcuts, and a reduced-motion option.
- Desktop, tablet, and phone layouts fit in one viewport without page scrolling.
- Keyboard: **1 / 2 / 3** select phrases; **R** replays the entrance. Native dialog supports Escape.

## Animation status — read before an event

**The included gestures are illustrative, authored motion previews. They have not been validated by a Deaf signer. They are not motion-captured signing, certified ASL, or evidence of live translation. Arabic UI labels do not convert ASL into a local Arabic sign language.**

The current avatar is the supplied **3D Char deaf.glb**, with its original 88-joint skeleton and mesh. It contains no embedded animation clips. The demo maps its named joints to the motion controls, uses a two-bone IK solver for the arms, and preserves its authored finger rest poses. The original project's sign JSON files were solid-color Lottie placeholders.

For web delivery, the avatar's 8192px texture is resized to 2048px WebP and its duplicate JPEG fallback is removed. Geometry, skin weights, bind matrices, materials, and bone names are preserved. The input file remains untouched. Modern browsers with WebP and WebGL support are required. The optional `scripts/prepare-avatar.py` utility reproduces this preparation using Pillow; it is not needed to run the website with npm.

Motion references, used for basic direction and hand positioning rather than to claim validation:

- Hello: https://www.lifeprint.com/asl101/pages-signs/h/hello.htm
- Thank you: https://www.lifeprint.com/asl101/pages-signs/t/thankyou.htm
- Good: https://www.lifeprint.com/asl101/pages-signs/g/good.htm
- Morning: https://www.lifeprint.com/asl101/pages-signs/m/morning.htm

Have a Deaf signer from the audience's language community review the exact rendered motions before presenting them as signs.

## Replace previews with approved clips

1. Obtain an approved animation exported on the **same skeleton** as `public/models/avatar.glb`. Different rigs require proper retargeting first.
2. Save it as, for example, `public/animations/hello-approved.glb`.
3. Update the relevant entry in `public/animations/manifest.json`:

```json
{
  "hello": {
    "file": "animations/hello-approved.glb",
    "clip": "Hello",
    "validated": true
  },
  "good-morning": { "file": null, "clip": null, "validated": false },
  "thank-you": { "file": null, "clip": null, "validated": false }
}
```

`clip` is the exact animation name in that GLB; use `null` to select its first clip. Only set `validated` after a real review. The app checks that animation tracks target objects on the supplied rig. It falls back to the clearly labelled preview if a clip cannot be loaded or bound.

## Files

| File | Purpose |
|---|---|
| `src/App.tsx` | Bilingual UI, controls, scene lifecycle |
| `src/style.css` | Responsive, single-screen layout |
| `src/scene/hospital.ts` | Reception architecture, materials, lighting |
| `src/scene/avatar.ts` | IK solver and illustrative phrase poses |
| `src/scene/Experience.ts` | GLB loading, entrance, camera and playback |
| `public/animations/manifest.json` | Approved clip mapping |

## Assets

The avatar was supplied separately by the user; Deafference branding comes from the supplied project. The room's geometry and material textures are authored in code. Manrope is distributed by Fontsource under its included font license. Lucide icons use their package license. Keep the asset owners' permissions when reusing or redistributing the project.
