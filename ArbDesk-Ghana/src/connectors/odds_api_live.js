/**
 * The Odds API Connector (Zero-Cloudflare Aggregator Feed)
 * Connects directly to The Odds API to fetch 1xBet and Betway pre-match lines.
 * Supported when process.env.ODDS_API_KEY is configured (defaults to pre-configured key).
 */
export class OddsApiLiveConnector {
  constructor() {
    this.apiKey = process.env.ODDS_API_KEY || '7f9418a4ff1bf2e65535713b1c511d71';
    this.lastFetch = 0;
    this.cachedMatchesByBookie = {};
    const refreshMinutes = parseInt(process.env.ODDS_API_REFRESH_MINUTES, 10) || 15;
    this.cacheTTL = refreshMinutes * 60 * 1000;
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
    // Conserve free-tier quota using configurable cache TTL (default 15 minutes)
    if (now - this.lastFetch < this.cacheTTL && Object.keys(this.cachedMatchesByBookie).length > 0) {
      return this.cachedMatchesByBookie;
    }

    const results = {
      '1xBet Ghana': [],
      'Betway Ghana': []
    };

    // 'upcoming' sport key fetches top upcoming matches across all sports in a single API call
    const sports = ['upcoming'];

    for (const sportKey of sports) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${this.apiKey}&regions=eu,uk&markets=h2h,totals,spreads&bookmakers=onexbet,betway`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) {
          console.warn(`[OddsAPI] Endpoint responded with status ${res.status}`);
          continue;
        }

        const remaining = res.headers.get('x-requests-remaining');
        const used = res.headers.get('x-requests-used');
        if (remaining !== null) {
          console.log(`[OddsAPI] Quota: ${used} used, ${remaining} remaining this month.`);
        }

        const data = await res.json();
        if (!Array.isArray(data)) continue;

        for (const ev of data) {
          const homeTeam = ev.home_team;
          const awayTeam = ev.away_team;
          const startTime = ev.commence_time;
          const sportKeyStr = (ev.sport_key || sportKey || '').toLowerCase();
          const sport = sportKeyStr.includes('basketball') ? 'Basketball' :
                        sportKeyStr.includes('tennis') ? 'Tennis' :
                        sportKeyStr.includes('hockey') ? 'Ice Hockey' : 'Football';

          for (const bookie of ev.bookmakers || []) {
            let targetBookmaker = null;
            if (bookie.key === 'onexbet') targetBookmaker = '1xBet Ghana';
            else if (bookie.key === 'betway') targetBookmaker = 'Betway Ghana';
            if (!targetBookmaker) continue;

            const markets = [];

            for (const m of bookie.markets || []) {
              // 1. 1X2 / Moneyline
              if (m.key === 'h2h') {
                const h = m.outcomes?.find(o => o.name === homeTeam);
                const d = m.outcomes?.find(o => o.name?.toLowerCase() === 'draw');
                const a = m.outcomes?.find(o => o.name === awayTeam);

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
                  const over = m.outcomes?.find(x => x.name?.toLowerCase() === 'over' && x.point === point);
                  const under = m.outcomes?.find(x => x.name?.toLowerCase() === 'under' && x.point === point);
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
                  const hH = m.outcomes?.find(x => x.name === homeTeam && x.point === point);
                  const aH = m.outcomes?.find(x => x.name === awayTeam && x.point === -point);
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
                competition: ev.sport_title || sportKey,
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
        console.warn('[OddsAPI] Fetch exception:', e.message);
      }
    }

    if (results['1xBet Ghana'].length > 0 || results['Betway Ghana'].length > 0) {
      console.log(`[OddsAPI] Successfully loaded ${results['1xBet Ghana'].length} 1xBet matches and ${results['Betway Ghana'].length} Betway matches`);
    }

    this.cachedMatchesByBookie = results;
    this.lastFetch = now;
    return results;
  }
}
