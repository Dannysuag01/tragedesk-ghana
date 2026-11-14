import { BaseBookmaker } from './base.js';
import { formatProxyUrl } from '../utils/proxy_helper.js';

/**
 * 1xBet Ghana Connector
 * Connects directly to 1xBet Ghana's public pre-match service API.
 * Strictly Pre-Match Only (Filters out live fixtures).
 * Dynamically discovers upcoming matches via bulk endpoints.
 *
 * If all endpoints return HTML (Cloudflare challenge), the connector
 * backs off for 5 minutes before retrying to avoid wasting scan time.
 */
export class OneXBetLiveConnector extends BaseBookmaker {
  constructor() {
    super('1xBet Ghana', 'https://1xbet.com.gh');
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*'
    };

    // 15-second event-list cache
    this._cachedEventIds = null;
    this._cacheTimestamp = 0;
    this._cacheTTL = 15_000; // ms

    // Cloudflare/HTML-block cooldown: skip entirely for 5 min after detection
    this._blockedUntil = 0;
    this._BLOCK_COOLDOWN = 5 * 60 * 1000;
    this._consecutiveHtmlFailures = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: detect HTML (Cloudflare) responses
  // ─────────────────────────────────────────────────────────────────────────

  _isHtmlResponse(res) {
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    return ct.includes('text/html');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Event-list discovery
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Try multiple bulk endpoints in order and return the first successfully
   * parsed list of game IDs (integers).
   * @returns {Promise<number[]>}
   */
  async _fetchEventIds() {
    const endpoints = [
      `${this.baseUrl}/LineFeed/Get1x2_Zip?sports=1,2,3,4,10&count=50&lng=en&mode=4`,
      `${this.baseUrl}/LineFeed/GetSportsZip?sports=1,2,3,4,10&lng=en&tf=10800&tz=0&country=97&gr=176`,
      `${this.baseUrl}/LineFeed/Get1x2_3?SportId=1&Count=50&lng=en&tf=10800&tz=0`,
      `${this.baseUrl}/service-api/LineFeed/GetSportsZip?sports=1,2,3,4,10&lng=en&tf=10800&tz=0&country=97&gr=176`,
      `${this.baseUrl}/service-api/LineFeed/Get1x2_3?SportId=1&Count=50&lng=en&tf=10800&tz=0`
    ];

    let htmlCount = 0;

    for (const url of endpoints) {
      try {
        const res = await fetch(formatProxyUrl(url), {
          headers: this.headers,
          signal: AbortSignal.timeout(2500)
        });
        if (!res.ok) continue;

        // Detect Cloudflare HTML challenge — stop trying further endpoints
        if (this._isHtmlResponse(res)) {
          htmlCount++;
          if (htmlCount >= 2) {
            // Two HTML responses in a row = definitely Cloudflare-blocked
            console.warn('[1xBet Ghana] Cloudflare block detected — entering cooldown');
            this._blockedUntil = Date.now() + this._BLOCK_COOLDOWN;
            this._consecutiveHtmlFailures++;
            return [];
          }
          continue;
        }

        const data = await res.json();
        const ids = this._parseEventIds(data);
        if (ids && ids.length > 0) {
          this._consecutiveHtmlFailures = 0; // Reset on success
          return ids;
        }
      } catch (err) {
        // JSON parse error on HTML body or network failure
        if (err.message && err.message.includes('<!DOCTYPE')) {
          htmlCount++;
          if (htmlCount >= 2) {
            console.warn('[1xBet Ghana] Cloudflare block detected — entering cooldown');
            this._blockedUntil = Date.now() + this._BLOCK_COOLDOWN;
            this._consecutiveHtmlFailures++;
            return [];
          }
        }
      }
    }

    return [];
  }

  /**
   * Extract game IDs from the varying response structures.
   * - Flat array: data.Value = [{I: id, ...}, ...]
   * - Grouped:    data.Value.GC = [{E: [{I: id}], ...}, ...]
   */
  _parseEventIds(data) {
    const ids = [];

    const extractFromEvent = (e) => {
      if (e && (e.I || e.id)) {
        const id = e.I || e.id;
        // Sanity: real event IDs are large numbers (>1000), not sport category IDs
        if (typeof id === 'number' && id > 100) {
          ids.push(id);
        }
      }
    };

    try {
      const val = data.Value;

      if (!val) return ids;

      // Grouped structure: val.GC[].E[].I
      if (val.GC && Array.isArray(val.GC)) {
        for (const group of val.GC) {
          if (Array.isArray(group.E)) {
            group.E.forEach(extractFromEvent);
          }
        }
        return ids;
      }

      // Flat array: val = [{I: id}, ...]
      if (Array.isArray(val)) {
        val.forEach(extractFromEvent);
        return ids;
      }

      // Some endpoints return val.V or val.d
      if (Array.isArray(val.V)) {
        val.V.forEach(extractFromEvent);
        return ids;
      }
    } catch (err) {
      console.warn('[1xBet Ghana] Event ID parse error:', err.message);
    }

    return ids;
  }

  /**
   * Returns cached event IDs if still fresh, otherwise fetches them.
   * Never uses stale cache — if discovery fails, returns [].
   * @returns {Promise<number[]>}
   */
  async _getEventIds() {
    const now = Date.now();
    if (this._cachedEventIds !== null && (now - this._cacheTimestamp) < this._cacheTTL) {
      return this._cachedEventIds;
    }

    const ids = await this._fetchEventIds();
    // Always update cache — empty list means blocked, don't keep stale data
    this._cachedEventIds = ids;
    this._cacheTimestamp = now;

    if (ids.length === 0) {
      // Silently return empty; the cooldown will suppress further attempts
    }

    return this._cachedEventIds;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Market extraction helpers
  // ─────────────────────────────────────────────────────────────────────────

  _extractMarkets(g) {
    const markets = [];
    if (!g.E) return markets;

    const ci = g.CI;

    // 1. 1X2 (3-way) or Moneyline (2-way)
    const h1x2 = g.E.find(e => e.T === 1);
    const d1x2 = g.E.find(e => e.T === 2);
    const a1x2 = g.E.find(e => e.T === 3);
    if (h1x2 && a1x2) {
      if (d1x2) {
        markets.push({
          id: '1',
          type: '1x2',
          name: '1X2',
          outcomes: [
            { id: `${ci}_1`, name: 'Home', odds: parseFloat(h1x2.C), eventId: String(ci) },
            { id: `${ci}_X`, name: 'Draw', odds: parseFloat(d1x2.C), eventId: String(ci) },
            { id: `${ci}_2`, name: 'Away', odds: parseFloat(a1x2.C), eventId: String(ci) }
          ]
        });
      } else {
        markets.push({
          id: '219',
          type: 'moneyline',
          name: 'Moneyline (Winner)',
          line: 'Head to Head',
          outcomes: [
            { id: `${ci}_1`, name: 'Home', odds: parseFloat(h1x2.C), eventId: String(ci) },
            { id: `${ci}_2`, name: 'Away', odds: parseFloat(a1x2.C), eventId: String(ci) }
          ]
        });
      }
    }

    // 2. Over/Under - full-time (any total line including Basketball/Tennis)
    const seenLines = new Set();
    const candidateLines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
    // Gather all distinct P values from full-time over/under entries (strictly exclude 1st half G=2, 2nd half G=3, corners)
    for (const e of g.E) {
      if ((!e.G || e.G === 1 || e.G === 17) && (e.T === 7 || e.T === 9) && typeof e.P === 'number') candidateLines.push(e.P);
    }
    for (const line of candidateLines) {
      if (seenLines.has(line)) continue;
      seenLines.add(line);
      const over  = g.E.find(e => (!e.G || e.G === 1 || e.G === 17) && (e.T === 7 || e.T === 9)  && e.P === line);
      const under = g.E.find(e => (!e.G || e.G === 1 || e.G === 17) && (e.T === 8 || e.T === 10) && e.P === line);
      if (over && under) {
        markets.push({
          id: '18',
          type: `over_under_${line}`,
          name: 'Total Over/Under',
          line: `Total ${line}`,
          specifier: `total=${line}`,
          outcomes: [
            { id: `${ci}_o${line}`, name: `Over ${line}`,  odds: parseFloat(over.C),  eventId: String(ci) },
            { id: `${ci}_u${line}`, name: `Under ${line}`, odds: parseFloat(under.C), eventId: String(ci) }
          ]
        });
      }
    }

    // 3. BTTS (Group 62, T: 13=Yes, 14=No)
    const bttsYes = g.E.find(e => e.T === 13 && e.G === 62);
    const bttsNo  = g.E.find(e => e.T === 14 && e.G === 62);
    if (bttsYes && bttsNo) {
      markets.push({
        id: '29',
        type: 'btts',
        name: 'Both Teams To Score',
        line: 'Yes / No',
        outcomes: [
          { id: `${ci}_yes`, name: 'Yes', odds: parseFloat(bttsYes.C), eventId: String(ci) },
          { id: `${ci}_no`,  name: 'No',  odds: parseFloat(bttsNo.C),  eventId: String(ci) }
        ]
      });
    }

    // 4. Double Chance (T: 4=1X, 5=12, 6=X2)
    const dc1X = g.E.find(e => e.T === 4);
    const dc12 = g.E.find(e => e.T === 5);
    const dcX2 = g.E.find(e => e.T === 6);
    if (dc1X && dc12 && dcX2) {
      markets.push({
        id: '10',
        type: 'double_chance',
        name: 'Double Chance',
        line: 'Double Chance',
        outcomes: [
          { id: `${ci}_1x`, name: '1X', odds: parseFloat(dc1X.C), eventId: String(ci) },
          { id: `${ci}_12`, name: '12', odds: parseFloat(dc12.C), eventId: String(ci) },
          { id: `${ci}_x2`, name: 'X2', odds: parseFloat(dcX2.C), eventId: String(ci) }
        ]
      });
    }

    // 5. Asian Handicaps (Group 3, T: 1=Home, 2=Away, e.P = handicap line)
    const hcpLines = [-1.5, -0.5, 0.5, 1.5];
    for (const line of hcpLines) {
      const hH = g.E.find(e => e.G === 3 && e.T === 1 && e.P === line);
      const aH = g.E.find(e => e.G === 3 && e.T === 2 && e.P === -line);
      if (hH && aH) {
        const hKey = line > 0 ? `+${line}` : `${line}`;
        const aKey = -line > 0 ? `+${-line}` : `${-line}`;
        markets.push({
          id: '64',
          type: `asian_handicap_${hKey}`,
          name: 'Asian Handicap',
          line: `Handicap ${hKey}`,
          outcomes: [
            { id: `${ci}_h${line}`,  name: `Home (${hKey})`, odds: parseFloat(hH.C), eventId: String(ci) },
            { id: `${ci}_a${-line}`, name: `Away (${aKey})`, odds: parseFloat(aH.C), eventId: String(ci) }
          ]
        });
      }
    }

    // 6. 1st Half 1X2 (Group G:2, T: 1=Home, 2=Draw, 3=Away)
    const h1H = g.E.find(e => e.G === 2 && e.T === 1);
    const d1H = g.E.find(e => e.G === 2 && e.T === 2);
    const a1H = g.E.find(e => e.G === 2 && e.T === 3);
    if (h1H && a1H) {
      markets.push({
        id: '2',
        type: '1h_1x2',
        name: '1st Half 1X2',
        line: '1st Half',
        outcomes: [
          { id: `${ci}_1h1`, name: 'Home (1H)', odds: parseFloat(h1H.C), eventId: String(ci) },
          ...(d1H ? [{ id: `${ci}_1hX`, name: 'Draw (1H)', odds: parseFloat(d1H.C), eventId: String(ci) }] : []),
          { id: `${ci}_1h2`, name: 'Away (1H)', odds: parseFloat(a1H.C), eventId: String(ci) }
        ]
      });
    }

    // 7. 1st Half Over/Under (Group G:2, T: 7/9=Over, 8/10=Under with e.P)
    const htLines = [0.5, 1.5, 2.5];
    for (const line of htLines) {
      const htOver  = g.E.find(e => e.G === 2 && (e.T === 7 || e.T === 9)  && e.P === line);
      const htUnder = g.E.find(e => e.G === 2 && (e.T === 8 || e.T === 10) && e.P === line);
      if (htOver && htUnder) {
        markets.push({
          id: '21',
          type: `1h_over_under_${line}`,
          name: '1st Half Over/Under',
          line: `HT Total ${line}`,
          specifier: `total=${line}`,
          outcomes: [
            { id: `${ci}_hto${line}`, name: `HT Over ${line}`,  odds: parseFloat(htOver.C),  eventId: String(ci) },
            { id: `${ci}_htu${line}`, name: `HT Under ${line}`, odds: parseFloat(htUnder.C), eventId: String(ci) }
          ]
        });
      }
    }

    return markets;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // fetchOdds – main entry point
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fetches real-time upcoming pre-match fixtures from 1xBet Ghana.
   * If Cloudflare-blocked, returns [] immediately (cooldown enforced).
   * @returns {Promise<Array<Object>>}
   */
  async fetchOdds() {
    // Fast-exit if we're in Cloudflare cooldown
    if (Date.now() < this._blockedUntil) {
      return [];
    }

    const matches = [];

    // --- 1. Discover event IDs (cached for 15 s) ---------------------------
    let eventIds;
    try {
      eventIds = await this._getEventIds();
    } catch (err) {
      console.warn('[1xBet Ghana] Event ID discovery threw unexpectedly:', err.message);
      eventIds = [];
    }

    if (eventIds.length === 0) return [];

    // Limit to first 30 to avoid Render timeout
    const idsToFetch = eventIds.slice(0, 30);
    let htmlHits = 0;

    // --- 2. Fetch individual game zips -------------------------------------
    for (const gameId of idsToFetch) {
      try {
        const res = await fetch(
          formatProxyUrl(`${this.baseUrl}/LineFeed/GetGameZip?id=${gameId}&lng=en`),
          { headers: this.headers, signal: AbortSignal.timeout(2500) }
        );

        if (!res || !res.ok) continue;

        // Detect HTML / Cloudflare challenge — stop fetching more games
        if (this._isHtmlResponse(res)) {
          htmlHits++;
          if (htmlHits >= 2) {
            console.warn('[1xBet Ghana] Cloudflare block detected on game fetch — entering cooldown');
            this._blockedUntil = Date.now() + this._BLOCK_COOLDOWN;
            break;
          }
          continue;
        }

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          // HTML body returned as 200 — treat as Cloudflare
          htmlHits++;
          if (htmlHits >= 2) {
            this._blockedUntil = Date.now() + this._BLOCK_COOLDOWN;
            break;
          }
          continue;
        }

        const g = data.Value;
        if (!g || !g.O1 || !g.O2) continue;

        // Skip live or already-started matches, or matches beyond 7 days
        if (g.IL === true) continue;
        const startMs = g.S ? g.S * 1000 : 0;
        const nowMs = Date.now();
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (startMs <= nowMs || startMs > nowMs + SEVEN_DAYS_MS) continue;

        // --- 3. Extract markets --------------------------------------------
        const markets = this._extractMarkets(g);
        if (markets.length === 0) continue;

        // --- 4 & 5. Build match object -------------------------------------
        const competition = g.LE || g.SE || 'Football';
        const country     = g.CN || 'International';
        const sportMap    = { 1: 'Football', 2: 'Ice Hockey', 3: 'Basketball', 4: 'Tennis', 10: 'Table Tennis', 11: 'Volleyball', 13: 'Baseball' };
        const sport       = g.SN || sportMap[g.SI] || 'Football';
        const startTime   = new Date(g.S * 1000).toISOString();
        const dateStr     = new Date(g.S * 1000).toLocaleString('en-GB', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        });

        matches.push({
          id: String(g.CI),
          homeTeam: g.O1,
          awayTeam: g.O2,
          sport,
          competition,
          country,
          startTime,
          dateStr,
          isLive: false,
          markets
        });
      } catch (err) {
        // Detect HTML parse failures without spamming 30 log lines
        if (err.message && err.message.includes('<!DOCTYPE')) {
          htmlHits++;
          if (htmlHits >= 2) {
            console.warn('[1xBet Ghana] Cloudflare block detected — entering 5 min cooldown');
            this._blockedUntil = Date.now() + this._BLOCK_COOLDOWN;
            break;
          }
        }
      }
    }

    return matches;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // generateBookingCode
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generates a direct event URL / betslip reference for 1xBet Ghana.
   * @param {Object} selection
   * @returns {Promise<{code: string, shareUrl: string}>}
   */
  async generateBookingCode(selection = {}) {
    const eventId    = String(selection.eventId || '');
    const competition = (selection.competition || 'football')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    const shortCode  = eventId ? eventId.slice(-6) : 'GH';

    return {
      code: `1X-${shortCode}`,
      shareUrl: `https://1xbet.com.gh/en/line/football/${competition}/${eventId}`
    };
  }
}
