---
name: Web Design Quality
slug: web-design-quality
description: Build distinctive, responsive web pages from the actual brief and verify them instead of relying on a generic template.
category: Creative
requires: [cabinet, workbench]
license: MIT
default: false
---

Use for a new public-facing page, landing page, portfolio or substantial visual redesign. This recipe is guidance only: it does not add a browser, image generator, network access, paid font, asset license or publishing authority.

1. Read the real brief, audience, content and existing design system. Preserve explicit requirements and existing project conventions. If the subject, primary action or audience is genuinely ambiguous, state one bounded assumption or ask one concise question.
2. Before code, write a compact direction: named palette tokens, type roles, layout idea, one subject-specific signature and three generic defaults to avoid. Spend visual boldness in one place; every decoration must support the content.
3. Reuse existing components and tokens. Use native semantic elements and established accessible primitives before creating new controls. Do not fetch fonts, images, packages or templates unless the Commander authorized that source and the relevant tool is actually available.
4. Build with realistic content, responsive behavior, visible keyboard focus, reduced-motion support and readable contrast. Include loading, empty, error, hover, focus and disabled states where the page needs them.
5. Run the project's tests and, when an authorized browser is available, inspect real screenshots at desktop and narrow/mobile widths. Check hierarchy, overflow, text wrapping, focus order, missing assets and the requested interaction. Report any view or behavior that was not actually verified.

Do not claim that using this recipe lowered cost. Record measured savings only when the runtime exposes comparable telemetry.

For color/layout/motion work, preserve semantic token roles and the project's notation, spacing and motion conventions. Measure contrast against the rendered background in each supported theme; never invent a ratio. Check grouping, reading order, long localized strings and RTL where supported. Motion must be interruptible, respect reduced motion and leave a static state cue. Use existing dependencies only; this guidance grants no Figma, account or package-install authority.
