/**
 * Arbitrage Detector Engine
 * Finds arbitrage opportunities across normalized bookmaker odds feeds,
 * checks margins, and attaches booking codes.
 * Strictly Pre-Match Only (Filters out in-play/live fixtures)
 */

import { isMatchEqual } from './normalizer.js';
import { calculate2WayArbitrage, calculate3WayArbitrage } from './calculator.js';

export class ArbDetector {
  /**
   * @param {Object} [options]
   * @param {number} [options.minMargin=1.0] - Minimum margin percentage (e.g. 1.0%)
   * @param {number} [options.maxMargin=25.0] - Maximum margin to filter out obvious bookmaker palpable errors/void traps
   * @param {number} [options.defaultBankroll=100] - Default total stake in GHS
   */
  constructor(options = {}) {
    this.minMargin = options.minMargin ?? 0.1; // Strictly positive arbitrage profit only (> 0%)
    this.maxMargin = options.maxMargin ?? 25.0; // margins > 25% are usually palps/mistakes that bookies cancel
    this.defaultBankroll = options.defaultBankroll ?? 100;
    this.enableBookingCodes = options.enableBookingCodes ?? false; // User requested "no need for the booking code"
  }

  /**
   * Scans a set of normalized matches across bookmakers
   * Strictly filters for pre-match fixtures.
   * @param {Array<Object>} bookmakerFeeds Array of { bookmaker: '...', matches: [...] }
   * @param {Object} [bookers] Map of bookmaker name -> booker instance with generateCode()
   * @returns {Promise<Array<Object>>} List of detected arbitrage opportunities
   */
  async findOpportunities(bookmakerFeeds, bookers = {}) {
    const opportunities = [];

    // 1. Group matching fixtures across bookmakers
    const groupedMatches = this._groupMatches(bookmakerFeeds);

    // 2. For each real-world match, evaluate available markets
    for (const group of groupedMatches) {
      const matchMeta = group.meta;
      const comparedBookies = group.bookmakers;

      // Evaluate all markets (2-Way and 3-Way)
      const marketsMap = group.markets || group.twoWayMarkets || {};
      for (const marketKey of Object.keys(marketsMap)) {
        const marketData = marketsMap[marketKey];
        if (!marketData.outcomes || marketData.outcomes.length < 2) continue;

        // 2-Way Markets (Over/Under all lines, BTTS, DNB, Team Totals, Odd/Even)
        if (marketData.outcomes.length === 2) {
          const bestSide1 = this._findBestOdd(marketData.outcomes[0]);
          const bestSide2 = this._findBestOdd(marketData.outcomes[1]);

          if (bestSide1 && bestSide2 && bestSide1.bookmaker !== bestSide2.bookmaker) {
            const arb = calculate2WayArbitrage(
              bestSide1.odds,
              bestSide2.odds,
              this.defaultBankroll,
              {
                bookmaker: bestSide1.bookmaker,
                selection: marketData.outcomes[0].name,
                selectionId: bestSide1.selectionId,
                eventId: bestSide1.eventId,
                marketId: bestSide1.marketId,
                specifier: bestSide1.specifier
              },
              {
                bookmaker: bestSide2.bookmaker,
                selection: marketData.outcomes[1].name,
                selectionId: bestSide2.selectionId,
                eventId: bestSide2.eventId,
                marketId: bestSide2.marketId,
                specifier: bestSide2.specifier
              }
            );

            if (arb && arb.isArb && arb.marginPct >= this.minMargin && arb.marginPct <= this.maxMargin) {
              await this._attachBookingCodes(arb.legs, bookers, matchMeta, marketData);

              opportunities.push({
                id: `${matchMeta.homeTeam}-${matchMeta.awayTeam}-${marketKey}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                match: matchMeta,
                market: marketData.marketName,
                line: marketData.line || null,
                category: matchMeta.sport || 'Football',
                preMatch: !matchMeta.isLive,
                isLive: Boolean(matchMeta.isLive),
                liveClock: matchMeta.liveClock || null,
                score: matchMeta.score || null,
                comparedBookies,
                verifiedAt: Date.now(),
                ...arb
              });
            }
          }
        }

        // 3-Way Markets (1X2 Full Time, 1X2 1st Half)
        else if (marketData.outcomes.length === 3) {
          const bestSide1 = this._findBestOdd(marketData.outcomes[0]);
          const bestSide2 = this._findBestOdd(marketData.outcomes[1]);
          const bestSide3 = this._findBestOdd(marketData.outcomes[2]);

          if (bestSide1 && bestSide2 && bestSide3) {
            const uniqueBookies = new Set([bestSide1.bookmaker, bestSide2.bookmaker, bestSide3.bookmaker]);
            if (uniqueBookies.size >= 2) {
              const arb = calculate3WayArbitrage(
                bestSide1.odds,
                bestSide2.odds,
                bestSide3.odds,
                this.defaultBankroll,
                {
                  bookmaker: bestSide1.bookmaker,
                  selection: marketData.outcomes[0].name,
                  selectionId: bestSide1.selectionId,
                  eventId: bestSide1.eventId,
                  marketId: bestSide1.marketId,
                  specifier: bestSide1.specifier
                },
                {
                  bookmaker: bestSide2.bookmaker,
                  selection: marketData.outcomes[1].name,
                  selectionId: bestSide2.selectionId,
                  eventId: bestSide2.eventId,
                  marketId: bestSide2.marketId,
                  specifier: bestSide2.specifier
                },
                {
                  bookmaker: bestSide3.bookmaker,
                  selection: marketData.outcomes[2].name,
                  selectionId: bestSide3.selectionId,
                  eventId: bestSide3.eventId,
                  marketId: bestSide3.marketId,
                  specifier: bestSide3.specifier
                }
              );

              if (arb && arb.isArb && arb.marginPct >= this.minMargin && arb.marginPct <= this.maxMargin) {
                await this._attachBookingCodes(arb.legs, bookers, matchMeta, marketData);

                opportunities.push({
                  id: `${matchMeta.homeTeam}-${matchMeta.awayTeam}-${marketKey}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                  match: matchMeta,
                  market: marketData.marketName,
                  line: marketData.line || null,
                  category: matchMeta.sport || 'Football',
                  preMatch: !matchMeta.isLive,
                  isLive: Boolean(matchMeta.isLive),
                  liveClock: matchMeta.liveClock || null,
                  score: matchMeta.score || null,
                  comparedBookies,
                  verifiedAt: Date.now(),
                  ...arb
                });
              }
            }
          }
        }
      }
    }

    return opportunities;
  }

  /**
   * Internal helper to find highest odds selection
   */
  _findBestOdd(outcome) {
    if (!outcome.quotes || outcome.quotes.length === 0) return null;
    let best = outcome.quotes[0];
    for (const quote of outcome.quotes) {
      if (quote.odds > best.odds) {
        best = quote;
      }
    }
    return best;
  }

  /**
   * Attaches booking codes to legs
   */
  async _attachBookingCodes(legs, bookers, matchMeta = {}, marketData = {}) {
    if (!this.enableBookingCodes) return;
    for (const leg of legs) {
      const booker = bookers[leg.bookmaker];
      if (booker && typeof booker.generateBookingCode === 'function') {
        try {
          const res = await booker.generateBookingCode({
            eventId: leg.eventId,
            marketId: leg.marketId,
            marketType: marketData.marketType || marketData.marketName,
            selectionId: leg.selectionId,
            selection: leg.selection,
            outcomeId: leg.selectionId,
            specifier: leg.specifier,
            stake: leg.stake,
            homeTeam: matchMeta.homeTeam,
            awayTeam: matchMeta.awayTeam
          });
          if (typeof res === 'object' && res !== null) {
            leg.code = res.code;
            leg.shareUrl = res.shareUrl;
          } else {
            leg.code = res;
          }
        } catch (err) {
          console.warn(`[ArbDetector] Could not generate code for ${leg.bookmaker}:`, err.message);
          leg.code = null;
        }
      }
    }
  }

  /**
   * Groups matches across feeds using fuzzy matching
   * Strictly filters out in-play or past fixtures.
   */
  _groupMatches(bookmakerFeeds) {
    const groups = [];

    for (const feed of bookmakerFeeds) {
      const bookmakerName = feed.bookmaker;

      for (const match of feed.matches) {
        const isLive = Boolean(match.isLive);
        if (!isLive && match.startTime) {
          const matchTime = new Date(match.startTime).getTime();
          if (!isNaN(matchTime) && matchTime < Date.now() - 10 * 60 * 1000) {
            continue;
          }
        }

        let matchedGroup = groups.find(g => isMatchEqual(g.meta, match) && Boolean(g.meta.isLive) === isLive);

        if (!matchedGroup) {
          matchedGroup = {
            meta: {
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              startTime: match.startTime,
              dateStr: match.dateStr || new Date(match.startTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
              competition: match.competition,
              country: match.country || null,
              sport: match.sport || 'Football',
              isLive,
              preMatch: !isLive,
              liveClock: match.liveClock || null,
              score: match.score || null
            },
            bookmakers: [],
            markets: {},
            twoWayMarkets: {}
          };
          groups.push(matchedGroup);
        }

        if (!matchedGroup.bookmakers.includes(bookmakerName)) {
          matchedGroup.bookmakers.push(bookmakerName);
        }

        // Merge markets dynamically (supports 2-way, 3-way, all lines)
        if (match.markets) {
          for (const m of match.markets) {
            if (!m.outcomes || m.outcomes.length === 0) continue;
            const key = `${m.type}_${m.line || ''}`.trim();

            if (!matchedGroup.markets[key]) {
              matchedGroup.markets[key] = {
                marketName: m.name,
                line: m.line,
                type: m.type,
                outcomes: m.outcomes.map(o => ({ name: o.name, quotes: [] }))
              };
              // Backwards compatibility for tests expecting twoWayMarkets
              matchedGroup.twoWayMarkets[key] = matchedGroup.markets[key];
            }

            for (let i = 0; i < m.outcomes.length; i++) {
              const out = m.outcomes[i];
              // Match by name or index
              let targetOut = matchedGroup.markets[key].outcomes.find(to => to.name.toLowerCase() === out.name.toLowerCase());
              if (!targetOut && matchedGroup.markets[key].outcomes[i]) {
                targetOut = matchedGroup.markets[key].outcomes[i];
              }

              if (targetOut) {
                targetOut.quotes.push({
                  bookmaker: bookmakerName,
                  odds: out.odds,
                  selectionId: out.id,
                  eventId: match.id,
                  marketId: m.id || m.marketId,
                  specifier: m.specifier || null
                });
              }
            }
          }
        }
      }
    }

    // Generate cross-market synthetic hedges (Double Chance vs 1X2, Asian Handicap vs 1X2)
    for (const group of groups) {
      this._generateSyntheticMarkets(group);
    }

    return groups;
  }

  /**
   * Generates cross-market synthetic hedges (e.g. Double Chance vs 1X2, Asian Handicap vs 1X2)
   */
  _generateSyntheticMarkets(group) {
    const markets = group.markets;

    // 1. Double Chance vs 1X2 Hedges
    const m1x2 = Object.values(markets).find(m => m.type === '1x2');
    const mDc = Object.values(markets).find(m => m.type === 'double_chance');

    if (m1x2 && mDc) {
      const home1x2 = m1x2.outcomes.find(o => o.name?.toLowerCase() === 'home');
      const draw1x2 = m1x2.outcomes.find(o => o.name?.toLowerCase() === 'draw');
      const away1x2 = m1x2.outcomes.find(o => o.name?.toLowerCase() === 'away');

      const dc1X = mDc.outcomes.find(o => o.name?.toUpperCase() === '1X');
      const dc12 = mDc.outcomes.find(o => o.name?.toUpperCase() === '12');
      const dcX2 = mDc.outcomes.find(o => o.name?.toUpperCase() === 'X2');

      // A. 1X (Home/Draw) vs Away Win
      if (dc1X?.quotes?.length > 0 && away1x2?.quotes?.length > 0) {
        markets['synth_1x_away'] = {
          marketName: 'Double Chance 1X vs Away Win (Hedge)',
          line: '1X vs 2',
          type: 'synth_1x_away',
          outcomes: [
            { name: '1X (Home or Draw)', quotes: [...dc1X.quotes] },
            { name: 'Away (Win)', quotes: [...away1x2.quotes] }
          ]
        };
      }

      // B. X2 (Draw/Away) vs Home Win
      if (dcX2?.quotes?.length > 0 && home1x2?.quotes?.length > 0) {
        markets['synth_x2_home'] = {
          marketName: 'Double Chance X2 vs Home Win (Hedge)',
          line: 'X2 vs 1',
          type: 'synth_x2_home',
          outcomes: [
            { name: 'X2 (Draw or Away)', quotes: [...dcX2.quotes] },
            { name: 'Home (Win)', quotes: [...home1x2.quotes] }
          ]
        };
      }

      // C. 12 (Home/Away) vs Draw
      if (dc12?.quotes?.length > 0 && draw1x2?.quotes?.length > 0) {
        markets['synth_12_draw'] = {
          marketName: 'Double Chance 12 vs Draw (Hedge)',
          line: '12 vs X',
          type: 'synth_12_draw',
          outcomes: [
            { name: '12 (Home or Away)', quotes: [...dc12.quotes] },
            { name: 'Draw', quotes: [...draw1x2.quotes] }
          ]
        };
      }
    }

    // 2. Asian Handicap +0.5 vs 1X2
    const ah05 = Object.values(markets).find(m => m.type === 'asian_handicap_+0.5' || m.type === 'asian_handicap_0.5');
    if (ah05 && m1x2) {
      const ahHomePlus = ah05.outcomes.find(o => o.name?.toLowerCase().includes('home'));
      const ahAwayPlus = ah05.outcomes.find(o => o.name?.toLowerCase().includes('away'));
      const home1x2 = m1x2.outcomes.find(o => o.name?.toLowerCase() === 'home');
      const away1x2 = m1x2.outcomes.find(o => o.name?.toLowerCase() === 'away');

      if (ahHomePlus?.quotes?.length > 0 && away1x2?.quotes?.length > 0) {
        markets['synth_ah_home_away'] = {
          marketName: 'Asian Handicap +0.5 vs Away Win (Hedge)',
          line: 'Home (+0.5) vs Away',
          type: 'synth_ah_home_away',
          outcomes: [
            { name: 'Home (+0.5)', quotes: [...ahHomePlus.quotes] },
            { name: 'Away (Win)', quotes: [...away1x2.quotes] }
          ]
        };
      }
      if (ahAwayPlus?.quotes?.length > 0 && home1x2?.quotes?.length > 0) {
        markets['synth_ah_away_home'] = {
          marketName: 'Asian Handicap +0.5 vs Home Win (Hedge)',
          line: 'Away (+0.5) vs Home',
          type: 'synth_ah_away_home',
          outcomes: [
            { name: 'Away (+0.5)', quotes: [...ahAwayPlus.quotes] },
            { name: 'Home (Win)', quotes: [...home1x2.quotes] }
          ]
        };
      }
    }
  }
}
