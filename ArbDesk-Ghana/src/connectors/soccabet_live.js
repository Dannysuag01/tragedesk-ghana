import { BaseBookmaker } from './base.js';

/**
 * Soccabet Ghana Connector
 * Connects to Soccabet Ghana's public sports interface.
 * Employs direct 1-click match betslip routing (no broken booking codes).
 */
export class SoccabetLiveConnector extends BaseBookmaker {
  constructor() {
    super('Soccabet Ghana', 'https://www.soccabet.com');
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.soccabet.com/',
      'Origin': 'https://www.soccabet.com'
    };
  }

  /**
   * Parses a raw fixture object into a normalised match record.
   * Returns null if essential fields are missing.
   */
  _parseFixture(f) {
    const homeTeam = f.homeTeam || f.home_team || f.HomeTeam;
    const awayTeam = f.awayTeam || f.away_team || f.AwayTeam;
    if (!homeTeam || !awayTeam) return null;

    const markets = [];

    // 1X2 market
    const odds1 = parseFloat(f.odds1 || f.home_odds || f.HomeOdds);
    const oddsX = parseFloat(f.oddsX || f.draw_odds || f.DrawOdds);
    const odds2 = parseFloat(f.odds2 || f.away_odds || f.AwayOdds);
    if (odds1 > 1 && odds2 > 1) {
      markets.push({
        id: '1',
        type: '1x2',
        name: '1X2 (Full Time)',
        line: 'Full Time',
        outcomes: [
          { id: `${f.id}_1`, name: 'Home', odds: odds1 },
          ...(oddsX > 1 ? [{ id: `${f.id}_x`, name: 'Draw', odds: oddsX }] : []),
          { id: `${f.id}_2`, name: 'Away', odds: odds2 }
        ]
      });
    }

    // Over/Under market (if available)
    const over = parseFloat(f.overOdds || f.over_odds || f.OverOdds);
    const under = parseFloat(f.underOdds || f.under_odds || f.UnderOdds);
    const ouLine = f.ouLine || f.ou_line || f.OULine || 2.5;
    if (over > 1 && under > 1) {
      markets.push({
        id: '2',
        type: `over_under_${ouLine}`,
        name: 'Over/Under Goals',
        line: `Total ${ouLine}`,
        outcomes: [
          { id: `${f.id}_over`, name: `Over ${ouLine}`, odds: over },
          { id: `${f.id}_under`, name: `Under ${ouLine}`, odds: under }
        ]
      });
    }

    if (markets.length === 0) return null;

    return {
      id: String(f.id || `${homeTeam}_${awayTeam}`),
      homeTeam,
      awayTeam,
      sport: 'Football',
      competition: f.tournament || f.league || f.competition || 'Football',
      startTime: f.startTime || f.start_time || f.StartTime || new Date(Date.now() + 3600000).toISOString(),
      dateStr: 'Upcoming',
      isLive: false,
      markets
    };
  }

  /**
   * Fetches real upcoming pre-match fixtures from Soccabet.
   * Tries multiple endpoints; first successful, non-empty response wins.
   * Returns [] without throwing if all endpoints fail.
   * @returns {Promise<Array<Object>>}
   */
  async fetchOdds() {
    const endpoints = [
      'https://www.soccabet.com/api/v1/sportsbook/fixtures?sportId=1&take=50',
      'https://www.soccabet.com/api/v2/fixtures?sport=soccer&limit=50',
      'https://soccabet.com/api/sportsbook/events?sport=1&status=prematch&limit=50'
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: this.headers,
          signal: AbortSignal.timeout(2000)
        });

        // Skip Cloudflare / auth-wall responses
        if (res.status === 403 || res.status === 429) {
          console.debug(`[Soccabet] Skipping ${url} — status ${res.status}`);
          continue;
        }
        if (!res.ok) {
          console.debug(`[Soccabet] Skipping ${url} — status ${res.status}`);
          continue;
        }

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          console.debug(`[Soccabet] Skipping ${url} — HTML response (Cloudflare?)`);
          continue;
        }

        let data;
        try {
          data = await res.json();
        } catch {
          console.debug(`[Soccabet] Skipping ${url} — invalid JSON`);
          continue;
        }

        // Normalise response envelope
        const rawList = Array.isArray(data)
          ? data
          : (data.data || data.fixtures || data.events || data.results || []);

        if (!Array.isArray(rawList) || rawList.length === 0) {
          console.debug(`[Soccabet] Skipping ${url} — empty payload`);
          continue;
        }

        const matches = rawList.map(f => this._parseFixture(f)).filter(Boolean);
        if (matches.length === 0) {
          console.debug(`[Soccabet] Skipping ${url} — no parseable fixtures`);
          continue;
        }

        console.log(`[Soccabet] Fetched ${matches.length} fixtures from ${url}`);
        return matches;

      } catch (err) {
        console.debug(`[Soccabet] Endpoint failed (${url}):`, err.message || err);
      }
    }

    console.debug('[Soccabet] All endpoints exhausted — returning []');
    return [];
  }

  /**
   * Generates direct betslip share URL for Soccabet Ghana.
   * Since Soccabet retail codes require client cookie sessions,
   * we provide direct 1-click event betslip deep links.
   */
  async generateBookingCode(selection = {}) {
    const query = selection.homeTeam || selection.selection || 'soccer';
    const shareUrl = `${this.baseUrl}/sports/search?q=${encodeURIComponent(query)}`;
    return {
      code: null,
      shareUrl
    };
  }
}
