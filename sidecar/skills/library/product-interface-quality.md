---
name: Product Interface Quality
slug: product-interface-quality
description: Design and refine dashboards, admin panels and data-heavy tools with explicit hierarchy, reusable tokens and complete states.
category: Creative
requires: [cabinet, workbench]
license: MIT
default: false
---

Use for dashboards, settings, admin panels and interactive product surfaces, not campaign or marketing pages. This recipe changes no capability or permission by itself.

1. Identify the person, the task they must complete and the intended density/feel. Name the single focal action or value for each view.
2. Inspect the existing components, tokens, navigation and interaction patterns. Extend them instead of creating parallel buttons, dialogs, tables or styling conventions.
3. Choose one spacing grid, one depth strategy, a small semantic color system and a type hierarchy that uses size, weight and tone deliberately. Use tabular numbers for changing metrics and make proportions express information priority.
4. Prefer native controls, then the project's established accessible primitives. Every interaction needs keyboard/focus behavior and default, hover, active, focus and disabled states; every data surface needs loading, empty and error behavior.
5. Verify the implemented view with relevant tests and real visual inspection when an authorized browser exists. Check a narrow viewport, 200% text/zoom where practical, long values, empty data, errors, focus visibility and reduced motion. Never describe an unrun check as passed.

If durable design notes already exist, follow them. Do not create a second memory store, background design loop or silent global preference. Saving new design decisions requires the existing reviewed project path or an explicit Commander request.

Only when explicitly requested, explore one component with local mock fixtures for states its code can actually reach, or compare three variants along one named axis. Preserve the production component and design system; isolate the temporary harness and prevent live requests or account mutations. Verify each state/variant with available authorized tools and mark the rest not verified. Present tradeoffs without choosing for the Commander. Promote a variant only after their choice; remove only the task-owned harness when requested. No package installation, Figma, asset acquisition, network or publishing authority is added.
