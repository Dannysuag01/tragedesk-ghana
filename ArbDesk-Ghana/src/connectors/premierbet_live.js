import { BaseBookmaker } from './base.js';
import { formatProxyUrl } from '../utils/proxy_helper.js';

/**
 * PremierBet Ghana Connector
 * Connects to PremierBet Ghana sports feed.
 * Fully isolated markets: 1X2, Over/Under, Double Chance.
 */
export class PremierBetLiveConnector extends BaseBookmaker {
  constructor() {
    super('PremierBet Ghana', 'https://www.premierbetzone.com');
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.premierbetzone.com/'
    };
    this._blockedUntil = 0;
    this._BLOCK_COOLDOWN = 5 * 60 * 1000;
    this._consecutiveFailures = 0;
  }

  _parseFixture(f) {
    const homeTeam = f.homeTeam || f.home || f.team1 || f.participants?.[0]?.name;
    const awayTeam = f.awayTeam || f.away || f.team2 || f.participants?.[1]?.name;
    if (!homeTeam || !awayTeam) return null;

    const markets = [];

    // 1X2 market
    const odds1 = parseFloat(f.odds1 || f.homeOdds || f.odds?.home);
    const oddsX = parseFloat(f.oddsX || f.drawOdds || f.odds?.draw);
    const odds2 = parseFloat(f.odds2 || f.awayOdds || f.odds?.away);

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

    if (markets.length === 0) return null;

    return {
      id: String(f.id || `${homeTeam}_${awayTeam}`),
      homeTeam,
      awayTeam,
      sport: 'Football',
      competition: f.tournament || f.competition || 'Football',
      startTime: f.startTime || new Date(Date.now() + 3600000).toISOString(),
      dateStr: 'Upcoming',
      isLive: false,
      markets
    };
  }

  async fetchOdds() {
    if (Date.now() < this._blockedUntil) {
      return [];
    }

    const endpoints = [
      'https://www.premierbetzone.com/api/sportsbook/v1/fixtures?sportId=1&take=50',
      'https://www.premierbet.com.gh/api/v1/events?sport=soccer&limit=50'
    ];

    for (const url of endpoints) {
      try {
        const reqUrl = formatProxyUrl(url);
        const res = await fetch(reqUrl, {
          headers: this.headers,
          signal: AbortSignal.timeout(2000)
        });

        if (!res.ok) continue;

        const ct = res.headers.get('content-type') || '';
        if (ct.includes('text/html')) continue;

        const data = await res.json().catch(() => null);
        if (!data) continue;

        const rawList = Array.isArray(data) ? data : (data.data || data.events || data.fixtures || []);
        if (!Array.isArray(rawList) || rawList.length === 0) continue;

        const matches = rawList.map(f => this._parseFixture(f)).filter(Boolean);
        if (matches.length > 0) {
          this._consecutiveFailures = 0;
          return matches;
        }
      } catch (e) {
        // Continue to fallback
      }
    }

    this._consecutiveFailures++;
    if (this._consecutiveFailures >= 3) {
      this._blockedUntil = Date.now() + this._BLOCK_COOLDOWN;
      this._consecutiveFailures = 0;
    }
    return [];
  }

  async generateBookingCode(selection = {}) {
    const query = selection.homeTeam || selection.selection || 'soccer';
    return {
      code: null,
      shareUrl: `${this.baseUrl}/sport/soccer?search=${encodeURIComponent(query)}`
    };
  }
}
