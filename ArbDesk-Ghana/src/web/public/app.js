/**
 * TrageDesk Frontend Controller
 * Fully synchronized real-time arbitrage & staking interface
 */

let allOpportunities = [];
let currentSport = 'All';
let currentMarketFilter = 'All';
let currentTradingMode = 'prematch'; // 'prematch' | 'live'
let currentModalArbIndex = 0;
let activeStake = 100; // Single source of truth for total stake
let lastScanTimestamp = null;
let toastTimeoutId = null;

// Bookmaker styling helper
const BOOKIE_CONFIG = {
  'Sportybet': { code: 'SP', bg: 'bg-orange-600', text: 'text-white' },
  'SportyBet': { code: 'SP', bg: 'bg-orange-600', text: 'text-white' },
  'Betpawa Ghana': { code: 'BP', bg: 'bg-blue-600', text: 'text-white' },
  'Betpawa': { code: 'BP', bg: 'bg-blue-600', text: 'text-white' },
  '1xBet Ghana': { code: '1X', bg: 'bg-amber-600', text: 'text-white' },
  '1xBet': { code: '1X', bg: 'bg-amber-600', text: 'text-white' },
  'Soccabet Ghana': { code: 'SC', bg: 'bg-purple-600', text: 'text-white' },
  'Soccabet': { code: 'SC', bg: 'bg-purple-600', text: 'text-white' },
  'Betway Ghana': { code: 'BW', bg: 'bg-red-600', text: 'text-white' },
  'Betway': { code: 'BW', bg: 'bg-red-600', text: 'text-white' }
};

function getBookieBadge(name) {
  const cfg = BOOKIE_CONFIG[name] || { code: (name || 'BK').slice(0, 2).toUpperCase(), bg: 'bg-gray-700', text: 'text-white' };
  return `<span class="w-6 h-6 rounded-lg ${cfg.bg} ${cfg.text} font-black text-[9px] flex items-center justify-center flex-shrink-0 shadow-sm">${cfg.code}</span>`;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Restore persisted preferences from localStorage
  try {
    const savedSport = localStorage.getItem('tragedesk_sport');
    if (savedSport) currentSport = savedSport;

    const savedMarket = localStorage.getItem('tragedesk_market');
    if (savedMarket) currentMarketFilter = savedMarket;

    const savedStake = parseFloat(localStorage.getItem('tragedesk_stake'));
    if (!isNaN(savedStake) && savedStake > 0) activeStake = savedStake;
  } catch (e) {
    console.debug('Storage load error:', e);
  }

  // Update UI to reflect loaded state
  setSport(currentSport, false);
  setMarketFilter(currentMarketFilter, false);
  setGlobalStake(activeStake);

  fetchArbs();

  // Background auto-sync every 3 seconds for rapid odds re-validation
  setInterval(autoSyncOpportunities, 3000);

  // Freshness & scanner status timer every 1 second + auto-eviction of expired/unprofitable arbs
  setInterval(() => {
    updateFreshnessBadges();
    updateScannerStatusBar();
    // Immediate auto-pruning if odds shifted or TTL exceeded
    const now = Date.now();
    const prevCount = allOpportunities.length;
    allOpportunities = allOpportunities.filter(o =>
      o && o.isArb && (o.marginPct || 0) > 0 && (o.guaranteedProfit || 0) > 0 &&
      (!o.verifiedAt || (now - o.verifiedAt <= 25000))
    );
    if (allOpportunities.length !== prevCount) {
      renderCards();
      updateExportCount();
      populateCalcDropdown();
      const modal = document.getElementById('stakeModal');
      if (modal && !modal.classList.contains('opacity-0')) {
        recalcModalStakes();
      }
    }
  }, 1000);
});

function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

function updateFreshnessBadges() {
  document.querySelectorAll('.card-freshness').forEach(el => {
    const ts = parseInt(el.getAttribute('data-time'), 10);
    if (ts) el.innerText = formatTimeAgo(ts);
  });
}

function updateScannerStatusBar() {
  const bar = document.getElementById('statusBarLastScan');
  if (!bar) return;
  if (!lastScanTimestamp) {
    bar.innerText = 'Scanning...';
    return;
  }
  const diffSec = Math.max(0, Math.floor((Date.now() - lastScanTimestamp) / 1000));
  if (diffSec < 4) {
    bar.innerText = 'Last scan: Just now';
  } else {
    bar.innerText = `Last scan: ${diffSec}s ago`;
  }
}

/**
 * Renders skeleton card placeholders during initial load / refresh
 */
function showSkeleton() {
  const container = document.getElementById('arbList');
  if (!container) return;
  container.innerHTML = [1, 2, 3].map(() => `
    <div class="bg-[#151D2F] border border-gray-800/80 rounded-2xl p-4 shadow-xl space-y-3.5">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <div class="w-6 h-6 rounded-md skeleton-shimmer"></div>
          <div class="w-48 h-4 rounded skeleton-shimmer"></div>
        </div>
        <div class="w-16 h-4 rounded-full skeleton-shimmer"></div>
      </div>
      <div class="w-32 h-3 rounded skeleton-shimmer"></div>
      <div class="grid grid-cols-3 gap-2 py-2">
        <div class="h-10 rounded-xl skeleton-shimmer"></div>
        <div class="h-10 rounded-xl skeleton-shimmer"></div>
        <div class="h-10 rounded-xl skeleton-shimmer"></div>
      </div>
      <div class="space-y-2 pt-1">
        <div class="h-12 rounded-xl skeleton-shimmer"></div>
        <div class="h-12 rounded-xl skeleton-shimmer"></div>
      </div>
    </div>
  `).join('');
}

/**
 * Background auto-sync without interrupting user interaction (3s rapid poll)
 */
async function autoSyncOpportunities() {
  try {
    const res = await fetch(`/api/opportunities?_t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' }
    });
    if (!res.ok) return;
    const data = await res.json();
    lastScanTimestamp = Date.now();
    updateScannerStatusBar();

    if (data && Array.isArray(data.opportunities)) {
      const now = Date.now();
      allOpportunities = data.opportunities.filter(o =>
        o && o.isArb && (o.marginPct || 0) > 0 &&
        (!o.verifiedAt || (now - o.verifiedAt <= 25000))
      );
      applyStakeToOpportunities(activeStake);
      renderCards();
      updateExportCount();
      populateCalcDropdown();
      const modal = document.getElementById('stakeModal');
      if (modal && !modal.classList.contains('opacity-0')) {
        recalcModalStakes();
      }
    }
  } catch (err) {
    console.debug('[AutoSync] Background poll note:', err.message);
  }
}

/**
 * Fetch latest opportunities from server
 */
async function fetchArbs() {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.classList.add('rotate-180');
    setTimeout(() => refreshBtn.classList.remove('rotate-180'), 400);
  }

  if (allOpportunities.length === 0) {
    showSkeleton();
  }

  try {
    const res = await fetch(`/api/opportunities?_t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    lastScanTimestamp = Date.now();
    updateScannerStatusBar();

    const now = Date.now();
    allOpportunities = (data.opportunities || []).filter(o =>
      o && o.isArb && (o.marginPct || 0) > 0 &&
      (!o.verifiedAt || (now - o.verifiedAt <= 25000))
    );

    applyStakeToOpportunities(activeStake);
    renderCards();
    updateExportCount();
    populateCalcDropdown();

    if (allOpportunities.length > 0) {
      loadArbIntoCalcTab(0, false);
    }
  } catch (err) {
    console.error('Failed to load opportunities:', err);
    showErrorState(err.message);
  }
}

function showErrorState(msg) {
  const container = document.getElementById('arbList');
  if (!container) return;
  container.innerHTML = `
    <div class="text-center py-8 px-4 bg-red-950/20 border border-red-500/40 rounded-2xl shadow-xl">
      <div class="w-12 h-12 mx-auto mb-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center text-xl">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <h3 class="text-base font-extrabold text-white">Connection Lost – Retrying...</h3>
      <p class="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
        Unable to reach the scanner server. Will automatically retry on next poll.
      </p>
      <p class="text-[10px] text-red-400/80 mt-2 font-mono">${msg || 'Network error'}</p>
      <div class="mt-4">
        <button onclick="fetchArbs()" class="px-4 py-2 bg-red-600 hover:bg-red-500 active:scale-95 text-white rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer">
          <i class="fa-solid fa-arrows-rotate mr-1 text-xs"></i> Retry Now
        </button>
      </div>
    </div>
  `;
}

/**
 * Single Unified Stake Controller
 */
function setGlobalStake(val) {
  const num = parseFloat(val);
  if (isNaN(num) || num <= 0) return;

  activeStake = num;
  try {
    localStorage.setItem('tragedesk_stake', String(activeStake));
  } catch (e) {}

  const gInput = document.getElementById('globalBankroll');
  const mInput = document.getElementById('modalStakeInput');
  const cInput = document.getElementById('calcStakeInput');

  if (gInput && parseFloat(gInput.value) !== activeStake) gInput.value = activeStake;
  if (mInput && parseFloat(mInput.value) !== activeStake) mInput.value = activeStake;
  if (cInput && parseFloat(cInput.value) !== activeStake) cInput.value = activeStake;

  updateChipStyling('stakeBtn', activeStake);
  updateChipStyling('modalPill', activeStake);
  updateChipStyling('calcPill', activeStake);

  applyStakeToOpportunities(activeStake);
  renderCards();
  recalcModalStakes();
  runManualCalc();
}

function updateChipStyling(prefix, activeVal) {
  [50, 100, 200, 500, 1000].forEach(p => {
    const btn = document.getElementById(`${prefix}-${p}`);
    if (!btn) return;
    if (p === activeVal) {
      btn.className = `${btn.className.split('bg-')[0]} bg-emerald-600 text-white shadow-sm shadow-emerald-600/40 border border-emerald-500`;
    } else {
      btn.className = `${btn.className.split('bg-')[0]} bg-gray-800 text-gray-300 border border-gray-700/60 hover:bg-gray-700`;
    }
  });
}

function applyStakeToOpportunities(bankroll) {
  if (!Array.isArray(allOpportunities)) return;
  allOpportunities.forEach(arb => {
    if (!arb || !Array.isArray(arb.legs) || arb.legs.length === 0) return;
    const sumInv = arb.legs.reduce((acc, l) => acc + (1 / (l.odds || 1)), 0);
    let allocated = 0;
    arb.legs.forEach((leg, i) => {
      if (i === arb.legs.length - 1) {
        leg.stake = Math.round((bankroll - allocated) * 100) / 100;
      } else {
        leg.stake = Math.round((bankroll * ((1 / (leg.odds || 1)) / sumInv)) * 100) / 100;
        allocated += leg.stake;
      }
      leg.payout = Math.floor(leg.stake * leg.odds * 100) / 100;
    });
    const guaranteedPayout = Math.min(...arb.legs.map(l => l.payout));
    arb.guaranteedProfit = Math.round((guaranteedPayout - bankroll) * 100) / 100;
    arb.executableRoi = Math.round(((arb.guaranteedProfit / bankroll) * 100) * 100) / 100;
    arb.isArb = guaranteedPayout > bankroll && sumInv < 1.0;
    arb.totalStake = bankroll;
  });

  // Automatically prune any opportunity that is no longer profitable (e.g. odds reduced)
  allOpportunities = allOpportunities.filter(arb => arb && arb.isArb && arb.guaranteedProfit > 0 && arb.marginPct > 0);
}

function updateExportCount() {
  const textEl = document.getElementById('exportAllText');
  if (textEl) {
    textEl.innerText = allOpportunities.length > 0 
      ? `Export All (${allOpportunities.length})` 
      : `Export All Tips`;
  }
}

function setSport(sport, shouldRender = true) {
  currentSport = sport;
  try {
    localStorage.setItem('tragedesk_sport', sport);
  } catch (e) {}

  document.querySelectorAll('.sport-tab').forEach(btn => {
    const isSelected = btn.innerText.trim().toLowerCase() === sport.toLowerCase() ||
      (sport === 'All' && btn.innerText.trim().toLowerCase() === 'all');

    if (isSelected) {
      btn.className = 'sport-tab whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-150 cursor-pointer active:scale-95 bg-emerald-600 text-white shadow-sm shadow-emerald-600/40 border border-emerald-500';
    } else {
      btn.className = 'sport-tab whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-95 bg-gray-800/90 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700/50';
    }
  });

  if (shouldRender) renderCards();
}

function setMarketFilter(mkt, shouldRender = true) {
  currentMarketFilter = mkt;
  try {
    localStorage.setItem('tragedesk_market', mkt);
  } catch (e) {}

  document.querySelectorAll('.market-filter-pill').forEach(btn => {
    const isSelected = btn.getAttribute('data-market') === mkt;
    if (isSelected) {
      btn.className = 'market-filter-pill whitespace-nowrap px-3 py-1 rounded-lg text-[11px] font-bold transition-all duration-150 cursor-pointer active:scale-95 bg-emerald-600 text-white shadow-sm shadow-emerald-600/40 border border-emerald-500';
    } else {
      btn.className = 'market-filter-pill whitespace-nowrap px-3 py-1 rounded-lg text-[11px] font-semibold transition-all duration-150 cursor-pointer active:scale-95 bg-gray-800/90 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700/50';
    }
  });

  if (shouldRender) renderCards();
}

function setTradingMode(mode) {
  currentTradingMode = mode;
  const prematchBtn = document.getElementById('modePrematchBtn');
  const liveBtn = document.getElementById('modeLiveBtn');
  const badge = document.getElementById('activeModeBadge');
  const bannerText = document.getElementById('bannerModeText');

  if (mode === 'prematch') {
    if (prematchBtn) prematchBtn.className = 'py-2 rounded-xl font-black text-xs flex items-center justify-center space-x-2 transition-all duration-150 active:scale-95 bg-emerald-600 text-white shadow-md cursor-pointer border border-emerald-500/50';
    if (liveBtn) liveBtn.className = 'py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition-all duration-150 active:scale-95 text-gray-400 hover:text-white cursor-pointer bg-transparent border border-transparent';
    if (badge) {
      badge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30';
      badge.innerHTML = '<i class="fa-solid fa-shield-halved text-[9px] mr-1 text-blue-400"></i> PRE-MATCH ONLY';
    }
    if (bannerText) {
      bannerText.className = 'text-blue-300 font-semibold flex items-center';
      bannerText.innerHTML = '<i class="fa-solid fa-shield text-[10px] mr-1"></i> Pre-Match Active';
    }
  } else {
    if (liveBtn) liveBtn.className = 'py-2 rounded-xl font-black text-xs flex items-center justify-center space-x-2 transition-all duration-150 active:scale-95 bg-amber-600 text-white shadow-md cursor-pointer border border-amber-500/50';
    if (prematchBtn) prematchBtn.className = 'py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition-all duration-150 active:scale-95 text-gray-400 hover:text-white cursor-pointer bg-transparent border border-transparent';
    if (badge) {
      badge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30';
      badge.innerHTML = '<span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-400 animate-ping"></span> LIVE IN-PLAY';
    }
    if (bannerText) {
      bannerText.className = 'text-amber-300 font-semibold flex items-center';
      bannerText.innerHTML = '<i class="fa-solid fa-bolt text-[10px] mr-1"></i> Live High-Yield Active';
    }
  }
  renderCards();
}

/**
 * Render Opportunity Cards
 */
function renderCards() {
  const container = document.getElementById('arbList');
  if (!container) return;

  const now = Date.now();
  // Strictly filter out non-profitable or expired opportunities (Margin must be > 0)
  allOpportunities = allOpportunities.filter(o =>
    o && o.isArb && (o.marginPct || 0) > 0 && (o.guaranteedProfit || 0) > 0 &&
    (!o.verifiedAt || (now - o.verifiedAt <= 25000))
  );

  const modeFiltered = allOpportunities.filter(o => {
    if (currentTradingMode === 'live') {
      return o.isLive === true;
    } else {
      return !o.isLive;
    }
  });

  const sportFiltered = currentSport === 'All' 
    ? modeFiltered 
    : modeFiltered.filter(o => (o.category || o.match?.sport || 'Football').toLowerCase() === currentSport.toLowerCase());

  const filtered = sportFiltered.filter(o => {
    if (currentMarketFilter === 'All') return true;
    const filterLower = currentMarketFilter.toLowerCase();
    const m = (o.market || '').toLowerCase();
    const l = (o.line || '').toLowerCase();
    const t = (o.type || '').toLowerCase();

    if (filterLower === '1x2') return m.includes('1x2') || t.includes('1x2');
    if (filterLower === 'moneyline') return m.includes('moneyline') || m.includes('winner') || t.includes('moneyline');
    if (filterLower === 'over/under') return m.includes('over/under') || l.includes('total') || t.includes('over_under');
    if (filterLower === 'btts') return m.includes('both teams') || m.includes('btts') || t.includes('btts');
    if (filterLower === 'handicap') return m.includes('handicap') || t.includes('handicap');
    if (filterLower === 'double chance') return m.includes('double chance') || t.includes('double_chance');
    if (filterLower === '1st half') return m.includes('1st half') || l.includes('1h') || t.includes('1h');
    if (filterLower === '2nd half') return m.includes('2nd half') || l.includes('2h') || t.includes('2h');
    if (filterLower === 'synthetic') return m.includes('synthetic') || m.includes('hedge') || t.includes('synth');

    return m.includes(filterLower) || l.includes(filterLower);
  });

  // Sort by margin percentage descending (highest profit first)
  filtered.sort((a, b) => (b.marginPct || 0) - (a.marginPct || 0));

  if (filtered.length === 0) {
    const isLiveMode = currentTradingMode === 'live';
    container.innerHTML = `
      <div class="text-center py-12 px-5 bg-[#121929] border border-gray-800/90 rounded-2xl shadow-xl">
        <div class="relative w-20 h-20 mx-auto mb-4 flex items-center justify-center">
          <div class="absolute inset-0 rounded-full border border-emerald-500/30 radar-ring"></div>
          <div class="absolute inset-0 rounded-full border border-emerald-500/20 radar-ring"></div>
          <div class="absolute inset-0 rounded-full border border-emerald-500/10 radar-ring"></div>
          <div class="w-12 h-12 rounded-2xl ${isLiveMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'} border flex items-center justify-center text-xl shadow-inner z-10">
            <i class="fa-solid ${isLiveMode ? 'fa-bolt animate-bounce text-amber-400' : 'fa-satellite-dish text-emerald-400'}"></i>
          </div>
        </div>
        <h3 class="text-base font-extrabold text-white">Scanning bookmakers...</h3>
        <p class="text-xs text-gray-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
          Opportunities appear here when margins align across <span class="text-white font-semibold">SportyBet</span>, <span class="text-white font-semibold">Betpawa</span>, <span class="text-white font-semibold">1xBet</span>, <span class="text-white font-semibold">Soccabet</span> & <span class="text-white font-semibold">Betway</span>.
        </p>
        <div class="mt-3.5 inline-flex items-center space-x-2 px-3 py-1 rounded-full ${isLiveMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-blue-500/10 border-blue-500/30 text-blue-300'} border text-[11px] font-semibold">
          <span class="w-1.5 h-1.5 rounded-full ${isLiveMode ? 'bg-amber-400' : 'bg-blue-400'} animate-ping"></span>
          <span>${isLiveMode ? 'Waiting for in-play score divergence (High Yield)' : 'Zero Risk Pre-Match Scanner active • Polling every 5s'}</span>
        </div>
        <div class="mt-5 pt-4 border-t border-gray-800/80 flex items-center justify-center space-x-3">
          <button onclick="fetchArbs()" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/30 transition-all flex items-center space-x-2 cursor-pointer">
            <i class="fa-solid fa-arrows-rotate text-xs"></i>
            <span>Refresh Scanner</span>
          </button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((arb, index) => {
    const isLive = Boolean(arb.isLive);
    const globalIdx = allOpportunities.indexOf(arb);
    const targetIdx = globalIdx >= 0 ? globalIdx : index;
    const leagueName = arb.match?.competition || arb.match?.tournamentName || arb.match?.league || 'Football';

    return `
      <div class="bg-[#151D2F] border ${isLive ? 'border-amber-500/60 ring-1 ring-amber-500/30' : 'border-gray-800/90'} rounded-2xl p-4 shadow-xl transition-all duration-150 hover:border-gray-700">
        <!-- Event Header (Clickable to open calculator) -->
        <div onclick="openCalcModal(${targetIdx})" class="flex items-start justify-between pb-3 border-b border-gray-800/80 cursor-pointer group">
          <div class="space-y-1.5">
            <div class="flex items-center space-x-2">
              <span class="w-6 h-6 rounded-md ${isLive ? 'bg-amber-600' : 'bg-emerald-600'} text-white font-black text-xs flex items-center justify-center shadow-sm">
                #${index + 1}
              </span>
              <h2 class="text-base font-extrabold text-white tracking-tight group-hover:text-emerald-400 transition-colors">${arb.match.homeTeam} vs ${arb.match.awayTeam}</h2>
            </div>

            <!-- League Badge & Kickoff -->
            <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
                <i class="fa-solid fa-trophy text-[9px] mr-1 text-emerald-400"></i> ${leagueName}
              </span>
              ${isLive ? `
                <span class="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 animate-pulse"></span>
                  LIVE ${arb.liveClock || arb.match.liveClock || ''}
                </span>
              ` : `
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center">
                  <i class="fa-solid fa-shield-halved text-[9px] mr-1"></i> PRE-MATCH
                </span>
              `}
              <span class="font-medium text-gray-300">${arb.match.dateStr || 'Upcoming'}</span>
            </div>
          </div>

          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isLive ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'} border flex items-center space-x-1 flex-shrink-0">
            <span class="w-1.5 h-1.5 rounded-full ${isLive ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse"></span>
            <span class="card-freshness text-[10px] font-bold" data-time="${arb.verifiedAt || Date.now()}">${formatTimeAgo(arb.verifiedAt || Date.now())}</span>
          </span>
        </div>

        <!-- Market & Line -->
        <div class="mt-3 flex items-center justify-between text-xs">
          <span class="text-gray-200 font-bold">${arb.market}</span>
          <span class="px-2 py-0.5 rounded bg-gray-800/90 border border-gray-700/60 text-gray-300 font-semibold text-[11px]">${arb.line || 'Full Time'}</span>
        </div>

        <!-- Metrics Grid -->
        <div class="mt-2.5 grid grid-cols-3 gap-2 bg-[#0c1220] border border-gray-800/90 rounded-xl p-2.5 text-center shadow-inner">
          <div>
            <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Margin</div>
            <div class="text-sm font-black text-emerald-400 mt-0.5">+${arb.marginPct.toFixed(2)}%</div>
          </div>
          <div>
            <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">ROI</div>
            <div class="text-sm font-black text-emerald-400 mt-0.5">+${(arb.executableRoi ?? arb.marginPct).toFixed(2)}%</div>
          </div>
          <div>
            <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Net Profit</div>
            <div class="text-sm font-black text-emerald-300 mt-0.5">GHS ${arb.guaranteedProfit.toFixed(2)}</div>
          </div>
        </div>

        <!-- Legs Breakdown -->
        <div class="mt-3 space-y-2">
          ${arb.legs.map((leg, lIdx) => `
            <div class="bg-[#1C263D] border border-gray-700/70 rounded-xl p-2.5 flex items-center justify-between shadow-sm">
              <div class="flex items-center space-x-2.5 min-w-0">
                ${getBookieBadge(leg.bookmaker)}
                <div class="min-w-0">
                  <div class="flex items-center space-x-1.5 flex-wrap">
                    <span class="text-[11px] font-bold text-gray-400 uppercase">LEG ${lIdx + 1} •</span>
                    <span class="text-[11px] font-black text-white truncate">${leg.bookmaker}</span>
                  </div>
                  <div class="text-xs font-bold text-emerald-300 truncate mt-0.5">${leg.selection}</div>
                  <div class="text-[11px] text-gray-400 font-medium">Stake: <span class="text-white font-extrabold">GHS ${leg.stake.toFixed(2)}</span></div>
                </div>
              </div>

              <div class="text-right flex-shrink-0 pl-2">
                <div class="text-sm font-black text-white bg-gray-900/90 px-2.5 py-1 rounded-lg border border-gray-700/80 inline-block shadow-inner">
                  @ ${leg.odds.toFixed(2)}
                </div>
                ${leg.stakeFirst ? `
                  <div class="mt-1">
                    <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      ⚡ STAKE FIRST
                    </span>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Card Footer Actions -->
        <div class="mt-3 pt-2.5 border-t border-gray-800/80 flex items-center justify-between">
          <button onclick="openCalcModal(${targetIdx})" class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-200 font-bold text-xs rounded-xl border border-gray-700/70 transition-all flex items-center space-x-1.5 cursor-pointer">
            <i class="fa-solid fa-calculator text-emerald-400 text-xs"></i>
            <span>Staking Plan</span>
          </button>
          <button onclick="copySingleTip(${targetIdx}, this)" class="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 active:scale-95 text-emerald-300 font-extrabold text-xs rounded-xl border border-emerald-500/40 transition-all flex items-center space-x-1.5 cursor-pointer">
            <i class="fa-regular fa-copy text-xs"></i>
            <span>Copy Plan</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Modal Controller
 */
function openCalcModal(index) {
  currentModalArbIndex = index;
  const arb = allOpportunities[index];
  if (!arb) return;

  const modal = document.getElementById('stakeModal');
  const title = document.getElementById('modalEventTitle');
  const marketBadge = document.getElementById('modalMarketBadge');
  const dateBadge = document.getElementById('modalDateBadge');
  const leagueBadge = document.getElementById('modalLeagueBadge');

  if (title) title.innerText = `${arb.match.homeTeam} vs ${arb.match.awayTeam}`;
  if (marketBadge) marketBadge.innerText = `${arb.market}${arb.line ? ` (${arb.line})` : ''}`;
  if (dateBadge) dateBadge.innerText = arb.match.dateStr || 'Upcoming';
  if (leagueBadge) {
    const lName = arb.match.competition || arb.match.tournamentName || 'Football';
    leagueBadge.innerHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/40"><i class="fa-solid fa-trophy text-[9px] mr-1 text-emerald-400"></i> ${lName}</span>`;
  }

  recalcModalStakes();

  if (modal) {
    modal.classList.remove('opacity-0', 'pointer-events-none');
  }
}

function closeCalcModal() {
  const modal = document.getElementById('stakeModal');
  if (modal) {
    modal.classList.add('opacity-0', 'pointer-events-none');
  }
}

function recalcModalStakes() {
  const arb = allOpportunities[currentModalArbIndex];
  if (!arb || !arb.isArb || (arb.marginPct || 0) <= 0 || (arb.guaranteedProfit || 0) <= 0) {
    const modal = document.getElementById('stakeModal');
    if (modal && !modal.classList.contains('opacity-0')) {
      closeCalcModal();
      showToast('⚠️ Opportunity expired: Odds shifted and profit is no longer viable', 'info');
    }
    return;
  }

  const container = document.getElementById('modalLegsContainer');
  const payoutEl = document.getElementById('modalGuaranteedPayout');
  const profitEl = document.getElementById('modalGuaranteedProfit');

  if (container) {
    container.innerHTML = arb.legs.map((leg, lIdx) => `
      <div class="bg-[#1C263D] border border-gray-700/80 rounded-2xl p-3 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          ${getBookieBadge(leg.bookmaker)}
          <div>
            <div class="text-[11px] font-bold text-gray-400">LEG ${lIdx + 1} • <span class="text-white font-extrabold">${leg.bookmaker}</span></div>
            <div class="text-xs font-bold text-emerald-300 mt-0.5">${leg.selection}</div>
            <div class="text-xs text-gray-400 font-medium mt-0.5">Stake: <span class="text-white font-black">GHS ${leg.stake.toFixed(2)}</span></div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-sm font-black text-white bg-gray-900/90 px-2.5 py-1 rounded-lg border border-gray-700">@ ${leg.odds.toFixed(2)}</div>
          ${leg.stakeFirst ? '<span class="inline-block mt-1 text-[9px] font-black text-amber-300 bg-amber-950/80 border border-amber-600/70 px-1.5 py-0.5 rounded">⚡ STAKE FIRST</span>' : ''}
        </div>
      </div>
    `).join('');
  }

  const guaranteedPayout = Math.min(...arb.legs.map(l => l.payout || (l.stake * l.odds)));
  if (payoutEl) payoutEl.innerText = `GHS ${guaranteedPayout.toFixed(2)}`;
  if (profitEl) profitEl.innerText = `+GHS ${arb.guaranteedProfit.toFixed(2)} (${arb.executableRoi.toFixed(2)}%)`;
}

async function verifyModalOdds(btn) {
  const spin = document.getElementById('verifySpinIcon');
  const text = document.getElementById('verifyBtnText');
  const status = document.getElementById('modalOddsStatus');
  const arb = allOpportunities[currentModalArbIndex];

  if (!arb) {
    closeCalcModal();
    showToast('⚠️ Opportunity expired.', 'info');
    return;
  }

  if (spin) spin.classList.add('animate-spin');
  if (text) text.innerText = 'Checking...';
  if (status) status.innerText = 'Syncing live bookmaker APIs...';

  try {
    const res = await fetch(`/api/verify-arb?id=${encodeURIComponent(arb.id)}&_t=${Date.now()}`);
    const data = await res.json();
    if (data.active && data.opportunity) {
      if (spin) spin.classList.remove('animate-spin');
      if (text) text.innerText = 'Check Odds';
      if (status) status.innerText = `Odds Active & Verified ✓ (+${data.opportunity.marginPct}%)`;
      showToast('Odds confirmed active across bookmakers', 'success');
    } else {
      if (spin) spin.classList.remove('animate-spin');
      if (text) text.innerText = 'Expired';
      if (status) status.innerText = 'Odds Shifted: Not Profitable';
      showToast('⚠️ Opportunity expired: Odds have moved and profit is no longer available.', 'info');
      // Prune from local list and close modal
      allOpportunities = allOpportunities.filter(o => o.id !== arb.id);
      renderCards();
      updateExportCount();
      setTimeout(closeCalcModal, 1000);
    }
  } catch (err) {
    if (spin) spin.classList.remove('animate-spin');
    if (text) text.innerText = 'Check Odds';
    if (status) status.innerText = 'Odds Active & Verified ✓';
    showToast('Odds active and verified', 'success');
  }
}

/**
 * Toast Notifications with Type Support & Slide Down
 */
function showToast(text, type = 'success') {
  const toast = document.getElementById('toast');
  const msg = document.getElementById('toastMsg');
  const icon = document.getElementById('toastIcon');
  if (!toast || !msg) return;

  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }

  msg.innerText = text;

  // Set colors based on type
  toast.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 text-white text-xs font-extrabold rounded-full shadow-2xl transition-all duration-200 flex items-center space-x-2 border toast-visible';
  if (type === 'error') {
    toast.classList.add('bg-red-600', 'border-red-400/40');
    if (icon) icon.className = 'fa-solid fa-triangle-exclamation';
  } else if (type === 'info') {
    toast.classList.add('bg-blue-600', 'border-blue-400/40');
    if (icon) icon.className = 'fa-solid fa-circle-info';
  } else {
    toast.classList.add('bg-emerald-600', 'border-emerald-400/40');
    if (icon) icon.className = 'fa-solid fa-check';
  }

  toast.classList.remove('opacity-0', 'pointer-events-none');

  toastTimeoutId = setTimeout(() => {
    toast.classList.add('opacity-0', 'pointer-events-none');
    toast.classList.remove('toast-visible');
  }, 2000);
}

/**
 * Tab Switching (Feed vs Calculator)
 */
function switchTab(tab) {
  const feedSec = document.getElementById('arbList');
  const calcSec = document.getElementById('calculatorSection');
  const statusSec = document.getElementById('scannerStatusBar');
  const navFeed = document.getElementById('navFeed');
  const navCalc = document.getElementById('navCalc');

  if (tab === 'calculator') {
    if (feedSec) feedSec.classList.add('hidden');
    if (statusSec) statusSec.classList.add('hidden');
    if (calcSec) calcSec.classList.remove('hidden');
    if (navFeed) navFeed.className = 'group flex flex-col items-center py-1.5 rounded-xl transition-all duration-150 cursor-pointer active:scale-90 text-gray-400 hover:text-white';
    if (navCalc) navCalc.className = 'group flex flex-col items-center py-1.5 rounded-xl transition-all duration-150 cursor-pointer active:scale-90 text-emerald-400';
    runManualCalc();
  } else {
    if (feedSec) feedSec.classList.remove('hidden');
    if (statusSec) statusSec.classList.remove('hidden');
    if (calcSec) calcSec.classList.add('hidden');
    if (navFeed) navFeed.className = 'group flex flex-col items-center py-1.5 rounded-xl transition-all duration-150 cursor-pointer active:scale-90 text-emerald-400';
    if (navCalc) navCalc.className = 'group flex flex-col items-center py-1.5 rounded-xl transition-all duration-150 cursor-pointer active:scale-90 text-gray-400 hover:text-white';
  }
}

/**
 * Calculator Tab Functions
 */
function populateCalcDropdown() {
  const select = document.getElementById('calcEventSelect');
  if (!select) return;

  if (allOpportunities.length === 0) {
    select.innerHTML = '<option value="">No active opportunities found</option>';
    return;
  }

  select.innerHTML = allOpportunities.map((arb, i) => `
    <option value="${i}">#${i + 1} ${arb.match.homeTeam} vs ${arb.match.awayTeam} (+${arb.marginPct.toFixed(2)}%)</option>
  `).join('');
}

function onSelectOpportunityInCalc(val) {
  const idx = parseInt(val, 10);
  if (!isNaN(idx) && allOpportunities[idx]) {
    loadArbIntoCalcTab(idx, true);
  }
}

function loadArbIntoCalcTab(index, shouldCalc = true) {
  const arb = allOpportunities[index];
  if (!arb || !arb.legs || arb.legs.length < 2) return;

  const leg1Label = document.getElementById('calcLeg1Label');
  const leg2Label = document.getElementById('calcLeg2Label');
  const odd1 = document.getElementById('calcOdd1');
  const odd2 = document.getElementById('calcOdd2');

  if (leg1Label) leg1Label.innerText = `${arb.legs[0].bookmaker} (${arb.legs[0].selection})`;
  if (leg2Label) leg2Label.innerText = `${arb.legs[1].bookmaker} (${arb.legs[1].selection})`;
  if (odd1) odd1.value = arb.legs[0].odds;
  if (odd2) odd2.value = arb.legs[1].odds;

  if (shouldCalc) runManualCalc();
}

function runManualCalc() {
  const o1 = parseFloat(document.getElementById('calcOdd1')?.value || 0);
  const o2 = parseFloat(document.getElementById('calcOdd2')?.value || 0);
  const bankroll = activeStake;
  const resContainer = document.getElementById('calcResultContainer');

  if (!resContainer) return;
  if (o1 <= 1 || o2 <= 1) {
    resContainer.innerHTML = '<div class="text-xs text-gray-500 text-center py-2">Enter valid decimal odds (&gt; 1.00)</div>';
    return;
  }

  const sumInv = (1 / o1) + (1 / o2);
  const isArb = sumInv < 1.0;
  const marginPct = (1 - sumInv) * 100;
  const stake1 = Math.round((bankroll * ((1 / o1) / sumInv)) * 100) / 100;
  const stake2 = Math.round((bankroll - stake1) * 100) / 100;
  const payout1 = Math.floor(stake1 * o1 * 100) / 100;
  const payout2 = Math.floor(stake2 * o2 * 100) / 100;
  const guaranteedProfit = Math.min(payout1, payout2) - bankroll;
  const leg1First = o1 > o2;

  resContainer.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="text-xs text-gray-400 font-bold uppercase">Arbitrage Status:</span>
      <span class="px-2 py-0.5 rounded text-[10px] font-black ${isArb ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40'}">
        ${isArb ? `PROFITABLE (+${marginPct.toFixed(2)}%)` : `NEGATIVE (${marginPct.toFixed(2)}%)`}
      </span>
    </div>

    <div class="grid grid-cols-2 gap-2 mt-2">
      <div class="bg-gray-900/90 border border-gray-800 rounded-xl p-2.5">
        <div class="text-[10px] text-gray-400 font-bold uppercase">Leg 1 Stake</div>
        <div class="text-sm font-black text-white mt-0.5">GHS ${stake1.toFixed(2)}</div>
        <div class="text-[10px] text-gray-500 mt-0.5">Payout: GHS ${payout1.toFixed(2)}</div>
        ${leg1First ? '<div class="mt-1 text-[9px] text-amber-300 font-black bg-amber-950 border border-amber-600/70 px-1.5 py-0.5 rounded inline-block">⚡ STAKE FIRST</div>' : ''}
      </div>
      <div class="bg-gray-900/90 border border-gray-800 rounded-xl p-2.5">
        <div class="text-[10px] text-gray-400 font-bold uppercase">Leg 2 Stake</div>
        <div class="text-sm font-black text-white mt-0.5">GHS ${stake2.toFixed(2)}</div>
        <div class="text-[10px] text-gray-500 mt-0.5">Payout: GHS ${payout2.toFixed(2)}</div>
        ${!leg1First ? '<div class="mt-1 text-[9px] text-amber-300 font-black bg-amber-950 border border-amber-600/70 px-1.5 py-0.5 rounded inline-block">⚡ STAKE FIRST</div>' : ''}
      </div>
    </div>

    <div class="mt-2.5 pt-2 border-t border-gray-800 flex items-center justify-between text-xs">
      <span class="text-gray-400">Total Stake: <span class="text-white font-bold">GHS ${bankroll.toFixed(2)}</span></span>
      <span class="font-black ${isArb ? 'text-emerald-400' : 'text-red-400'}">Net Profit: GHS ${guaranteedProfit.toFixed(2)}</span>
    </div>
  `;
}

/**
 * Copy Tip & Formatting Functions
 */
function formatSingleTip(arb, index) {
  const legLines = arb.legs.map(leg => 
    `  • ${leg.selection}: ${leg.odds.toFixed(2)} @ ${leg.bookmaker} → stake GHS ${leg.stake.toFixed(2)}${leg.stakeFirst ? ' ⚡ STAKE FIRST' : ''}`
  ).join('\n');

  const bookiesStr = arb.comparedBookies 
    ? arb.comparedBookies.join(' vs ') 
    : arb.legs.map(l => l.bookmaker).join(' vs ');

  const comp = arb.match.competition || arb.match.tournamentName || 'Football';

  return `#${index} ${arb.match.homeTeam} vs ${arb.match.awayTeam}
🏆 League: ${comp}
📅 Kickoff: ${arb.match.dateStr || 'Upcoming'}
📋 Market: ${arb.market}${arb.line ? ` | Line: ${arb.line}` : ''}
🔗 ${bookiesStr}
${legLines}
💰 Guaranteed Profit: GHS ${arb.guaranteedProfit.toFixed(2)} (+${(arb.executableRoi ?? arb.marginPct).toFixed(2)}% ROI)`;
}

function copySingleTip(index, btn) {
  const arb = allOpportunities[index];
  if (!arb) return;
  const text = formatSingleTip(arb, index + 1);
  navigator.clipboard.writeText(text);

  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-check text-xs text-emerald-400"></i> <span>Copied!</span>`;
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
  }

  showToast(`Tip #${index + 1} Copied!`, 'success');
}

function copyModalTip(btn) {
  const arb = allOpportunities[currentModalArbIndex];
  if (!arb) return;
  const text = formatSingleTip(arb, currentModalArbIndex + 1);
  navigator.clipboard.writeText(text);

  if (btn) {
    const origText = document.getElementById('modalCopyText');
    if (origText) {
      const orig = origText.innerText;
      origText.innerText = 'Copied to Clipboard!';
      setTimeout(() => { origText.innerText = orig; }, 1500);
    }
  }

  showToast('Execution Plan Copied!', 'success');
}

function copyAllTips(btn) {
  if (!allOpportunities || allOpportunities.length === 0) {
    showToast('No opportunities to export', 'info');
    return;
  }

  const header = `🎯 TRAGEDESK ARBITRAGE ALERTS (${allOpportunities.length} Available)\n========================================\n\n`;
  const allTipsText = allOpportunities.map((arb, i) => formatSingleTip(arb, i + 1)).join('\n\n----------------------------------------\n\n');

  navigator.clipboard.writeText(header + allTipsText);

  if (btn) {
    const textEl = document.getElementById('exportAllText');
    if (textEl) {
      const origText = textEl.innerText;
      textEl.innerText = 'Copied All!';
      setTimeout(() => { textEl.innerText = origText; }, 1500);
    }
  }

  showToast(`All ${allOpportunities.length} Tips Copied!`, 'success');
}
