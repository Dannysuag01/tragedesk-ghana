/**
 * Normalizer & Fuzzy Matching Engine
 * Reconciles team names, competitions, and market selections across different bookmakers.
 */

// Common prefixes/suffixes to strip for clean comparison
const STRIP_WORDS = new Set([
  'fc', 'sc', 'cf', 'afc', 'ac', 'as', 'ssc', 'sv', 'fk', 'sk', 'club', 'de',
  'united', 'utd', 'city', 'town', 'athletic', 'atletico', 'sporting', 'real'
]);

/**
 * Clean and standardize team name
 * @param {string} name 
 * @returns {string}
 */
export function cleanTeamName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents (é -> e)
    .replace(/[^a-z0-9\s]/g, ' ') // remove special chars
    .split(/\s+/)
    .filter(word => !STRIP_WORDS.has(word) && word.length > 1)
    .join(' ')
    .trim();
}

/**
 * Calculates Levenshtein distance between two strings
 */
function levenshtein(a, b) {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array(bn + 1).fill(null).map(() => Array(an + 1).fill(null));
  for (let i = 0; i <= an; i += 1) matrix[0][i] = i;
  for (let j = 0; j <= bn; j += 1) matrix[j][0] = j;
  for (let j = 1; j <= bn; j += 1) {
    for (let i = 1; i <= an; i += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  return matrix[bn][an];
}

/**
 * Calculates string similarity between 0.0 and 1.0
 */
export function stringSimilarity(str1, str2) {
  const s1 = cleanTeamName(str1);
  const s2 = cleanTeamName(str2);
  if (s1 === s2 && s1.length > 0) return 1.0;
  if (!s1 || !s2) return 0.0;

  // Check token overlap
  const tokens1 = new Set(s1.split(/\s+/));
  const tokens2 = new Set(s2.split(/\s+/));
  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }
  const tokenScore = (2 * intersection) / (tokens1.size + tokens2.size);

  const maxLen = Math.max(s1.length, s2.length);
  const levScore = 1 - (levenshtein(s1, s2) / maxLen);

  return Math.max(tokenScore, levScore);
}

/**
 * Determines if two fixture representations match the same real-world match
 * @param {Object} fixtureA { homeTeam, awayTeam, startTime }
 * @param {Object} fixtureB { homeTeam, awayTeam, startTime }
 * @param {number} [threshold=0.70]
 * @returns {boolean}
 */
export function isMatchEqual(fixtureA, fixtureB, threshold = 0.70) {
  // If start times are known, ensure they are within a 3-hour window
  if (fixtureA.startTime && fixtureB.startTime) {
    const timeDiffMs = Math.abs(new Date(fixtureA.startTime).getTime() - new Date(fixtureB.startTime).getTime());
    if (timeDiffMs > 3 * 60 * 60 * 1000) {
      return false;
    }
  }

  const cleanHomeA = cleanTeamName(fixtureA.homeTeam);
  const cleanHomeB = cleanTeamName(fixtureB.homeTeam);
  const cleanAwayA = cleanTeamName(fixtureA.awayTeam);
  const cleanAwayB = cleanTeamName(fixtureB.awayTeam);

  const homeSim = stringSimilarity(cleanHomeA, cleanHomeB);
  const awaySim = stringSimilarity(cleanAwayA, cleanAwayB);

  // Both teams must match reasonably well
  return (homeSim >= threshold && awaySim >= threshold);
}
