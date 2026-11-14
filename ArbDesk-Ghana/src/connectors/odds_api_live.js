/**
 * The Odds API Connector (Zero-Cloudflare Aggregator Feed)
 * Connects directly to The Odds API to fetch 1xBet and Betway pre-match lines.
 * Supported when process.env.ODDS_API_KEY is configured.
 */
export class OddsApiLiveConnector {
  constructor() {
    this.apiKey = process.env.ODDS_API_KEY || '';
    this.lastFetch = 0;
    this.cachedMatchesByBookie = {};
  }

  isAvailable() {
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  /**
   * Fetches latest odds from The Odds API across sports and returns grouped matches by bookmaker
   * @returns {Promise<{[bookmakerName: string]: Array<Object>}>}
   */
  async fetchOddsByBookmakers() {
    if (!this.isAvailable()) return {};

    const now = Date.now();
    // Refresh every 30 seconds to conserve quota
    if (now - this.lastFetch < 30000 && Object.keys(this.cachedMatchesByBookie).length > 0) {
      return this.cachedMatchesByBookie;
    }

    const sports = [
      'soccer_epl',
      'soccer_spain_la_liga',
      'soccer_italy_serie_a',
      'soccer_germany_bundesliga',
      'soccer_uefa_nations_league',
      'basketball_nba'
    ];
    const results = {
      '1xBet Ghana': [],
      'Betway Ghana': []
    };

    for (const sportKey of sports) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${this.apiKey}&regions=eu,uk&markets=h2h,totals,spreads&bookmakers=onexbet,betway`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;

        const data = await res.json();
        if (!Array.isArray(data)) continue;

        for (const ev of data) {
          const homeTeam = ev.home_team;
          const awayTeam = ev.away_team;
          const startTime = ev.commence_time;
          const sport = sportKey.startsWith('soccer') ? 'Football' : 'Basketball';

          for (const bookie of ev.bookmakers || []) {
            let targetBookmaker = null;
            if (bookie.key === 'onexbet') targetBookmaker = '1xBet Ghana';
            else if (bookie.key === 'betway') targetBookmaker = 'Betway Ghana';
            if (!targetBookmaker) continue;

            const markets = [];

            for (const m of bookie.markets || []) {
              // 1. 1X2 / Moneyline
              if (m.key === 'h2h') {
                const h = m.outcomes.find(o => o.name === homeTeam);
                const d = m.outcomes.find(o => o.name?.toLowerCase() === 'draw');
                const a = m.outcomes.find(o => o.name === awayTeam);

                if (h && a) {
                  if (d) {
                    markets.push({
                      id: '1',
                      type: '1x2',
                      name: '1X2 (Full Time)',
                      line: 'Full Time',
                      outcomes: [
                        { id: `${ev.id}_h`, name: 'Home', odds: parseFloat(h.price) },
                        { id: `${ev.id}_d`, name: 'Draw', odds: parseFloat(d.price) },
                        { id: `${ev.id}_a`, name: 'Away', odds: parseFloat(a.price) }
                      ]
                    });
                  } else {
                    markets.push({
                      id: '219',
                      type: 'moneyline',
                      name: 'Moneyline (Winner)',
                      line: 'Head to Head',
                      outcomes: [
                        { id: `${ev.id}_h`, name: 'Home', odds: parseFloat(h.price) },
                        { id: `${ev.id}_a`, name: 'Away', odds: parseFloat(a.price) }
                      ]
                    });
                  }
                }
              }

              // 2. Over/Under (Totals)
              if (m.key === 'totals') {
                for (const o of m.outcomes || []) {
                  const point = o.point;
                  if (point === undefined) continue;
                  const over = m.outcomes.find(x => x.name?.toLowerCase() === 'over' && x.point === point);
                  const under = m.outcomes.find(x => x.name?.toLowerCase() === 'under' && x.point === point);
                  if (over && under) {
                    const existing = markets.find(mk => mk.type === `over_under_${point}`);
                    if (!existing) {
                      markets.push({
                        id: `ou_${point}`,
                        type: `over_under_${point}`,
                        name: 'Over/Under Goals',
                        line: `Total ${point}`,
                        outcomes: [
                          { id: `${ev.id}_o_${point}`, name: `Over ${point}`, odds: parseFloat(over.price) },
                          { id: `${ev.id}_u_${point}`, name: `Under ${point}`, odds: parseFloat(under.price) }
                        ]
                      });
                    }
                  }
                }
              }

              // 3. Spreads (Asian Handicap)
              if (m.key === 'spreads') {
                for (const o of m.outcomes || []) {
                  const point = o.point;
                  if (point === undefined) continue;
                  const hH = m.outcomes.find(x => x.name === homeTeam && x.point === point);
                  const aH = m.outcomes.find(x => x.name === awayTeam && x.point === -point);
                  if (hH && aH) {
                    const hKey = point > 0 ? `+${point}` : String(point);
                    const aKey = -point > 0 ? `+${-point}` : String(-point);
                    const existing = markets.find(mk => mk.type === `asian_handicap_${hKey}`);
                    if (!existing) {
                      markets.push({
                        id: `ah_${hKey}`,
                        type: `asian_handicap_${hKey}`,
                        name: 'Asian Handicap',
                        line: `Handicap ${hKey}`,
                        outcomes: [
                          { id: `${ev.id}_ah_${hKey}`, name: `Home (${hKey})`, odds: parseFloat(hH.price) },
                          { id: `${ev.id}_ah_${aKey}`, name: `Away (${aKey})`, odds: parseFloat(aH.price) }
                        ]
                      });
                    }
                  }
                }
              }
            }

            if (markets.length > 0) {
              results[targetBookmaker].push({
                id: `${targetBookmaker}_${ev.id}`,
                homeTeam,
                awayTeam,
                sport,
                competition: sportKey,
                country: 'International',
                startTime,
                dateStr: new Date(startTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
                isLive: false,
                markets
              });
            }
          }
        }
      } catch (e) {
        // Silently continue
      }
    }

    this.cachedMatchesByBookie = results;
    this.lastFetch = now;
    return results;
  }
}
