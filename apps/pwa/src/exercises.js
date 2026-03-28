// We combine word-overlap + Levenshtein similarity to handle STT typos and slang.
let exercises = [];
const MIN_SIMILARITY = 0.04;

function levenshtein(a, b) {
  if (a === b) return 0;
  const alen = a.length;
  const blen = b.length;
  if (alen === 0) return blen;
  if (blen === 0) return alen;

  // dp[i][j] = minimum edits to turn a[0..i) into b[0..j)
  const dp = Array.from({ length: alen + 1 }, () => new Array(blen + 1));
  for (let i = 0; i <= alen; i++) dp[i][0] = i;
  for (let j = 0; j <= blen; j++) dp[0][j] = j;

  for (let i = 1; i <= alen; i++) {
    for (let j = 1; j <= blen; j++) {
      // cost = 0 if same char, 1 if substitution needed
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      // consider delete, insert, substitute
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[alen][blen];
}

export async function loadExercises() {
  const url = new URL("../public/exercises.json", import.meta.url);
  const res = await fetch(url);
  exercises = await res.json();
  return exercises;
}

export function bestExerciseMatch(input) {
  if (!exercises.length) return input;
  const inputWords = input.toLowerCase().split(/\s+/);
  let best = { name: input, score: 0, similarity: 0 };

  for (const ex of exercises) {
    const exWords = ex.split(/\s+/);
    let score = 0;

    for (const w of inputWords) {
      if (exWords.includes(w)) score += 2;
    }

    if (input === ex) score += 3;

    // normalize distance to 0..1 similarity
    const maxLen = Math.max(input.length, ex.length) || 1;
    const distance = levenshtein(input, ex);
    const similarity = 1 - distance / maxLen;

    // combine word-overlap score with string similarity
    const combined = score + similarity;

    if (combined > best.score) {
      best = { name: ex, score: combined, similarity };
    }
  }

  if (best.similarity < MIN_SIMILARITY) {
    return null;
  }
  return best.name;
}
