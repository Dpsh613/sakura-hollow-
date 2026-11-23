# Sakura Hollow

A tiny floating island adrift in the clouds, built entirely in code with Three.js and the Web Audio API.
No images, models, textures or sound files are loaded: every mesh, material, animation, cloud,
raindrop and voice is generated procedurally.

```
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

## What lives here
- **Ten characters with their own personalities**: Mochi (gentle florist rabbit), Peaches (bubbly gardener
  rabbit who loves rain), Hazel (curious fox who fishes and lights the campfire), Professor Hoot (nocturnal
  storytelling owl), Biscuit and Bean (piglet siblings who dance and squabble over apples), Pip (shy mouse
  behind the root door who sails paper boats), Wren (songbird), Lily (frog on the lily pads) and Bramble
  (a hedgehog who only visits after dark).
- They choose what to do from their needs, traits, friendships, the time and the weather: chatting
  (sometimes disagreeing and making up), playing tag, sharing food, gardening and harvesting, picking
  flowers as gifts, fishing, swinging and pushing each other, napping, stargazing, dancing, watching
  the clouds, storytelling round the fire, splashing in puddles, sheltering from rain and going home at night.
  Friendships grow with every shared moment.
- **A living sky**: a full day–night cycle, weather (clear, breezy, overcast, rain, thunderstorms with
  lightning, mist, snow), seasons (blossom, summer green, autumn flame, bare snowy winter with a frozen
  pond), wet glossy surfaces, puddles, rainbows after rain, stars and shooting stars.
- **Sound**: wind and rustling leaves, rain and roof patter, thunder, the waterfall and stream, birdsong
  with a dawn chorus, crickets and frogs at night, a crackling campfire, wind chimes, footsteps that change
  on wood, wet ground and snow, a music box, and a distinct synthesised voice for every character.

## Controls
- Drag to orbit, scroll or pinch to zoom, right-drag to pan
- **Click** a creature to say hi · **double-click** to follow them around
- Click the pond, the clouds, the campfire, the tree, the swing, the bells... and look for the fairy ring
- Top right: sound, plus world settings (time of day, weather, season, volume, music box, captions)
- Bottom bar: island, treehouse, campfire meadow, pond, garden, beneath the island, and gentle drift

## Structure
- `src/core/` noise, clay materials (world-space bump, wet/snow/season/grade reactions, contact AO),
  geometry helpers, post-processing, camera rig
- `src/env/weather.js` time, weather and season engine that drives light, sky, water and shaders
- `src/world/` island & underside, water, sky & clouds, treehouse, tree, flower tower, places, vegetation, effects
- `src/life/` character rigs, animation & locomotion, navigation (A*), activities (coroutines), director, emotes
- `src/audio/engine.js` the procedural soundscape and voices
- `src/main.js` assembly, interaction, UI and quality tiers

## Performance
At start-up the app times a few frames and picks a tier: full (ambient occlusion, bloom, tilt-shift),
medium (bloom and tilt-shift) or light (direct render with the colour grade applied in the materials).
Resolution then adapts to hold about 30 fps.
