/**
 * Live Bookmaker Feed Manager
 * Coordinates real-time production feeds between:
 * 1. SportyBet Ghana
 * 2. Betpawa Ghana
 * 3. 1xBet Ghana
 * Pure live data - zero mock or simulated fixtures.
 */

import { SportyBetLiveConnector } from './sportybet_live.js';
import { BetpawaLiveConnector } from './betpawa_live.js';
import { OneXBetLiveConnector } from './1xbet_live.js';

export class LiveFeedManager {
  constructor() {
    this.connectors = {
      'Sportybet': new SportyBetLiveConnector(),
      'Betpawa Ghana': new BetpawaLiveConnector(),
      '1xBet Ghana': new OneXBetLiveConnector()
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
    console.log('[LiveFeedManager] Polling real-time Ghanaian sportsbook APIs...');

    const sportyMatches = [];
    const betpawaMatches = [];
    const oneXMatches = [];

    const spHeaders = this.connectors['Sportybet'].headers;
    const bpHeaders = this.connectors['Betpawa Ghana'].headers;

    // 1. Fetch real matches from SportyBet
    try {
      let spEvents = this.cachedSportyEvents;
      if (Date.now() - this.lastSportyFetch > 10000 || spEvents.length === 0) {
        const spRes = await fetch('https://www.sportybet.com/api/gh/factsCenter/wapUpcomingEvents?sportId=sr:sport:1', { headers: spHeaders });
        if (spRes.ok) {
          const spJson = await spRes.json();
          spEvents = spJson.data || [];
          this.cachedSportyEvents = spEvents;
          this.lastSportyFetch = Date.now();
        }
      }

      for (const ev of spEvents) {
        const markets = [];
        for (const m of ev.markets || []) {
          // Over/Under 2.5
          if (m.id === '18' && m.specifier === 'total=2.5') {
            const over = m.outcomes?.find(o => o.desc?.toLowerCase().includes('over'));
            const under = m.outcomes?.find(o => o.desc?.toLowerCase().includes('under'));
            if (over && under) {
              markets.push({
                id: '18',
                marketId: '18',
                type: 'over_under',
                name: 'Over/Under Goals',
                line: 'Total 2.5',
                specifier: 'total=2.5',
                outcomes: [
                  { id: over.id, name: 'Over 2.5', odds: parseFloat(over.odds) },
                  { id: under.id, name: 'Under 2.5', odds: parseFloat(under.odds) }
                ]
              });
            }
          }
          // Both Teams To Score (GG/NG)
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
        }

        if (markets.length > 0) {
          sportyMatches.push({
            id: ev.eventId,
            homeTeam: ev.homeTeamName,
            awayTeam: ev.awayTeamName,
            sport: 'Football',
            competition: ev.tournamentName || 'Football',
            startTime: new Date(ev.estimateStartTime).toISOString(),
            dateStr: new Date(ev.estimateStartTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
            isLive: false,
            markets
          });

          // 2. Search & Map matching event on Betpawa Ghana with exact PriceIDs
          try {
            const teamQuery = (ev.homeTeamName || '').replace(/women|fc|fk|sc|u21|u19/gi, '').trim().split(' ')[0];
            if (teamQuery && teamQuery.length >= 3) {
              let bpEvId = this.betpawaEventCache.get(teamQuery);

              if (!bpEvId) {
                const bpSearchRes = await fetch(`https://www.betpawa.com.gh/api/sportsbook/v3/search?name=${encodeURIComponent(teamQuery)}`, { headers: bpHeaders });
                if (bpSearchRes.ok) {
                  const bpSearch = await bpSearchRes.json();
                  const bpEv = (bpSearch.events || []).find(e => {
                    const n = (e.name || '').toLowerCase();
                    return n.includes(teamQuery.toLowerCase());
                  });
                  if (bpEv) {
                    bpEvId = bpEv.id;
                    this.betpawaEventCache.set(teamQuery, bpEvId);
                  }
                }
              }

              if (bpEvId) {
                const bpEvRes = await fetch(`https://www.betpawa.com.gh/api/sportsbook/v4/events/${bpEvId}`, { headers: bpHeaders });
                if (bpEvRes.ok) {
                  const bpFull = await bpEvRes.json();
                  const bpMarkets = [];

                  // Betpawa Over/Under 2.5
                  const ouMkt = bpFull.markets?.find(bm => (bm.marketType?.name || '').toLowerCase().includes('total score over/under'));
                  if (ouMkt) {
                    let overPrice, underPrice;
                    for (const r of ouMkt.row || []) {
                      for (const p of r.prices || []) {
                        if (p.handicap === '2.5' && p.name?.toLowerCase() === 'over') overPrice = p;
                        if (p.handicap === '2.5' && p.name?.toLowerCase() === 'under') underPrice = p;
                      }
                    }
                    if (overPrice && underPrice) {
                      bpMarkets.push({
                        id: '5000',
                        marketId: '5000',
                        type: 'over_under',
                        name: 'Over/Under Goals',
                        line: 'Total 2.5',
                        outcomes: [
                          { id: String(overPrice.id), name: 'Over 2.5', odds: parseFloat(overPrice.odds) },
                          { id: String(underPrice.id), name: 'Under 2.5', odds: parseFloat(underPrice.odds) }
                        ]
                      });
                    }
                  }

                  // Betpawa Both Teams To Score
                  const bttsMkt = bpFull.markets?.find(bm => (bm.marketType?.name || '').toLowerCase().includes('both teams to score'));
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

                  if (bpMarkets.length > 0) {
                    betpawaMatches.push({
                      id: bpFull.id || bpEvId,
                      homeTeam: ev.homeTeamName,
                      awayTeam: ev.awayTeamName,
                      sport: 'Football',
                      competition: bpFull.competition?.name || ev.tournamentName,
                      startTime: bpFull.startTime || new Date(ev.estimateStartTime).toISOString(),
                      dateStr: new Date(ev.estimateStartTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
                      isLive: false,
                      markets: bpMarkets
                    });
                  }
                }
              }
            }
          } catch (e) {
            console.warn('[LiveFeedManager] Betpawa matching error:', e.message);
          }
        }
      }
    } catch (err) {
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

    return [
      { bookmaker: 'Sportybet', matches: sportyMatches },
      { bookmaker: 'Betpawa Ghana', matches: betpawaMatches },
      { bookmaker: '1xBet Ghana', matches: oneXMatches }
    ];
  }

  /**
   * Returns bookers map for booking code generation
   */
  getBookers() {
    return this.connectors;
  }
}
