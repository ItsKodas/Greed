/**
 * Slots: five reels, nine lines, and a bank that only holds what players put
 * in it.
 *
 * Every export here is a pure function over numbers. The machine has no table,
 * no seats and no turns, so there is nothing to stand up and nothing to mock:
 * the whole economy can be argued with in a test file.
 */
export { drawGrid, FACES, STOPS, STRIP, WEIGHTS } from "./strip.js";
export type { Face } from "./strip.js";
