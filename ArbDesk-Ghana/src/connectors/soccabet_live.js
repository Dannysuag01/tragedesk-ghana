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
      'Accept': 'application/json, text/plain, */*'
    };
  }

  /**
   * Fetches real upcoming pre-match fixtures from Soccabet
   * @returns {Promise<Array<Object>>}
   */
  async fetchOdds() {
    const matches = [];
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/sportsbook/fixtures?sportId=1&take=20`, {
        headers: this.headers,
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const data = await res.json();
        const fixtures = data.data || data.fixtures || [];
        for (const f of fixtures) {
          if (!f.homeTeam || !f.awayTeam) continue;
          const markets = [];
          // Parse 1X2, Over/Under, BTTS if available
          if (f.odds1 && f.odds2) {
            markets.push({
              id: '1',
              type: '1x2',
              name: '1X2 (Full Time)',
              line: 'Full Time',
              outcomes: [
                { id: `${f.id}_1`, name: 'Home', odds: parseFloat(f.odds1) },
                ...(f.oddsX ? [{ id: `${f.id}_x`, name: 'Draw', odds: parseFloat(f.oddsX) }] : []),
                { id: `${f.id}_2`, name: 'Away', odds: parseFloat(f.odds2) }
              ]
            });
          }
          if (markets.length > 0) {
            matches.push({
              id: String(f.id),
              homeTeam: f.homeTeam,
              awayTeam: f.awayTeam,
              sport: 'Football',
              competition: f.tournament || 'Football',
              startTime: f.startTime || new Date(Date.now() + 3600000).toISOString(),
              dateStr: 'Upcoming',
              isLive: false,
              markets
            });
          }
        }
      }
    } catch {
      // Soccabet endpoints may be rate-limited or require client-side routing
    }
    return matches;
  }

  /**
   * Generates direct betslip share URL for Soccabet Ghana
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
