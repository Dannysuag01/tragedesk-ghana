/**
 * Live Bookmaker Feed Manager
 * Coordinates real-time production feeds across all Ghanaian sportsbooks:
 * 1. SportyBet Ghana
 * 2. Betpawa Ghana
 * 3. 1xBet Ghana
 * Comprehensive market scanner: Over/Under (all lines), 1X2, BTTS, DNB, 1st Half markets.
 */

import { SportyBetLiveConnector } from './sportybet_live.js';
import { BetpawaLiveConnector } from './betpawa_live.js';
import { OneXBetLiveConnector } from './1xbet_live.js';
import { SoccabetLiveConnector } from './soccabet_live.js';
import { BetwayLiveConnector } from './betway_live.js';
import { isMatchEqual, cleanTeamName } from '../engine/normalizer.js';

export class LiveFeedManager {
  constructor() {
    const socca = new SoccabetLiveConnector();
    const bway = new BetwayLiveConnector();
    this.connectors = {
      'Sportybet': new SportyBetLiveConnector(),
      'Betpawa Ghana': new BetpawaLiveConnector(),
      '1xBet Ghana': new OneXBetLiveConnector(),
      'Soccabet Ghana': socca,
      'Soccabet': socca,
      'Betway Ghana': bway,
      'Betway': bway
    };
    this.betpawaEventCache = new Map();
    this.lastSportyFetch = 0;
    this.cachedSportyEvents = [];
  }

  /**
   * Fetches latest real production feeds across verified Ghanaian sportsbooks
   * @returns {Promise<Array<Object>>}
   */
  async getLatestFeeds() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    console.log(`[LiveFeedManager] Starting feed scan at ${hh}:${mm}:${ss}`);
    console.log('[LiveFeedManager] Polling real-time Ghanaian sportsbook APIs (All Markets)...');

    const sportyMatches = [];
    const betpawaMatches = [];
    const oneXMatches = [];
    const validSpEvents = [];

    const spHeaders = {
      ...this.connectors['Sportybet'].headers,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    };
    const bpHeaders = {
      ...this.connectors['Betpawa Ghana'].headers,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    };

    const SPORT_CATALOG = [
      { id: 'sr:sport:1', name: 'Football' },
      { id: 'sr:sport:2', name: 'Basketball' },
      { id: 'sr:sport:5', name: 'Tennis' },
      { id: 'sr:sport:20', name: 'Table Tennis' },
      { id: 'sr:sport:4', name: 'Ice Hockey' }
    ];

    // 1. Fetch real matches from SportyBet (up to 7 days / 168 hours across all active sports)
    try {
      let spEvents = this.cachedSportyEvents;
      if (Date.now() - this.lastSportyFetch > 3000 || spEvents.length === 0) {
        const allFetchedEvents = [];
        for (const sport of SPORT_CATALOG) {
          try {
            // Query SportyBet with 168 hours (7 days) horizon per sport + cache buster
            const spRes = await fetch(`https://www.sportybet.com/api/gh/factsCenter/wapUpcomingEvents?sportId=${sport.id}&timeFrame=168&_t=${Date.now()}`, {
              headers: spHeaders,
              signal: AbortSignal.timeout(6000)
            });
            if (spRes.ok) {
              const spJson = await spRes.json();
              const evList = (spJson.data || []).map(e => ({ ...e, defaultSport: sport.name }));
              allFetchedEvents.push(...evList);
            } else {
              // Fallback to standard upcoming feed if 168h query is not supported
              const fbRes = await fetch(`https://www.sportybet.com/api/gh/factsCenter/wapUpcomingEvents?sportId=${sport.id}&_t=${Date.now()}`, {
                headers: spHeaders,
                signal: AbortSignal.timeout(6000)
              });
              if (fbRes.ok) {
                const fbJson = await fbRes.json();
                const evList = (fbJson.data || []).map(e => ({ ...e, defaultSport: sport.name }));
                allFetchedEvents.push(...evList);
              }
            }
          } catch (e) {
            // Silently skip if a single sport times out
          }
        }
        spEvents = allFetchedEvents;
        this.cachedSportyEvents = spEvents;
        this.lastSportyFetch = Date.now();
      }

      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();

    for (const ev of spEvents) {
      // Filter strictly for pre-match within next 7 days
      if (ev.estimateStartTime) {
        if (ev.estimateStartTime <= nowMs) continue; // Already started/live
        if (ev.estimateStartTime > nowMs + SEVEN_DAYS_MS) continue; // Beyond 7 days
      }
      const evSport = ev.sport?.name || ev.defaultSport || 'Football';
      const markets = [];
      for (const m of ev.markets || []) {
        const mDesc = (m.desc || m.name || '').toLowerCase();

        // A. 1X2 Full Time (Football, Hockey)
        if (m.id === '1' || mDesc === '1x2') {
          const h = m.outcomes?.find(o => o.desc?.toLowerCase() === 'home' || o.desc?.toLowerCase() === '1');
          const d = m.outcomes?.find(o => o.desc?.toLowerCase() === 'draw' || o.desc?.toLowerCase() === 'x');
          const a = m.outcomes?.find(o => o.desc?.toLowerCase() === 'away' || o.desc?.toLowerCase() === '2');
          if (h && d && a) {
            markets.push({
              id: '1',
              marketId: '1',
              type: '1x2',
              name: '1X2 (Full Time)',
              line: 'Full Time',
              outcomes: [
                { id: h.id, name: 'Home', odds: parseFloat(h.odds) },
                { id: d.id, name: 'Draw', odds: parseFloat(d.odds) },
                { id: a.id, name: 'Away', odds: parseFloat(a.odds) }
              ]
            });
          }
        }

        // A2. 2-Way Moneyline / Winner (Basketball, Tennis, Table Tennis, Baseball)
        if (m.id === '219' || m.id === '186' || mDesc === 'winner' || mDesc === '1 2' || mDesc === 'moneyline' || mDesc === 'head to head' || mDesc.includes('winner (incl. overtime)')) {
          const h = m.outcomes?.find(o => o.desc?.toLowerCase() === 'home' || o.desc?.toLowerCase() === '1');
          const a = m.outcomes?.find(o => o.desc?.toLowerCase() === 'away' || o.desc?.toLowerCase() === '2');
          const hasDraw = m.outcomes?.some(o => o.desc?.toLowerCase() === 'draw' || o.desc?.toLowerCase() === 'x');
          if (h && a && !hasDraw) {
            markets.push({
              id: '219',
              marketId: '219',
              type: 'moneyline',
              name: 'Moneyline (Winner)',
              line: 'Head to Head',
              outcomes: [
                { id: h.id, name: 'Home', odds: parseFloat(h.odds) },
                { id: a.id, name: 'Away', odds: parseFloat(a.odds) }
              ]
            });
          }
        }

        // B. Over/Under All Lines (0.5, 1.5, 2.5, 3.5, 4.5, 5.5)
        if (m.id === '18' && m.specifier?.startsWith('total=')) {
          const line = m.specifier.replace('total=', '').trim();
          const over = m.outcomes?.find(o => o.desc?.toLowerCase().includes('over'));
          const under = m.outcomes?.find(o => o.desc?.toLowerCase().includes('under'));
          if (over && under) {
            markets.push({
              id: '18',
              marketId: '18',
              type: `over_under_${line}`,
              name: 'Over/Under Goals',
              line: `Total ${line}`,
              specifier: m.specifier,
              outcomes: [
                { id: over.id, name: `Over ${line}`, odds: parseFloat(over.odds) },
                { id: under.id, name: `Under ${line}`, odds: parseFloat(under.odds) }
              ]
            });
          }
        }

        // C. Both Teams To Score (GG/NG)
        if (m.desc === 'GG/NG' || m.id === '29') {
          const yes = m.outcomes?.find(o => o.desc?.toLowerCase() === 'yes');
          const no = m.outcomes?.find(o => o.desc?.toLowerCase() === 'no');
          if (yes && no) {
            markets.push({
              id: '29',
              marketId: '29',
              type: 'btts',
              name: 'Both Teams To Score',
              line: 'Yes / No',
              outcomes: [
                { id: yes.id, name: 'Yes', odds: parseFloat(yes.odds) },
                { id: no.id, name: 'No', odds: parseFloat(no.odds) }
              ]
            });
          }
        }

        // D. 1st Half 1X2
        if (m.id === '60') {
          const h = m.outcomes?.find(o => o.desc?.toLowerCase() === 'home' || o.desc?.toLowerCase() === '1');
          const d = m.outcomes?.find(o => o.desc?.toLowerCase() === 'draw' || o.desc?.toLowerCase() === 'x');
          const a = m.outcomes?.find(o => o.desc?.toLowerCase() === 'away' || o.desc?.toLowerCase() === '2');
          if (h && d && a) {
            markets.push({
              id: '60',
              marketId: '60',
              type: '1h_1x2',
              name: '1st Half 1X2',
              line: '1st Half',
              outcomes: [
                { id: h.id, name: '1st Half Home', odds: parseFloat(h.odds) },
                { id: d.id, name: '1st Half Draw', odds: parseFloat(d.odds) },
                { id: a.id, name: '1st Half Away', odds: parseFloat(a.odds) }
              ]
            });
          }
        }

        // E. 1st Half Over/Under
        if (m.id === '68' && m.specifier?.startsWith('total=')) {
          const line = m.specifier.replace('total=', '').trim();
          const over = m.outcomes?.find(o => o.desc?.toLowerCase().includes('over'));
          const under = m.outcomes?.find(o => o.desc?.toLowerCase().includes('under'));
          if (over && under) {
            markets.push({
              id: '68',
              marketId: '68',
              type: `1h_over_under_${line}`,
              name: '1st Half Over/Under',
              line: `1H Total ${line}`,
              specifier: m.specifier,
              outcomes: [
                { id: over.id, name: `1H Over ${line}`, odds: parseFloat(over.odds) },
                { id: under.id, name: `1H Under ${line}`, odds: parseFloat(under.odds) }
              ]
            });
          }
        }

        // F. Draw No Bet (Market ID 2)
        if (m.id === '2' || mDesc === 'draw no bet') {
          const h = m.outcomes?.find(o => o.desc?.toLowerCase() === 'home' || o.desc?.toLowerCase() === '1');
          const a = m.outcomes?.find(o => o.desc?.toLowerCase() === 'away' || o.desc?.toLowerCase() === '2');
          if (h && a) {
            markets.push({
              id: '2',
              marketId: '2',
              type: 'dnb',
              name: 'Draw No Bet',
              line: 'Draw No Bet',
              outcomes: [
                { id: h.id, name: 'Home', odds: parseFloat(h.odds) },
                { id: a.id, name: 'Away', odds: parseFloat(a.odds) }
              ]
            });
          }
        }

        // G. Double Chance (Market ID 10)
        if (m.id === '10' || mDesc === 'double chance') {
          const hx = m.outcomes?.find(o => o.desc?.toLowerCase() === 'home/draw' || o.desc?.toLowerCase() === '1x');
          const ha = m.outcomes?.find(o => o.desc?.toLowerCase() === 'home/away' || o.desc?.toLowerCase() === '12');
          const ax = m.outcomes?.find(o => o.desc?.toLowerCase() === 'draw/away' || o.desc?.toLowerCase() === 'x2');
          if (hx && ha && ax) {
            markets.push({
              id: '10',
              marketId: '10',
              type: 'double_chance',
              name: 'Double Chance',
              line: 'Double Chance',
              outcomes: [
                { id: hx.id, name: '1X', odds: parseFloat(hx.odds) },
                { id: ha.id, name: '12', odds: parseFloat(ha.odds) },
                { id: ax.id, name: 'X2', odds: parseFloat(ax.odds) }
              ]
            });
          }
        }

        // H. Asian Handicap (2-Way Full Time only - strictly exclude corners, cards, halves)
        if ((m.id === '64' || mDesc.includes('asian handicap')) && !mDesc.includes('corner') && !mDesc.includes('card') && !mDesc.includes('1st') && !mDesc.includes('2nd') && !mDesc.includes('half') && m.specifier?.includes('hcp=')) {
          const hcp = m.specifier.replace(/.*hcp=([^&]+).*/, '$1').trim();
          const h = m.outcomes?.find(o => o.desc?.toLowerCase() === 'home' || o.desc?.toLowerCase() === '1');
          const a = m.outcomes?.find(o => o.desc?.toLowerCase() === 'away' || o.desc?.toLowerCase() === '2');
          if (h && a) {
            markets.push({
              id: '64',
              marketId: '64',
              type: `asian_handicap_${hcp}`,
              name: 'Asian Handicap',
              line: `Handicap ${hcp}`,
              specifier: m.specifier,
              outcomes: [
                { id: h.id, name: `Home (${hcp})`, odds: parseFloat(h.odds) },
                { id: a.id, name: `Away (-${hcp})`, odds: parseFloat(a.odds) }
              ]
            });
          }
        }

        // I. European Handicap (3-Way Full Time only - strictly exclude corners, cards, halves)
        if ((m.id === '16' || mDesc.includes('handicap')) && !mDesc.includes('corner') && !mDesc.includes('card') && !mDesc.includes('1st') && !mDesc.includes('2nd') && !mDesc.includes('half') && m.specifier?.includes('hcp=')) {
          const hcp = m.specifier.replace(/.*hcp=([^&]+).*/, '$1').trim();
          const h = m.outcomes?.find(o => o.desc?.toLowerCase() === 'home' || o.desc?.toLowerCase() === '1');
          const d = m.outcomes?.find(o => o.desc?.toLowerCase() === 'draw' || o.desc?.toLowerCase() === 'x');
          const a = m.outcomes?.find(o => o.desc?.toLowerCase() === 'away' || o.desc?.toLowerCase() === '2');
          if (h && d && a) {
            markets.push({
              id: '16',
              marketId: '16',
              type: `euro_handicap_${hcp}`,
              name: 'European Handicap (3-Way)',
              line: `Handicap ${hcp}`,
              specifier: m.specifier,
              outcomes: [
                { id: h.id, name: `Home (${hcp})`, odds: parseFloat(h.odds) },
                { id: d.id, name: `Draw (${hcp})`, odds: parseFloat(d.odds) },
                { id: a.id, name: `Away (${hcp})`, odds: parseFloat(a.odds) }
              ]
            });
          }
        }

        // J. Home Team Total Goals (Over/Under)
        if (m.id === '19' && m.specifier?.startsWith('total=')) {
          const line = m.specifier.replace('total=', '').trim();
          const over = m.outcomes?.find(o => o.desc?.toLowerCase().includes('over'));
          const under = m.outcomes?.find(o => o.desc?.toLowerCase().includes('under'));
          if (over && under) {
            markets.push({
              id: '19',
              marketId: '19',
              type: `home_total_${line}`,
              name: 'Home Total Goals',
              line: `Home Total ${line}`,
              specifier: m.specifier,
              outcomes: [
                { id: over.id, name: `Home Over ${line}`, odds: parseFloat(over.odds) },
                { id: under.id, name: `Home Under ${line}`, odds: parseFloat(under.odds) }
              ]
            });
          }
        }

        // K. Away Team Total Goals (Over/Under)
        if (m.id === '20' && m.specifier?.startsWith('total=')) {
          const line = m.specifier.replace('total=', '').trim();
          const over = m.outcomes?.find(o => o.desc?.toLowerCase().includes('over'));
          const under = m.outcomes?.find(o => o.desc?.toLowerCase().includes('under'));
          if (over && under) {
            markets.push({
              id: '20',
              marketId: '20',
              type: `away_total_${line}`,
              name: 'Away Total Goals',
              line: `Away Total ${line}`,
              specifier: m.specifier,
              outcomes: [
                { id: over.id, name: `Away Over ${line}`, odds: parseFloat(over.odds) },
                { id: under.id, name: `Away Under ${line}`, odds: parseFloat(under.odds) }
              ]
            });
          }
        }

        // L. Odd/Even Total Goals
        if (m.id === '26' || mDesc === 'odd/even') {
          const odd = m.outcomes?.find(o => o.desc?.toLowerCase() === 'odd');
          const even = m.outcomes?.find(o => o.desc?.toLowerCase() === 'even');
          if (odd && even) {
            markets.push({
              id: '26',
              marketId: '26',
              type: 'odd_even',
              name: 'Odd/Even Total Goals',
              line: 'Odd / Even',
              outcomes: [
                { id: odd.id, name: 'Odd', odds: parseFloat(odd.odds) },
                { id: even.id, name: 'Even', odds: parseFloat(even.odds) }
              ]
            });
          }
        }

        // M. Clean Sheet - Home & Away
        if (m.id === '21' || mDesc.includes('clean sheet home') || mDesc.includes('home clean sheet')) {
          const yes = m.outcomes?.find(o => o.desc?.toLowerCase() === 'yes');
          const no = m.outcomes?.find(o => o.desc?.toLowerCase() === 'no');
          if (yes && no) {
            markets.push({
              id: '21',
              marketId: '21',
              type: 'clean_sheet_home',
              name: 'Home Clean Sheet',
              line: 'Yes / No',
              outcomes: [
                { id: yes.id, name: 'Yes', odds: parseFloat(yes.odds) },
                { id: no.id, name: 'No', odds: parseFloat(no.odds) }
              ]
            });
          }
        }
        if (m.id === '22' || mDesc.includes('clean sheet away') || mDesc.includes('away clean sheet')) {
          const yes = m.outcomes?.find(o => o.desc?.toLowerCase() === 'yes');
          const no = m.outcomes?.find(o => o.desc?.toLowerCase() === 'no');
          if (yes && no) {
            markets.push({
              id: '22',
              marketId: '22',
              type: 'clean_sheet_away',
              name: 'Away Clean Sheet',
              line: 'Yes / No',
              outcomes: [
                { id: yes.id, name: 'Yes', odds: parseFloat(yes.odds) },
                { id: no.id, name: 'No', odds: parseFloat(no.odds) }
              ]
            });
          }
        }

        // N. 1st Half Both Teams to Score (1H GG/NG)
        if (m.id === '71' || (mDesc.includes('both teams to score') && mDesc.includes('1st half'))) {
          const yes = m.outcomes?.find(o => o.desc?.toLowerCase() === 'yes');
          const no = m.outcomes?.find(o => o.desc?.toLowerCase() === 'no');
          if (yes && no) {
            markets.push({
              id: '71',
              marketId: '71',
              type: '1h_btts',
              name: '1st Half Both Teams to Score',
              line: '1H Yes / No',
              outcomes: [
                { id: yes.id, name: '1H BTTS Yes', odds: parseFloat(yes.odds) },
                { id: no.id, name: '1H BTTS No', odds: parseFloat(no.odds) }
              ]
            });
          }
        }

        // O. 2nd Half 1X2
        if (m.id === '14' || (mDesc.includes('1x2') && mDesc.includes('2nd half'))) {
          const h = m.outcomes?.find(o => o.desc?.toLowerCase() === 'home' || o.desc?.toLowerCase() === '1');
          const d = m.outcomes?.find(o => o.desc?.toLowerCase() === 'draw' || o.desc?.toLowerCase() === 'x');
          const a = m.outcomes?.find(o => o.desc?.toLowerCase() === 'away' || o.desc?.toLowerCase() === '2');
          if (h && d && a) {
            markets.push({
              id: '14',
              marketId: '14',
              type: '2h_1x2',
              name: '2nd Half 1X2',
              line: '2nd Half',
              outcomes: [
                { id: h.id, name: '2nd Half Home', odds: parseFloat(h.odds) },
                { id: d.id, name: '2nd Half Draw', odds: parseFloat(d.odds) },
                { id: a.id, name: '2nd Half Away', odds: parseFloat(a.odds) }
              ]
            });
          }
        }

        // P. 2nd Half Over/Under
        if (m.id === '70' && m.specifier?.startsWith('total=')) {
          const line = m.specifier.replace('total=', '').trim();
          const over = m.outcomes?.find(o => o.desc?.toLowerCase().includes('over'));
          const under = m.outcomes?.find(o => o.desc?.toLowerCase().includes('under'));
          if (over && under) {
            markets.push({
              id: '70',
              marketId: '70',
              type: `2h_over_under_${line}`,
              name: '2nd Half Over/Under',
              line: `2H Total ${line}`,
              specifier: m.specifier,
              outcomes: [
                { id: over.id, name: `2H Over ${line}`, odds: parseFloat(over.odds) },
                { id: under.id, name: `2H Under ${line}`, odds: parseFloat(under.odds) }
              ]
            });
          }
        }
      }

      if (markets.length > 0) {
        const spTourn = ev.sport?.category?.tournament?.name || ev.tournamentName;
        const spCountry = ev.sport?.category?.name;
        const spComp = spTourn
          ? (spCountry && !spTourn.toLowerCase().includes(spCountry.toLowerCase()) ? `${spCountry} - ${spTourn}` : spTourn)
          : (spCountry || `${evSport} Tournament`);

        sportyMatches.push({
          id: ev.eventId,
          homeTeam: ev.homeTeamName,
          awayTeam: ev.awayTeamName,
          sport: evSport,
          competition: spComp,
          country: spCountry,
          startTime: new Date(ev.estimateStartTime).toISOString(),
          dateStr: new Date(ev.estimateStartTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
          isLive: false,
          markets
        });

        validSpEvents.push({ ev, evSport, spComp, spCountry });
      }
    }

    // 2. Concurrently Search & Map Betpawa Ghana matches in parallel batches of 8
    const CHUNK_SIZE = 8;
    for (let i = 0; i < validSpEvents.length; i += CHUNK_SIZE) {
      const chunk = validSpEvents.slice(i, i + CHUNK_SIZE);
      const settled = await Promise.allSettled(
        chunk.map(item => this._mapBetpawaForEvent(item.ev, bpHeaders, item.evSport, item.spComp, item.spCountry))
      );
      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value) {
          betpawaMatches.push(s.value);
        }
      }
    }
  } catch(err) {
    console.warn('[LiveFeedManager] SportyBet fetch error:', err.message);
  }

    // 3. Fetch live 1xBet Ghana matches
    try {
  const oneX = await this.connectors['1xBet Ghana'].fetchOdds();
  if (oneX && oneX.length > 0) {
    oneXMatches.push(...oneX);
  }
} catch (err) {
  console.warn('[LiveFeedManager] 1xBet fetch error:', err.message);
}

// 4. Fetch live Soccabet Ghana matches
const soccabetMatches = [];
try {
  const socca = await this.connectors['Soccabet Ghana'].fetchOdds();
  if (socca && socca.length > 0) {
    soccabetMatches.push(...socca);
  }
} catch (err) {
  console.warn('[LiveFeedManager] Soccabet fetch error:', err.message);
}

// 5. Fetch live Betway Ghana matches
const betwayMatches = [];
try {
  const bway = await this.connectors['Betway Ghana'].fetchOdds();
  if (bway && bway.length > 0) {
    betwayMatches.push(...bway);
  }
} catch (err) {
  console.warn('[LiveFeedManager] Betway fetch error:', err.message);
}

return [
  { bookmaker: 'Sportybet', matches: sportyMatches },
  { bookmaker: 'Betpawa Ghana', matches: betpawaMatches },
  { bookmaker: '1xBet Ghana', matches: oneXMatches },
  { bookmaker: 'Soccabet Ghana', matches: soccabetMatches },
  { bookmaker: 'Betway Ghana', matches: betwayMatches }
];
  }

  /**
   * Returns bookers map for booking code generation
   */

  /**
   * Generates prioritized search query candidates for matching Betpawa fixtures
   * @param {string} homeName
   * @param {string} awayName
   * @returns {string[]}
   */
  _getSearchQueries(homeName, awayName) {
    const queries = [];
    const addQuery = (q) => {
      const trimmed = (q || '').trim();
      if (trimmed.length >= 3 && !queries.some(existing => existing.toLowerCase() === trimmed.toLowerCase())) {
        queries.push(trimmed);
      }
    };

    // 1. Longest significant word from cleaned home name
    const cleanHome = cleanTeamName(homeName);
    const homeWords = cleanHome.split(/\s+/).filter(w => w.length >= 3);
    if (homeWords.length > 0) {
      addQuery(homeWords.sort((a, b) => b.length - a.length)[0]);
    }

    // 2. Longest word from raw home name (ignoring noise words)
    const rawHomeWords = (homeName || '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => !['fc', 'sc', 'cf', 'fk', 'u19', 'u20', 'u21', 'women', 'ladies'].includes(w.toLowerCase()) && w.length >= 3);
    if (rawHomeWords.length > 0) {
      addQuery(rawHomeWords.sort((a, b) => b.length - a.length)[0]);
    }

    // 3. Fallback: Longest word from cleaned away name
    const cleanAway = cleanTeamName(awayName);
    const awayWords = cleanAway.split(/\s+/).filter(w => w.length >= 3);
    if (awayWords.length > 0) {
      addQuery(awayWords.sort((a, b) => b.length - a.length)[0]);
    }

    // 4. Raw away word
    const rawAwayWords = (awayName || '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => !['fc', 'sc', 'cf', 'fk', 'u19', 'u20', 'u21', 'women', 'ladies'].includes(w.toLowerCase()) && w.length >= 3);
    if (rawAwayWords.length > 0) {
      addQuery(rawAwayWords.sort((a, b) => b.length - a.length)[0]);
    }

    return queries;
  }

  /**
   * Concurrently searches, maps and parses Betpawa Ghana markets for a given match
   * @param {Object} ev SportyBet event object
   * @param {Object} bpHeaders HTTP headers
   * @param {string} evSport Sport name
   * @param {string} spComp Competition name
   * @param {string} spCountry Country name
   * @returns {Promise<Object|null>}
   */
  async _mapBetpawaForEvent(ev, bpHeaders, evSport, spComp, spCountry) {
  // 2. Search & Map matching event on Betpawa Ghana across all lines
  try {
    const queries = this._getSearchQueries(ev.homeTeamName, ev.awayTeamName);
    if (queries.length > 0) {
      const fixtureCacheKey = `${ev.homeTeamName}-${ev.awayTeamName}`.toLowerCase();
      const cached = this.betpawaEventCache.get(fixtureCacheKey);
      let bpEv;

      const CACHE_TTL_MS = 30 * 60 * 1000;
      if (cached && (Date.now() - cached.ts < CACHE_TTL_MS)) {
        bpEv = cached.data;
      } else {
        bpEv = null;
        for (const teamQuery of queries) {
          try {
            const bpSearchRes = await fetch(`https://www.betpawa.com.gh/api/sportsbook/v3/search?name=${encodeURIComponent(teamQuery)}&_t=${Date.now()}`, {
              headers: bpHeaders,
              signal: AbortSignal.timeout(3500)
            });
            if (bpSearchRes.ok) {
              const bpSearch = await bpSearchRes.json();
              const candidates = bpSearch.events || [];

              for (const cand of candidates) {
                // Match sport category
                if (cand.category?.name && evSport) {
                  const cName = cand.category.name.toLowerCase();
                  const sName = evSport.toLowerCase();
                  if (cName !== sName && !cName.includes(sName) && !sName.includes(cName)) {
                    continue;
                  }
                }

                const candP1 = cand.participants?.[0]?.name;
                const candP2 = cand.participants?.[1]?.name;
                let candHome = candP1;
                let candAway = candP2;
                if (!candHome || !candAway) {
                  const parts = (cand.name || '').split(/\s+-\s+|\s+vs\.?\s+/i);
                  candHome = parts[0]?.trim();
                  candAway = parts[1]?.trim();
                }
                if (!candHome || !candAway) continue;

                // Rigorous verification: checks sport, teams, league/competition, gender, kickoff
                const matches = isMatchEqual(
                  {
                    homeTeam: ev.homeTeamName,
                    awayTeam: ev.awayTeamName,
                    sport: evSport,
                    competition: spComp,
                    country: spCountry,
                    startTime: new Date(ev.estimateStartTime).toISOString()
                  },
                  {
                    homeTeam: candHome,
                    awayTeam: candAway,
                    sport: cand.category?.name || evSport,
                    competition: cand.competition?.name,
                    country: cand.region?.name,
                    startTime: cand.startTime
                  }
                );

                if (matches) {
                  bpEv = {
                    ...cand,
                    verifiedHome: candHome,
                    verifiedAway: candAway
                  };
                  break;
                }
              }
            }
          } catch (e) {
            // Ignore timeout on individual query attempt and try next candidate
          }
          if (bpEv) break; // Match found, avoid redundant network requests
        }

        this.betpawaEventCache.set(fixtureCacheKey, { data: bpEv, ts: Date.now() });
      }

      if (bpEv) {
        const bpEvId = bpEv.id;
        const bpEvRes = await fetch(`https://www.betpawa.com.gh/api/sportsbook/v4/events/${bpEvId}?_t=${Date.now()}`, {
          headers: bpHeaders,
          signal: AbortSignal.timeout(3500)
        });
        if (bpEvRes.ok) {
          const bpFull = await bpEvRes.json();
          const bpMarkets = [];

          // A. Betpawa 1X2 Full Time
          const bp1X2 = bpFull.markets?.find(bm => (bm.marketType?.name || '').toLowerCase() === '1x2 - ft');
          if (bp1X2) {
            let hPrice, dPrice, aPrice;
            for (const r of bp1X2.row || []) {
              for (const p of r.prices || []) {
                if (p.name === '1') hPrice = p;
                if (p.name === 'X') dPrice = p;
                if (p.name === '2') aPrice = p;
              }
            }
            if (hPrice && dPrice && aPrice) {
              bpMarkets.push({
                id: '1000',
                marketId: '1000',
                type: '1x2',
                name: '1X2 (Full Time)',
                line: 'Full Time',
                outcomes: [
                  { id: String(hPrice.id), name: 'Home', odds: parseFloat(hPrice.odds) },
                  { id: String(dPrice.id), name: 'Draw', odds: parseFloat(dPrice.odds) },
                  { id: String(aPrice.id), name: 'Away', odds: parseFloat(aPrice.odds) }
                ]
              });
            }
          }

          // A2. Betpawa 2-Way Moneyline / Winner (Basketball, Tennis, etc.)
          const bpWinner = bpFull.markets?.find(bm => {
            const n = (bm.marketType?.name || '').toLowerCase();
            return n === 'winner' || n === 'head to head' || n === '1 2' || n === 'moneyline' || n.includes('match winner');
          });
          if (bpWinner) {
            let hPrice, aPrice;
            for (const r of bpWinner.row || []) {
              for (const p of r.prices || []) {
                if (p.name === '1' || p.name?.toLowerCase() === 'home') hPrice = p;
                if (p.name === '2' || p.name?.toLowerCase() === 'away') aPrice = p;
              }
            }
            if (hPrice && aPrice) {
              bpMarkets.push({
                id: '2190',
                marketId: '2190',
                type: 'moneyline',
                name: 'Moneyline (Winner)',
                line: 'Head to Head',
                outcomes: [
                  { id: String(hPrice.id), name: 'Home', odds: parseFloat(hPrice.odds) },
                  { id: String(aPrice.id), name: 'Away', odds: parseFloat(aPrice.odds) }
                ]
              });
            }
          }

          // B. Betpawa All Over/Under Lines (0.5, 1.5, 2.5, 3.5, 4.5, 5.5) Full Time
          const ouMkt = bpFull.markets?.find(bm => {
            const n = (bm.marketType?.name || '').toLowerCase();
            return n.includes('total score over/under') && !n.includes('corner') && !n.includes('card') && !n.includes('1h') && !n.includes('2h') && !n.includes('half');
          });
          if (ouMkt) {
            const handicapGroups = new Map();
            for (const r of ouMkt.row || []) {
              for (const p of r.prices || []) {
                if (p.handicap) {
                  if (!handicapGroups.has(p.handicap)) handicapGroups.set(p.handicap, {});
                  if (p.name?.toLowerCase() === 'over') handicapGroups.get(p.handicap).over = p;
                  if (p.name?.toLowerCase() === 'under') handicapGroups.get(p.handicap).under = p;
                }
              }
            }

            for (const [line, pair] of handicapGroups.entries()) {
              if (pair.over && pair.under) {
                bpMarkets.push({
                  id: '5000',
                  marketId: '5000',
                  type: `over_under_${line}`,
                  name: 'Over/Under Goals',
                  line: `Total ${line}`,
                  outcomes: [
                    { id: String(pair.over.id), name: `Over ${line}`, odds: parseFloat(pair.over.odds) },
                    { id: String(pair.under.id), name: `Under ${line}`, odds: parseFloat(pair.under.odds) }
                  ]
                });
              }
            }
          }

          // C. Betpawa Both Teams To Score (Full Time only)
          const bttsMkt = bpFull.markets?.find(bm => {
            const n = (bm.marketType?.name || '').toLowerCase();
            return n.includes('both teams to score') && !n.includes('corner') && !n.includes('card') && !n.includes('1h') && !n.includes('2h') && !n.includes('half');
          });
          if (bttsMkt) {
            let yesPrice, noPrice;
            for (const r of bttsMkt.row || []) {
              for (const p of r.prices || []) {
                if (p.name?.toLowerCase() === 'yes') yesPrice = p;
                if (p.name?.toLowerCase() === 'no') noPrice = p;
              }
            }
            if (yesPrice && noPrice) {
              bpMarkets.push({
                id: '5005',
                marketId: '5005',
                type: 'btts',
                name: 'Both Teams To Score',
                line: 'Yes / No',
                outcomes: [
                  { id: String(yesPrice.id), name: 'Yes', odds: parseFloat(yesPrice.odds) },
                  { id: String(noPrice.id), name: 'No', odds: parseFloat(noPrice.odds) }
                ]
              });
            }
          }

          // D. Betpawa 1st Half 1X2
          const bpHalf1X2 = bpFull.markets?.find(bm => (bm.marketType?.name || '').toLowerCase() === '1x2 - 1h');
          if (bpHalf1X2) {
            let hPrice, dPrice, aPrice;
            for (const r of bpHalf1X2.row || []) {
              for (const p of r.prices || []) {
                if (p.name === '1') hPrice = p;
                if (p.name === 'X') dPrice = p;
                if (p.name === '2') aPrice = p;
              }
            }
            if (hPrice && dPrice && aPrice) {
              bpMarkets.push({
                id: '1060',
                marketId: '1060',
                type: '1h_1x2',
                name: '1st Half 1X2',
                line: '1st Half',
                outcomes: [
                  { id: String(hPrice.id), name: '1st Half Home', odds: parseFloat(hPrice.odds) },
                  { id: String(dPrice.id), name: '1st Half Draw', odds: parseFloat(dPrice.odds) },
                  { id: String(aPrice.id), name: '1st Half Away', odds: parseFloat(aPrice.odds) }
                ]
              });
            }
          }

          // E. Betpawa Draw No Bet (Full Time only)
          const bpDnb = bpFull.markets?.find(bm => {
            const n = (bm.marketType?.name || '').toLowerCase();
            return n.includes('draw no bet') && !n.includes('corner') && !n.includes('card') && !n.includes('1h') && !n.includes('2h') && !n.includes('half');
          });
          if (bpDnb) {
            let hPrice, aPrice;
            for (const r of bpDnb.row || []) {
              for (const p of r.prices || []) {
                if (p.name === '1' || p.name?.toLowerCase() === 'home') hPrice = p;
                if (p.name === '2' || p.name?.toLowerCase() === 'away') aPrice = p;
              }
            }
            if (hPrice && aPrice) {
              bpMarkets.push({
                id: '5002',
                marketId: '5002',
                type: 'dnb',
                name: 'Draw No Bet',
                line: 'Draw No Bet',
                outcomes: [
                  { id: String(hPrice.id), name: 'Home', odds: parseFloat(hPrice.odds) },
                  { id: String(aPrice.id), name: 'Away', odds: parseFloat(aPrice.odds) }
                ]
              });
            }
          }

          // F. Betpawa Double Chance (Full Time only)
          const bpDc = bpFull.markets?.find(bm => {
            const n = (bm.marketType?.name || '').toLowerCase();
            return (n === 'double chance - ft' || n === 'double chance') && !n.includes('corner') && !n.includes('card') && !n.includes('1h') && !n.includes('2h') && !n.includes('half') && !n.includes('both') && !n.includes('total') && !n.includes('1up') && !n.includes('2up');
          });
          if (bpDc) {
            let hxPrice, haPrice, axPrice;
            for (const r of bpDc.row || []) {
              for (const p of r.prices || []) {
                const pn = (p.name || '').toLowerCase();
                if (pn === '1x' || pn === '1 or x') hxPrice = p;
                if (pn === '12' || pn === '1 or 2') haPrice = p;
                if (pn === 'x2' || pn === 'x or 2') axPrice = p;
              }
            }
            if (hxPrice && haPrice && axPrice) {
              bpMarkets.push({
                id: '5010',
                marketId: '5010',
                type: 'double_chance',
                name: 'Double Chance',
                line: 'Double Chance',
                outcomes: [
                  { id: String(hxPrice.id), name: '1X', odds: parseFloat(hxPrice.odds) },
                  { id: String(haPrice.id), name: '12', odds: parseFloat(haPrice.odds) },
                  { id: String(axPrice.id), name: 'X2', odds: parseFloat(axPrice.odds) }
                ]
              });
            }
          }

          // G. Betpawa Handicaps (Asian & European Full Time only - strictly exclude corners, cards, halves)
          const bpHcp = bpFull.markets?.filter(bm => {
            const n = (bm.marketType?.name || '').toLowerCase();
            if (n.includes('corner') || n.includes('card') || n.includes('booking') || n.includes('foul') || n.includes('1h') || n.includes('2h') || n.includes('half') || n.includes('period') || n.includes('1up') || n.includes('2up')) {
              return false;
            }
            return n.includes('handicap');
          });
          for (const bm of bpHcp || []) {
            const bmName = (bm.marketType?.name || '').toLowerCase();
            const is2Way = bmName.includes('asian') || bmName.includes('2-way') || bmName.includes('2 way');

            if (is2Way) {
              const homePrices = [];
              const awayPrices = [];
              for (const r of bm.row || []) {
                for (const p of r.prices || []) {
                  if (p.handicap !== undefined) {
                    const pn = (p.name || '').toLowerCase();
                    if (pn === '1' || pn === 'home') homePrices.push(p);
                    if (pn === '2' || pn === 'away') awayPrices.push(p);
                  }
                }
              }
              for (const hp of homePrices) {
                const hVal = parseFloat(hp.handicap);
                const targetAwayVal = -hVal;
                const ap = awayPrices.find(p => Math.abs(parseFloat(p.handicap) - targetAwayVal) < 0.001);
                if (ap) {
                  const hKey = hVal > 0 ? `+${hVal}` : String(hVal);
                  const aKey = targetAwayVal > 0 ? `+${targetAwayVal}` : String(targetAwayVal);
                  bpMarkets.push({
                    id: '5064',
                    marketId: '5064',
                    type: `asian_handicap_${hKey}`,
                    name: 'Asian Handicap',
                    line: `Handicap ${hKey}`,
                    outcomes: [
                      { id: String(hp.id), name: `Home (${hKey})`, odds: parseFloat(hp.odds) },
                      { id: String(ap.id), name: `Away (${aKey})`, odds: parseFloat(ap.odds) }
                    ]
                  });
                }
              }
            } else {
              const hcpGroups = new Map();
              for (const r of bm.row || []) {
                for (const p of r.prices || []) {
                  if (p.handicap !== undefined) {
                    const hKey = String(p.handicap);
                    if (!hcpGroups.has(hKey)) hcpGroups.set(hKey, {});
                    const pn = (p.name || '').toLowerCase();
                    if (pn === '1' || pn === 'home') hcpGroups.get(hKey).home = p;
                    if (pn === 'x' || pn === 'draw') hcpGroups.get(hKey).draw = p;
                    if (pn === '2' || pn === 'away') hcpGroups.get(hKey).away = p;
                  }
                }
              }
              for (const [hKey, group] of hcpGroups.entries()) {
                if (group.home && group.draw && group.away) {
                  bpMarkets.push({
                    id: '5016',
                    marketId: '5016',
                    type: `euro_handicap_${hKey}`,
                    name: 'European Handicap (3-Way)',
                    line: `Handicap ${hKey}`,
                    outcomes: [
                      { id: String(group.home.id), name: `Home (${hKey})`, odds: parseFloat(group.home.odds) },
                      { id: String(group.draw.id), name: `Draw (${hKey})`, odds: parseFloat(group.draw.odds) },
                      { id: String(group.away.id), name: `Away (${hKey})`, odds: parseFloat(group.away.odds) }
                    ]
                  });
                }
              }
            }
          }

          // H. Betpawa Team 1 (Home) Total Goals (Full Time only)
          const bpHtOu = bpFull.markets?.find(bm => {
            const n = (bm.marketType?.name || '').toLowerCase();
            return (n.includes('team 1 total') || n.includes('home total')) && !n.includes('corner') && !n.includes('card') && !n.includes('1h') && !n.includes('2h') && !n.includes('half');
          });
          if (bpHtOu) {
            const hGroups = new Map();
            for (const r of bpHtOu.row || []) {
              for (const p of r.prices || []) {
                if (p.handicap) {
                  if (!hGroups.has(p.handicap)) hGroups.set(p.handicap, {});
                  if (p.name?.toLowerCase() === 'over') hGroups.get(p.handicap).over = p;
                  if (p.name?.toLowerCase() === 'under') hGroups.get(p.handicap).under = p;
                }
              }
            }
            for (const [line, pair] of hGroups.entries()) {
              if (pair.over && pair.under) {
                bpMarkets.push({
                  id: '5019',
                  marketId: '5019',
                  type: `home_total_${line}`,
                  name: 'Home Total Goals',
                  line: `Home Total ${line}`,
                  outcomes: [
                    { id: String(pair.over.id), name: `Home Over ${line}`, odds: parseFloat(pair.over.odds) },
                    { id: String(pair.under.id), name: `Home Under ${line}`, odds: parseFloat(pair.under.odds) }
                  ]
                });
              }
            }
          }

          // I. Betpawa Team 2 (Away) Total Goals (Full Time only)
          const bpAtOu = bpFull.markets?.find(bm => {
            const n = (bm.marketType?.name || '').toLowerCase();
            return (n.includes('team 2 total') || n.includes('away total')) && !n.includes('corner') && !n.includes('card') && !n.includes('1h') && !n.includes('2h') && !n.includes('half');
          });
          if (bpAtOu) {
            const aGroups = new Map();
            for (const r of bpAtOu.row || []) {
              for (const p of r.prices || []) {
                if (p.handicap) {
                  if (!aGroups.has(p.handicap)) aGroups.set(p.handicap, {});
                  if (p.name?.toLowerCase() === 'over') aGroups.get(p.handicap).over = p;
                  if (p.name?.toLowerCase() === 'under') aGroups.get(p.handicap).under = p;
                }
              }
            }
            for (const [line, pair] of aGroups.entries()) {
              if (pair.over && pair.under) {
                bpMarkets.push({
                  id: '5020',
                  marketId: '5020',
                  type: `away_total_${line}`,
                  name: 'Away Total Goals',
                  line: `Away Total ${line}`,
                  outcomes: [
                    { id: String(pair.over.id), name: `Away Over ${line}`, odds: parseFloat(pair.over.odds) },
                    { id: String(pair.under.id), name: `Away Under ${line}`, odds: parseFloat(pair.under.odds) }
                  ]
                });
              }
            }
          }

          // J. Betpawa Odd/Even Total Goals (Full Time only)
          const bpOddEven = bpFull.markets?.find(bm => {
            const n = (bm.marketType?.name || '').toLowerCase();
            return n.includes('odd/even') && !n.includes('corner') && !n.includes('card') && !n.includes('1h') && !n.includes('2h');
          });
          if (bpOddEven) {
            let oddP, evenP;
            for (const r of bpOddEven.row || []) {
              for (const p of r.prices || []) {
                if (p.name?.toLowerCase() === 'odd') oddP = p;
                if (p.name?.toLowerCase() === 'even') evenP = p;
              }
            }
            if (oddP && evenP) {
              bpMarkets.push({
                id: '5026',
                marketId: '5026',
                type: 'odd_even',
                name: 'Odd/Even Total Goals',
                line: 'Odd / Even',
                outcomes: [
                  { id: String(oddP.id), name: 'Odd', odds: parseFloat(oddP.odds) },
                  { id: String(evenP.id), name: 'Even', odds: parseFloat(evenP.odds) }
                ]
              });
            }
          }

          // K. Betpawa Clean Sheet - Home & Away
          const bpHCS = bpFull.markets?.find(bm => {
            const n = (bm.marketType?.name || '').toLowerCase();
            return n.includes('clean sheet') && (n.includes('team 1') || n.includes('home'));
          });
          if (bpHCS) {
            let yesP, noP;
            for (const r of bpHCS.row || []) {
              for (const p of r.prices || []) {
                if (p.name?.toLowerCase() === 'yes') yesP = p;
                if (p.name?.toLowerCase() === 'no') noP = p;
              }
            }
            if (yesP && noP) {
              bpMarkets.push({
                id: '5021',
                marketId: '5021',
                type: 'clean_sheet_home',
                name: 'Home Clean Sheet',
                line: 'Yes / No',
                outcomes: [
                  { id: String(yesP.id), name: 'Yes', odds: parseFloat(yesP.odds) },
                  { id: String(noP.id), name: 'No', odds: parseFloat(noP.odds) }
                ]
              });
            }
          }

          const bpACS = bpFull.markets?.find(bm => {
            const n = (bm.marketType?.name || '').toLowerCase();
            return n.includes('clean sheet') && (n.includes('team 2') || n.includes('away'));
          });
          if (bpACS) {
            let yesP, noP;
            for (const r of bpACS.row || []) {
              for (const p of r.prices || []) {
                if (p.name?.toLowerCase() === 'yes') yesP = p;
                if (p.name?.toLowerCase() === 'no') noP = p;
              }
            }
            if (yesP && noP) {
              bpMarkets.push({
                id: '5022',
                marketId: '5022',
                type: 'clean_sheet_away',
                name: 'Away Clean Sheet',
                line: 'Yes / No',
                outcomes: [
                  { id: String(yesP.id), name: 'Yes', odds: parseFloat(yesP.odds) },
                  { id: String(noP.id), name: 'No', odds: parseFloat(noP.odds) }
                ]
              });
            }
          }

          // L. Betpawa 1st Half BTTS
          const bp1HBtts = bpFull.markets?.find(bm => {
            const n = (bm.marketType?.name || '').toLowerCase();
            return n.includes('both teams to score') && (n.includes('1h') || n.includes('first half'));
          });
          if (bp1HBtts) {
            let yesP, noP;
            for (const r of bp1HBtts.row || []) {
              for (const p of r.prices || []) {
                if (p.name?.toLowerCase() === 'yes') yesP = p;
                if (p.name?.toLowerCase() === 'no') noP = p;
              }
            }
            if (yesP && noP) {
              bpMarkets.push({
                id: '5071',
                marketId: '5071',
                type: '1h_btts',
                name: '1st Half Both Teams to Score',
                line: '1H Yes / No',
                outcomes: [
                  { id: String(yesP.id), name: '1H BTTS Yes', odds: parseFloat(yesP.odds) },
                  { id: String(noP.id), name: '1H BTTS No', odds: parseFloat(noP.odds) }
                ]
              });
            }
          }

          // M. Betpawa 2nd Half 1X2
          const bp2H1x2 = bpFull.markets?.find(bm => (bm.marketType?.name || '').toLowerCase() === '1x2 - 2h');
          if (bp2H1x2) {
            let hP, dP, aP;
            for (const r of bp2H1x2.row || []) {
              for (const p of r.prices || []) {
                if (p.name === '1') hP = p;
                if (p.name === 'X') dP = p;
                if (p.name === '2') aP = p;
              }
            }
            if (hP && dP && aP) {
              bpMarkets.push({
                id: '5014',
                marketId: '5014',
                type: '2h_1x2',
                name: '2nd Half 1X2',
                line: '2nd Half',
                outcomes: [
                  { id: String(hP.id), name: '2nd Half Home', odds: parseFloat(hP.odds) },
                  { id: String(dP.id), name: '2nd Half Draw', odds: parseFloat(dP.odds) },
                  { id: String(aP.id), name: '2nd Half Away', odds: parseFloat(aP.odds) }
                ]
              });
            }
          }

          // N. Betpawa 2nd Half Over/Under
          const bp2HOu = bpFull.markets?.find(bm => {
            const n = (bm.marketType?.name || '').toLowerCase();
            return n.includes('total score over/under') && (n.includes('2h') || n.includes('second half'));
          });
          if (bp2HOu) {
            const half2Groups = new Map();
            for (const r of bp2HOu.row || []) {
              for (const p of r.prices || []) {
                if (p.handicap) {
                  if (!half2Groups.has(p.handicap)) half2Groups.set(p.handicap, {});
                  if (p.name?.toLowerCase() === 'over') half2Groups.get(p.handicap).over = p;
                  if (p.name?.toLowerCase() === 'under') half2Groups.get(p.handicap).under = p;
                }
              }
            }
            for (const [line, pair] of half2Groups.entries()) {
              if (pair.over && pair.under) {
                bpMarkets.push({
                  id: '5070',
                  marketId: '5070',
                  type: `2h_over_under_${line}`,
                  name: '2nd Half Over/Under',
                  line: `2H Total ${line}`,
                  outcomes: [
                    { id: String(pair.over.id), name: `2H Over ${line}`, odds: parseFloat(pair.over.odds) },
                    { id: String(pair.under.id), name: `2H Under ${line}`, odds: parseFloat(pair.under.odds) }
                  ]
                });
              }
            }
          }

          if (bpMarkets.length > 0) {
            const realBpHome = bpEv.verifiedHome || bpEv.participants?.[0]?.name || ev.homeTeamName;
            const realBpAway = bpEv.verifiedAway || bpEv.participants?.[1]?.name || ev.awayTeamName;
            const realBpComp = bpFull.competition?.name || bpEv.competition?.name || spComp;

            return {
              id: bpFull.id || bpEvId,
              homeTeam: realBpHome,
              awayTeam: realBpAway,
              sport: bpEv.category?.name || evSport,
              competition: realBpComp,
              country: bpEv.region?.name || spCountry,
              startTime: bpFull.startTime || new Date(ev.estimateStartTime).toISOString(),
              dateStr: new Date(ev.estimateStartTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
              isLive: false,
              markets: bpMarkets
            };
          }
        }
      }
    }
  } catch (e) {
    console.warn('[LiveFeedManager] Betpawa matching error:', e.message);
  }

  return null;
}

getBookers() {
  return this.connectors;
}
}
