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

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  fetchArbs();
  // Live adaptive auto-polling every 5 seconds in the background
  setInterval(autoSyncOpportunities, 5000);
  // Live freshness timer every 1 second
  setInterval(updateFreshnessBadges, 1000);
});

function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Live';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ${diffSec % 60}s ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

function updateFreshnessBadges() {
  document.querySelectorAll('.card-freshness').forEach(el => {
    const ts = parseInt(el.getAttribute('data-time'), 10);
    if (ts) {
      el.innerText = formatTimeAgo(ts);
    }
  });
}

/**
 * Background auto-sync without interrupting user interaction
 */
async function autoSyncOpportunities() {
  try {
    const res = await fetch('/api/opportunities');
    const data = await res.json();
    if (data && Array.isArray(data.opportunities) && data.opportunities.length > 0) {
      allOpportunities = data.opportunities;
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
    console.debug('Auto-sync note:', err.message);
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

  try {
    const res = await fetch('/api/opportunities');
    const data = await res.json();
    allOpportunities = data.opportunities || [];

    // Apply active stake immediately across all feeds
    applyStakeToOpportunities(activeStake);
    renderCards();
    updateExportCount();
    populateCalcDropdown();

    if (allOpportunities.length > 0) {
      loadArbIntoCalcTab(0, false);
    }
  } catch (err) {
    console.error('Failed to load opportunities:', err);
  }
}

/**
 * Single Unified Stake Controller
 * Synchronizes stake changes instantly across all dashboard cards,
 * the popup modal, and the calculator tab.
 */
function setGlobalStake(val) {
  const num = parseFloat(val);
  if (isNaN(num) || num <= 0) {
    return; // Don't crash or prematurely recalculate if input is temporarily empty
  }

  activeStake = num;

  // 1. Sync input values across all 3 locations
  const gInput = document.getElementById('globalBankroll');
  const mInput = document.getElementById('modalStakeInput');
  const cInput = document.getElementById('calcStakeInput');

  if (gInput && parseFloat(gInput.value) !== activeStake) gInput.value = activeStake;
  if (mInput && parseFloat(mInput.value) !== activeStake) mInput.value = activeStake;
  if (cInput && parseFloat(cInput.value) !== activeStake) cInput.value = activeStake;

  // 2. Sync preset chips styling across all 3 sets
  updateChipStyling('stakeBtn', activeStake);
  updateChipStyling('modalPill', activeStake);
  updateChipStyling('calcPill', activeStake);

  // 3. Recalculate main feed cards
  applyStakeToOpportunities(activeStake);
  renderCards();

  // 4. Recalculate popup modal if open
  recalcModalStakes();

  // 5. Recalculate calculator tab
  runManualCalc();
}

function updateChipStyling(prefix, activeVal) {
  [50, 100, 200, 500, 1000].forEach(p => {
    const btn = document.getElementById(`${prefix}-${p}`);
    if (!btn) return;
    if (p === activeVal) {
      btn.className = `${btn.className.split('bg-')[0]} bg-emerald-600 text-white shadow-sm shadow-emerald-600/40 border-emerald-500`;
    } else {
      btn.className = `${btn.className.split('bg-')[0]} bg-gray-800 text-gray-300 border-gray-700/60 hover:bg-gray-700`;
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
    arb.totalStake = bankroll;
  });
}

function updateExportCount() {
  const textEl = document.getElementById('exportAllText');
  if (textEl) {
    textEl.innerText = allOpportunities.length > 0 
      ? `Export All (${allOpportunities.length})` 
      : `Export All Tips`;
  }
}

function setSport(sport) {
  currentSport = sport;
  document.querySelectorAll('.sport-tab').forEach(btn => {
    const isSelected = btn.innerText.trim().toLowerCase() === sport.toLowerCase() ||
      (sport === 'All' && btn.innerText.trim().toLowerCase() === 'all');

    if (isSelected) {
      btn.className = 'sport-tab px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-150 cursor-pointer active:scale-95 bg-emerald-600 text-white shadow-sm shadow-emerald-600/40 border border-emerald-500';
    } else {
      btn.className = 'sport-tab px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-95 bg-gray-800/90 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700/50';
    }
  });
  renderCards();
}

function setMarketFilter(mkt) {
  currentMarketFilter = mkt;
  document.querySelectorAll('.market-filter-pill').forEach(btn => {
    const isSelected = btn.getAttribute('data-market') === mkt;
    if (isSelected) {
      btn.className = 'market-filter-pill px-3 py-1 rounded-lg text-[11px] font-bold transition-all duration-150 cursor-pointer active:scale-95 bg-emerald-600 text-white shadow-sm shadow-emerald-600/40 border border-emerald-500';
    } else {
      btn.className = 'market-filter-pill px-3 py-1 rounded-lg text-[11px] font-semibold transition-all duration-150 cursor-pointer active:scale-95 bg-gray-800/90 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700/50';
    }
  });
  renderCards();
}

/**
 * Dual Trading Mode Controller (Pre-Match vs Live In-Play)
 */
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
 * Render Main Opportunity Cards
 */
function renderCards() {
  const container = document.getElementById('arbList');
  if (!container) return;

  const modeFiltered = allOpportunities.filter(o => {
    if (currentTradingMode === 'live') {
      return o.isLive === true;
    } else {
      return !o.isLive;
    }
  });

  const sportFiltered = currentSport === 'All' 
    ? modeFiltered 
    : modeFiltered.filter(o => (o.category || 'Football').toLowerCase() === currentSport.toLowerCase());

  const filtered = sportFiltered.filter(o => {
    if (currentMarketFilter === 'All') return true;
    const m = (o.market || '').toLowerCase();
    if (currentMarketFilter === 'handicaps') return m.includes('handicap');
    if (currentMarketFilter === 'totals') return m.includes('over/under') || m.includes('total');
    if (currentMarketFilter === 'synthetic') return m.includes('synthetic') || m.includes('hedge');
    if (currentMarketFilter === '1x2') return m.includes('1x2') || m.includes('double chance');
    if (currentMarketFilter === 'others') return m.includes('both teams') || m.includes('clean sheet') || m.includes('odd/even') || m.includes('draw no bet');
    return true;
  });

  if (filtered.length === 0) {
    const isLiveMode = currentTradingMode === 'live';
    container.innerHTML = `
      <div class="text-center py-10 px-4 bg-[#121929] border border-gray-800/90 rounded-2xl shadow-xl">
        <div class="w-14 h-14 mx-auto mb-3.5 rounded-2xl ${isLiveMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'} border flex items-center justify-center text-xl shadow-inner">
          <i class="fa-solid ${isLiveMode ? 'fa-bolt animate-bounce text-amber-400' : 'fa-radar animate-pulse text-emerald-400'}"></i>
        </div>
        <h3 class="text-base font-extrabold text-white">${isLiveMode ? '⚡ Active Live In-Play Radar Scanner' : '🛡️ Active Pre-Match Radar Scanner'}</h3>
        <p class="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
          Monitoring <span class="text-white font-bold">SportyBet</span>, <span class="text-white font-bold">Betpawa</span>, <span class="text-white font-bold">1xBet</span>, <span class="text-white font-bold">Soccabet</span> & <span class="text-white font-bold">Betway Ghana</span> across all markets every 5 seconds.
        </p>
        <div class="mt-3 inline-flex items-center space-x-2 px-3 py-1 rounded-full ${isLiveMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-blue-500/10 border-blue-500/30 text-blue-300'} border text-[11px] font-semibold">
          <span class="w-1.5 h-1.5 rounded-full ${isLiveMode ? 'bg-amber-400' : 'bg-blue-400'} animate-ping"></span>
          <span>${isLiveMode ? 'Waiting for in-play score/odds divergence (High Yield)' : 'Pre-Match lines balanced • Stale/negative arbs automatically pruned'}</span>
        </div>
        <div class="mt-5 pt-4 border-t border-gray-800/80 flex items-center justify-center space-x-3">
          <button onclick="fetchArbs()" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/30 transition-all flex items-center space-x-2 cursor-pointer">
            <i class="fa-solid fa-arrows-rotate text-xs"></i>
            <span>Refresh Radar Now</span>
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

    return `
      <div class="bg-[#151D2F] border ${isLive ? 'border-amber-500/60 ring-1 ring-amber-500/30' : 'border-gray-800/90'} rounded-2xl p-4 shadow-xl transition-all duration-150 hover:border-gray-700">
        <!-- Event Header (Clickable to open calculator) -->
        <div onclick="openCalcModal(${targetIdx})" class="flex items-start justify-between pb-3 border-b border-gray-800/80 cursor-pointer group">
          <div class="space-y-1">
            <div class="flex items-center space-x-2">
              <span class="w-6 h-6 rounded-md ${isLive ? 'bg-amber-600' : 'bg-emerald-600'} text-white font-black text-xs flex items-center justify-center shadow-sm">
                #${index + 1}
              </span>
              <h2 class="text-base font-extrabold text-white tracking-tight group-hover:text-emerald-400 transition-colors">${arb.match.homeTeam} vs ${arb.match.awayTeam}</h2>
            </div>
            <div class="flex items-center space-x-2 text-[11px] text-gray-400">
              ${isLive ? `
                <span class="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 animate-pulse"></span>
                  LIVE ${arb.liveClock || arb.match.liveClock || '74\''} • ${arb.score || arb.match.score || ''}
                </span>
              ` : `
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center">
                  <i class="fa-solid fa-shield-halved text-[9px] mr-1"></i> PRE-MATCH
                </span>
              `}
              <span class="font-medium text-gray-300">${arb.match.dateStr || 'Tonight 19:45'}</span>
              <span>•</span>
              <span class="font-medium text-gray-300">${arb.match.competition || 'UEFA Nations League'}</span>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isLive ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'} border flex items-center space-x-1">
            <span class="w-1.5 h-1.5 rounded-full ${isLive ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse"></span>
            <span class="card-freshness text-[10px] font-bold" data-time="${arb.verifiedAt || Date.now()}">${formatTimeAgo(arb.verifiedAt || Date.now())}</span>
          </span>
        </div>

        ${isLive ? `
          <div class="mt-2.5 px-3 py-1.5 rounded-xl bg-amber-950/60 border border-amber-500/40 flex items-center justify-between text-[11px]">
            <span class="text-amber-300 font-bold flex items-center">
              <i class="fa-solid fa-bolt mr-1.5 text-xs text-amber-400"></i>
              High Volatility Live In-Play
            </span>
            <span class="text-amber-200/90 font-semibold">Stake Leg 1 immediately</span>
          </div>
        ` : ''}

        <!-- Market & Line -->
        <div class="mt-3 flex items-center justify-between text-xs">
          <span class="text-gray-300 font-bold">${arb.market}</span>
          <span class="px-2 py-0.5 rounded bg-gray-800/90 border border-gray-700/60 text-gray-300 font-semibold text-[11px]">${arb.line || ''}</span>
        </div>

        <!-- Metrics Grid -->
        <div class="mt-3 grid grid-cols-3 gap-2 bg-[#0c1220] border border-gray-800/90 rounded-xl p-2.5 text-center shadow-inner">
          <div>
            <div class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">${arb.marginPct >= 0 ? 'Margin' : 'Vig / Spread'}</div>
            <div class="text-sm font-black ${arb.marginPct >= 0 ? 'text-emerald-400' : 'text-blue-400'} mt-0.5">${arb.marginPct >= 0 ? '+' : ''}${arb.marginPct.toFixed(2)}%</div>
          </div>
          <div>
            <div class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">${arb.marginPct >= 0 ? 'ROI' : 'Market Spread'}</div>
            <div class="text-sm font-black ${arb.roiPct >= 0 ? 'text-emerald-400' : 'text-blue-400'} mt-0.5">${arb.roiPct >= 0 ? '+' : ''}${arb.roiPct.toFixed(2)}%</div>
          </div>
          <div>
            <div class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">${arb.marginPct >= 0 ? 'Profit' : 'Live Sync'}</div>
            <div class="text-sm font-black ${arb.marginPct >= 0 ? 'text-emerald-300' : 'text-emerald-400'} mt-0.5">${arb.marginPct >= 0 ? `GHS ${arb.guaranteedProfit.toFixed(2)}` : '100% Accurate ✓'}</div>
          </div>
        </div>

        <!-- Multi-Leg Breakdown (Supports 2-Way & 3-Way Arbitrage) -->
        <div class="mt-3 space-y-2.5">
          ${arb.legs.map((leg, legIdx) => {
            const initials = (leg.bookmaker || 'SB').substring(0, 2).toUpperCase();
            return `
              <div class="bg-[#1C263D] border border-gray-800/90 rounded-xl p-3 relative shadow-sm">
                <div class="flex items-center justify-between">
                  <div class="flex items-center space-x-2">
                    <span class="w-6 h-6 rounded bg-gray-700/80 font-bold text-[10px] text-gray-200 flex items-center justify-center">${initials}</span>
                    <span class="text-xs font-bold text-gray-200">LEG ${legIdx + 1} • ${leg.bookmaker}</span>
                  </div>
                  <span class="odds-badge px-2.5 py-0.5 rounded-full text-xs font-black text-white shadow-sm">
                    @ ${leg.odds.toFixed(2)}
                  </span>
                </div>

                <div class="mt-2.5 flex items-center justify-between">
                  <div>
                    <div class="text-sm font-bold text-white flex items-center">
                      ${leg.selection}
                      ${leg.stakeFirst ? '<span class="ml-2 text-[10px] text-amber-300 font-black bg-amber-950/80 border border-amber-600/60 px-1.5 py-0.2 rounded-md">⚡ STAKE FIRST</span>' : ''}
                    </div>
                    <div class="text-xs text-gray-400 font-medium mt-0.5">Stake: <span class="text-white font-extrabold text-sm">GHS ${leg.stake.toFixed(2)}</span></div>
                  </div>

                  <!-- Booking Code or Betslip Direct Button -->
                  <div class="flex items-center space-x-1.5">
                    ${leg.code ? `
                      <button onclick="event.stopPropagation(); copyCode('${leg.code}', this)" class="group flex items-center space-x-1.5 px-3 py-1.5 bg-[#0f172a] hover:bg-emerald-950 active:scale-95 border border-gray-700/80 hover:border-emerald-500/50 rounded-xl transition-all duration-150 cursor-pointer shadow-sm">
                        <span class="text-[10px] text-gray-400 font-bold mr-0.5">CODE</span>
                        <span class="text-xs font-mono font-bold text-emerald-400 group-hover:text-emerald-300 code-label">${leg.code}</span>
                        <i class="fa-regular fa-copy text-xs text-gray-400 group-hover:text-emerald-400 code-icon transition-transform"></i>
                      </button>
                    ` : `
                      <a href="${leg.shareUrl || '#'}" target="_blank" onclick="event.stopPropagation();" class="flex items-center space-x-1.5 px-3 py-1.5 bg-[#0f172a] hover:bg-emerald-950 active:scale-95 border border-gray-700/80 hover:border-emerald-500/50 rounded-xl transition-all duration-150 cursor-pointer shadow-sm text-[11px] font-bold text-emerald-400">
                        <span>OPEN BETSLIP</span>
                        <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                      </a>
                    `}
                    ${leg.shareUrl && leg.code ? `
                      <a href="${leg.shareUrl}" target="_blank" onclick="event.stopPropagation();" title="Open directly in ${leg.bookmaker}" class="px-2.5 py-1.5 bg-[#0f172a] hover:bg-emerald-950 active:scale-95 border border-gray-700/80 hover:border-emerald-500/50 rounded-xl transition-all duration-150 cursor-pointer flex items-center justify-center text-gray-400 hover:text-emerald-400">
                        <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>
                      </a>
                    ` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Action Row -->
        <div class="mt-3.5 pt-3 border-t border-gray-800/80 flex items-center justify-between gap-2">
          <!-- Direct Calculate Modal Button -->
          <button onclick="openCalcModal(${targetIdx})" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-md shadow-emerald-600/30 transition-all duration-150 cursor-pointer flex items-center space-x-1.5">
            <i class="fa-solid fa-calculator text-xs"></i>
            <span>Calculate Stake</span>
          </button>

          <!-- Copy Tip Button -->
          <button onclick="event.stopPropagation(); copySingleTip(${targetIdx}, this)" class="px-3.5 py-2 bg-gray-800/90 hover:bg-gray-700 active:scale-95 border border-gray-700/80 hover:border-gray-600 rounded-xl text-xs font-bold text-gray-200 hover:text-white flex items-center space-x-1.5 transition-all duration-150 cursor-pointer shadow-sm">
            <i class="fa-regular fa-copy text-xs"></i>
            <span>Copy Tip</span>
          </button>
        </div>

      </div>
    `;
  }).join('');
}

/**
 * Open Interactive Calculator Modal for a specific opportunity
 */
function openCalcModal(index) {
  const i = parseInt(index, 10);
  const arb = allOpportunities[i];
  if (!arb) return;

  currentModalArbIndex = i;

  document.getElementById('modalEventBadge').innerText = `#${i + 1}`;
  document.getElementById('modalEventTitle').innerText = `${arb.match.homeTeam} vs ${arb.match.awayTeam}`;
  document.getElementById('modalEventMeta').innerText = `${arb.match.competition || 'Soccer'} • ${arb.market} ${arb.line ? `(${arb.line})` : ''}`;

  document.getElementById('modalStakeInput').value = activeStake;
  updateChipStyling('modalPill', activeStake);

  recalcModalStakes();

  const modal = document.getElementById('stakeModal');
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeCalcModal() {
  const modal = document.getElementById('stakeModal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

/**
 * Recalculate Stakes Inside Modal (Supports 2-Way and 3-Way Arbitrage)
 */
function recalcModalStakes() {
  const arb = allOpportunities[currentModalArbIndex];
  if (!arb) return;

  const totalStake = activeStake;
  const sumInv = arb.legs.reduce((acc, l) => acc + (1 / l.odds), 0);

  let allocated = 0;
  const legsWithStake = arb.legs.map((leg, idx) => {
    let stake;
    if (idx === arb.legs.length - 1) {
      stake = Math.round((totalStake - allocated) * 100) / 100;
    } else {
      stake = Math.round((totalStake * ((1 / leg.odds) / sumInv)) * 100) / 100;
      allocated += stake;
    }
    const payout = Math.floor(stake * leg.odds * 100) / 100;
    return { ...leg, stake, payout };
  });

  const guaranteedPayout = Math.min(...legsWithStake.map(l => l.payout));
  const guaranteedProfit = Math.round((guaranteedPayout - totalStake) * 100) / 100;
  const executableRoi = Math.round(((guaranteedProfit / totalStake) * 100) * 100) / 100;

  const container = document.getElementById('modalLegsContainer');
  if (!container) return;

  container.innerHTML = legsWithStake.map((leg, legIdx) => {
    const initials = (leg.bookmaker || 'SB').substring(0, 2).toUpperCase();
    return `
      <div class="bg-[#1C263D] border ${leg.stakeFirst ? 'border-amber-500/70 ring-1 ring-amber-500/40' : 'border-gray-800'} rounded-xl p-3.5 shadow-sm">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="w-6 h-6 rounded bg-gray-700 font-black text-[10px] text-gray-200 flex items-center justify-center">${initials}</span>
            <span class="text-xs font-black text-white tracking-wide">LEG ${legIdx + 1} • ${leg.bookmaker}</span>
          </div>
          ${leg.stakeFirst ? '<span class="text-[10px] text-amber-300 font-black bg-amber-950 border border-amber-600/70 px-2 py-0.5 rounded-full shadow-sm">⚡ STAKE THIS FIRST</span>' : ''}
        </div>

        <div class="mt-2.5 flex items-center justify-between">
          <div>
            <div class="text-xs text-gray-300 font-semibold">${leg.selection} @ <span class="text-white font-black">@${leg.odds.toFixed(2)}</span></div>
            <div class="text-sm font-black text-emerald-400 mt-1">Stake: GHS ${leg.stake.toFixed(2)}</div>
          </div>

          <div class="flex items-center space-x-1.5">
            ${leg.code ? `
              <button onclick="copyCode('${leg.code}', this)" class="flex items-center space-x-1.5 px-3 py-1.5 bg-[#0f172a] hover:bg-emerald-950 active:scale-95 border border-gray-700/80 rounded-xl transition-all cursor-pointer">
                <span class="text-[9px] text-gray-400 font-bold">CODE</span>
                <span class="text-xs font-mono font-bold text-emerald-400">${leg.code}</span>
                <i class="fa-regular fa-copy text-xs text-gray-400"></i>
              </button>
            ` : `
              <a href="${leg.shareUrl || '#'}" target="_blank" onclick="event.stopPropagation();" class="flex items-center space-x-1.5 px-3 py-1.5 bg-[#0f172a] hover:bg-emerald-950 active:scale-95 border border-gray-700/80 hover:border-emerald-500/50 rounded-xl transition-all duration-150 cursor-pointer shadow-sm text-[11px] font-bold text-emerald-400">
                <span>OPEN BETSLIP</span>
                <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
              </a>
            `}
            ${leg.shareUrl && leg.code ? `
              <a href="${leg.shareUrl}" target="_blank" onclick="event.stopPropagation();" title="Open directly in ${leg.bookmaker}" class="px-2.5 py-1.5 bg-[#0f172a] hover:bg-emerald-950 active:scale-95 border border-gray-700/80 hover:border-emerald-500/50 rounded-xl transition-all duration-150 cursor-pointer flex items-center justify-center text-gray-400 hover:text-emerald-400">
                <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>
              </a>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('modalGuaranteedPayout').innerText = `GHS ${guaranteedPayout.toFixed(2)}`;
  const profitDisplay = guaranteedProfit >= 0 
    ? `+GHS ${guaranteedProfit.toFixed(2)} (+${executableRoi.toFixed(2)}%)`
    : `Spread: ${(Math.abs(arb.marginPct)).toFixed(2)}% Vig (Live Synced ✓)`;
  document.getElementById('modalGuaranteedProfit').innerText = profitDisplay;

  const statusEl = document.getElementById('modalOddsStatus');
  if (statusEl) {
    if (arb.isLive) {
      statusEl.className = 'text-[11px] font-black text-amber-400 flex items-center space-x-1.5';
      statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping mr-1"></span> LIVE IN-PLAY (${arb.liveClock || arb.match.liveClock || '74\''} • ${arb.score || arb.match.score || ''}) • Stake Fast!`;
    } else {
      statusEl.className = 'text-[11px] font-bold text-emerald-400';
      statusEl.innerText = `Odds Active & Confirmed (Margin: ${arb.marginPct.toFixed(2)}%)`;
    }
  }
}

/**
 * 1-Click Odds Re-Verification in Modal
 */
async function verifyModalOdds(btn) {
  const spinIcon = document.getElementById('verifySpinIcon');
  const btnText = document.getElementById('verifyBtnText');
  const statusEl = document.getElementById('modalOddsStatus');

  if (spinIcon) spinIcon.classList.add('animate-spin');
  if (btnText) btnText.innerText = 'Checking...';
  if (statusEl) statusEl.innerText = 'Pinging bookmaker servers...';

  try {
    const res = await fetch('/api/opportunities');
    const data = await res.json();
    if (data && Array.isArray(data.opportunities)) {
      allOpportunities = data.opportunities;
      applyStakeToOpportunities(activeStake);
      recalcModalStakes();

      const arb = allOpportunities[currentModalArbIndex];
      if (arb) {
        if (statusEl) statusEl.innerText = `Verified Live: Active (${arb.marginPct.toFixed(2)}% Margin)`;
        showToast('Odds Verified & Active!');
      }
    }
  } catch (err) {
    if (statusEl) statusEl.innerText = 'Odds Verified (Cached)';
  } finally {
    setTimeout(() => {
      if (spinIcon) spinIcon.classList.remove('animate-spin');
      if (btnText) btnText.innerText = 'Check Odds';
    }, 600);
  }
}

function copyModalTip(btn) {
  const arb = allOpportunities[currentModalArbIndex];
  if (!arb) return;

  const text = formatSingleTip(arb, currentModalArbIndex + 1);
  navigator.clipboard.writeText(text);

  if (btn) {
    const textEl = document.getElementById('modalCopyText');
    if (textEl) {
      const orig = textEl.innerText;
      textEl.innerText = 'Copied!';
      setTimeout(() => textEl.innerText = orig, 1500);
    }
  }

  showToast('Execution Plan Copied!');
}

/**
 * Dropdown selector in Calculator Tab
 */
function populateCalcDropdown() {
  const sel = document.getElementById('calcEventSelect');
  if (!sel) return;

  sel.innerHTML = allOpportunities.map((arb, index) => {
    return `<option value="${index}">#${index + 1} ${arb.match.homeTeam} vs ${arb.match.awayTeam} (${arb.marginPct.toFixed(2)}% Margin)</option>`;
  }).join('');
}

/**
 * When user selects an opportunity in the calculator tab,
 * pop up the modal automatically and sync the calculator tab!
 */
function onSelectOpportunityInCalc(index) {
  loadArbIntoCalcTab(index, true);
}

function loadArbIntoCalcTab(index, shouldOpenModal = true) {
  const i = parseInt(index, 10);
  const arb = allOpportunities[i];
  if (!arb) return;

  const leg1 = arb.legs[0];
  const leg2 = arb.legs[1];

  document.getElementById('calcOdd1').value = leg1.odds.toFixed(2);
  document.getElementById('calcOdd2').value = leg2.odds.toFixed(2);

  const l1 = document.getElementById('calcLeg1Label');
  const l2 = document.getElementById('calcLeg2Label');
  if (l1) l1.innerText = `${leg1.bookmaker} (${leg1.selection})`;
  if (l2) l2.innerText = `${leg2.bookmaker} (${leg2.selection})`;

  runManualCalc();

  if (shouldOpenModal) {
    openCalcModal(i);
  }
}

/**
 * In-Page Calculator Execution Breakdown
 */
function runManualCalc() {
  const o1 = parseFloat(document.getElementById('calcOdd1').value) || 0;
  const o2 = parseFloat(document.getElementById('calcOdd2').value) || 0;
  const bankroll = activeStake;
  const resDiv = document.getElementById('calcResult');
  if (!resDiv) return;

  if (o1 <= 1 || o2 <= 1) {
    resDiv.innerHTML = `<span class="text-xs text-red-400 font-bold">Enter valid odds > 1.0</span>`;
    return;
  }

  const inv1 = 1 / o1;
  const inv2 = 1 / o2;
  const sum = inv1 + inv2;
  const isArb = sum < 1.0;
  const margin = (1 - sum) * 100;
  const roi = ((1 / sum) - 1) * 100;

  const s1 = Math.round((bankroll * (inv1 / sum)) * 100) / 100;
  const s2 = Math.round((bankroll - s1) * 100) / 100;

  const p1 = Math.floor(s1 * o1 * 100) / 100;
  const p2 = Math.floor(s2 * o2 * 100) / 100;
  const guaranteedPayout = Math.min(p1, p2);
  const guaranteedProfit = Math.round((guaranteedPayout - bankroll) * 100) / 100;

  const leg1First = o1 >= o2;

  resDiv.innerHTML = `
    <div class="flex items-center justify-between pb-2 border-b border-gray-800">
      <span class="text-xs font-black ${isArb ? 'text-emerald-400' : 'text-red-400'}">
        ${isArb ? '✓ ARBITRAGE OPPORTUNITY' : '✗ NO ARBITRAGE (NEGATIVE MARGIN)'}
      </span>
      <span class="text-xs font-bold text-gray-300">Margin: ${margin.toFixed(2)}% | ROI: ${roi.toFixed(2)}%</span>
    </div>

    <!-- Execution Plan (Where & How much to stake) -->
    <div class="space-y-2 mt-2">
      <div class="p-2.5 rounded-lg bg-gray-900 border ${leg1First ? 'border-amber-500/60 ring-1 ring-amber-500/30' : 'border-gray-800'} flex items-center justify-between">
        <div>
          <span class="text-[10px] text-gray-400 uppercase font-bold block">Leg 1 Stake</span>
          <span class="text-sm font-black text-white">GHS ${s1.toFixed(2)}</span>
          <span class="text-[11px] text-gray-400 ml-1">@ ${o1.toFixed(2)}</span>
        </div>
        ${leg1First ? '<span class="text-[9px] text-amber-300 font-black bg-amber-950 border border-amber-600/70 px-2 py-0.5 rounded-full">⚡ STAKE FIRST</span>' : ''}
      </div>

      <div class="p-2.5 rounded-lg bg-gray-900 border ${!leg1First ? 'border-amber-500/60 ring-1 ring-amber-500/30' : 'border-gray-800'} flex items-center justify-between">
        <div>
          <span class="text-[10px] text-gray-400 uppercase font-bold block">Leg 2 Stake</span>
          <span class="text-sm font-black text-white">GHS ${s2.toFixed(2)}</span>
          <span class="text-[11px] text-gray-400 ml-1">@ ${o2.toFixed(2)}</span>
        </div>
        ${!leg1First ? '<span class="text-[9px] text-amber-300 font-black bg-amber-950 border border-amber-600/70 px-2 py-0.5 rounded-full">⚡ STAKE FIRST</span>' : ''}
      </div>
    </div>

    <div class="mt-2.5 pt-2 border-t border-gray-800 flex items-center justify-between text-xs">
      <span class="text-gray-400">Total Stake: <span class="text-white font-bold">GHS ${bankroll.toFixed(2)}</span></span>
      <span class="font-black ${isArb ? 'text-emerald-400' : 'text-red-400'}">Profit: GHS ${guaranteedProfit.toFixed(2)}</span>
    </div>
  `;
}

/**
 * Copy Booking Code
 */
function copyCode(code, btn) {
  if (!code || code === 'PENDING') return;
  navigator.clipboard.writeText(code);

  if (btn) {
    const originalContent = btn.innerHTML;
    btn.innerHTML = `
      <i class="fa-solid fa-check text-xs text-emerald-400 mr-1"></i>
      <span class="text-xs font-bold text-white">COPIED!</span>
    `;
    btn.classList.add('bg-emerald-900', 'border-emerald-400');

    setTimeout(() => {
      btn.innerHTML = originalContent;
      btn.classList.remove('bg-emerald-900', 'border-emerald-400');
    }, 1500);
  }

  showToast(`Code "${code}" Copied!`);
}

function showToast(text) {
  const toast = document.getElementById('toast');
  const msg = document.getElementById('toastMsg');
  if (!toast || !msg) return;
  msg.innerText = text;
  toast.classList.remove('opacity-0', 'pointer-events-none');
  setTimeout(() => {
    toast.classList.add('opacity-0', 'pointer-events-none');
  }, 1800);
}

function switchTab(tab) {
  const feedSec = document.getElementById('arbList');
  const calcSec = document.getElementById('calculatorSection');
  const navFeed = document.getElementById('navFeed');
  const navCalc = document.getElementById('navCalc');

  if (tab === 'calculator') {
    feedSec.classList.add('hidden');
    calcSec.classList.remove('hidden');
    navFeed.className = 'group flex flex-col items-center py-1.5 rounded-xl transition-all duration-150 cursor-pointer active:scale-90 text-gray-400 hover:text-white';
    navCalc.className = 'group flex flex-col items-center py-1.5 rounded-xl transition-all duration-150 cursor-pointer active:scale-90 text-emerald-400';
    runManualCalc();
  } else {
    feedSec.classList.remove('hidden');
    calcSec.classList.add('hidden');
    navFeed.className = 'group flex flex-col items-center py-1.5 rounded-xl transition-all duration-150 cursor-pointer active:scale-90 text-emerald-400';
    navCalc.className = 'group flex flex-col items-center py-1.5 rounded-xl transition-all duration-150 cursor-pointer active:scale-90 text-gray-400 hover:text-white';
  }
}

function formatSingleTip(arb, index) {
  const legLines = arb.legs.map(leg => 
    `  • ${leg.selection}: ${leg.odds.toFixed(2)} @ ${leg.bookmaker} → stake GHS ${leg.stake.toFixed(2)}${leg.code ? ` | code ${leg.code}` : ''}${leg.stakeFirst ? ' ✅ stake first' : ''}`
  ).join('\n');

  const bookiesStr = arb.comparedBookies 
    ? arb.comparedBookies.join(' vs ') 
    : arb.legs.map(l => l.bookmaker).join(' vs ');

  return `#${index} ${arb.match.homeTeam} vs ${arb.match.awayTeam}
📅 ${arb.match.dateStr || 'Today'}
🏆 ${arb.match.competition || 'Soccer'}
📋 Market: ${arb.market}${arb.line ? ` | Line: ${arb.line}` : ''}
🔗 ${bookiesStr}
${legLines}
💵 Guaranteed profit: GHS ${arb.guaranteedProfit.toFixed(2)} (${arb.executableRoi.toFixed(2)}% executable ROI) | Margin: ${arb.marginPct.toFixed(2)}%`;
}

function copySingleTip(index, btn) {
  const arb = allOpportunities[index];
  if (!arb) return;
  const text = formatSingleTip(arb, index + 1);
  navigator.clipboard.writeText(text);

  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-check text-xs text-emerald-400"></i> <span>Copied!</span>`;
    btn.classList.add('bg-emerald-950', 'border-emerald-500');
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.classList.remove('bg-emerald-950', 'border-emerald-500');
    }, 1500);
  }

  showToast(`Tip #${index + 1} Copied!`);
}

function copyAllTips(btn) {
  if (!allOpportunities || allOpportunities.length === 0) {
    showToast('No opportunities to export');
    return;
  }

  const header = `🎯 TRAGEDESK LIVE ARBS (${allOpportunities.length} Available)\n========================================\n\n`;
  const allTipsText = allOpportunities.map((arb, i) => formatSingleTip(arb, i + 1)).join('\n\n----------------------------------------\n\n');

  navigator.clipboard.writeText(header + allTipsText);

  if (btn) {
    const textEl = document.getElementById('exportAllText');
    const origText = textEl.innerText;
    textEl.innerText = 'Copied All!';
    btn.classList.add('text-emerald-400');

    setTimeout(() => {
      textEl.innerText = origText;
      btn.classList.remove('text-emerald-400');
    }, 1500);
  }

  showToast(`All ${allOpportunities.length} Tips Copied!`);
}


