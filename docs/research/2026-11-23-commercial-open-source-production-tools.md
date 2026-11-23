# Commercial open-source production tools — adoption decision, 2026-11-23

## Decision

Moe AI Station remains in the existing GitHub/Codex development path. Moving the codebase to another AI-development shell is not justified while the current path is reliable, because a migration would add integration and acceptance work without proving a better product result.

Open-source applications may still be adopted when they close a required gap **or** produce a materially better result than the existing implementation on identical representative inputs. Repository popularity, a feature list, a permissive licence and a successful process exit are not sufficient acceptance evidence.

## Candidate order

| Area | Candidate | Integration posture | Required comparison |
| --- | --- | --- | --- |
| Website audit | SiteOne Crawler, Lighthouse and axe-core | First dedicated adapters; private bounded crawls only | Coverage, reproducibility, false positives, mobile/desktop evidence and readable report quality against the current evidence-only audit |
| Image finishing | Keep Sharp; benchmark rembg and later Real-ESRGAN | Optional separate tools | Alpha edges, hair/detail, product integrity, artefacts, resolution and licence/model provenance |
| 3D/game assets | Blender plus bounded trimesh/Assimp inspection | Optional, one job at a time | Topology, material, render, export/import and human visual acceptance |
| Video editing | Existing FFmpeg path; benchmark PySceneDetect/Kinocut where useful | Optional, one job at a time | Playback, timing, captions, codec, loudness, rights and customer review |
| Speech/music | Keep existing Kokoro/Whisper path; consider Pedalboard/pyloudnorm finishing | Optional | Listening quality, transcription evidence, loudness/true peak and rights |
| Documents | Keep bounded DOCX/XLSX writers; use LibreOffice/WeasyPrint/Tika only as renderer/parser fallbacks | Optional fallback | Render/readback accuracy must beat the current path without weakening input or output boundaries |
| Social channels | Prefer official provider APIs | No embedded AGPL control plane merely for convenience | Authenticated draft/publish/reconcile acceptance per provider; no bulk outreach |
| Trading | Existing simulation first; Zipline only if a later paper-only benchmark warrants it | Deferred | Reproducibility, fees/slippage and no live-trade authority |

Licence review is per exact version and distribution arrangement. Model weights, codecs, fonts, templates, assets and provider terms are reviewed separately from an application's source licence. Copyleft applications stay separate processes unless a later legal/distribution review explicitly approves a different arrangement.

## Modest-PC execution contract

- Optional programs and all of their models, caches, state and temporary files live below one configurable tool root. The default is a sibling of `WORKSPACES`, which keeps the data on `F:` when the canonical migrated workspace is on `F:`.
- Nothing is downloaded, installed or started automatically. No optional program is a permanent service.
- At most one external production job can run at once. Each profile has free-memory, free-disk, input-size and timeout floors; worker/thread hints default to two.
- Executables are accepted only at explicit paths below the tool root. PATH search, a shell and ambient secret inheritance are excluded.
- Model downloads are disabled during jobs. A process exit remains `PROCESS_COMPLETED_UNREVIEWED`; preview, licence, rights and human quality review remain separate gates.
- The model-facing surface initially exposes inspection only. Dedicated adapters must separately constrain arguments, network, inputs, outputs and final-export consent.

The first implementation milestone is therefore the shared governor and read-only inventory. The next milestone is a dedicated SiteOne/Lighthouse website-audit adapter with synthetic browser QA. Large media applications are installed only when their adapter and comparison fixture are ready, preventing disk pressure and unused complexity.
