# Room lighting reference correction

Current implementation: 5fd23677c, source lock 2976fce4c, agent/room-lighting-strip.

The owner rejected both the centered pools and the uniform strip. The additional reference shows a lit north wall, the original falloff and sheen, and dark lateral/lower floor. The continuous strip implementation is superseded. Original north-wall fixture placement, depth rhythm, pool/sheens, warm film and live shimmer are restored. One fixture column follows the room center. Deck radius is capped at 30% of room width before the existing reach multipliers. Background room fill follows those actual sources instead of creating a separate central pool. A wall-only clip restores original wall reach without spilling onto floor edges. Website mirrors match.

Live preview: http://127.0.0.1:9197, node dev/seed.js --keep. In-app browser reloaded and visually checked in cinema view: north-wall panels visible, dark lateral/lower floor, strongest light near the north fixture. Synthetic furnished telescope and wood reference reconstructions are in .worldshots/room-lighting/northwall-narrow-*.png. These are not the owner's save.

Six live bake sizes 9x7 through 40x30: source transmission .761-.784; side samples at the source .141-.302; north wall .808-.871. In the small 9x7 and 14x9 rooms, lower center is .267-.310 and lower corners .165. Larger rooms retain the original repeated north-south fixture rhythm. Explicit live assertions require source/edge separation and nonblack north walls.

Focused simulation lighting: 39 assertions pass. Station bake: 54 assertions pass. Syntax and whitespace checks pass. The earlier strip version completed all 722 fast steps, but that receipt does not validate this correction. A new full npm run test:fast is running; log .worldshots/room-lighting/test-fast-northwall.log. Not merged or installer-verified. No provider credential is configured for agent runs.
