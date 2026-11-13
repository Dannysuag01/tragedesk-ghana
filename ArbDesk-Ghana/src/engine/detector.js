/**
 * Arbitrage Detector Engine
 * Finds arbitrage opportunities across normalized bookmaker odds feeds,
 * checks margins, and attaches booking codes.
 * Strictly Pre-Match Only (Filters out in-play/live fixtures)
 */

import { isMatchEqual } from './normalizer.js';
import { calculate2WayArbitrage } from './calculator.js';

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

      // Evaluate 2-Way Markets (e.g. Over/Under, Both Teams To Score)
      for (const marketKey of Object.keys(group.twoWayMarkets)) {
        const marketData = group.twoWayMarkets[marketKey];
        if (!marketData.outcomes || marketData.outcomes.length < 2) continue;

        // Find highest odds for Outcome 1 and Outcome 2 across all bookies
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
            // Attach booking codes if bookers are provided
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
              sport: match.sport || 'Football',
              isLive,
              preMatch: !isLive,
              liveClock: match.liveClock || null,
              score: match.score || null
            },
            bookmakers: [],
            twoWayMarkets: {}
          };
          groups.push(matchedGroup);
        }

        if (!matchedGroup.bookmakers.includes(bookmakerName)) {
          matchedGroup.bookmakers.push(bookmakerName);
        }

        // Merge markets
        if (match.markets) {
          for (const m of match.markets) {
            const key = `${m.type}_${m.line || ''}`;
            if (!matchedGroup.twoWayMarkets[key]) {
              matchedGroup.twoWayMarkets[key] = {
                marketName: m.name,
                line: m.line,
                outcomes: [
                  { name: m.outcomes[0].name, quotes: [] },
                  { name: m.outcomes[1].name, quotes: [] }
                ]
              };
            }

            matchedGroup.twoWayMarkets[key].outcomes[0].quotes.push({
              bookmaker: bookmakerName,
              odds: m.outcomes[0].odds,
              selectionId: m.outcomes[0].id,
              eventId: match.id,
              marketId: m.id || m.marketId,
              specifier: m.specifier || null
            });

            matchedGroup.twoWayMarkets[key].outcomes[1].quotes.push({
              bookmaker: bookmakerName,
              odds: m.outcomes[1].odds,
              selectionId: m.outcomes[1].id,
              eventId: match.id,
              marketId: m.id || m.marketId,
              specifier: m.specifier || null
            });
          }
        }
      }
    }

    return groups;
  }
}
