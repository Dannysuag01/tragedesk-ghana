import { BaseBookmaker } from './base.js';

/**
 * Soccabet Ghana Connector
 * Connects to Soccabet Ghana's public sports interface.
 * Employs direct 1-click match betslip routing (no broken booking codes).
 *
 * Includes failure cooldown: if all endpoints fail, suppresses retries
 * for 5 minutes to avoid flooding logs every 3 seconds.
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

    // Cooldown after repeated failures
    this._blockedUntil = 0;
    this._BLOCK_COOLDOWN = 5 * 60 * 1000; // 5 minutes
    this._consecutiveFailures = 0;
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
   * Enters 5-minute cooldown after 3 consecutive total failures.
   * @returns {Promise<Array<Object>>}
   */
  async fetchOdds() {
    // Fast-exit during cooldown
    if (Date.now() < this._blockedUntil) {
      return [];
    }

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
          continue;
        }
        if (!res.ok) {
          continue;
        }

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          continue;
        }

        let data;
        try {
          data = await res.json();
        } catch {
          continue;
        }

        // Normalise response envelope
        const rawList = Array.isArray(data)
          ? data
          : (data.data || data.fixtures || data.events || data.results || []);

        if (!Array.isArray(rawList) || rawList.length === 0) {
          continue;
        }

        const matches = rawList.map(f => this._parseFixture(f)).filter(Boolean);
        if (matches.length === 0) {
          continue;
        }

        console.log(`[Soccabet] Fetched ${matches.length} fixtures`);
        this._consecutiveFailures = 0; // Reset on success
        return matches;

      } catch (err) {
        // Silently continue to next endpoint
      }
    }

    // All endpoints failed
    this._consecutiveFailures++;
    if (this._consecutiveFailures >= 3) {
      // Log once, then go silent for 5 minutes
      console.warn('[Soccabet] All endpoints failed 3× — entering 5 min cooldown');
      this._blockedUntil = Date.now() + this._BLOCK_COOLDOWN;
      this._consecutiveFailures = 0;
    }
    return [];
  }

  /**
   * Generates direct betslip share URL for Soccabet Ghana.
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
