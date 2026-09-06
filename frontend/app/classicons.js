/* STARNET — classicons.js : the CLASS SEAL system for the Recruitment Bay.

   A class is identified by an engraved emblem (a "challenge-coin" seal), NEVER by a character
   skin — the skin is the Commander's own choice at summon. This module is the single source for:
     • the bespoke vector emblem per built-in specialty (currentColor SVG, themes to the accent),
     • the 3-letter class code stamped on the coin,
     • the focus LANE a spec reads as (code / research / ops) from its ranking tags,
     • the model tier rendered as gold CLEARANCE pips (◆◆◆ reasoning / ◆◆ balanced / ◆ fast).

   Pure + DOM-free so it unit-tests under node and is reused anywhere a class is shown. The emblems
   are matte (debossed, not glowing) to sit inside the phosphor-CRT chrome. Customs (no bespoke art)
   fall back to their chosen emoji + a derived code. UMD-light: a `ClassIcons` global / node export. */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.ClassIcons = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const D = '#0c0704';   // the coin's recessed-floor colour — cut detail in an emblem is "carved" in this

  // Bespoke etched line emblems. A shared optical weight and translucent detail keep every
  // class legible from shelf to hero size; currentColor follows all station themes.
  const ICONS = {
    "chief": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M16 3 20 12 29 16 20 20 16 29 12 20 3 16 12 12Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/><path d=\"M16 3 19 13 29 16 19 19 16 29 13 19 3 16 13 13Z M6 6 9 9 M23 23 26 26 M26 6 23 9 M9 23 6 26\"/><circle cx=\"16\" cy=\"16\" r=\"2\"/></svg>",
    "engineer": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"3\" y=\"6\" width=\"26\" height=\"21\" rx=\"2\"/><path d=\"M3 11H29 M11 15 7 19 11 23 M21 15 25 19 21 23 M18 14 14 24 M7 8.5H8 M11 8.5H12\"/></svg>",
    "researcher": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"14\" cy=\"13\" r=\"9\"/><circle cx=\"14\" cy=\"13\" r=\"5\"/><path d=\"M21 20 28 27 M11 13H17 M14 10V16 M4 27H15\"/></svg>",
    "reviewer": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M16 3 27 7V16Q26 24 16 29Q6 24 5 16V7Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/><path d=\"M16 3 27 7V16Q26 24 16 29Q6 24 5 16V7Z M10 16 14 20 22 12 M12 7H20\"/></svg>",
    "operator": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"16\" cy=\"16\" r=\"8\"/><circle cx=\"16\" cy=\"16\" r=\"3\"/><path d=\"M13 8V3H19V8 M24 13H29V19H24 M19 24V29H13V24 M8 19H3V13H8 M7 7 10 10 M22 22 25 25 M25 7 22 10 M10 22 7 25\"/></svg>",
    "analyst": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M6 21 12 15 18 18 26 7V27H6Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/><path d=\"M4 4V28H29 M9 24V20 M15 24V17 M21 24V13 M27 24V8 M7 15 13 10 19 12 27 4 M22 4H27V9\"/></svg>",
    "scout": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M2 16Q16-3 30 16Q16 35 2 16Z M16 3V6 M16 26V29\"/><circle cx=\"16\" cy=\"16\" r=\"6\"/><circle cx=\"16\" cy=\"16\" r=\"2\"/></svg>",
    "archivist": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"5\" y=\"4\" width=\"22\" height=\"25\" rx=\"2\"/><path d=\"M5 12H27 M5 20H27 M13 8H19 M13 16H19 M13 24H19\"/></svg>",
    "designer": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M5 6H21V22H5Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/><rect x=\"4\" y=\"5\" width=\"17\" height=\"17\" rx=\"2\"/><circle cx=\"22\" cy=\"22\" r=\"7\"/><path d=\"M8 2V8 M2 9H8 M25 10V3H18\"/></svg>",
    "envoy": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"3\" y=\"8\" width=\"26\" height=\"19\" rx=\"2\"/><path d=\"M3 9 16 19 29 9 M4 26 11 19 M28 26 21 19 M11 4H21\"/></svg>",
    "navigator": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"16\" cy=\"16\" r=\"12\"/><path d=\"M22 9 19 19 9 23 13 13Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/><path d=\"M22 9 19 19 9 23 13 13Z M13 13 19 19 M16 1V5 M16 27V31 M1 16H5 M27 16H31\"/></svg>",
    "curator": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M3 10H29V27H3Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/><path d=\"M3 11V6H12L15 10H29V27H3Z M8 15H24 M8 20H20 M8 24H16\"/></svg>",
    "muse": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M11 22C11 18 6 17 6 11A10 10 0 0 1 26 11C26 17 21 18 21 22Z M11 26H21 M14 29H18 M16 22V15 M12 11 16 15 20 11 M2 5 4 7 M28 7 30 5\"/><path d=\"M11 22C11 18 6 17 6 11A10 10 0 0 1 26 11C26 17 21 18 21 22Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "broker": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M16 3V28 M10 28H22 M5 9H27 M7 9 3 20H11Z M25 9 21 20H29Z M3 20Q7 26 11 20 M21 20Q25 26 29 20\"/><circle cx=\"16\" cy=\"7\" r=\"2\"/></svg>",
    "marketer": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M5 12H13L24 5V25L13 18H5Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/><path d=\"M5 12H13L24 5V25L13 18H5Z M13 12V18 M7 18 9 27H14L12 18 M28 10 30 8 M28 15H31 M28 20 30 22\"/></svg>",
    "tutor": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M16 9Q9 5 3 8V27Q9 24 16 28Q23 24 29 27V8Q23 5 16 9V28 M7 12 12 13 M7 17 12 18 M20 13 25 12 M20 18 25 17 M16 2V5\"/></svg>",
    "auditor": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M16 3 27 7V15Q27 23 16 29Q5 23 5 15V7Z\"/><circle cx=\"15\" cy=\"14\" r=\"5\"/><path d=\"M19 18 23 22 M12 14H18 M15 11V17\"/></svg>",
    "treasurer": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"5\" y=\"3\" width=\"23\" height=\"26\" rx=\"2\"/><path d=\"M10 3V29 M2 8H7 M2 15H7 M2 23H7 M15 9H23 M15 14H23 M15 21 18 24 24 18\"/></svg>",
    "opportunist": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 12 10 5H22L28 12 16 28Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/><path d=\"M4 12 10 5H22L28 12 16 28Z M4 12H28 M10 5 12 12 16 28 20 12 22 5 M12 12 16 5 20 12 M3 3V7 M1 5H5\"/></svg>",
    "strategist": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"14\" cy=\"18\" r=\"11\"/><circle cx=\"14\" cy=\"18\" r=\"7\"/><circle cx=\"14\" cy=\"18\" r=\"2\"/><path d=\"M14 18 27 5 M23 5V1 M23 5H28V10 M27 5 30 2\"/><path d=\"M14 18 23 9 23 5 28 5 28 10 24 10Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "publisher": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"4\" y=\"6\" width=\"24\" height=\"23\" rx=\"2\"/><path d=\"M10 3V9 M22 3V9 M4 13H28 M9 18H12 M18 18H23 M9 24H12 M18 23 20 25 24 21\"/></svg>",
    "producer": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"3\" y=\"12\" width=\"26\" height=\"17\" rx=\"2\"/><path d=\"M3 12 2 7 27 2 28 7Z M8 6 12 10 M17 4 21 8 M13 17 22 21 13 25Z\"/></svg>",
    "writer": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M6 3H21L26 8V29H6Z M21 3V9H26 M11 13H21 M11 18H21 M11 23H17\"/><path d=\"M21 3V9H26Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "prospector": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M3 5H29L20 17V26L12 29V17Z M7 10H25\"/><circle cx=\"10\" cy=\"3\" r=\"1\"/><circle cx=\"16\" cy=\"3\" r=\"1\"/><circle cx=\"22\" cy=\"3\" r=\"1\"/></svg>",
    "closer": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M6 3H21L26 8V17 M6 3V29H18 M11 10H20 M11 15H20 M11 20H14\"/><circle cx=\"23\" cy=\"24\" r=\"7\"/><path d=\"M19 24 22 27 27 21\"/></svg>",
    "steward": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M3 5H23V19H11L5 24V19H3Z M24 11H29V27H25V31L20 27H13V23 M7 10H19 M7 14H15\"/></svg>",
    "optimizer": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"13\" cy=\"13\" r=\"10\"/><path d=\"M20 20 29 29 M7 18V13 M12 18V10 M17 18V7 M6 26H18\"/><path d=\"M7 18V13L12 10 17 7V18Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "translator": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M2 7H18 M10 3V7 M6 7Q6 16 17 21 M15 7Q14 15 3 21 M17 28 23 12 29 28 M19 23H27 M2 28H11 M8 25 11 28 8 31\"/></svg>",
    "pilot": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"16\" cy=\"16\" r=\"9\"/><circle cx=\"16\" cy=\"16\" r=\"3\"/><path d=\"M16 1V13 M16 19V31 M1 16H13 M19 16H31 M5 5 13 13 M19 19 27 27 M27 5 19 13 M13 19 5 27\"/></svg>",
    "foreman": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"3\" y=\"12\" width=\"7\" height=\"8\" rx=\"2\"/><rect x=\"22\" y=\"3\" width=\"7\" height=\"6\" rx=\"2\"/><rect x=\"22\" y=\"13\" width=\"7\" height=\"6\" rx=\"2\"/><rect x=\"22\" y=\"23\" width=\"7\" height=\"6\" rx=\"2\"/><path d=\"M10 16H16 M16 6H22 M16 6V26H22 M16 16H22\"/></svg>",
    "nightwatch": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M21 3A13 13 0 1 0 29 23A13 13 0 0 1 21 3Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/><path d=\"M21 3A13 13 0 1 0 29 23A13 13 0 0 1 21 3Z M25 5V11 M22 8H28 M12 13 16 16 12 19 8 16Z\"/></svg>",
    "ghostwriter": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M5 27 8 17 23 2 30 9 15 24Z M8 17 15 24 M5 27 11 25 M20 5 27 12 M12 18 22 8 M19 29H29\"/><path d=\"M5 27 8 17 15 24Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "paralegal": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M5 3H21L27 9V29H5Z M21 3V9H27 M10 14H22 M10 19H22 M10 24H18 M10 11H15\"/><path d=\"M9 17H24V21H9Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "negotiator": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M3 9H25 M20 4 25 9 20 14 M29 23H7 M12 18 7 23 12 28 M4 14V19 M28 14V19\"/></svg>",
    "jobhunter": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"3\" y=\"9\" width=\"26\" height=\"20\" rx=\"2\"/><path d=\"M10 9V4H22V9 M3 17Q16 23 29 17 M13 18V23H19V18\"/><path d=\"M3 9H29V17Q16 23 3 17Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "anchor": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"11\" y=\"2\" width=\"10\" height=\"19\" rx=\"2\"/><path d=\"M6 14V16A10 10 0 0 0 26 16V14 M16 26V30 M10 30H22 M14 7H18 M14 11H18\"/></svg>",
    "drafter": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 28 20 3V28Z M10 24 16 14V24Z M24 5H29V28H24 M25 10H29 M25 15H29 M25 20H29\"/><path d=\"M4 28 20 3V28Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "harvester": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 7Q16-1 28 7Q16 15 4 7V24Q16 32 28 24V7 M4 15Q16 23 28 15 M16 14V26 M12 22 16 26 20 22\"/></svg>",
    "sentinel": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M16 3 27 7V16Q25 25 16 29Q7 25 5 16V7Z M8 16Q16 7 24 16Q16 25 8 16Z\"/><circle cx=\"16\" cy=\"16\" r=\"3\"/></svg>",
    "registrar": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"4\" y=\"4\" width=\"24\" height=\"25\" rx=\"2\"/><circle cx=\"13\" cy=\"12\" r=\"4\"/><path d=\"M7 24V22Q13 14 19 22V24 M22 10H25 M22 15H25 M22 20H25\"/></svg>",
    "provisioner": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M2 15 16 3 30 15 M6 12V29H26V12 M12 29V20H20V29 M12 12H20 M16 8V16\"/><path d=\"M6 15 16 6 26 15V29H20V20H12V29H6Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "taskmaster": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"5\" y=\"5\" width=\"23\" height=\"24\" rx=\"2\"/><rect x=\"11\" y=\"2\" width=\"11\" height=\"6\" rx=\"2\"/><path d=\"M10 15 12 17 16 12 M19 15H24 M10 24 12 26 16 21 M19 24H24\"/></svg>",
    "medic": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M16 28C7 22 2 17 3 10C4 2 12 2 16 8C20 2 28 2 29 10C30 17 25 22 16 28Z M8 16H12L14 11 18 21 20 16H25\"/><path d=\"M16 28C7 22 2 17 3 10C4 2 12 2 16 8C20 2 28 2 29 10C30 17 25 22 16 28Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "diplomat": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M3 11 9 7 15 11 21 7 29 11 25 21 19 26 8 20Z M9 7 6 17 M23 9 19 15 15 12 11 16 19 24 M25 21 20 18 M3 11 1 17 6 20 M29 11 31 17 27 20\"/></svg>",
    "apptester": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"6\" y=\"2\" width=\"20\" height=\"28\" rx=\"2\"/><path d=\"M12 6H20 M12 26H20 M10 16 14 20 23 11\"/></svg>",
    "deployer": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M11 20Q9 8 24 3Q27 18 15 21Z M11 12 5 14 3 23 11 20 M21 19 19 26 10 29 13 21 M7 24 3 28\"/><circle cx=\"20\" cy=\"10\" r=\"3\"/></svg>",
    "dbhelper": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 7Q16-1 28 7Q16 15 4 7V25Q16 33 28 25V7 M4 16Q16 24 28 16 M9 13H10 M9 22H10\"/></svg>",
    "copywriter": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M5 4H20V9 M5 4V29H25V19 M10 10H17 M10 15H14 M10 23 12 17 25 4 30 9 17 22Z M22 7 27 12\"/><path d=\"M10 23 12 17 17 22Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "webdesigner": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"3\" y=\"4\" width=\"26\" height=\"24\" rx=\"2\"/><path d=\"M3 10H29 M7 7H8 M11 7H12 M7 14H15V24H7Z M19 14H25 M19 19H25 M19 24H23\"/><path d=\"M7 14H15V24H7Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "support": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 17V15A12 12 0 0 1 28 15V23Q28 29 19 29 M4 16H9V24H4Z M23 16H28V24H23Z\"/><rect x=\"14\" y=\"27\" width=\"6\" height=\"4\" rx=\"2\"/></svg>",
    "a11y": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"16\" cy=\"5\" r=\"3\"/><path d=\"M4 12 16 15 28 12 M16 15V21 M16 21 9 29 M16 21 23 29 M7 3 3 7 M25 3 29 7\"/></svg>",
    "hiring": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"10\" r=\"5\"/><path d=\"M3 29V25Q3 17 12 17Q21 17 21 25V29 M24 7V17 M19 12H29\"/><path d=\"M3 29V25Q3 17 12 17Q21 17 21 25V29Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "processwriter": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"3\" y=\"3\" width=\"10\" height=\"7\" rx=\"2\"/><rect x=\"19\" y=\"13\" width=\"10\" height=\"7\" rx=\"2\"/><rect x=\"3\" y=\"23\" width=\"10\" height=\"7\" rx=\"2\"/><path d=\"M13 6H24V13 M19 17H8V23 M5 6H10 M21 16H26 M5 26H10\"/></svg>",
    "pitchwriter": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M3 6H29V23H3Z M16 23V29 M11 29H21 M7 18 12 13 17 16 25 10 M21 10H25V14 M16 2V6\"/><path d=\"M7 18 12 13 17 16 25 10V20H7Z\" fill=\"currentColor\" fill-opacity=\".14\" stroke=\"none\"/></svg>",
    "herald": "<svg viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 4H24V9H29V28H4Z M24 9V24Q24 28 29 28 M8 9H20 M8 14H14V21H8Z M18 14H21 M18 19H21 M8 25H20\"/></svg>"
};

  const CODE = {
    chief: 'CHF', engineer: 'ENG', researcher: 'RES', reviewer: 'REV', operator: 'AUT',
    analyst: 'ANL', scout: 'SCT', archivist: 'ARV', designer: 'DSN',
    broker: 'DLF', tutor: 'TCH', auditor: 'SEC', translator: 'XLT', herald: 'DGS',
    navigator: 'TRP', curator: 'FIL', muse: 'BRN',
    strategist: 'STG', marketer: 'MKT', publisher: 'CNT', producer: 'VID', writer: 'SCR',
    prospector: 'LED', envoy: 'INB', treasurer: 'TRE',
    closer: 'CLO', steward: 'COM', optimizer: 'SEO', opportunist: 'OPF',
    // 2026-08-03 catalog expansion
    pilot: 'VAS', foreman: 'TML', nightwatch: 'NGT', ghostwriter: 'GHW', paralegal: 'LGL',
    negotiator: 'NEG', jobhunter: 'JOB', anchor: 'NWS',
    // 2026-08-03 second wave
    drafter: 'PDM', harvester: 'DAT', sentinel: 'PRG', registrar: 'REL', provisioner: 'HOM',
    taskmaster: 'CCH', medic: 'HLT', diplomat: 'MED',
    // 2026-08-03 third wave — the build lane, marketing sub-niches, and business roles
    apptester: 'QAT', deployer: 'OPS', dbhelper: 'DBE', support: 'SUP', a11y: 'ACS', hiring: 'HIR', processwriter: 'SOP',
    pitchwriter: 'PCH',
    // 2026-08-03 consolidation: broad roles replace the marketing micro-classes
    copywriter: 'CPY', webdesigner: 'WDS'
  };

  // bespoke emblems for the built-in RECIPES (missions) — same matte/debossed style, keyed by recipe id.
  // Custom missions (no built-in art) fall back to their chosen emoji, exactly like custom classes.
  const MISSION_ICONS = {
    'morning-brief': '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 7 a5 5 0 0 1 5 5 H7 a5 5 0 0 1 5-5 Z"/><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2.5 16 H21.5"/><path d="M5 19.5 H19"/><path d="M12 3.4 V5.2"/><path d="M5.8 5.8 L7 7"/><path d="M18.2 5.8 L17 7"/></g></svg>',
    'deep-research': '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="8" fill="currentColor"/><path fill="currentColor" d="M16 14.2 L22 20.2 L20.2 22 L14.2 16 Z"/><g fill="none" stroke="' + D + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8.5 L10.5 12 L14 8.5"/><path d="M7 11.8 L10.5 15.3 L14 11.8"/></g></svg>',
    'fact-check': '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 L20 5 V11 C20 16 16.5 19.4 12 21.4 C7.5 19.4 4 16 4 11 V5 Z"/><path fill="none" stroke="' + D + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M8.2 11.4 L11 14.2 L16 8.6"/></svg>',
    'fix-bug': '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16.7 2.6 a6 6 0 0 0 -5.2 9 L3.3 19.7 a2.3 2.3 0 0 0 3.2 3.2 l8.1-8.1 a6 6 0 0 0 7.4-7.7 l-3 3 -2.9-.8 -.8-2.9 Z"/><circle cx="5.2" cy="18.8" r="1.1" fill="' + D + '"/></svg>',
    'code-review': '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="8" fill="currentColor"/><path fill="currentColor" d="M16 14.2 L22 20.2 L20.2 22 L14.2 16 Z"/><g fill="none" stroke="' + D + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8.8 7.8 L6 10.5 L8.8 13.2"/><path d="M12.2 7.8 L15 10.5 L12.2 13.2"/></g></svg>',
    'ship-feature': '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3.3" y="3.3" width="8" height="8" rx="1.4"/><rect x="12.7" y="3.3" width="8" height="8" rx="1.4"/><rect x="3.3" y="12.7" width="8" height="8" rx="1.4"/><path d="M16.7 13.2 v3 h3 v2 h-3 v3 h-2 v-3 h-3 v-2 h3 v-3 Z"/></svg>',
    'draft-reply': '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 5.6 a2 2 0 0 1 2-2 h14 a2 2 0 0 1 2 2 v8.8 a2 2 0 0 1 -2 2 H9.5 L5 20 v-3.6 a2 2 0 0 1 -2-2 Z"/><g fill="none" stroke="' + D + '" stroke-width="1.7" stroke-linecap="round"><path d="M7 8.6 H15"/><path d="M7 11.6 H12"/></g></svg>',
    'tighten-writing': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6.2" r="2.6"/><circle cx="6" cy="17.8" r="2.6"/><path d="M8.3 7.7 L19.5 16.8"/><path d="M8.3 16.3 L19.5 7.2"/></svg>',
    'plan-project': '<svg viewBox="0 0 24 24"><rect x="4.5" y="3.6" width="15" height="16.8" rx="2" fill="currentColor"/><rect x="9" y="2" width="6" height="3.4" rx="1.2" fill="currentColor" stroke="' + D + '" stroke-width="1.2"/><g fill="none" stroke="' + D + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7.4 10 L8.5 11.1 L10.1 9.2"/><path d="M12 10.2 H16.4"/><path d="M7.4 14.6 L8.5 15.7 L10.1 13.8"/><path d="M12 14.8 H16.4"/></g></svg>',
    'summarize': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M4 5.5 H20"/><path d="M4 9.7 H20"/><path d="M4 13.9 H14"/><path d="M4 18.1 H9"/></svg>'
  };
  const MISSION_CODE = {
    'morning-brief': 'BRF', 'deep-research': 'DIG', 'fact-check': 'CHK', 'fix-bug': 'FIX', 'code-review': 'CRV',
    'ship-feature': 'BLD', 'draft-reply': 'RPL', 'tighten-writing': 'CUT', 'plan-project': 'PLN', 'summarize': 'TLD'
  };

  /* ---- CATEGORY SEALS (2026-08-13) — the recipe library's fallback, in the same engraved style ----
     MISSION_ICONS covers ten hero recipes. The other NINETY-ONE had no vector art at all, so the coin
     rendered `item.emoji` instead — and those emoji are geometric symbol characters (⌦ ⊟ ⊡ ⊘ ⊞ ⌘ ◱ ⊛ ◭).
     VT323 carries no glyph for any of them, so every one fell through to a system FALLBACK FONT: wrong
     weight, wrong metrics, wrong colour discipline, and on several rows a plain tofu box. They also
     collided badly — 43 distinct marks across 91 recipes, ◐ on five different recipes, ⚠ / ◈ / ◉ on
     four each — so the mark told you nothing about the row anyway.
     Authoring 91 bespoke emblems is not the answer; a recipe's CATEGORY is the honest grouping the
     browse rail already sorts by, so one engraved seal per category gives every row real vector art
     that says something true about it. Same rules as the class seals above: 24x24, currentColor so it
     rides the station phosphor, cut detail in the deboss colour, no <text> (that was the one seal that
     ever picked up a system font). A CUSTOM recipe still falls back to the emoji its author chose. */
  const CATEGORY_ICONS = {
    // developer: the terminal pane with a live prompt caret — the machine you actually type at.
    developer: '<svg viewBox="0 0 24 24"><rect x="2.2" y="3.6" width="19.6" height="16.8" rx="1.8" fill="currentColor"/><rect x="2.2" y="3.6" width="19.6" height="3.4" rx="1.8" fill="' + D + '"/><g fill="none" stroke="' + D + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5.6 11 L8.4 13.6 L5.6 16.2"/><path d="M10.8 16.8 H17"/></g></svg>',
    // code: the two angle brackets around a slash — the oldest mark for "this is source".
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6.4 L2.6 12 L8 17.6"/><path d="M16 6.4 L21.4 12 L16 17.6"/><path d="M13.6 4.2 L10.4 19.8"/></svg>',
    // research: the lens laid over ruled evidence — reading something, with the sources kept.
    research: '<svg viewBox="0 0 24 24"><rect x="3" y="2.6" width="14.4" height="18.8" rx="1.6" fill="currentColor"/><g fill="none" stroke="' + D + '" stroke-width="1.5" stroke-linecap="round"><path d="M5.8 6.4 H14.6"/><path d="M5.8 9.4 H14.6"/><path d="M5.8 12.4 H10.2"/></g><circle cx="15.6" cy="14.6" r="4.6" fill="currentColor" stroke="' + D + '" stroke-width="1.6"/><path d="M18.8 17.8 L22 21" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    // writing: the nib, cut and inked — the draft itself.
    writing: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.4 20.6 L5.2 14.8 L15.4 4.6 L19.4 8.6 L9.2 18.8 Z"/><path fill="' + D + '" d="M13.8 7 L17 10.2 L9.6 17.6 L6.4 14.4 Z"/><path fill="currentColor" d="M16.6 3.4 L18 2 a1.6 1.6 0 0 1 2.3 0 l1.7 1.7 a1.6 1.6 0 0 1 0 2.3 l-1.4 1.4 Z"/><path fill="currentColor" d="M2.6 22.4 L4 18.6 L6.4 21 Z"/></svg>',
    // creator: the frame with the play mark struck into it — something made to be watched or read.
    creator: '<svg viewBox="0 0 24 24"><rect x="2.4" y="3.6" width="19.2" height="16.8" rx="2" fill="currentColor"/><path fill="' + D + '" d="M9.6 8.2 L16.4 12 L9.6 15.8 Z"/><g fill="' + D + '"><rect x="4.4" y="5.6" width="2.2" height="2.2" rx=".5"/><rect x="4.4" y="16.2" width="2.2" height="2.2" rx=".5"/><rect x="17.4" y="5.6" width="2.2" height="2.2" rx=".5"/><rect x="17.4" y="16.2" width="2.2" height="2.2" rx=".5"/></g></svg>',
    // planning: the board with the route stepped across it — a goal broken into moves.
    planning: '<svg viewBox="0 0 24 24"><rect x="2.6" y="3.4" width="18.8" height="17.2" rx="1.8" fill="currentColor"/><g fill="none" stroke="' + D + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.6 L10 16.6 L10 12 L14 12 L14 7.4 L18 7.4"/></g><g fill="' + D + '"><circle cx="6" cy="16.6" r="1.7"/><circle cx="14" cy="12" r="1.7"/><circle cx="18" cy="7.4" r="1.7"/></g></svg>',
    // ops: the gear — the thing that runs on its own schedule.
    ops: '<svg viewBox="0 0 24 24"><g fill="currentColor"><rect x="10.8" y="1.4" width="2.4" height="4.6" rx=".5"/><rect x="10.8" y="18" width="2.4" height="4.6" rx=".5"/><rect x="1.4" y="10.8" width="4.6" height="2.4" rx=".5"/><rect x="18" y="10.8" width="4.6" height="2.4" rx=".5"/><rect x="10.8" y="1.4" width="2.4" height="4.6" rx=".5" transform="rotate(45 12 12)"/><rect x="10.8" y="18" width="2.4" height="4.6" rx=".5" transform="rotate(45 12 12)"/><rect x="1.4" y="10.8" width="4.6" height="2.4" rx=".5" transform="rotate(45 12 12)"/><rect x="18" y="10.8" width="4.6" height="2.4" rx=".5" transform="rotate(45 12 12)"/><circle cx="12" cy="12" r="7"/></g><circle cx="12" cy="12" r="3.2" fill="' + D + '"/></svg>',
    // business: the case with its clasp cut out — the client-facing job.
    business: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 2.6 h6 a2 2 0 0 1 2 2 V7 h-2.4 V5 H9.4 V7 H7 V4.6 A2 2 0 0 1 9 2.6 Z"/><rect x="2" y="7" width="20" height="14.4" rx="1.8" fill="currentColor"/><path fill="' + D + '" d="M2 12.4 H10 V14.2 H2 Z"/><path fill="' + D + '" d="M14 12.4 H22 V14.2 H14 Z"/><rect x="10.2" y="11.4" width="3.6" height="4" rx=".6" fill="' + D + '"/></svg>',
    // money: the stacked coins — what it is worth, counted.
    money: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5.4" rx="8.6" ry="3.4" fill="currentColor"/><path fill="currentColor" d="M3.4 8.4 v3 a8.6 3.4 0 0 0 17.2 0 v-3 a8.6 3.4 0 0 1 -17.2 0 Z"/><path fill="currentColor" d="M3.4 14.2 v3 a8.6 3.4 0 0 0 17.2 0 v-3 a8.6 3.4 0 0 1 -17.2 0 Z"/><path fill="' + D + '" d="M11.2 3.2 h1.6 v4.4 h-1.6 Z"/><path fill="' + D + '" d="M9.6 4.2 a3.4 1.4 0 0 1 4.8 0 a3.4 1.4 0 0 1 -4.8 0 Z"/></svg>',
    // data: the drum with the bars read off it — rows turned into an answer.
    data: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="4.6" rx="8.2" ry="3" fill="currentColor"/><path fill="currentColor" d="M3.8 7.4 v3.2 a8.2 3 0 0 0 16.4 0 V7.4 a8.2 3 0 0 1 -16.4 0 Z"/><g fill="currentColor"><rect x="4.4" y="17" width="3.4" height="4.6" rx=".5"/><rect x="10.3" y="14" width="3.4" height="7.6" rx=".5"/><rect x="16.2" y="11" width="3.4" height="10.6" rx=".5"/></g></svg>',
    // general: the station rosette — no claim about the kind of work, just the station's own mark.
    general: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.6" fill="currentColor"/><path fill="' + D + '" d="M12 4.4 L14 10 L19.6 12 L14 14 L12 19.6 L10 14 L4.4 12 L10 10 Z"/></svg>'
  };
  // the 3-letter stamp for a category-sealed recipe still derives from its NAME (see `code()`), so two
  // recipes sharing a category seal are never mistaken for each other.
  function categoryIcon(item) {
    if (!item || typeof item !== 'object' || item.custom) return null;   // a custom author's own emoji wins
    const c = String(item.category || '').toLowerCase();
    return CATEGORY_ICONS[c] || null;
  }

  /* ==== THE ABILITIES CATALOG: platform seals, hybrid (2026-08-14) ==========================
     The catalog (39 vetted MCP servers + 15 keyed platforms) printed every entry as a name and a
     paragraph, so browsing it was reading. Same treatment as the recipe library, same two-layer shape
     `svg()` already uses: a BESPOKE mark for the entries people scan for by sight, and the entry's
     CATEGORY seal for everything else — so no card is ever bare and the set can grow without an art
     task blocking a catalog addition.

     LOGO-FORWARD, ONE PHOSPHOR (2026-08-14, Andrew's explicit call after I flagged the trademark side:
     recolouring a mark is the part many brand guidelines forbid, so "their shape in our amber" carries
     MORE exposure than either a full-colour logo or a generic glyph — he took that call, it is his
     product). So the marks below now trace the SILHOUETTE where the silhouette is simple enough to
     survive at seal size, drawn as a currentColor path with the deboss cut, and the station's phosphor
     and engrave ride on top. NO colour ever comes from the vendor: one tube, one hue.

     WHICH ONES GET THE SILHOUETTE IS A LEGIBILITY DECISION, NOT A COMPLETENESS ONE. A seal renders at
     ~26px. A mark that is bold and geometric (a triangle, an X, a burst, an N in a square) is still
     itself at that size; an ILLUSTRATIVE mark is not — an octocat, a sprocket, a face, a fox-with-fur
     becomes a smudge, and a smudge that is trying to be a specific logo reads worse than an honest
     glyph that is trying to be nothing else. So the illustrative vendors deliberately KEEP their
     what-it-does glyph (github = a branch, hubspot = a wired record, intercom = a conversation,
     huggingface/canva/wix = their category seal). Do not "finish the set" by tracing those; that is
     the failure mode this note exists to prevent.
     Same rules as every seal here: 24x24, currentColor, no <text>. */
  const PLATFORM_ICONS = {
    // --- code hosting & shipping ---
    // github: the branch — a commit line splitting off and merging back.
    github: '<svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6.6 7.4 V16.6"/><path d="M6.6 12.4 h5.2 a3 3 0 0 0 3-3 V7.4"/></g><g fill="currentColor"><circle cx="6.6" cy="5" r="2.6"/><circle cx="6.6" cy="19" r="2.6"/><circle cx="14.8" cy="5" r="2.6"/></g></svg>',
    // gitlab: SILHOUETTE — the five-facet mark, two peaks folding down to a single point. Bold flat
    // triangles, so it survives at seal size where anything fur-like would not.
    gitlab: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22.4 L15.7 11.2 H8.3 Z"/><path d="M12 22.4 L8.3 11.2 H3.1 Z"/><path d="M3.1 11.2 L1.7 15.7 a1 1 0 0 0 .37 1.12 Z"/><path d="M3.1 11.2 L2.07 16.82 L12 22.4 Z"/><path d="M12 22.4 L15.7 11.2 H20.9 Z"/><path d="M20.9 11.2 L21.93 16.82 L12 22.4 Z"/><path d="M3.1 11.2 L5.25 4.6 a.6 .6 0 0 1 1.14 0 L8.3 11.2 Z"/><path d="M20.9 11.2 L18.75 4.6 a.6 .6 0 0 0 -1.14 0 L15.7 11.2 Z"/></svg>',
    // vercel: the deploy triangle — the build going up.
    vercel: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3.2 L22.4 20.8 H1.6 Z"/></svg>',
    // netlify: SILHOUETTE — the mark's rotated square with its four circuit stubs running out to the edge.
    netlify: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3.4 L20.6 12 L12 20.6 L3.4 12 Z"/><path fill="' + D + '" d="M12 7.6 L16.4 12 L12 16.4 L7.6 12 Z"/><g fill="currentColor"><rect x="11.1" y="0.4" width="1.8" height="4.4" rx=".6"/><rect x="11.1" y="19.2" width="1.8" height="4.4" rx=".6"/><rect x="0.4" y="11.1" width="4.4" height="1.8" rx=".6"/><rect x="19.2" y="11.1" width="4.4" height="1.8" rx=".6"/></g></svg>',
    // sentry: GLYPH, not silhouette — TRIED the arc mark and it failed its own test: rendered at 80px it
    // read as a scribble and at 26px as a smear, because the shape is only legible when you already know
    // it. The waveform breaking over a floor line says "the fault, caught" at any size. This is the rule
    // in the block note, applied to itself.
    sentry: '<svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M2.2 15.4 H6 L8.6 8.6 L12 19 L15 5.4 L17.6 15.4 H21.8"/></g><path fill="currentColor" d="M10.6 20.6 h2.8 v1.8 h-2.8 Z"/></svg>',
    // --- data stores ---
    // neon / prisma / supabase all sit on a database drum; the SECOND element is what separates them.
    neon: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5.4" rx="8.4" ry="3.2" fill="currentColor"/><path fill="currentColor" d="M3.6 8.4 v10 a8.4 3.2 0 0 0 16.8 0 v-10 a8.4 3.2 0 0 1 -16.8 0 Z"/><path fill="' + D + '" d="M3.6 12.6 a8.4 3.2 0 0 0 16.8 0 v1.8 a8.4 3.2 0 0 1 -16.8 0 Z"/></svg>',
    // supabase: the drum with the live bolt — rows that push at you.
    supabase: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8.2" ry="3" fill="currentColor"/><path fill="currentColor" d="M3.8 7.8 v9.4 a8.2 3 0 0 0 16.4 0 V7.8 a8.2 3 0 0 1 -16.4 0 Z"/><path fill="' + D + '" d="M13.6 8.6 L8.4 15.2 h3.2 l-1.2 4.6 l5.2 -6.6 h-3.2 Z"/></svg>',
    // prisma: SILHOUETTE, widened — the first cut leaned so far it read as a sliver. Squarer footprint,
    // and the facet fold is now a full-height cut rather than a thin wedge, so the solid stays a solid.
    prisma: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.9 1.8 a1.6 1.6 0 0 1 2.7 .35 L21.4 18.4 a1.6 1.6 0 0 1 -1 2.25 L9.1 22.3 a1.6 1.6 0 0 1 -1.95 -1.55 L6.1 5.2 a1.6 1.6 0 0 1 .55 -1.35 Z"/><path fill="' + D + '" d="M11.05 6.1 L18.15 18.6 L10.15 19.9 Z"/></svg>',
    // airtable: SILHOUETTE — the mark's four facets: the top plane, the two lower blocks, and the bar.
    airtable: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.9 1.9 L1.7 5.7 a.8 .8 0 0 0 0 1.48 l9.25 3.67 a2.9 2.9 0 0 0 2.1 0 L22.3 7.18 a.8 .8 0 0 0 0 -1.48 L13.1 1.9 a2.9 2.9 0 0 0 -2.2 0 Z"/><path d="M12.9 13.5 v8.1 a.8 .8 0 0 0 1.1 .74 l8.5 -3.3 a.8 .8 0 0 0 .5 -.74 v-8.1 a.8 .8 0 0 0 -1.1 -.74 l-8.5 3.3 a.8 .8 0 0 0 -.5 .74 Z"/><path d="M9.6 14.15 L1.9 10.45 a.72 .72 0 0 0 -1.04 .64 v7.36 a1.4 1.4 0 0 0 .8 1.26 l7.7 3.7 a.72 .72 0 0 0 1.04 -.64 v-7.36 a1.4 1.4 0 0 0 -.8 -1.26 Z"/></svg>',
    // --- payments ---
    // stripe: SILHOUETTE — the rounded tile with the S cut into it.
    stripe: '<svg viewBox="0 0 24 24"><rect x="2.4" y="2.4" width="19.2" height="19.2" rx="4.6" fill="currentColor"/><path fill="' + D + '" d="M11.35 9.55 c0 -.72 .6 -1 1.55 -1 a8.9 8.9 0 0 1 3.6 .93 V6.06 A9.6 9.6 0 0 0 12.9 5.4 c-2.95 0 -4.92 1.54 -4.92 4.12 0 4.02 5.53 3.37 5.53 5.1 0 .85 -.74 1.13 -1.75 1.13 a10 10 0 0 1 -3.96 -1.16 v3.5 a10 10 0 0 0 3.96 .83 c3.03 0 5.12 -1.5 5.12 -4.11 0 -4.34 -5.53 -3.57 -5.53 -5.25 Z"/></svg>',
    // paypal: GLYPH, not silhouette — TRIED the double-P and it lost. Two overlapping bowls need the
    // counters INSIDE each P to stay open to read as letters at all, and at 26px those counters close
    // up: the mark became one blob with a flag on it. The wallet reads instantly at both sizes.
    paypal: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M2.6 6.4 a2 2 0 0 1 2 -2 H16 v2.6 H5.6 a.8 .8 0 0 0 0 1.6 H19.4 a2 2 0 0 1 2 2 v8.6 a2 2 0 0 1 -2 2 H4.6 a2 2 0 0 1 -2 -2 Z"/><circle cx="17" cy="14.6" r="1.9" fill="' + D + '"/></svg>',
    // square: the terminal with the card slot — a payment taken in person.
    square: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3.2" fill="currentColor"/><rect x="7.6" y="7.6" width="8.8" height="8.8" rx="1.4" fill="' + D + '"/><rect x="9.8" y="9.8" width="4.4" height="4.4" rx=".7" fill="currentColor"/></svg>',
    // shopify: the shop bag — the storefront itself.
    shopify: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4.4 7.4 H19.6 L21.2 21.4 a1.4 1.4 0 0 1 -1.4 1.6 H4.2 a1.4 1.4 0 0 1 -1.4 -1.6 Z"/><path fill="none" stroke="currentColor" stroke-width="2" d="M8.2 9.6 V6.4 a3.8 3.8 0 0 1 7.6 0 V9.6"/><path fill="' + D + '" d="M7.6 11.6 h8.8 v1.8 h-8.8 Z"/></svg>',
    // --- work surfaces ---
    // notion: SILHOUETTE — the bordered page with the N cut out of it (left post, diagonal, right post).
    notion: '<svg viewBox="0 0 24 24"><rect x="2.2" y="2.2" width="19.6" height="19.6" rx="2.4" fill="currentColor"/><g fill="' + D + '"><rect x="6.5" y="6.3" width="2.5" height="11.4" rx=".4"/><rect x="15" y="6.3" width="2.5" height="11.4" rx=".4"/><path d="M9.15 6.3 h2.55 l5.8 11.4 h-2.55 Z"/></g></svg>',
    // linear: SILHOUETTE — the rounded tile with the mark's parallel diagonal cuts.
    linear: '<svg viewBox="0 0 24 24"><rect x="2.2" y="2.2" width="19.6" height="19.6" rx="4.8" fill="currentColor"/><g fill="none" stroke="' + D + '" stroke-width="2.1" stroke-linecap="round"><path d="M5.6 13.9 L13.9 5.6"/><path d="M5.6 18.9 L18.9 5.6"/><path d="M10.6 19.2 L19.2 10.6"/></g></svg>',
    // google-workspace: the app grid — a suite, not one tool.
    'google-workspace': '<svg viewBox="0 0 24 24"><g fill="currentColor"><rect x="2.6" y="2.6" width="8.2" height="8.2" rx="1.6"/><rect x="13.2" y="2.6" width="8.2" height="8.2" rx="4.1"/><rect x="2.6" y="13.2" width="8.2" height="8.2" rx="4.1"/><rect x="13.2" y="13.2" width="8.2" height="8.2" rx="1.6"/></g></svg>',
    // hubspot: the connected record — one contact wired to everything about them.
    hubspot: '<svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 12 L5.4 5.4"/><path d="M12 12 L18.6 5.4"/><path d="M12 12 L5.4 18.6"/><path d="M12 12 L18.6 18.6"/></g><g fill="currentColor"><circle cx="12" cy="12" r="3.4"/><circle cx="5" cy="5" r="2.4"/><circle cx="19" cy="5" r="2.4"/><circle cx="5" cy="19" r="2.4"/><circle cx="19" cy="19" r="2.4"/></g></svg>',
    // intercom: the answered conversation — a thread someone is on the other end of.
    intercom: '<svg viewBox="0 0 24 24"><rect x="2.4" y="3.4" width="19.2" height="15.2" rx="2.4" fill="currentColor"/><path fill="currentColor" d="M6.4 18 h5.2 L7.4 22.2 Z"/><g fill="' + D + '"><circle cx="8" cy="11" r="1.5"/><circle cx="12" cy="11" r="1.5"/><circle cx="16" cy="11" r="1.5"/></g></svg>',
    // --- automation & compute ---
    // zapier: SILHOUETTE — the six-point burst, hexagon centre cut.
    zapier: '<svg viewBox="0 0 24 24"><g fill="currentColor"><rect x="10.3" y="1.4" width="3.4" height="21.2" rx="1.3"/><rect x="10.3" y="1.4" width="3.4" height="21.2" rx="1.3" transform="rotate(60 12 12)"/><rect x="10.3" y="1.4" width="3.4" height="21.2" rx="1.3" transform="rotate(120 12 12)"/></g><circle cx="12" cy="12" r="3.1" fill="' + D + '"/></svg>',
    // wolfram: the spiked solid — computed, not looked up.
    wolfram: '<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M12 1.4 L14 8 L12 12 L10 8 Z"/><path d="M12 22.6 L10 16 L12 12 L14 16 Z"/><path d="M1.4 12 L8 10 L12 12 L8 14 Z"/><path d="M22.6 12 L16 14 L12 12 L16 10 Z"/><path d="M4.5 4.5 L10.6 7.2 L12 12 L7.2 10.6 Z"/><path d="M19.5 19.5 L13.4 16.8 L12 12 L16.8 13.4 Z"/><path d="M19.5 4.5 L16.8 10.6 L12 12 L13.4 7.2 Z"/><path d="M4.5 19.5 L7.2 13.4 L12 12 L10.6 16.8 Z"/></g></svg>',
    // x-twitter: the post — a short broadcast.
    'x-twitter': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 4 L20 20"/><path d="M20 4 L4 20"/></svg>',
    // --- email ---
    // resend: the sent message — it has already left.
    resend: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M22.2 2.4 L1.8 10.2 L8.6 13.2 L19 5.4 L11.4 15 L20.2 21.6 Z"/><path fill="' + D + '" d="M8.6 13.2 L11.4 15 L9.2 20 L7.6 14.4 Z"/></svg>',
    // sendgrid: the batch — many envelopes going out at once.
    sendgrid: '<svg viewBox="0 0 24 24"><rect x="1.6" y="6.4" width="14" height="10.4" rx="1.6" fill="currentColor"/><path fill="' + D + '" d="M3.4 8.4 L8.6 12.4 L13.8 8.4 v1.4 L8.6 13.8 L3.4 9.8 Z"/><g fill="currentColor" opacity=".85"><rect x="17.4" y="8.4" width="5" height="1.9" rx=".7"/><rect x="17.4" y="12.1" width="5" height="1.9" rx=".7"/><rect x="17.4" y="15.8" width="5" height="1.9" rx=".7"/></g></svg>'
  };

  /* The fallback layer: one seal per catalog CATEGORY, for every entry with no bespoke mark. Keys are
     the exact `category` strings the two catalog routes serve (/api/connectors/catalog groups and
     servicekeys-catalog.js), lowercased — matched loosely by `platformIcon` so a renamed group
     degrades to no seal rather than to the WRONG seal. */
  const CATALOG_CATEGORY_ICONS = {
    // MCP catalog groups
    'docs & knowledge': CATEGORY_ICONS.research,
    'search & research': '<svg viewBox="0 0 24 24"><circle cx="10.4" cy="10.4" r="7.8" fill="none" stroke="currentColor" stroke-width="2.6"/><path fill="currentColor" d="M15.8 14.2 L22 20.4 L20.2 22.2 L14 16 Z"/><g fill="currentColor"><circle cx="10.4" cy="10.4" r="2.2"/></g></svg>',
    'compute & data': CATEGORY_ICONS.data,
    'developer tools': CATEGORY_ICONS.developer,
    'advanced / developer': CATEGORY_ICONS.developer,
    'automation': CATEGORY_ICONS.ops,
    'social': '<svg viewBox="0 0 24 24"><g fill="currentColor"><circle cx="12" cy="6.4" r="3.4"/><path d="M5.6 20.6 a6.4 6.4 0 0 1 12.8 0 a1 1 0 0 1 -1 1 H6.6 a1 1 0 0 1 -1 -1 Z"/></g><g fill="currentColor" opacity=".8"><circle cx="4.4" cy="9.6" r="2.4"/><circle cx="19.6" cy="9.6" r="2.4"/></g></svg>',
    'productivity': CATEGORY_ICONS.planning,
    'design': CATEGORY_ICONS.creator,
    'payments & finance': CATEGORY_ICONS.money,
    'crm & sales': CATEGORY_ICONS.business,
    // keyed-platform groups (sidecar/servicekeys-catalog.js)
    'commerce & print-on-demand': CATEGORY_ICONS.business,
    'email & messaging': '<svg viewBox="0 0 24 24"><rect x="2" y="4.6" width="20" height="14.8" rx="2" fill="currentColor"/><path fill="' + D + '" d="M4.4 7.4 L12 13.4 L19.6 7.4 v1.9 L12 15.3 L4.4 9.3 Z"/></svg>',
    'data & content': CATEGORY_ICONS.data
  };

  /* The catalog resolver: bespoke mark, else the entry's category seal, else null (caller prints no
     seal rather than an invented one). Accepts an id string or the catalog entry itself — an id alone
     carries no category, so it can only ever hit the bespoke layer. */
  function platformIcon(idOrEntry) {
    const isObj = idOrEntry && typeof idOrEntry === 'object';
    const id = isObj ? idOrEntry.id : idOrEntry;
    if (PLATFORM_ICONS[id]) return PLATFORM_ICONS[id];
    if (!isObj) return null;
    const cat = String(idOrEntry.category || '').trim().toLowerCase();
    return CATALOG_CATEGORY_ICONS[cat] || null;
  }

  const LANE_LABEL = { code: 'CODE', research: 'RESEARCH', general: 'OPS' };
  const TIER_PIPS = { reasoning: 3, balanced: 2, fast: 1 };
  const TIER_LABEL = { reasoning: 'DEEP REASONING', balanced: 'BALANCED', fast: 'FAST & CHEAP' };

  // The emblem for a spec/recipe: its bespoke art first, then — for a built-in recipe with none — the
  // seal for its CATEGORY. Only a CUSTOM item (or a bare id string, which carries no category) returns
  // null, and only then does the caller draw the author's chosen emoji.
  function svg(idOrSpec) {
    const id = typeof idOrSpec === 'string' ? idOrSpec : (idOrSpec && idOrSpec.id);
    return ICONS[id] || MISSION_ICONS[id] || categoryIcon(idOrSpec) || null;
  }
  // a stamped 3-letter class code: the canon code for built-ins, else derived from the spec name.
  function code(idOrSpec) {
    const id = typeof idOrSpec === 'string' ? idOrSpec : (idOrSpec && idOrSpec.id);
    if (CODE[id]) return CODE[id];
    if (MISSION_CODE[id]) return MISSION_CODE[id];
    const name = (typeof idOrSpec === 'object' && idOrSpec && idOrSpec.name) || String(id || '');
    const letters = name.replace(/[^a-z0-9]/gi, '').toUpperCase();
    return (letters.slice(0, 3) || 'CLS').padEnd(3, '·');
  }
  // the dominant focus lane a spec ranks in — the single tag with the most weight (ties → code>research>general).
  function lane(spec) {
    const t = (spec && spec.tags) || {};
    const order = ['code', 'research', 'general'];
    let best = 'general', bestV = -1;
    for (const k of order) { const v = Number(t[k]) || 0; if (v > bestV) { bestV = v; best = k; } }
    return best;
  }
  function laneLabel(spec) { return LANE_LABEL[lane(spec)] || 'OPS'; }
  // model-tier → clearance: filled gold diamonds out of three. Returns {n,label} so callers render to taste.
  function clearance(model) {
    const n = TIER_PIPS[model] || 2;
    return { n, label: TIER_LABEL[model] || TIER_LABEL.balanced };
  }
  // ready-to-inject pip markup: <b>◆</b> for filled (gold via css), ◇ for empty.
  function pipsHTML(model) {
    const n = (TIER_PIPS[model] || 2);
    return '<span class="mkt-pips">' + '<b>◆</b>'.repeat(n) + '◇'.repeat(3 - n) + '</span>';
  }

  return { ICONS, CODE, CATEGORY_ICONS, PLATFORM_ICONS, CATALOG_CATEGORY_ICONS, LANE_LABEL,
    svg, code, categoryIcon, platformIcon, lane, laneLabel, clearance, pipsHTML };
});
