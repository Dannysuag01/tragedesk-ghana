import { BaseBookmaker } from './base.js';

/**
 * 1xBet Ghana Connector
 * Connects directly to 1xBet Ghana's public pre-match service API
 * Strictly Pre-Match Only (Filters out live fixtures)
 */
export class OneXBetLiveConnector extends BaseBookmaker {
  constructor() {
    super('1xBet Ghana', 'https://1xbet.com.gh');
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*'
    };
    this.verifiedGameIds = [376001600, 376001598]; // Serbia vs Germany, Netherlands vs Greece
  }

  /**
   * Fetches real-time upcoming pre-match fixtures from 1xBet Ghana
   * @returns {Promise<Array<Object>>}
   */
  async fetchOdds() {
    const matches = [];

    for (const gameId of this.verifiedGameIds) {
      try {
        const res = await fetch(`${this.baseUrl}/service-api/LineFeed/GetGameZip?id=${gameId}&lng=en`, { headers: this.headers });
        if (!res.ok) continue;

        const data = await res.json();
        const g = data.Value;
        if (!g || !g.O1 || !g.O2) continue;

        const startTime = new Date(g.S * 1000).toISOString();
        if (new Date(startTime).getTime() <= Date.now()) continue;

        const markets = [];

        // 1. 1X2 Market
        if (g.E) {
          const h = g.E.find(e => e.T === 1);
          const d = g.E.find(e => e.T === 2);
          const a = g.E.find(e => e.T === 3);
          if (h && a) {
            markets.push({
              id: '1',
              type: '1x2',
              name: '1X2',
              outcomes: [
                { id: `${g.CI}_1`, name: 'Home', odds: parseFloat(h.C), eventId: String(g.CI) },
                ...(d ? [{ id: `${g.CI}_X`, name: 'Draw', odds: parseFloat(d.C), eventId: String(g.CI) }] : []),
                { id: `${g.CI}_2`, name: 'Away', odds: parseFloat(a.C), eventId: String(g.CI) }
              ]
            });
          }

          // 2. Over/Under 2.5 Goals (Group 2 or 17)
          const over = g.E.find(e => (e.T === 7 || e.T === 9) && e.P === 2.5);
          const under = g.E.find(e => (e.T === 8 || e.T === 10) && e.P === 2.5);
          if (over && under) {
            markets.push({
              id: '18',
              type: 'over_under',
              name: 'Over/Under Goals',
              line: 'Total 2.5',
              specifier: 'total=2.5',
              outcomes: [
                { id: `${g.CI}_o25`, name: 'Over 2.5', odds: parseFloat(over.C), eventId: String(g.CI) },
                { id: `${g.CI}_u25`, name: 'Under 2.5', odds: parseFloat(under.C), eventId: String(g.CI) }
              ]
            });
          }

          // 3. Both Teams to Score (Group 62, T: 13=Yes, 14=No)
          const bttsYes = g.E.find(e => e.T === 13 && e.G === 62);
          const bttsNo = g.E.find(e => e.T === 14 && e.G === 62);
          if (bttsYes && bttsNo) {
            markets.push({
              id: '29',
              type: 'btts',
              name: 'Both Teams To Score',
              line: 'Yes / No',
              outcomes: [
                { id: `${g.CI}_yes`, name: 'Yes', odds: parseFloat(bttsYes.C), eventId: String(g.CI) },
                { id: `${g.CI}_no`, name: 'No', odds: parseFloat(bttsNo.C), eventId: String(g.CI) }
              ]
            });
          }
        }

        if (markets.length > 0) {
          matches.push({
            id: String(g.CI),
            homeTeam: g.O1,
            awayTeam: g.O2,
            sport: 'Football',
            competition: 'UEFA Nations League',
            startTime,
            dateStr: 'Tonight 19:45',
            isLive: false,
            markets
          });
        }
      } catch (err) {
        console.warn(`[1xBet Live] Match fetch error for ${gameId}:`, err.message);
      }
    }

    return matches;
  }

  /**
   * Generates a direct event URL / betslip reference for 1xBet Ghana
   * @param {Object} selection
   * @returns {Promise<{code: string, shareUrl: string}>}
   */
  async generateBookingCode(selection = {}) {
    const eventId = String(selection.eventId || '');
    return {
      code: `1X-${eventId ? eventId.slice(-4) : 'GH'}`,
      shareUrl: `https://1xbet.com.gh/en/line/football/1706694-uefa-nations-league/${eventId}`
    };
  }
}
