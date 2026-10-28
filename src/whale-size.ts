/**
 * The whale's size. Everything that depends on how big the animal is derives from these two numbers, so the
 * whale can be resized in one place.
 */

/** Rostrum to fluke tips (m). Adult blue whales are 24 to 27 m, rarely 30 m. */
export const WHALE_LENGTH = 25;
/** Deepest body section, belly to back, as a share of the length: a blue whale is slender. */
export const BODY_DEPTH_SHARE = 0.122;
export const BODY_DEPTH = WHALE_LENGTH * BODY_DEPTH_SHARE;

/**
 * Much of the motion, camera and effects code was tuned on a 12 m whale with a 2.5 m deep body. A length tuned
 * that way scales by LENGTH_SCALE (camera distances, spray, breach height); a height relative to the waterline
 * that depends on how deep the body is (swimming and surfacing levels) scales by DEPTH_SCALE.
 */
const TUNED_LENGTH = 12;
const TUNED_DEPTH = 2.5;
export const LENGTH_SCALE = WHALE_LENGTH / TUNED_LENGTH;
export const DEPTH_SCALE = BODY_DEPTH / TUNED_DEPTH;
