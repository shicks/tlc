# Trail Life Connect Tools (`tlc`)

> **Power tools for working with Trail Life Connect advancement, attendance, and troop management.**

`tlc` is a TypeScript-based [Tampermonkey](https://www.tampermonkey.net/) / Greasemonkey userscript that enhances the web portal at [Trail Life Connect (TLC)](https://www.traillifeconnect.com/). It provides bulk actions, intelligent progress analysis, attendance CSV imports, and automation tools specifically tailored for the **Woodlands Trail** program of [Trail Life USA](https://www.traillifeusa.com/).

---

## Table of Contents

- [Overview & What It's About](#overview--what-its-about)
- [Trail Life USA Concepts](#trail-life-usa-concepts)
- [Key Features](#key-features)
  - [1. Troop Members Scraping (`/user*`)](#1-troop-members-scraping-user)
  - [2. Attendance Importer (`/attendance*`)](#2-attendance-importer-attendance)
  - [3. Advancement Grid Enhancements (`/advancement*`)](#3-advancement-grid-enhancements-advancement)
  - [4. Advancement Gap Analysis & Emoji Report Card](#4-advancement-gap-analysis--emoji-report-card)
  - [5. Calendar & Attendance Export](#5-calendar--attendance-export)
  - [6. Email Queue Automation (`/email/users*`)](#6-email-queue-automation-emailusers)
- [Architecture & How It Works](#architecture--how-it-works)
  - [Directory & File Overview](#directory--file-overview)
  - [Data Persistence](#data-persistence)
  - [DOM Observation & UI Injection](#dom-observation--ui-injection)
- [Getting Started & Local Development](#getting-started--local-development)
  - [Prerequisites](#prerequisites)
  - [Installation & Setup](#installation--setup)
  - [Building the Bundle](#building-the-bundle)
  - [Installing in Tampermonkey](#installing-in-tampermonkey)
- [Known Issues & Current Status](#known-issues--current-status)
- [Contributing & Agent Work](#contributing--agent-work)

---

## Overview & What It's About

Trail Life Connect is the official web portal used by Trail Life USA troops to manage member rosters, record meeting attendance, track awards, and schedule events. However, the default web application involves slow, click-heavy workflows when managing dozens of boys across multiple patrols and program years.

`tlc` injects lightweight, powerful client-side enhancements into TLC pages to:
1. **Automate attendance recording** from external CSV sign-in sheets using fuzzy name matching.
2. **Speed up advancement data entry** with batch selection shortcuts, event cloning (ctrl-click), and date-based visual markers.
3. **Perform deep advancement gap analysis**: It scrapes requirements across all branches, simulates complex award substitution rules (e.g. transferring extra Hit-The-Trail activities and family-home projects), and outputs a ready-to-share emoji report card showing what each boy still needs to earn their Branch Pin, Sylvan Star, or Forest Award.

---

## Trail Life USA Concepts

To understand the logic in this codebase, it helps to understand the terminology of the Trail Life Woodlands Trail program:

- **Patrols (Levels)**:
  - **Foxes** (approx. ages 5–6, Kindergarten & 1st Grade)
  - **Hawks** (approx. ages 7–8, Grades 2 & 3)
  - **Mountain Lions** (approx. ages 9–10, Grades 4 & 5)
- **Program Years**: Each patrol level spans 2 program years (**Year 1** and **Year 2**). Program years transition around **July 15** (a critical cutoff date configured in [src/util.ts](file:///l:/home/sdh/src/tlc/src/util.ts#L70)).
- **The 7 Branches**:
  1. *Heritage Branch*
  2. *Life Skills Branch*
  3. *Science & Technology Branch*
  4. *Hobbies Branch*
  5. *Values Branch*
  6. *Sports & Fitness Branch*
  7. *Outdoor Skills Branch*
- **Activity Types**:
  - `core`: Core curriculum steps.
  - `elective`: Elective activities.
  - `htt`: **Hit The Trail** activities (field trips, hikes, campouts, special events).
  - `home`: Family Home Activities (at-home projects that can substitute for missed steps/HTTs).
- **Awards**:
  - **Joining Award**: Patrol patch received upon joining.
  - **Branch Pin**: Earned after completing the core, elective, and HTT requirements for a branch in Year 1.
  - **Sylvan Star**: Earned after completing a second full year of requirements in that branch during Year 2.
  - **Forest Award**: The pinnacle award for a patrol, earned by completing all 7 Branch Pins (Year 1) or all 7 Sylvan Stars (Year 2).
- **Substitution Rules**:
  - **Extra HTTs (`🔀`)**: If a boy attends more HTTs in a branch than required, the extra HTT credits can often be credited toward a missing HTT in another branch.
  - **Family Home Activities (`🏠`)**: Missed steps or HTTs can be made up with documented family activities (subject to yearly caps).

---

## Key Features

### 1. Troop Members Scraping (`/user*`)
- Injected on `https://www.traillifeconnect.com/user*`.
- Adds top buttons:
  - **Scrape**: Scrapes the member grid (`tr.user_grid`), extracting names, TLC user IDs, assigned patrol, and calculated program year (Year 1 vs Year 2, calculated from birthdates or subpatrol naming conventions).
  - **Show**: Opens a modal displaying all cached troop members grouped by patrol/subpatrol.
  - **Clear**: Prompts for confirmation and resets the cached troop member database in `localStorage`.
- Automatically keeps the local trailmen database fresh via a `MutationObserver`.

### 2. Attendance Importer (`/attendance*`) & Extractor Script
- Injected on `https://www.traillifeconnect.com/attendance*`.
- **Importing in Browser**:
  - Adds an **Import CSV** button, drag-and-drop file target, and clipboard paste listener (`Ctrl+V`).
  - Supports all Trail Life levels: **Woodlands Trail** (Foxes, Hawks, Mountain Lions), **Navigators**, and **Adventurers**.
  - Parses CSV exports with headers `Group`, `Last Name`, `First Name` (or `group`, `lastname`, `firstname`).
  - Uses [fuzzball](https://www.npmjs.com/package/fuzzball) for fuzzy string matching against roster names found in the DOM.
  - When an exact match is missing, opens an interactive dialog presenting top fuzzy suggestions, along with options to `SKIP` or `IGNORE`.
  - Remembers manual name corrections in browser `localStorage`.
  - **Safe Checkbox Toggling**: Detects whether checkboxes are already checked (via native property and Krajee `.cbx-container` state) so it **only** checks unchecked members and never accidentally unchecks members checked by someone else.
- **Extracting from Check-In Zip Files (`scripts/extract_attendance.py`)**:
  - Script for parsing weekly check-in spreadsheets (`.xlsx` inside `.zip` files, e.g. `traillifemeetingattendanceasof*.zip`).
  - By default, extracts attended members for the **most recent meeting date** and outputs CSV ready to copy-paste into the userscript.
  - Usage:
    ```bash
    # Export most recent meeting attendance (outputs CSV to stdout)
    npm run attendance
    # Or directly with Python
    python scripts/extract_attendance.py

    # List all available meeting dates in the spreadsheets with attendee counts
    npm run attendance -- --list-dates

    # Export a specific date
    npm run attendance -- --date 2026-10-19

    # Export all dates to individual CSV files
    npm run attendance -- --all
    ```

### 3. Advancement Grid Enhancements (`/advancement*`)
- Injected on `https://www.traillifeconnect.com/advancement*`.
- **Patrol Quick-Select**: Adds shortcut buttons above the grid to select all boys in:
  - `Fox 1`, `Fox 2`, `Hawk 1`, `Hawk 2`, `ML 1`, `ML 2`, `Year 1`, `Year 2`, or `All`.
- **Top Bar Actions**:
  - **Filter**: Filters selected trailmen down to only those who completed the clicked row/activity.
  - **Filter Out**: Filters selected trailmen down to only those who have *not* completed the clicked row/activity.
  - **Pick / Ctrl+Click**: Inspects an already-completed completion mark and populates the date and comment input fields with its details for rapid cloning.
  - **Split**: Color-codes the grid checkmarks (green for completions in the current program year, red for completions prior to the July 15 cutoff).
  - **Check all / Uncheck all**: Bulk checks or unchecks an entire row.

### 4. Advancement Gap Analysis & Emoji Report Card
- Under the **Analyze** menu on the advancement page:
  - **Analyze Progress**: Automatically navigates through all 7 branches, scrapes requirement statuses, tallies completions, reallocates extra HTT credits to where they are most needed, checks family home activity eligibility, and generates a formatted, printable HTML report with a full status key:
    - `🪾` = Already-received branch pin
    - `🌿` = Newly earned branch pin
    - `⭐` = Already-received sylvan star
    - `🌟` = Newly earned sylvan star
    - `✅` = Completed activity
    - `❌` = Not completed activity
    - `🏠` = Family-home activity substitution applied
    - `❓` = Eligible to be filled by family-home activity
    - `🔀` = HTT fulfilled by an extra HTT from another branch
    - `🌲` = Forest Award earned

### 5. Calendar, Attendance Export & Forest Awards
- Under the **Analyze** menu:
  - **Forest Awards**: Scrapes all branches to count earned Branch Pins (`.bp_ss`), identifies boys who completed all 7 branch pins, and injects dynamic quick-select buttons (`Fox Forest`, `Hawk Forest`, `Mountain Lion Forest`) under the `Select Trailmen:` section to select eligible candidates in one click.
  - **Edit Calendar**: Opens an interactive modal editor to configure the troop's calendar of scheduled branch events and dates.
  - **Export Attendance**: Compiles a matrix cross-referencing planned events against each trailman's completion date, with one-click transposition for spreadsheet pasting.
  - **Export Dates**: Generates a tab-separated list of all attendance dates per boy during the current program year.

### 6. Email Queue Automation (`/email/users*`)
- Injected on `https://www.traillifeconnect.com/email/users*`.
- Provides an IndexedDB-backed message queue (`MessageStore`).
- Adds a **SendNext** button to automatically pop the next draft message, populate recipient, subject, and body fields, and trigger the submission.

---

## Architecture & How It Works

`tlc` is organized as modular TypeScript files bundled into a single userscript file using [esbuild](https://esbuild.github.io/):

```
tlc/
├── header.js              # Tampermonkey userscript metadata header
├── userscript.local.js    # Local userscript wrapper pointing to dist/tlc.js
├── package.json           # Scripts and dependencies
├── tsconfig.json          # TypeScript build and typechecking configuration
└── src/
    ├── index.ts           # Entry point: imports all modules
    ├── trailman.ts        # Trailman data model, patrol definitions, and DB store
    ├── branch.ts          # Branch definitions, requirement schemas, activities
    ├── advancement.ts     # Grid UI automation, selectors, progress scrapers
    ├── analysis.ts        # Gap analysis algorithm, emoji report, calendar
    ├── attendance.ts      # CSV parsing, fuzzy name matching, attendance check
    ├── emailqueue.ts      # IndexedDB message store and email automation
    ├── members.ts         # Member list scraper and patrol year calculation
    ├── observer.ts        # MutationObserver wrapper for reactive page scraping
    ├── ui.ts              # Modal dialogs, buttons, DOM creation helpers
    ├── util.ts            # Date helpers (Temporal), download, Multiset, timing
    ├── db.ts              # Typed localStorage wrapper with Valibot validation
    └── idb.ts             # Draft IndexedDB wrapper (work in progress)
```

### Directory & File Overview

| Module | Primary Responsibility |
|---|---|
| [src/index.ts](file:///l:/home/sdh/src/tlc/src/index.ts) | Imports feature modules (`members`, `advancement`, `analysis`, `attendance`, `emailqueue`). |
| [src/trailman.ts](file:///l:/home/sdh/src/tlc/src/trailman.ts) | Defines `Trailman`, `Patrol`, `Subpatrol` schemas and manages in-memory indexing (`byId`, `byPatrol`, `byYear`, `bySubpatrol`). |
| [src/branch.ts](file:///l:/home/sdh/src/tlc/src/branch.ts) | Defines the 7 branches (`HERITAGE`, `LIFE`, etc.), `Activity`, and `ConcreteActivity` schemas. |
| [src/advancement.ts](file:///l:/home/sdh/src/tlc/src/advancement.ts) | DOM scraping and manipulation for `/advancement/index`. Handles branch switching, trailman selection, and grid scraping. |
| [src/analysis.ts](file:///l:/home/sdh/src/tlc/src/analysis.ts) | Algorithms for requirement checking (`CompletedActivities`, `BranchProgress`), extra HTT reallocation, emoji report generation, and calendar editing. |
| [src/attendance.ts](file:///l:/home/sdh/src/tlc/src/attendance.ts) | Handles attendance CSV drag/drop/paste, fuzzy name matching (`fuzzball`), and button clicking. |
| [src/members.ts](file:///l:/home/sdh/src/tlc/src/members.ts) | Scrapes `/user/index`, parses names and birthdates, and calculates Woodlands Trail patrol year. |
| [src/observer.ts](file:///l:/home/sdh/src/tlc/src/observer.ts) | Observes DOM mutations with debouncing and executes route-matched handlers. |
| [src/ui.ts](file:///l:/home/sdh/src/tlc/src/ui.ts) | Modern `<dialog>` wrapper, button toolbars, and element picker utilities. |
| [src/util.ts](file:///l:/home/sdh/src/tlc/src/util.ts) | Date calculations with `Temporal`, `parseDate`, `july15` cutoff, download utilities, and collection helpers. |
| [src/db.ts](file:///l:/home/sdh/src/tlc/src/db.ts) | Generic typed wrapper for `localStorage` using [valibot](https://valibot.dev/) for runtime validation. |
| [src/emailqueue.ts](file:///l:/home/sdh/src/tlc/src/emailqueue.ts) | IndexedDB storage (`MessageDB`) and automation for TLC's email interface. |
| [src/idb.ts](file:///l:/home/sdh/src/tlc/src/idb.ts) | *Experimental/WIP* IndexedDB migration layer for replacing `localStorage`. |

### Data Persistence

The userscript persists data in the browser across sessions:
- **`localStorage`**:
  - `__sdh__trailmen`: Serialized list of scraped `Trailman` objects.
  - `__sdh__all_branch_data`: Cached requirements and activity IDs for each of the 7 branches.
  - `__sdh__calendar`: User-defined schedule of branch activities and dates.
  - `__sdh__attendance_corrections`: Mapping of mismatched CSV names to TLC names.
  - `__sdh__advancements`: Cached progress records (partially implemented).
- **`IndexedDB`**:
  - `MessageDB`: Object store `messages` containing queued emails (`{ recipient, subject, message }`).

### DOM Observation & UI Injection

TLC pages make heavy use of client-side navigation and dynamic partial-page reloads. [src/observer.ts](file:///l:/home/sdh/src/tlc/src/observer.ts) uses a `MutationObserver` on `document.body` with a 2-second debounce timer to trigger scrape handlers whenever the page content updates.

---

## Getting Started & Local Development

### Prerequisites

- **Node.js**: v20 or v22 LTS (recommended: managed via [nvm](https://github.com/nvm-sh/nvm)).
- **Shell**: Bash environment (Linux, macOS, or **WSL** / Git Bash on Windows). The build script uses bash process substitution (`<()`).
- **Browser**: Modern Chrome, Brave, Edge, or Firefox with the **Tampermonkey** extension installed.

### Installation & Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/shicks/tlc.git
   cd tlc
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Building the Bundle

To compile the TypeScript source into `dist/tlc.js` with the Tampermonkey header attached:

```bash
npm run build
```

The build command:
1. Replaces `DATE` in [header.js](file:///l:/home/sdh/src/tlc/header.js) with today's date (`YYYYMMDD`).
2. Bundles [src/index.ts](file:///l:/home/sdh/src/tlc/src/index.ts) with `esbuild --tree-shaking --bundle`.
3. Emits the final userscript to `dist/tlc.js`.

To watch for file changes during active development:
```bash
npm run watch
```

### Installing in Tampermonkey

#### Option A: Local Live Reload (Recommended for Development)
1. In Chrome / your browser, open Tampermonkey's settings and ensure **"Allow access to file URLs"** is enabled in the browser extension management settings (`chrome://extensions`).
2. Create a new userscript in Tampermonkey and paste the contents of [userscript.local.js](file:///l:/home/sdh/src/tlc/userscript.local.js):
   ```javascript
   // ==UserScript==
   // @name         Trail Life Connect Tools (local)
   // @match        https://www.traillifeconnect.com/*
   // @grant        none
   // @require      file:///path/to/tlc/dist/tlc.js
   // ==/UserScript==
   ```
   *(Update the path to match your absolute local path to `dist/tlc.js`).*
3. Every time you run `npm run build`, reloading the TLC page will immediately pick up your new code without re-pasting into Tampermonkey!

#### Option B: Direct Script Installation
1. Run `npm run build`.
2. Open `dist/tlc.js` and copy the entire file.
3. In Tampermonkey, click **Add a new script**, paste the code, and press **Save**.

---

## Current Status

- **Clean Build & Typecheck**: The project compiles with `npm run build` and passes `npx tsc --noEmit` with 0 type errors on `main`.
- **Known Technical Debt**:
  - **Dead Code in `src/idb.ts`**: A 32-line IndexedDB skeleton stub exists on `main`. An unfinished IndexedDB migration exists in the separate `idb` branch, but `main` relies on the battle-tested `localStorage` implementation in `src/db.ts`.
  - **Deactivated Memoization**: `updateMemoizedProgress()` in `src/advancement.ts` is currently disabled pending a clean caching design.
- **Detailed Audit**: For an exhaustive technical breakdown of architecture, legacy DOM selectors, and guidelines for AI agents, see [AGENTS.md](file:///l:/home/sdh/src/tlc/AGENTS.md).

---

## Contributing & Agent Work

If you are an AI assistant or human contributor modifying this codebase:
- Please consult [AGENTS.md](file:///l:/home/sdh/src/tlc/AGENTS.md) for architectural guidelines, known traps, and safe refactoring strategies.
- Maintain documentation integrity and preserve domain comments explaining Trail Life advancement policies.
