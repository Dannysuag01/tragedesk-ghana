/**
 * Normalizer & Fuzzy Matching Engine
 * Reconciles team names, competitions, and market selections across different bookmakers.
 */

// Common prefixes/suffixes to strip for clean comparison
const STRIP_WORDS = new Set([
  'fc', 'sc', 'cf', 'afc', 'ac', 'as', 'ssc', 'sv', 'fk', 'sk', 'club', 'de',
  'united', 'utd', 'city', 'town', 'athletic', 'atletico', 'sporting', 'real'
]);

// Common team abbreviations
const TEAM_ALIASES = {
  'man': 'manchester',
  'wolves': 'wolverhampton',
  'spurs': 'tottenham',
  'gladbach': 'monchengladbach',
  'psg': 'paris'
};

const GENDER_MARKERS = ['women', '(w)', 'wom', 'feminino', 'femmes', 'ladies', 'damen', 'frau'];
const AGE_MARKERS = ['u17', 'u18', 'u19', 'u20', 'u21', 'u23', 'reserves', 'res.', 'youth', 'ii', 'b team'];

/**
 * Extracts demographic and sub-team tags (Women, Youth, Reserves)
 * @param {string} str 
 * @returns {Set<string>}
 */
export function getMatchTags(str = '') {
  const lower = String(str).toLowerCase();
  const tags = new Set();
  
  for (const m of GENDER_MARKERS) {
    if (new RegExp(`\\b${m.replace(/[()]/g, '')}\\b|\\(w\\)`, 'i').test(lower)) {
      tags.add('women');
      break;
    }
  }

  for (const a of AGE_MARKERS) {
    if (new RegExp(`\\b${a.replace('.', '\\.')}\\b`, 'i').test(lower)) {
      tags.add(a);
    }
  }

  return tags;
}

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
    .map(word => TEAM_ALIASES[word] || word)
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

// Common country aliases
const COUNTRY_ALIASES = {
  'uk': 'england',
  'united kingdom': 'england',
  'great britain': 'england',
  'gb': 'england',
  'usa': 'united states',
  'us': 'united states',
  'united states of america': 'united states',
  'uae': 'united arab emirates',
  'world': 'international',
  'intl': 'international',
  'inter': 'international',
  'europe': 'international',
  'africa': 'international'
};

// Common competition aliases
const COMP_ALIASES = {
  'epl': 'premier league',
  'english premier league': 'premier league',
  'npfl': 'nigeria professional league',
  'nigeria professional football league': 'nigeria professional league',
  'nigeria professional league': 'nigeria professional league',
  'ghpl': 'ghana premier league',
  'ghana premier league': 'ghana premier league',
  'laliga': 'primera division',
  'la liga': 'primera division',
  'spain laliga': 'primera division',
  'ucl': 'champions league',
  'uefa champions league': 'champions league',
  'uel': 'europa league',
  'uefa europa league': 'europa league',
  'unl': 'nations league',
  'uefa nations league': 'nations league'
};

/**
 * Normalizes sport names to canonical IDs
 * @param {string} sport
 * @returns {string}
 */
export function normalizeSportName(sport) {
  if (!sport) return '';
  const s = String(sport).toLowerCase().trim();
  if (s.includes('soccer') || s.includes('football')) return 'football';
  if (s.includes('basket')) return 'basketball';
  if (s.includes('table tennis') || s.includes('ping pong')) return 'table_tennis';
  if (s.includes('tennis')) return 'tennis';
  if (s.includes('hockey') || s.includes('ice hockey')) return 'ice_hockey';
  if (s.includes('cricket')) return 'cricket';
  if (s.includes('rugby')) return 'rugby';
  if (s.includes('baseball')) return 'baseball';
  return s;
}

/**
 * Verifies if two competition / league representations are compatible
 * @param {string} [compA]
 * @param {string} [compB]
 * @param {string} [countryA]
 * @param {string} [countryB]
 * @returns {boolean}
 */
export function isCompetitionCompatible(compA = '', compB = '', countryA = '', countryB = '', relaxed = false) {
  // 1. Country conflict check
  if (countryA && countryB) {
    const rawCA = countryA.toLowerCase().trim();
    const rawCB = countryB.toLowerCase().trim();
    const cA = COUNTRY_ALIASES[rawCA] || rawCA;
    const cB = COUNTRY_ALIASES[rawCB] || rawCB;
    const isInterA = cA === 'international' || cA.includes('inter') || cA.includes('world') || cA.includes('europe');
    const isInterB = cB === 'international' || cB.includes('inter') || cB.includes('world') || cB.includes('europe');
    if (!isInterA && !isInterB && cA !== cB && !cA.includes(cB) && !cB.includes(cA)) {
      return false;
    }
  }

  if (!compA || !compB) return true;

  let normA = compA.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  let normB = compB.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  for (const [alias, canonical] of Object.entries(COMP_ALIASES)) {
    if (normA === alias || normA.includes(alias)) normA = normA.replace(alias, canonical).trim();
    if (normB === alias || normB.includes(alias)) normB = normB.replace(alias, canonical).trim();
  }

  // If either is generic placeholder
  const genericComps = ['football', 'soccer', 'upcoming', 'sports', 'all', 'matches', 'top leagues'];
  if (genericComps.some(g => normA === g || normB === g || normA.includes(g) || normB.includes(g)) || normA.length === 0 || normB.length === 0) {
    return true;
  }

  // Exact or direct inclusion match (e.g. "England - Premier League" vs "Premier League")
  if (normA === normB || normA.includes(normB) || normB.includes(normA)) {
    return true;
  }

  // 2. Gender tag conflict in competition name
  const aIsWomen = GENDER_MARKERS.some(m => normA.includes(m.replace(/[()]/g, '')));
  const bIsWomen = GENDER_MARKERS.some(m => normB.includes(m.replace(/[()]/g, '')));
  if (aIsWomen !== bIsWomen) {
    return false;
  }

  // 3. Division / League Tier Conflict (e.g. League 1 vs League 2, J1 vs J2 vs J3, U19 vs U21)
  const divPatterns = [
    /\b(u17|u18|u19|u20|u21|u23)\b/,
    /\b(j1|j2|j3)\b/,
    /\b(division 1|division 2|division 3)\b/,
    /\b(league 1|league 2|league one|league two)\b/,
    /\b(serie a|serie b|serie c)\b/,
    /\b(segunda|primera)\b/
  ];

  for (const pat of divPatterns) {
    const matchA = normA.match(pat);
    const matchB = normB.match(pat);
    if (matchA && matchB && matchA[0] !== matchB[0]) {
      return false;
    }
  }

  // When teams match strongly across worldwide leagues, don't reject due to token abbreviations
  if (relaxed) {
    return true;
  }

  // 4. Token Overlap Check
  const stopWords = new Set(['league', 'cup', 'the', 'fc', 'championship', 'tournament', 'division']);
  const tokensA = new Set(normA.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)));
  const tokensB = new Set(normB.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)));

  if (tokensA.size > 0 && tokensB.size > 0) {
    let common = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) common++;
    }
    // If both specified distinctive leagues with zero shared tokens, they are different leagues
    if (common === 0) {
      return false;
    }
  }

  return true;
}

/**
 * Determines if two fixture representations match the same real-world match
 * @param {Object} fixtureA { homeTeam, awayTeam, startTime, competition, country }
 * @param {Object} fixtureB { homeTeam, awayTeam, startTime, competition, country }
 * @param {number} [threshold=0.70]
 * @returns {boolean}
 */
export function isMatchEqual(fixtureA, fixtureB, threshold = 0.70) {
  if (!fixtureA || !fixtureB) return false;

  // 0. Sport Verification (Reject if both specify different sports)
  if (fixtureA.sport && fixtureB.sport) {
    const sA = normalizeSportName(fixtureA.sport);
    const sB = normalizeSportName(fixtureB.sport);
    if (sA && sB && sA !== sB) {
      return false;
    }
  }

  // 1. Kickoff Time Window: Ensure within 2-hour window if both are known
  if (fixtureA.startTime && fixtureB.startTime) {
    const timeA = new Date(fixtureA.startTime).getTime();
    const timeB = new Date(fixtureB.startTime).getTime();
    if (!isNaN(timeA) && !isNaN(timeB)) {
      const timeDiffMs = Math.abs(timeA - timeB);
      if (timeDiffMs > 2 * 60 * 60 * 1000) {
        return false;
      }
    }
  }

  // 2. Gender & Age Group Verification (Women vs Men, Senior vs U19/U21)
  const fullA = `${fixtureA.homeTeam} ${fixtureA.awayTeam} ${fixtureA.competition || ''}`;
  const fullB = `${fixtureB.homeTeam} ${fixtureB.awayTeam} ${fixtureB.competition || ''}`;
  const tagsA = getMatchTags(fullA);
  const tagsB = getMatchTags(fullB);

  // If one match is Women and the other is not -> REJECT
  if (tagsA.has('women') !== tagsB.has('women')) {
    return false;
  }

  // If youth tags differ -> REJECT
  for (const tag of tagsA) {
    if (tag !== 'women' && !tagsB.has(tag)) {
      return false;
    }
  }
  for (const tag of tagsB) {
    if (tag !== 'women' && !tagsA.has(tag)) {
      return false;
    }
  }

  // 3. Team Name Similarity Verification
  const cleanHomeA = cleanTeamName(fixtureA.homeTeam);
  const cleanHomeB = cleanTeamName(fixtureB.homeTeam);
  const cleanAwayA = cleanTeamName(fixtureA.awayTeam);
  const cleanAwayB = cleanTeamName(fixtureB.awayTeam);

  const homeSim = stringSimilarity(cleanHomeA, cleanHomeB);
  const awaySim = stringSimilarity(cleanAwayA, cleanAwayB);

  // Both teams must match reasonably well
  if (homeSim < threshold || awaySim < threshold) {
    return false;
  }

  // 4. League / Competition Verification
  const compA = fixtureA.competition || fixtureA.tournamentName || fixtureA.league;
  const compB = fixtureB.competition || fixtureB.tournamentName || fixtureB.league;
  const countryA = fixtureA.country || fixtureA.region;
  const countryB = fixtureB.country || fixtureB.region;

  // When both teams match strongly (>= 0.80), allow relaxed competition check across worldwide leagues
  const isHighTeamMatch = (homeSim >= 0.80 && awaySim >= 0.80);
  if (!isCompetitionCompatible(compA, compB, countryA, countryB, isHighTeamMatch)) {
    return false;
  }

  return true;
}
