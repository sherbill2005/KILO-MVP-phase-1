import { CANONICAL_EXERCISES } from '../../models/exercises';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'was', 'on', 'at', 'to', 'of', 'for',
  'and', 'with', 'set', 'sets', 'log', 'logged', 'reps', 'rep',
  'pounds', 'pound', 'kgs', 'kg', 'lbs', 'lb', 'kilos', 'kilo',
  'done', 'then', 'doing', 'did', 'times', 'x', 'i', 'just', 'we'
]);

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const alen = a.length;
  const blen = b.length;
  if (alen === 0) return blen;
  if (blen === 0) return alen;

  const dp: number[][] = Array.from({ length: alen + 1 }, () => new Array(blen + 1));
  for (let i = 0; i <= alen; i++) dp[i][0] = i;
  for (let j = 0; j <= blen; j++) dp[0][j] = j;

  for (let i = 1; i <= alen; i++) {
    for (let j = 1; j <= blen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[alen][blen];
}

export class FuzzyExerciseMatcher {
  private catalog: { canonical: string; forms: string[] }[];

  constructor() {
    this.catalog = CANONICAL_EXERCISES.map(e => ({
      canonical: e.name,
      forms: [e.name.toLowerCase(), ...(e.aliases || []).map(a => a.toLowerCase())],
    }));
  }

  public match(rawInput: string): string | null {
    if (!rawInput || !rawInput.trim()) return null;

    const lower = rawInput.toLowerCase().trim();

    // 1. Direct substring check for any exercise or alias
    for (const item of this.catalog) {
      for (const form of item.forms) {
        if (lower.includes(form)) {
          return item.canonical;
        }
      }
    }

    // 2. Clean input: strip numbers and units
    const cleaned = lower
      .replace(/\b\d+(?:\.\d+)?\s*(?:kg|kilos|kilo|lbs|lb|pounds|reps|rep)?\b/g, ' ')
      .replace(/[^a-z\s]/g, ' ')
      .trim();

    const inputTokens = cleaned.split(/\s+/).filter(t => t.length > 0 && !STOP_WORDS.has(t));
    const filteredInput = inputTokens.join(' ');

    if (!filteredInput) return null;

    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const item of this.catalog) {
      for (const form of item.forms) {
        const formTokens = form.split(/\s+/);
        let score = 0;

        // Word overlap bonus
        for (const token of inputTokens) {
          if (formTokens.includes(token)) {
            score += 3.0;
          }
        }

        // Levenshtein similarity calculation (0.0 to 1.0)
        const maxLen = Math.max(filteredInput.length, form.length);
        const distance = levenshtein(filteredInput, form);
        const similarity = maxLen > 0 ? 1.0 - distance / maxLen : 0;

        const totalScore = score + similarity * 3.5;
        // Require either a word match or high string similarity (>= 0.65) for typos
        const isValidMatch = score >= 3.0 || similarity >= 0.65;
        if (isValidMatch && totalScore > bestScore) {
          bestScore = totalScore;
          bestMatch = item.canonical;
        }
      }
    }

    return bestMatch;
  }
}

export const fuzzyExerciseMatcher = new FuzzyExerciseMatcher();
