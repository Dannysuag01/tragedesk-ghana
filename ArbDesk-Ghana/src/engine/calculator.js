/**
 * Arbitrage Math & Stake Calculator Engine
 * Handles 2-way and 3-way arbitrage calculations, stake distribution,
 * profit/ROI margins, and "stake-first" execution prioritization.
 */

/**
 * Calculates 2-way arbitrage (e.g., Over/Under, Both Teams To Score, Asian Handicap, DNB)
 * @param {number} odds1 - Decimal odds for Leg 1
 * @param {number} odds2 - Decimal odds for Leg 2
 * @param {number} totalStake - Total amount to stake (in GHS)
 * @param {Object} [meta1] - Metadata for Leg 1 (bookmaker, selection name, etc.)
 * @param {Object} [meta2] - Metadata for Leg 2 (bookmaker, selection name, etc.)
 * @returns {Object|null} Arbitrage opportunity details, or null if no arb
 */
export function calculate2WayArbitrage(odds1, odds2, totalStake = 100, meta1 = {}, meta2 = {}) {
  if (odds1 <= 1 || odds2 <= 1) return null;

  const inv1 = 1 / odds1;
  const inv2 = 1 / odds2;
  const sumInv = inv1 + inv2;

  // Arbitrage exists when sum of inverse odds is less than 1.0
  const isArb = sumInv < 1.0;
  const marginPct = (1 - sumInv) * 100;
  const roiPct = ((1 / sumInv) - 1) * 100;

  // Calculate raw proportional stakes
  let stake1 = (totalStake * (inv1 / sumInv));
  let stake2 = (totalStake * (inv2 / sumInv));

  // Round stakes to 2 decimal places (standard currency)
  stake1 = Math.round(stake1 * 100) / 100;
  stake2 = Math.round((totalStake - stake1) * 100) / 100; // ensure stake1 + stake2 == totalStake

  // Bookmakers floor/truncate fractions of a cent (pesewa) on payout
  const payout1 = Math.floor((stake1 * odds1) * 100) / 100;
  const payout2 = Math.floor((stake2 * odds2) * 100) / 100;
  const guaranteedPayout = Math.min(payout1, payout2);
  const guaranteedProfit = Math.round((guaranteedPayout - totalStake) * 100) / 100;
  const executableRoi = Math.round(((guaranteedProfit / totalStake) * 100) * 100) / 100;

  // Determine "Stake First" priority:
  // The leg with higher odds has higher volatility / probability of moving first.
  const leg1StakeFirst = odds1 >= odds2;

  return {
    isArb,
    marketType: '2-way',
    marginPct: Math.round(marginPct * 100) / 100,
    roiPct: Math.round(roiPct * 100) / 100,
    executableRoi,
    totalStake,
    guaranteedProfit,
    guaranteedPayout,
    legs: [
      {
        ...meta1,
        odds: odds1,
        stake: stake1,
        payout: payout1,
        stakeFirst: leg1StakeFirst,
      },
      {
        ...meta2,
        odds: odds2,
        stake: stake2,
        payout: payout2,
        stakeFirst: !leg1StakeFirst,
      }
    ]
  };
}

/**
 * Calculates 3-way arbitrage (e.g., 1X2 - Home, Draw, Away)
 * @param {number} odds1 - Decimal odds for Home
 * @param {number} odds2 - Decimal odds for Draw
 * @param {number} odds3 - Decimal odds for Away
 * @param {number} totalStake - Total amount to stake (in GHS)
 * @param {Object} [meta1]
 * @param {Object} [meta2]
 * @param {Object} [meta3]
 * @returns {Object|null}
 */
export function calculate3WayArbitrage(odds1, odds2, odds3, totalStake = 100, meta1 = {}, meta2 = {}, meta3 = {}) {
  if (odds1 <= 1 || odds2 <= 1 || odds3 <= 1) return null;

  const inv1 = 1 / odds1;
  const inv2 = 1 / odds2;
  const inv3 = 1 / odds3;
  const sumInv = inv1 + inv2 + inv3;

  const isArb = sumInv < 1.0;
  const marginPct = (1 - sumInv) * 100;
  const roiPct = ((1 / sumInv) - 1) * 100;

  let stake1 = Math.round((totalStake * (inv1 / sumInv)) * 100) / 100;
  let stake2 = Math.round((totalStake * (inv2 / sumInv)) * 100) / 100;
  let stake3 = Math.round((totalStake - stake1 - stake2) * 100) / 100;

  const payout1 = Math.floor((stake1 * odds1) * 100) / 100;
  const payout2 = Math.floor((stake2 * odds2) * 100) / 100;
  const payout3 = Math.floor((stake3 * odds3) * 100) / 100;

  const guaranteedPayout = Math.min(payout1, payout2, payout3);
  const guaranteedProfit = Math.round((guaranteedPayout - totalStake) * 100) / 100;
  const executableRoi = Math.round(((guaranteedProfit / totalStake) * 100) * 100) / 100;

  // Highest odds leg gets "stake first"
  const maxOdds = Math.max(odds1, odds2, odds3);

  return {
    isArb,
    marketType: '3-way',
    marginPct: Math.round(marginPct * 100) / 100,
    roiPct: Math.round(roiPct * 100) / 100,
    executableRoi,
    totalStake,
    guaranteedProfit,
    guaranteedPayout,
    legs: [
      {
        ...meta1,
        odds: odds1,
        stake: stake1,
        payout: payout1,
        stakeFirst: odds1 === maxOdds
      },
      {
        ...meta2,
        odds: odds2,
        stake: stake2,
        payout: payout2,
        stakeFirst: odds2 === maxOdds && odds2 !== odds1
      },
      {
        ...meta3,
        odds: odds3,
        stake: stake3,
        payout: payout3,
        stakeFirst: odds3 === maxOdds && odds3 !== odds1 && odds3 !== odds2
      }
    ]
  };
}
