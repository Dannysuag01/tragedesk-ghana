/**
 * Verified Feeds for Ghanaian Sportsbooks
 * Supports Dual Mode:
 * 1. Pre-Match (Zero Risk, Stable Booking Codes)
 * 2. Live In-Play (High Yield, Rapid Execution)
 * Exclusively pairs verified sportsbooks: SportyBet Ghana, Betpawa Ghana, and 1xBet Ghana.
 */

export function getSampleFeeds() {
  const matchKickoff = '2026-11-13T19:45:00.000Z';

  return [
    {
      bookmaker: 'Sportybet',
      matches: [
        // --- PRE-MATCH FIXTURES ---
        {
          id: 'sr:match:68931586',
          homeTeam: 'Serbia',
          awayTeam: 'Germany',
          sport: 'Football',
          competition: 'UEFA Nations League',
          startTime: matchKickoff,
          dateStr: 'Tonight 19:45',
          isLive: false,
          markets: [
            {
              id: '18',
              marketId: '18',
              type: 'over_under',
              name: 'Over/Under Goals',
              line: 'Total 2.5',
              specifier: 'total=2.5',
              outcomes: [
                { id: '12', name: 'Over 2.5', odds: 1.42 },
                { id: '13', name: 'Under 2.5', odds: 3.00 }
              ]
            }
          ]
        },
        {
          id: 'sr:match:68931584',
          homeTeam: 'Netherlands',
          awayTeam: 'Greece',
          sport: 'Football',
          competition: 'UEFA Nations League',
          startTime: matchKickoff,
          dateStr: 'Tonight 19:45',
          isLive: false,
          markets: [
            {
              id: '18',
              marketId: '18',
              type: 'over_under',
              name: 'Over/Under Goals',
              line: 'Total 2.5',
              specifier: 'total=2.5',
              outcomes: [
                { id: '12', name: 'Over 2.5', odds: 1.48 },
                { id: '13', name: 'Under 2.5', odds: 2.75 }
              ]
            }
          ]
        },
        {
          id: 'sr:match:68932814',
          homeTeam: 'Andorra',
          awayTeam: 'Gibraltar',
          sport: 'Football',
          competition: 'UEFA Nations League',
          startTime: matchKickoff,
          dateStr: 'Tonight 19:45',
          isLive: false,
          markets: [
            {
              id: '29',
              marketId: '29',
              type: 'btts',
              name: 'Both Teams To Score',
              line: 'Yes / No',
              outcomes: [
                { id: '74', name: 'Yes', odds: 3.20 },
                { id: '76', name: 'No', odds: 1.48 }
              ]
            }
          ]
        },
        {
          id: 'sr:match:68932278',
          homeTeam: 'Bulgaria',
          awayTeam: 'Iceland',
          sport: 'Football',
          competition: 'UEFA Nations League',
          startTime: matchKickoff,
          dateStr: 'Tonight 19:45',
          isLive: false,
          markets: [
            {
              id: '18',
              marketId: '18',
              type: 'over_under',
              name: 'Over/Under Goals',
              line: 'Total 2.5',
              specifier: 'total=2.5',
              outcomes: [
                { id: '12', name: 'Over 2.5', odds: 2.05 },
                { id: '13', name: 'Under 2.5', odds: 2.08 }
              ]
            }
          ]
        },

        // --- LIVE IN-PLAY FIXTURES ---
        {
          id: 'sr:match:68931586',
          homeTeam: 'South Africa',
          awayTeam: 'Kenya',
          sport: 'Football',
          competition: 'Africa Cup Of Nations',
          startTime: new Date().toISOString(),
          dateStr: 'Live 74\'',
          isLive: true,
          liveClock: '74\'',
          score: '1 - 1',
          markets: [
            {
              id: '18',
              marketId: '18',
              type: 'over_under',
              name: 'Over/Under Goals',
              line: 'Total 2.5',
              specifier: 'total=2.5',
              outcomes: [
                { id: '12', name: 'Over 2.5', odds: 1.38 },
                { id: '13', name: 'Under 2.5', odds: 3.40 } // SportyBet Under 2.5 @ 3.40
              ]
            }
          ]
        },
        {
          id: 'sr:match:68931584',
          homeTeam: 'Denmark U21',
          awayTeam: 'Netherlands U21',
          sport: 'Football',
          competition: 'UEFA Euro U21 Qual.',
          startTime: new Date().toISOString(),
          dateStr: 'Live 62\'',
          isLive: true,
          liveClock: '62\'',
          score: '0 - 1',
          markets: [
            {
              id: '18',
              marketId: '18',
              type: 'over_under',
              name: 'Over/Under Goals',
              line: 'Total 2.5',
              specifier: 'total=2.5',
              outcomes: [
                { id: '12', name: 'Over 2.5', odds: 1.62 },
                { id: '13', name: 'Under 2.5', odds: 2.45 } // SportyBet Under 2.5 @ 2.45
              ]
            }
          ]
        }
      ]
    },
    {
      bookmaker: 'Betpawa Ghana',
      matches: [
        // --- PRE-MATCH FIXTURES ---
        {
          id: '38822816',
          homeTeam: 'Serbia',
          awayTeam: 'Germany',
          sport: 'Football',
          competition: 'UEFA Nations League',
          startTime: matchKickoff,
          dateStr: 'Tonight 19:45',
          isLive: false,
          markets: [
            {
              id: '5000',
              marketId: '5000',
              type: 'over_under',
              name: 'Over/Under Goals',
              line: 'Total 2.5',
              outcomes: [
                { id: '1577115443', name: 'Over 2.5', odds: 1.44 },
                { id: '1577115444', name: 'Under 2.5', odds: 2.90 }
              ]
            }
          ]
        },
        {
          id: '38888683',
          homeTeam: 'Netherlands',
          awayTeam: 'Greece',
          sport: 'Football',
          competition: 'UEFA Nations League',
          startTime: matchKickoff,
          dateStr: 'Tonight 19:45',
          isLive: false,
          markets: [
            {
              id: '5000',
              marketId: '5000',
              type: 'over_under',
              name: 'Over/Under Goals',
              line: 'Total 2.5',
              outcomes: [
                { id: '1579401839', name: 'Over 2.5', odds: 1.50 },
                { id: '1579401840', name: 'Under 2.5', odds: 2.69 }
              ]
            }
          ]
        },
        {
          id: '38909685',
          homeTeam: 'Andorra',
          awayTeam: 'Gibraltar',
          sport: 'Football',
          competition: 'UEFA Nations League',
          startTime: matchKickoff,
          dateStr: 'Tonight 19:45',
          isLive: false,
          markets: [
            {
              id: '5005',
              marketId: '5005',
              type: 'btts',
              name: 'Both Teams To Score',
              line: 'Yes / No',
              outcomes: [
                { id: '1590832284', name: 'Yes', odds: 3.24 },
                { id: '1590832285', name: 'No', odds: 1.35 }
              ]
            }
          ]
        },
        {
          id: '38795711',
          homeTeam: 'Bulgaria',
          awayTeam: 'Iceland',
          sport: 'Football',
          competition: 'UEFA Nations League',
          startTime: matchKickoff,
          dateStr: 'Tonight 19:45',
          isLive: false,
          markets: [
            {
              id: '5000',
              marketId: '5000',
              type: 'over_under',
              name: 'Over/Under Goals',
              line: 'Total 2.5',
              outcomes: [
                { id: '1578284299', name: 'Over 2.5', odds: 2.06 },
                { id: '1578284300', name: 'Under 2.5', odds: 1.80 }
              ]
            }
          ]
        },

        // --- LIVE IN-PLAY FIXTURES ---
        {
          id: '38822816',
          homeTeam: 'South Africa',
          awayTeam: 'Kenya',
          sport: 'Football',
          competition: 'Africa Cup Of Nations',
          startTime: new Date().toISOString(),
          dateStr: 'Live 74\'',
          isLive: true,
          liveClock: '74\'',
          score: '1 - 1',
          markets: [
            {
              id: '5000',
              marketId: '5000',
              type: 'over_under',
              name: 'Over/Under Goals',
              line: 'Total 2.5',
              outcomes: [
                { id: '1577115443', name: 'Over 2.5', odds: 1.62 }, // Betpawa Over 2.5 @ 1.62 -> Arb vs Sporty 3.40 (13.6% Margin!)
                { id: '1577115444', name: 'Under 2.5', odds: 2.40 }
              ]
            }
          ]
        },
        {
          id: '38888683',
          homeTeam: 'Denmark U21',
          awayTeam: 'Netherlands U21',
          sport: 'Football',
          competition: 'UEFA Euro U21 Qual.',
          startTime: new Date().toISOString(),
          dateStr: 'Live 62\'',
          isLive: true,
          liveClock: '62\'',
          score: '0 - 1',
          markets: [
            {
              id: '5000',
              marketId: '5000',
              type: 'over_under',
              name: 'Over/Under Goals',
              line: 'Total 2.5',
              outcomes: [
                { id: '1579401839', name: 'Over 2.5', odds: 1.85 }, // Betpawa Over 2.5 @ 1.85 -> Arb vs Sporty 2.45 (8.35% Margin!)
                { id: '1579401840', name: 'Under 2.5', odds: 1.95 }
              ]
            }
          ]
        }
      ]
    }
  ];
}
