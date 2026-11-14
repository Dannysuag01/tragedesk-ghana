import { BaseBookmaker } from './base.js';

/**
 * Betway Ghana Connector
 * Connects to Betway Ghana's sports catalog.
 * Employs direct 1-click match betslip routing (no broken booking codes).
 */
export class BetwayLiveConnector extends BaseBookmaker {
  constructor() {
    super('Betway Ghana', 'https://www.betway.com.gh');
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.betway.com.gh/',
      'Origin': 'https://www.betway.com.gh'
    };
  }

  /**
   * Parses a raw event object into a normalised match record.
   * Returns null if essential fields are missing.
   */
  _parseEvent(ev) {
    const homeTeam = ev.homeTeam || ev.home || ev.HomeTeam;
    const awayTeam = ev.awayTeam || ev.away || ev.AwayTeam;
    if (!homeTeam || !awayTeam) return null;

    const markets = [];

    // Parse structured markets array if present
    if (Array.isArray(ev.markets)) {
      for (const m of ev.markets) {
        const type = (m.type || '').toLowerCase();
        if ((type === '1x2' || type === 'match_winner') && Array.isArray(m.outcomes) && m.outcomes.length >= 2) {
          markets.push({
            id: String(m.id || '1'),
            type: '1x2',
            name: '1X2 (Full Time)',
            line: 'Full Time',
            outcomes: m.outcomes.map(o => ({
              id: String(o.id),
              name: o.name,
              odds: parseFloat(o.odds || o.price || o.value)
            })).filter(o => o.odds > 1)
          });
        } else if ((type === 'over_under' || type === 'totals') && Array.isArray(m.outcomes) && m.outcomes.length >= 2) {
          markets.push({
            id: String(m.id || '2'),
            type: 'over_under',
            name: m.name || `Over/Under ${m.line || 2.5}`,
            line: String(m.line || 2.5),
            outcomes: m.outcomes.map(o => ({
              id: String(o.id),
              name: o.name,
              odds: parseFloat(o.odds || o.price || o.value)
            })).filter(o => o.odds > 1)
          });
        }
      }
    }

    // Flat odds fields fallback (some APIs surface top-level 1X2)
    if (markets.length === 0) {
      const odds1 = parseFloat(ev.odds1 || ev.homeOdds || ev.home_odds);
      const oddsX = parseFloat(ev.oddsX || ev.drawOdds || ev.draw_odds);
      const odds2 = parseFloat(ev.odds2 || ev.awayOdds || ev.away_odds);
      if (odds1 > 1 && odds2 > 1) {
        markets.push({
          id: '1',
          type: '1x2',
          name: '1X2 (Full Time)',
          line: 'Full Time',
          outcomes: [
            { id: `${ev.id}_1`, name: 'Home', odds: odds1 },
            ...(oddsX > 1 ? [{ id: `${ev.id}_x`, name: 'Draw', odds: oddsX }] : []),
            { id: `${ev.id}_2`, name: 'Away', odds: odds2 }
          ]
        });
      }
    }

    if (markets.length === 0) return null;

    return {
      id: String(ev.id || `${homeTeam}_${awayTeam}`),
      homeTeam,
      awayTeam,
      sport: 'Football',
      competition: ev.league || ev.competition || ev.tournament || 'Football',
      startTime: ev.startTime || ev.start_time || ev.StartTime || new Date(Date.now() + 3600000).toISOString(),
      dateStr: 'Upcoming',
      isLive: false,
      markets
    };
  }

  /**
   * Fetches real upcoming pre-match events from Betway Ghana.
   * Tries multiple endpoints; first successful, non-empty response wins.
   * Returns [] without throwing if all endpoints fail.
   * @returns {Promise<Array<Object>>}
   */
  async fetchOdds() {
    const endpoints = [
      'https://www.betway.com.gh/api/v1/sports/events?sportId=soccer&take=50',
      'https://sports.betway.com.gh/api/sports/soccer/events?take=50',
      'https://bwgh-api.betway.com/v1/events?sport=soccer&limit=50&status=prematch'
      // https://www.betway.com.gh/Sports/Default.aspx is HTML — skipped by design
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: this.headers,
          signal: AbortSignal.timeout(2000)
        });

        // Skip Cloudflare / auth-wall responses
        if (res.status === 403 || res.status === 429) {
          console.debug(`[Betway] Skipping ${url} — status ${res.status}`);
          continue;
        }
        if (!res.ok) {
          console.debug(`[Betway] Skipping ${url} — status ${res.status}`);
          continue;
        }

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          console.debug(`[Betway] Skipping ${url} — HTML response (Cloudflare?)`);
          continue;
        }

        let data;
        try {
          data = await res.json();
        } catch {
          console.debug(`[Betway] Skipping ${url} — invalid JSON`);
          continue;
        }

        // Normalise response envelope
        const rawList = Array.isArray(data)
          ? data
          : (data.events || data.data || data.results || []);

        if (!Array.isArray(rawList) || rawList.length === 0) {
          console.debug(`[Betway] Skipping ${url} — empty payload`);
          continue;
        }

        const matches = rawList.map(ev => this._parseEvent(ev)).filter(Boolean);
        if (matches.length === 0) {
          console.debug(`[Betway] Skipping ${url} — no parseable events`);
          continue;
        }

        console.log(`[Betway] Fetched ${matches.length} events from ${url}`);
        return matches;

      } catch (err) {
        console.debug(`[Betway] Endpoint failed (${url}):`, err.message || err);
      }
    }

    console.debug('[Betway] All endpoints exhausted — returning []');
    return [];
  }

  /**
   * Generates direct betslip share URL for Betway Ghana.
   * Direct deep-link routing to the exact match or search on Betway Ghana.
   */
  async generateBookingCode(selection = {}) {
    const query = selection.homeTeam || selection.selection || 'soccer';
    const shareUrl = `${this.baseUrl}/sport/soccer?search=${encodeURIComponent(query)}`;
    return {
      code: null,
      shareUrl
    };
  }
}
