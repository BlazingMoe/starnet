---
name: Interface Content Quality
slug: interface-content-quality
description: Review interface accessibility, typography and action copy together, with concrete fixes and honest verification evidence.
category: Quality
requires: [cabinet, workbench]
license: MIT
default: false
---

Use after a UI exists or while changing one. Work from the repository's actual strings, locale files, styles and components; do not invent a brand voice or rename established objects casually.

1. Accessibility: prefer native semantics; require accessible names, visible keyboard focus, keyboard paths for pointer actions, associated form labels, announced errors, non-color status cues, reduced-motion handling and usable reflow. Cite a WCAG 2.2 A/AA criterion only when it actually applies.
2. Typography: keep a small role-based scale, unitless line height, readable line measure, deliberate wrapping and full-text recovery for truncation. Use tabular numerals for changing values and preserve browser/user font scaling.
3. Copy: keep one noun and verb per concept, verb-first actions, descriptive links, calm recoverable errors and explicit destructive consequences. Build complete localized messages rather than concatenated sentence fragments.
4. Verify static code findings, then use an authorized browser/accessibility tree when available for focus order, names, roles, zoom/reflow and dynamic announcements. Mark unavailable checks as not verified.

Report root causes with severity, file/line, before, after and user impact. Block completion when a high-severity task barrier remains; never approve coverage that was not inspected. This recipe grants no browser, screen-reader, file, network or external-action authority.
