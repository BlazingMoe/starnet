Latest owner tuning: ambient darkness reduced from 0.84 to 0.82 for a slight overall lift, most visible in the sides. Source positions, radius, hue, sheen and falloff are unchanged. The reference parity proof now compares the original renderer with exactly this same ambient adjustment, and both base and lightmap remain identical. Focused lighting checks pass 39 assertions; the local room was refreshed and visually inspected. The reference version before this two-point adjustment completed all 722 fast steps; a new full receipt for the adjustment is pending.

# Exact reference lighting restoration

Current implementation: 463ee4864. Source lock: 2a86a5ca9. Branch: agent/room-lighting-strip.

The owner supplied Screenshot 2026-09-05 224320.png and explicitly requested its top and bottom lights. The corresponding saved station room was found read-only in Local/StarNet/workspaces/agent.save.json: HAB-16, 15x14, walnut plank floor, ribbed hull wall, bar, pool table, couch and dining table. Only station geometry/props were copied to the disposable dev preview, with its two adjacent corridors. The real saved station was not modified.

All continuous-beam and separate clipped-wall experiments are removed. The original 07a643772 renderer's lighting is restored. Other rooms now keep the reference's single column and two source rows, with normalized positions and radius/fill scaled from 15x14. Global lighting strengths, physical falloff, floor sheen, room temperature and live shimmer use the original values.

Live proof: dev/room-lighting-reference-proof.mjs bakes the same saved reference geometry with the new renderer and the original renderer in a live seeded page. Both base image and lightmap data URLs are byte-identical (reference-parity.json: lightmapIdentical=true, baseIdentical=true). This proves the baked lighting matches the original renderer for the reference room; animated crew, props, CRT noise and screenshot framing are not a pixel-identical photograph claim. Screenshot artifact: .worldshots/room-lighting/reference-restored.png.

Preview http://127.0.0.1:9197 now opens the actual furnished reference room and two corridor stubs. The in-app browser was reloaded, framed in cinema view and visually inspected. Two warm source areas and darker side edges are visible. A preview-only auto-created commander desk and seeded crew can differ from the reference screenshot.

Seven live room sizes (9x7 through 40x30, including 15x14) pass checks for two sources, bright lower light, darker sides and illuminated north wall. Focused simulation-lighting: 39 assertions pass. Stationbake chunk: 64 assertions pass. Exact current full-suite verification is pending; earlier 722-step receipts belong to previous revisions. Not merged, pushed, packaged or installer-verified.
