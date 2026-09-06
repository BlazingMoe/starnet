# Vertical room lighting correction

The owner clarified that the reference is a continuous north-to-south band with lateral falloff, not circular pools in the center. This branch starts from ca78a69fa and replaces the room additive pool, ambient cut and warm film with the same width-based strip profile. Room fixtures remain on one vertical line at every aspect ratio. The animated room shimmer no longer stamps circular pools over that profile. Corridor and prop light sources are preserved.

Live seeded preview: http://127.0.0.1:9197 using node dev/seed.js --keep. The in-app browser visibly renders the running station. Six room sizes from 9x7 to 40x30 have center transmission about .784, sampled top/bottom center between .757 and .784, and side samples between .298 and .325. The live proof checks vertical consistency within .06 as well as center/perimeter separation. Furnished telescope and wood scenes are synthetic reference reconstructions, not the owner's save. Artifacts: .worldshots/room-lighting/strip-*.png and strip.json.

Focused station bake check passed 55 assertions including the explicit one-column invariant. Simulation lighting passed 40 assertions. Full npm run test:fast is running; no full green receipt is claimed. Not merged, packaged or installer-verified. Preview only; no provider credential is configured for agent runs.
