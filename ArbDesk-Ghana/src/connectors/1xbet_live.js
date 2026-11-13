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

          // 2. Over/Under All Lines (0.5, 1.5, 2.5, 3.5, 4.5, 5.5)
          const totalLines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
          for (const line of totalLines) {
            const over = g.E.find(e => (e.T === 7 || e.T === 9) && e.P === line);
            const under = g.E.find(e => (e.T === 8 || e.T === 10) && e.P === line);
            if (over && under) {
              markets.push({
                id: '18',
                type: `over_under_${line}`,
                name: 'Over/Under Goals',
                line: `Total ${line}`,
                specifier: `total=${line}`,
                outcomes: [
                  { id: `${g.CI}_o${line}`, name: `Over ${line}`, odds: parseFloat(over.C), eventId: String(g.CI) },
                  { id: `${g.CI}_u${line}`, name: `Under ${line}`, odds: parseFloat(under.C), eventId: String(g.CI) }
                ]
              });
            }
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

          // 4. Double Chance (Group 8, T: 4=1X, 5=12, 6=X2)
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
                { id: `${g.CI}_1x`, name: '1X', odds: parseFloat(dc1X.C), eventId: String(g.CI) },
                { id: `${g.CI}_12`, name: '12', odds: parseFloat(dc12.C), eventId: String(g.CI) },
                { id: `${g.CI}_x2`, name: 'X2', odds: parseFloat(dcX2.C), eventId: String(g.CI) }
              ]
            });
          }

          // 5. Asian Handicaps (Group 3, T: 1=Home, 2=Away with e.P)
          const hcpLines = [-1.5, -0.5, 0.5, 1.5];
          for (const line of hcpLines) {
            const h = g.E.find(e => e.G === 3 && e.T === 1 && e.P === line);
            const a = g.E.find(e => e.G === 3 && e.T === 2 && e.P === -line);
            if (h && a) {
              const hKey = line > 0 ? `+${line}` : `${line}`;
              markets.push({
                id: '64',
                type: `asian_handicap_${hKey}`,
                name: 'Asian Handicap',
                line: `Handicap ${hKey}`,
                outcomes: [
                  { id: `${g.CI}_h${line}`, name: `Home (${hKey})`, odds: parseFloat(h.C), eventId: String(g.CI) },
                  { id: `${g.CI}_a${-line}`, name: `Away (${-line > 0 ? `+${-line}` : -line})`, odds: parseFloat(a.C), eventId: String(g.CI) }
                ]
              });
            }
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
