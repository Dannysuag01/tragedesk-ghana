import test from 'node:test';
import assert from 'node:assert';
import { ArbDetector } from '../src/engine/detector.js';

test('detects 2-way arbitrage on Over/Under lines (e.g. Over/Under 3.5)', async () => {
  const detector = new ArbDetector({ minMargin: 0.1, maxMargin: 25.0 });

  const feeds = [
    {
      bookmaker: 'Betpawa Ghana',
      matches: [
        {
          id: 'bp_101',
          homeTeam: 'Arsenal FC',
          awayTeam: 'Chelsea FC',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          markets: [
            {
              id: '5000',
              type: 'over_under_3.5',
              name: 'Over/Under Goals',
              line: 'Total 3.5',
              outcomes: [
                { id: 'bp_o35', name: 'Over 3.5', odds: 3.50 },
                { id: 'bp_u35', name: 'Under 3.5', odds: 1.30 }
              ]
            }
          ]
        }
      ]
    },
    {
      bookmaker: 'Sportybet',
      matches: [
        {
          id: 'sp_101',
          homeTeam: 'Arsenal',
          awayTeam: 'Chelsea',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          markets: [
            {
              id: '18',
              type: 'over_under_3.5',
              name: 'Over/Under Goals',
              line: 'Total 3.5',
              outcomes: [
                { id: 'sp_o35', name: 'Over 3.5', odds: 2.20 },
                { id: 'sp_u35', name: 'Under 3.5', odds: 1.55 }
              ]
            }
          ]
        }
      ]
    }
  ];

  const opps = await detector.findOpportunities(feeds);
  assert.strictEqual(opps.length, 1);
  assert.strictEqual(opps[0].market, 'Over/Under Goals');
  assert.strictEqual(opps[0].line, 'Total 3.5');
  assert(opps[0].marginPct > 0);
  assert.strictEqual(opps[0].legs.length, 2);
});

test('detects 3-way arbitrage on 1X2 market across three bookmakers', async () => {
  const detector = new ArbDetector({ minMargin: 0.1, maxMargin: 25.0 });

  const feeds = [
    {
      bookmaker: 'Betpawa Ghana',
      matches: [
        {
          id: 'bp_102',
          homeTeam: 'Liverpool FC',
          awayTeam: 'Manchester City',
          startTime: new Date(Date.now() + 7200000).toISOString(),
          markets: [
            {
              id: '1000',
              type: '1x2',
              name: '1X2 (Full Time)',
              line: 'Full Time',
              outcomes: [
                { id: 'bp_h', name: 'Home', odds: 2.80 },
                { id: 'bp_d', name: 'Draw', odds: 3.30 },
                { id: 'bp_a', name: 'Away', odds: 2.20 }
              ]
            }
          ]
        }
      ]
    },
    {
      bookmaker: 'Sportybet',
      matches: [
        {
          id: 'sp_102',
          homeTeam: 'Liverpool',
          awayTeam: 'Man City',
          startTime: new Date(Date.now() + 7200000).toISOString(),
          markets: [
            {
              id: '1',
              type: '1x2',
              name: '1X2 (Full Time)',
              line: 'Full Time',
              outcomes: [
                { id: 'sp_h', name: 'Home', odds: 2.20 },
                { id: 'sp_d', name: 'Draw', odds: 4.20 },
                { id: 'sp_a', name: 'Away', odds: 2.50 }
              ]
            }
          ]
        }
      ]
    },
    {
      bookmaker: '1xBet Ghana',
      matches: [
        {
          id: '1x_102',
          homeTeam: 'Liverpool',
          awayTeam: 'Manchester City',
          startTime: new Date(Date.now() + 7200000).toISOString(),
          markets: [
            {
              id: '1',
              type: '1x2',
              name: '1X2 (Full Time)',
              line: 'Full Time',
              outcomes: [
                { id: '1x_h', name: 'Home', odds: 2.30 },
                { id: '1x_d', name: 'Draw', odds: 3.40 },
                { id: '1x_a', name: 'Away', odds: 3.10 }
              ]
            }
          ]
        }
      ]
    }
  ];

  // Best odds: Home @ Betpawa 2.80, Draw @ Sportybet 4.20, Away @ 1xBet 3.10
  // Sum of inverses = 1/2.80 + 1/4.20 + 1/3.10 = 0.3571 + 0.2381 + 0.3226 = 0.9178 < 1.0 (Arbitrage!)
  const opps = await detector.findOpportunities(feeds);
  assert.strictEqual(opps.length, 1);
  assert.strictEqual(opps[0].market, '1X2 (Full Time)');
  assert.strictEqual(opps[0].legs.length, 3);
  assert(opps[0].marginPct > 8.0);
});


test('detects 2-way Asian Handicap arbitrage', async () => {
  const detector = new ArbDetector({ minMargin: 0.1, maxMargin: 25.0 });

  const feeds = [
    {
      bookmaker: 'Sportybet',
      matches: [
        {
          id: 'sp_201',
          homeTeam: 'Real Madrid',
          awayTeam: 'Barcelona',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          markets: [
            {
              id: '64',
              type: 'asian_handicap_+0.5',
              name: 'Asian Handicap',
              line: 'Handicap +0.5',
              outcomes: [
                { id: 'sp_ah_h', name: 'Home (+0.5)', odds: 2.15 },
                { id: 'sp_ah_a', name: 'Away (-0.5)', odds: 1.75 }
              ]
            }
          ]
        }
      ]
    },
    {
      bookmaker: 'Betpawa Ghana',
      matches: [
        {
          id: 'bp_201',
          homeTeam: 'Real Madrid',
          awayTeam: 'Barcelona',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          markets: [
            {
              id: '5064',
              type: 'asian_handicap_+0.5',
              name: 'Asian Handicap',
              line: 'Handicap +0.5',
              outcomes: [
                { id: 'bp_ah_h', name: 'Home (+0.5)', odds: 1.80 },
                { id: 'bp_ah_a', name: 'Away (-0.5)', odds: 2.10 }
              ]
            }
          ]
        }
      ]
    }
  ];

  // Best: Home (+0.5) @ Sportybet 2.15, Away (-0.5) @ Betpawa 2.10
  // Sum = 1/2.15 + 1/2.10 = 0.4651 + 0.4761 = 0.9412 < 1.0 (Arbitrage!)
  const opps = await detector.findOpportunities(feeds);
  const ahArb = opps.find(o => o.market === 'Asian Handicap');
  assert(ahArb, 'Should find Asian Handicap arb');
  assert.strictEqual(ahArb.legs.length, 2);
  assert(ahArb.marginPct > 5.0);
});

test('detects cross-market synthetic hedge: Double Chance 1X vs 1X2 Away Win', async () => {
  const detector = new ArbDetector({ minMargin: 0.1, maxMargin: 25.0 });

  const feeds = [
    {
      bookmaker: 'Sportybet',
      matches: [
        {
          id: 'sp_301',
          homeTeam: 'Juventus',
          awayTeam: 'AC Milan',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          markets: [
            {
              id: '10',
              type: 'double_chance',
              name: 'Double Chance',
              line: 'Double Chance',
              outcomes: [
                { id: 'sp_dc_1x', name: '1X', odds: 1.85 },
                { id: 'sp_dc_12', name: '12', odds: 1.35 },
                { id: 'sp_dc_x2', name: 'X2', odds: 1.80 }
              ]
            }
          ]
        }
      ]
    },
    {
      bookmaker: 'Betpawa Ghana',
      matches: [
        {
          id: 'bp_301',
          homeTeam: 'Juventus',
          awayTeam: 'AC Milan',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          markets: [
            {
              id: '1000',
              type: '1x2',
              name: '1X2 (Full Time)',
              line: 'Full Time',
              outcomes: [
                { id: 'bp_1x2_h', name: 'Home', odds: 2.10 },
                { id: 'bp_1x2_d', name: 'Draw', odds: 3.30 },
                { id: 'bp_1x2_a', name: 'Away', odds: 2.45 }
              ]
            }
          ]
        }
      ]
    }
  ];

  // Best: 1X @ Sportybet 1.85, Away Win @ Betpawa 2.45
  // Sum = 1/1.85 + 1/2.45 = 0.5405 + 0.4081 = 0.9486 < 1.0 (Arbitrage!)
  const opps = await detector.findOpportunities(feeds);
  const synthArb = opps.find(o => o.market.includes('Double Chance 1X vs Away'));
  assert(synthArb, 'Should detect synthetic hedge arb between 1X and Away');
  assert.strictEqual(synthArb.legs.length, 2);
  assert(synthArb.marginPct > 5.0);
});

test('detects Home Team Total Goals arbitrage (Home Over/Under 1.5)', async () => {
  const detector = new ArbDetector({ minMargin: 0.1, maxMargin: 25.0 });

  const feeds = [
    {
      bookmaker: 'Sportybet',
      matches: [
        {
          id: 'sp_401',
          homeTeam: 'Bayern Munich',
          awayTeam: 'Dortmund',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          markets: [
            {
              id: '19',
              type: 'home_total_1.5',
              name: 'Home Total Goals',
              line: 'Home Total 1.5',
              outcomes: [
                { id: 'sp_hto_15', name: 'Home Over 1.5', odds: 2.25 },
                { id: 'sp_htu_15', name: 'Home Under 1.5', odds: 1.60 }
              ]
            }
          ]
        }
      ]
    },
    {
      bookmaker: 'Betpawa Ghana',
      matches: [
        {
          id: 'bp_401',
          homeTeam: 'Bayern Munich',
          awayTeam: 'Dortmund',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          markets: [
            {
              id: '5019',
              type: 'home_total_1.5',
              name: 'Home Total Goals',
              line: 'Home Total 1.5',
              outcomes: [
                { id: 'bp_hto_15', name: 'Home Over 1.5', odds: 1.70 },
                { id: 'bp_htu_15', name: 'Home Under 1.5', odds: 2.15 }
              ]
            }
          ]
        }
      ]
    }
  ];

  // Best: Home Over 1.5 @ Sportybet 2.25, Home Under 1.5 @ Betpawa 2.15
  // Sum = 1/2.25 + 1/2.15 = 0.4444 + 0.4651 = 0.9095 < 1.0 (Arbitrage!)
  const opps = await detector.findOpportunities(feeds);
  const teamTotalArb = opps.find(o => o.market === 'Home Total Goals');
  assert(teamTotalArb, 'Should detect Home Total Goals arb');
  assert.strictEqual(teamTotalArb.line, 'Home Total 1.5');
  assert(teamTotalArb.marginPct > 9.0);
});

test('strictly rejects non-profitable opportunities when odds drop (e.g. Betpawa drops from 1.35 to 1.22)', async () => {
  const detector = new ArbDetector({ minMargin: 0.1, maxMargin: 25.0 });

  // Scenario 1: Betpawa @ 1.35 vs Sportybet Away @ 4.90 -> PROFITABLE (+5.52%)
  const profitableFeeds = [
    {
      bookmaker: 'Betpawa Ghana',
      matches: [{
        homeTeam: 'Kosovo',
        awayTeam: 'Israel',
        sport: 'Football',
        markets: [{
          id: '5064',
          type: 'asian_handicap_+0.5',
          name: 'Asian Handicap',
          line: 'Handicap +0.5',
          outcomes: [
            { id: 'bp_1', name: 'Home (+0.5)', odds: 1.35 },
            { id: 'bp_2', name: 'Away (-0.5)', odds: 3.80 }
          ]
        }]
      }]
    },
    {
      bookmaker: 'Sportybet',
      matches: [{
        homeTeam: 'Kosovo',
        awayTeam: 'Israel',
        sport: 'Football',
        markets: [{
          id: '1',
          type: '1x2',
          name: '1X2 (Full Time)',
          outcomes: [
            { id: 'sp_1', name: 'Home', odds: 1.70 },
            { id: 'sp_x', name: 'Draw', odds: 3.50 },
            { id: 'sp_2', name: 'Away', odds: 4.90 }
          ]
        }]
      }]
    }
  ];

  const profOpps = await detector.findOpportunities(profitableFeeds);
  assert.strictEqual(profOpps.length, 1, 'Should detect profitable opportunity at 1.35');
  assert(profOpps[0].marginPct > 5.0, 'Margin should be ~5.52%');

  // Scenario 2: Betpawa drops to 1.22 vs Sportybet Away @ 4.90 -> NOT PROFITABLE (sumInv > 1.0)
  const reducedOddsFeeds = [
    {
      bookmaker: 'Betpawa Ghana',
      matches: [{
        homeTeam: 'Kosovo',
        awayTeam: 'Israel',
        sport: 'Football',
        markets: [{
          id: '5064',
          type: 'asian_handicap_+0.5',
          name: 'Asian Handicap',
          line: 'Handicap +0.5',
          outcomes: [
            { id: 'bp_1', name: 'Home (+0.5)', odds: 1.22 }, // DROPPED ODDS
            { id: 'bp_2', name: 'Away (-0.5)', odds: 4.50 }
          ]
        }]
      }]
    },
    {
      bookmaker: 'Sportybet',
      matches: [{
        homeTeam: 'Kosovo',
        awayTeam: 'Israel',
        sport: 'Football',
        markets: [{
          id: '1',
          type: '1x2',
          name: '1X2 (Full Time)',
          outcomes: [
            { id: 'sp_1', name: 'Home', odds: 1.70 },
            { id: 'sp_x', name: 'Draw', odds: 3.50 },
            { id: 'sp_2', name: 'Away', odds: 4.90 }
          ]
        }]
      }]
    }
  ];

  const reducedOpps = await detector.findOpportunities(reducedOddsFeeds);
  assert.strictEqual(reducedOpps.length, 0, 'Must NOT show or return opportunity when odds drop and profit is gone');
});

test('never matches half-time or corner markets against full-time markets', async () => {
  const detector = new ArbDetector({ minMargin: 0.1, maxMargin: 25.0 });

  const feeds = [
    {
      bookmaker: 'Betpawa Ghana',
      matches: [{
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        sport: 'Football',
        markets: [
          // 1st Half Over 1.5 @ 2.50
          {
            id: '5068',
            type: '1h_over_under_1.5',
            name: '1st Half Over/Under',
            line: '1H Total 1.5',
            outcomes: [
              { id: 'bp_1h_o', name: '1H Over 1.5', odds: 2.50 },
              { id: 'bp_1h_u', name: '1H Under 1.5', odds: 1.55 }
            ]
          }
        ]
      }]
    },
    {
      bookmaker: 'Sportybet',
      matches: [{
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        sport: 'Football',
        markets: [
          // Full Time Under 1.5 @ 4.00
          {
            id: '18',
            type: 'over_under_1.5',
            name: 'Over/Under Goals',
            line: 'Total 1.5',
            outcomes: [
              { id: 'sp_ft_o', name: 'Over 1.5', odds: 1.25 },
              { id: 'sp_ft_u', name: 'Under 1.5', odds: 4.00 }
            ]
          }
        ]
      }]
    }
  ];

  // 1H Over 1.5 @ 2.50 + FT Under 1.5 @ 4.00 would mathematically look like an arb if types collided
  // BUT THEY ARE DIFFERENT PERIODS! 1H Over 1.5 vs FT Under 1.5 must NEVER pair!
  const opps = await detector.findOpportunities(feeds);
  assert.strictEqual(opps.length, 0, 'Must NEVER cross-pair 1st Half with Full Time markets');
});

test('never matches Team Totals against Match Totals', async () => {
  const detector = new ArbDetector({ minMargin: 0.1, maxMargin: 25.0 });

  const feeds = [
    {
      bookmaker: 'Betpawa Ghana',
      matches: [{
        homeTeam: 'Liverpool',
        awayTeam: 'Everton',
        sport: 'Football',
        markets: [
          // Home Team Over 1.5 @ 2.20
          {
            id: '5019',
            type: 'home_total_1.5',
            name: 'Home Total Goals',
            line: 'Home Total 1.5',
            outcomes: [
              { id: 'bp_ht_o', name: 'Home Over 1.5', odds: 2.20 },
              { id: 'bp_ht_u', name: 'Home Under 1.5', odds: 1.65 }
            ]
          }
        ]
      }]
    },
    {
      bookmaker: 'Sportybet',
      matches: [{
        homeTeam: 'Liverpool',
        awayTeam: 'Everton',
        sport: 'Football',
        markets: [
          // Match Under 1.5 @ 3.80
          {
            id: '18',
            type: 'over_under_1.5',
            name: 'Over/Under Goals',
            line: 'Total 1.5',
            outcomes: [
              { id: 'sp_ft_o', name: 'Over 1.5', odds: 1.28 },
              { id: 'sp_ft_u', name: 'Under 1.5', odds: 3.80 }
            ]
          }
        ]
      }]
    }
  ];

  const opps = await detector.findOpportunities(feeds);
  assert.strictEqual(opps.length, 0, 'Must NEVER cross-pair Home Team Total with Match Total');
});

test('never extracts or pairs Corner Asian Handicap or Half-Time Handicap against Match 1X2', async () => {
  const detector = new ArbDetector({ minMargin: 0.1, maxMargin: 25.0 });

  // Betpawa Corner Asian Handicap First Half @ 1.35 vs Sportybet Full Time Away Win @ 4.90
  // When market extraction strictly tags period and stat as corner/half, types can NEVER collide
  const feeds = [
    {
      bookmaker: 'Betpawa Ghana',
      matches: [{
        homeTeam: 'Kosovo',
        awayTeam: 'Israel',
        sport: 'Football',
        markets: [
          {
            id: '5099',
            type: '1h_corner_asian_handicap_+0.5',
            name: 'Corner Asian Handicap (1st Half)',
            line: '1H Corners +0.5',
            outcomes: [
              { id: 'bp_c1', name: 'Home (+0.5)', odds: 1.35 },
              { id: 'bp_c2', name: 'Away (-0.5)', odds: 2.95 }
            ]
          }
        ]
      }]
    },
    {
      bookmaker: 'Sportybet',
      matches: [{
        homeTeam: 'Kosovo',
        awayTeam: 'Israel',
        sport: 'Football',
        markets: [
          {
            id: '1',
            type: '1x2',
            name: '1X2 (Full Time)',
            outcomes: [
              { id: 'sp_1', name: 'Home', odds: 1.70 },
              { id: 'sp_x', name: 'Draw', odds: 3.50 },
              { id: 'sp_2', name: 'Away', odds: 4.90 }
            ]
          }
        ]
      }]
    }
  ];

  const opps = await detector.findOpportunities(feeds);
  assert.strictEqual(opps.length, 0, 'Must NEVER pair Corner Asian Handicap (1st Half) against Full Time 1X2 Away Win');
});
