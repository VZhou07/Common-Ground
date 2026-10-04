// Seed lists for makePair (§4 step 1). Player starts come from the bucket's
// list; Venn always starts on a page from its own taste: math.
import type { BucketId } from "../topics/buckets";

export const MATH_SEEDS = [
  "Fractal", "Golden ratio", "Tessellation", "Fibonacci sequence", "Prime number", "Pi",
  "Möbius strip", "Symmetry", "Topology", "Game theory", "Graph theory", "Probability",
  "Chaos theory", "Knot theory", "Cryptography", "Infinity", "Pythagorean theorem",
  "Magic square", "Logarithm", "Normal distribution", "Euclidean geometry", "Conic section", "Platonic solid",
];

export const BUCKET_SEEDS: Record<BucketId, string[]> = {
  science: ["Honey bee", "Volcano", "Octopus", "Rainbow", "Coral reef", "Snowflake", "Aurora", "Photosynthesis"],
  tech: ["Bicycle", "Lighthouse", "Steam engine", "Transistor", "Suspension bridge", "Telescope", "Typewriter"],
  math: ["Sudoku", "Rubik's Cube", "Origami", "Abacus", "Slide rule"],
  sports: ["Alpine skiing", "Rock climbing", "Surfing", "Marathon", "Tennis", "Chess", "Sailing"],
  music: ["Piano", "Jazz", "Violin", "Drum kit", "Synthesizer", "Guitar", "Opera"],
  art: ["Stained glass", "Mosaic", "Impressionism", "Bauhaus", "Fashion design", "Quilt"],
  screen: ["Tetris", "Animation", "Minecraft", "Pac-Man", "Studio Ghibli", "Star Trek"],
  food: ["Pizza", "Chocolate", "Coffee", "Sushi", "Bread", "Honey", "Cheese"],
  history: ["Ancient Egypt", "Printing press", "Silk Road", "Stonehenge", "Renaissance", "Library of Alexandria"],
  places: ["Venice", "Iceland", "Kyoto", "Grand Canyon", "Sahara", "Antarctica"],
  language: ["Alphabet", "Haiku", "Calligraphy", "Esperanto", "Sherlock Holmes", "Dictionary"],
  business: ["Stock market", "Coca-Cola", "Money", "IKEA", "Advertising", "Tulip mania"],
};
