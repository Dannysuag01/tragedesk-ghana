import { BaseBookmaker } from './base.js';
import { formatProxyUrl } from '../utils/proxy_helper.js';

/**
 * Soccabet Ghana Connector
 * Connects to Soccabet Ghana's public sports interface.
 * Employs direct 1-click match betslip routing (no broken booking codes).
 *
 * Includes failure cooldown: if all endpoints fail, suppresses retries
 * for 5 minutes to avoid flooding logs every 3 seconds.
 */
export class SoccabetLiveConnector extends BaseBookmaker {
  constructor() {
    super('Soccabet Ghana', 'https://www.soccabet.com');
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.soccabet.com/',
      'Origin': 'https://www.soccabet.com'
    };

    // Cooldown after repeated failures
    this._blockedUntil = 0;
    this._BLOCK_COOLDOWN = 5 * 60 * 1000; // 5 minutes
    this._consecutiveFailures = 0;
  }

  /**
   * Parses a raw fixture object into a normalised match record.
   * Returns null if essential fields are missing.
   */
  _parseFixture(f) {
    const homeTeam = f.homeTeam || f.home_team || f.HomeTeam;
    const awayTeam = f.awayTeam || f.away_team || f.AwayTeam;
    if (!homeTeam || !awayTeam) return null;

    const markets = [];

    // 1X2 market
    const odds1 = parseFloat(f.odds1 || f.home_odds || f.HomeOdds);
    const oddsX = parseFloat(f.oddsX || f.draw_odds || f.DrawOdds);
    const odds2 = parseFloat(f.odds2 || f.away_odds || f.AwayOdds);
    if (odds1 > 1 && odds2 > 1) {
      markets.push({
        id: '1',
        type: '1x2',
        name: '1X2 (Full Time)',
        line: 'Full Time',
        outcomes: [
          { id: `${f.id}_1`, name: 'Home', odds: odds1 },
          ...(oddsX > 1 ? [{ id: `${f.id}_x`, name: 'Draw', odds: oddsX }] : []),
          { id: `${f.id}_2`, name: 'Away', odds: odds2 }
        ]
      });
    }

    // Over/Under market (if available)
    const over = parseFloat(f.overOdds || f.over_odds || f.OverOdds);
    const under = parseFloat(f.underOdds || f.under_odds || f.UnderOdds);
    const ouLine = f.ouLine || f.ou_line || f.OULine || 2.5;
    if (over > 1 && under > 1) {
      markets.push({
        id: '2',
        type: `over_under_${ouLine}`,
        name: 'Over/Under Goals',
        line: `Total ${ouLine}`,
        outcomes: [
          { id: `${f.id}_over`, name: `Over ${ouLine}`, odds: over },
          { id: `${f.id}_under`, name: `Under ${ouLine}`, odds: under }
        ]
      });
    }

    if (markets.length === 0) return null;

    return {
      id: String(f.id || `${homeTeam}_${awayTeam}`),
      homeTeam,
      awayTeam,
      sport: 'Football',
      competition: f.tournament || f.league || f.competition || 'Football',
      startTime: f.startTime || f.start_time || f.StartTime || new Date(Date.now() + 3600000).toISOString(),
      dateStr: 'Upcoming',
      isLive: false,
      markets
    };
  }

  /**
   * Fetches real upcoming pre-match fixtures from Soccabet.
   * Primary source is Soccabet's live initial state data (`/api/sports/isd.js`).
   * Returns [] without throwing if all endpoints fail.
   * Enters 5-minute cooldown after 3 consecutive total failures.
   * @returns {Promise<Array<Object>>}
   */
  async fetchOdds() {
    // Fast-exit during cooldown
    if (Date.now() < this._blockedUntil) {
      return [];
    }

    // 1. Primary High-Reliability Feed: Soccabet ISD
    try {
      const isdUrl = `https://www.soccabet.com/api/sports/isd.js?t=${Date.now()}`;
      const res = await fetch(formatProxyUrl(isdUrl), {
        headers: this.headers,
        signal: AbortSignal.timeout(4000)
      });

      if (res.ok) {
        const text = await res.text();
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1) {
          const jsonArr = JSON.parse(text.slice(start, end + 1));
          const sports = new Map(jsonArr.filter(x => x.object === 'sport').map(s => [s.id, s.name]));
          const categories = new Map(jsonArr.filter(x => x.object === 'category').map(c => [c.id, { name: c.name, sportId: c.sportId }]));
          const tournaments = new Map(jsonArr.filter(x => x.object === 'tournament').map(t => [t.id, { name: t.name, categoryId: t.categoryId }]));
          const markets = jsonArr.filter(x => x.object === 'market');
          const matches = jsonArr.filter(x => x.object === 'match');

          const parsed = [];
          for (const m of matches) {
            if (!m.competitors || m.competitors.length < 2) continue;
            // Strictly Pre-Match only: ignore in-play / live matches or past fixtures
            if (m.isLive) continue;
            if (m.startTs && m.startTs * 1000 <= Date.now()) continue;

            const homeTeam = m.competitors[0];
            const awayTeam = m.competitors[1];
            const tourneyInfo = tournaments.get(m.tournamentId);
            const catInfo = tourneyInfo ? categories.get(tourneyInfo.categoryId) : null;
            const sportName = catInfo ? sports.get(catInfo.sportId) : 'Football';
            const compName = tourneyInfo ? `${catInfo?.name ? catInfo.name + ' - ' : ''}${tourneyInfo.name}` : 'Football';

            const mMarkets = [];
            const matchMkts = markets.filter(mk => mk.matchId === m.id);
            for (const mk of matchMkts) {
              const s1 = mk.selections?.find(s => s.outcome === '1');
              const sx = mk.selections?.find(s => s.outcome === 'X');
              const s2 = mk.selections?.find(s => s.outcome === '2');

              // 1. 1X2 Full Time
              if (s1 && s2 && s1.odds > 1 && s2.odds > 1) {
                mMarkets.push({
                  id: String(mk.id),
                  type: '1x2',
                  name: '1X2 (Full Time)',
                  line: 'Full Time',
                  outcomes: [
                    { id: String(s1.id), name: 'Home', odds: parseFloat(s1.odds) },
                    ...(sx ? [{ id: String(sx.id), name: 'Draw', odds: parseFloat(sx.odds) }] : []),
                    { id: String(s2.id), name: 'Away', odds: parseFloat(s2.odds) }
                  ]
                });
              }

              // 2. Double Chance
              const s1x = mk.selections?.find(s => s.outcome === '1X' || s.outcome === '1/X' || s.name === '1X');
              const sx2 = mk.selections?.find(s => s.outcome === 'X2' || s.outcome === 'X/2' || s.name === 'X2');
              const s12 = mk.selections?.find(s => s.outcome === '12' || s.outcome === '1/2' || s.name === '12');
              if (s1x && sx2 && s1x.odds > 1 && sx2.odds > 1) {
                mMarkets.push({
                  id: String(mk.id),
                  type: 'double_chance',
                  name: 'Double Chance',
                  line: 'Full Time',
                  outcomes: [
                    { id: String(s1x.id), name: '1X', odds: parseFloat(s1x.odds) },
                    ...(s12 ? [{ id: String(s12.id), name: '12', odds: parseFloat(s12.odds) }] : []),
                    { id: String(sx2.id), name: 'X2', odds: parseFloat(sx2.odds) }
                  ]
                });
              }

              // 3. Over / Under Totals
              const sOver = mk.selections?.find(s => s.outcome === 'Over' || s.outcome?.toLowerCase() === 'over' || s.name?.toLowerCase()?.startsWith('over'));
              const sUnder = mk.selections?.find(s => s.outcome === 'Under' || s.outcome?.toLowerCase() === 'under' || s.name?.toLowerCase()?.startsWith('under'));
              if (sOver && sUnder && sOver.odds > 1 && sUnder.odds > 1) {
                const line = mk.param || mk.line || mk.handicap || 2.5;
                mMarkets.push({
                  id: String(mk.id),
                  type: `over_under_${line}`,
                  name: 'Over/Under Goals',
                  line: `Total ${line}`,
                  outcomes: [
                    { id: String(sOver.id), name: `Over ${line}`, odds: parseFloat(sOver.odds) },
                    { id: String(sUnder.id), name: `Under ${line}`, odds: parseFloat(sUnder.odds) }
                  ]
                });
              }

              // 4. Both Teams to Score (BTTS)
              const bttsYes = mk.selections?.find(s => s.outcome === 'Yes' || s.outcome === 'GG');
              const bttsNo = mk.selections?.find(s => s.outcome === 'No' || s.outcome === 'NG');
              if (bttsYes && bttsNo && bttsYes.odds > 1 && bttsNo.odds > 1) {
                mMarkets.push({
                  id: String(mk.id),
                  type: 'btts',
                  name: 'Both Teams to Score',
                  line: 'Full Time',
                  outcomes: [
                    { id: String(bttsYes.id), name: 'Yes', odds: parseFloat(bttsYes.odds) },
                    { id: String(bttsNo.id), name: 'No', odds: parseFloat(bttsNo.odds) }
                  ]
                });
              }
            }

            if (mMarkets.length > 0) {
              parsed.push({
                id: String(m.id),
                homeTeam,
                awayTeam,
                sport: sportName || 'Football',
                competition: compName,
                country: catInfo?.name || 'International',
                startTime: new Date(m.startTs * 1000).toISOString(),
                dateStr: new Date(m.startTs * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
                isLive: Boolean(m.isLive),
                code: m.code || null,
                markets: mMarkets
              });
            }
          }

          if (parsed.length > 0) {
            console.log(`[Soccabet] Fetched ${parsed.length} pre-match fixtures from Soccabet ISD`);
            this._consecutiveFailures = 0;
            return parsed;
          }
        }
      }
    } catch (err) {
      // Fall through to secondary endpoints
    }

    // 2. Secondary fallback endpoints
    const endpoints = [
      'https://www.soccabet.com/api/v1/sportsbook/fixtures?sportId=1&take=50',
      'https://www.soccabet.com/api/v2/fixtures?sport=soccer&limit=50',
      'https://soccabet.com/api/sportsbook/events?sport=1&status=prematch&limit=50'
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(formatProxyUrl(url), {
          headers: this.headers,
          signal: AbortSignal.timeout(2000)
        });

        // Skip Cloudflare / auth-wall responses
        if (res.status === 403 || res.status === 429) {
          continue;
        }
        if (!res.ok) {
          continue;
        }

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          continue;
        }

        let data;
        try {
          data = await res.json();
        } catch {
          continue;
        }

        // Normalise response envelope
        const rawList = Array.isArray(data)
          ? data
          : (data.data || data.fixtures || data.events || data.results || []);

        if (!Array.isArray(rawList) || rawList.length === 0) {
          continue;
        }

        const matches = rawList.map(f => this._parseFixture(f)).filter(Boolean);
        if (matches.length === 0) {
          continue;
        }

        console.log(`[Soccabet] Fetched ${matches.length} fixtures`);
        this._consecutiveFailures = 0; // Reset on success
        return matches;

      } catch (err) {
        // Silently continue to next endpoint
      }
    }

    // All endpoints failed
    this._consecutiveFailures++;
    if (this._consecutiveFailures >= 3) {
      // Log once, then go silent for 5 minutes
      console.warn('[Soccabet] All endpoints failed 3× — entering 5 min cooldown');
      this._blockedUntil = Date.now() + this._BLOCK_COOLDOWN;
      this._consecutiveFailures = 0;
    }
    return [];
  }

  /**
   * Generates direct betslip share URL for Soccabet Ghana.
   */
  async generateBookingCode(selection = {}) {
    if (selection.code) {
      return {
        code: String(selection.code),
        shareUrl: 'https://www.soccabet.com/'
      };
    }
    const query = selection.homeTeam || selection.selection || 'soccer';
    const shareUrl = `${this.baseUrl}/sports/search?q=${encodeURIComponent(query)}`;
    return {
      code: null,
      shareUrl
    };
  }
}
