// Home's module definitions and default placements.
//
// Home is not a grid of independent cards: every section reads one shared
// timeframe and one live feed, so its modules are `context` modules and the
// console provides that context. Kept in its own file so the Home migration
// never has to touch the shared catalog.

import type { ModuleDefinition, ModulePlacement } from "./types";

export const HOME_MODULES: ModuleDefinition[] = [];

export const HOME_LAYOUT: ModulePlacement[] = [];
