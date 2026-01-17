import { db, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp, doc, updateDoc, deleteDoc, onSnapshot } from './firebase.js';
import { formatCurrency, parseCSV, showToast } from './utils.js';

// State
let transactions = [];
let categories = new Set([
    'Ăn Uống', 'Xe', 'Xăng', 'Tiền Nhà', 'Nước', 
    'Tiền Đt', 'Đồ Dùng Cá Nhân', 'Thuốc Men', 
    'In Giấy Tờ', 'Tiết Kiệm', 'Chi Phí Khác'
]);

const categoryIcons = {
    'Ăn Uống': 'fa-utensils',
    'Xe': 'fa-motorcycle',        // Legacy support
    'Xăng': 'fa-gas-pump',        // Legacy support
    'Tiền Nhà': 'fa-house',
    'Nước': 'fa-bottle-water',    // Legacy support
    'Tiền Đt': 'fa-mobile-screen',// Legacy support
    'Đồ Dùng Cá Nhân': 'fa-shirt',// Legacy support
    'Thuốc Men': 'fa-capsules',   // Legacy support
    'In Giấy Tờ': 'fa-print',     // Legacy support
    'Tiết Kiệm': 'fa-piggy-bank',
    'Chi Phí Khác': 'fa-money-bill', // Legacy support
    'default': 'fa-tag'
};

// Filter State
let currentFilter = 'day'; // day, week, month, year
let currentViewDate = new Date(); // Track currently viewed period

// Swipe Handling
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

const headerEl = document.querySelector('.main-header');

headerEl.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, false);

headerEl.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
}, false);

function handleSwipe() {
    const xDiff = touchEndX - touchStartX;
    const yDiff = touchEndY - touchStartY;
    
    // Check if horizontal swipe is dominant
    if (Math.abs(xDiff) > Math.abs(yDiff)) {
        if (Math.abs(xDiff) > 50) { // Threshold
            if (xDiff > 0) shiftDate(-1); // Right -> Prev
            else shiftDate(1); // Left -> Next
        }
    }
}

function shiftDate(direction) {
    if (currentFilter === 'all') return;
    
    // Animate Header
    const card = document.querySelector('.balance-card');
    if (card) {
        card.classList.remove('swipe-effect-next', 'swipe-effect-prev');
        void card.offsetWidth; // Trigger reflow
        
        if (direction === 1) { // Left swipe -> Next
            card.classList.add('swipe-effect-next');
        } else { // Right swipe -> Prev
            card.classList.add('swipe-effect-prev');
        }
        
        // Clean up
        setTimeout(() => {
            card.classList.remove('swipe-effect-next', 'swipe-effect-prev');
        }, 300);
    }

    // Logic
    if (currentFilter === 'day') {
        currentViewDate.setDate(currentViewDate.getDate() + direction);
    } else if (currentFilter === 'week') {
        currentViewDate.setDate(currentViewDate.getDate() + (direction * 7));
    } else if (currentFilter === 'month') {
        currentViewDate.setMonth(currentViewDate.getMonth() + direction);
    } else if (currentFilter === 'year') {
        currentViewDate.setFullYear(currentViewDate.getFullYear() + direction);
    }
    renderTransactions();
}

// DOM Elements
const totalBalanceEl = document.getElementById('total-balance');
const transactionsListEl = document.getElementById('transactions-list');
const fabAdd = document.getElementById('fab-add');
const modalTransaction = document.getElementById('modal-transaction');
const modalCategory = document.getElementById('modal-category');
const closeTransactionModalBtn = document.getElementById('close-transaction-modal');
const closeCategoryModalBtn = document.getElementById('close-category-modal');
const transactionForm = document.getElementById('transaction-form');
const categoryForm = document.getElementById('category-form');
const categorySelector = document.getElementById('category-selector');
const selectedCategoryInput = document.getElementById('selected-category');
const filterChips = document.querySelectorAll('.filter-chip');
const filterLabel = document.getElementById('filter-label');
const currentMonthLabel = document.getElementById('current-month');
const modalAnalysis = document.getElementById('modal-analysis');
const btnShowAnalysis = document.getElementById('btn-show-analysis');
const closeAnalysisModalBtn = document.getElementById('close-analysis-modal');
const categoryBreakdownEl = document.getElementById('category-breakdown');
const expenseComparisonEl = document.getElementById('expense-comparison');

// Settings Elements
const btnSettings = document.getElementById('btn-settings');
const modalSettings = document.getElementById('modal-settings');
const closeSettingsModalBtn = document.getElementById('close-settings-modal');
const btnExportData = document.getElementById('btn-export-data');

// Init
document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    renderCategories();
    renderTransactions();
    
    // Set today's date
    document.getElementById('date-input').valueAsDate = new Date();
});

// Load Data
async function loadInitialData() {
    if (!db) {
        showToast("Chưa cấu hình Firebase!", "error");
        return;
    }

    try {
        const q = query(collection(db, "transactions"), orderBy("date", "desc"), limit(2000));
        
        // Real-time Listener (Handles Cache + Updates)
        const unsubscribe = onSnapshot(q, (snapshot) => {
            transactions = snapshot.docs.map(doc => {
                 const data = doc.data();
                 return {
                    id: doc.id,
                    ...data,
                    // Ensure date is a JS Date object
                    date: data.date && data.date.toDate ? data.date.toDate() : (new Date(data.date) || new Date())
                 };
            });
            
            // Re-render whenever data changes
            renderTransactions();
            
            // Update Analysis if modal is open (optional)
            if (document.getElementById('modal-analysis') && document.getElementById('modal-analysis').classList.contains('active')) {
                // Check if these functions exist in global scope or specific scope? They seem global in app.js
                if(typeof renderAnalysisOverview === 'function') renderAnalysisOverview();
                if(typeof renderCategoryBreakdown === 'function') renderCategoryBreakdown();
                if(typeof renderTrendChart === 'function') renderTrendChart();
            }
            
            console.log("Data synced from " + (snapshot.metadata.fromCache ? "Cache" : "Server"));
            
        }, (error) => {
             console.error("Error getting realtime update: ", error);
             showToast("Lỗi đồng bộ dữ liệu!", "error");
        });
        
    } catch (e) {
        console.error("Error setting up listener", e);
        showToast("Lỗi kết nối dữ liệu!", "error");
    }
}

// Filter Logic
function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

function isSameWeek(d1, d2) {
    // Clone to avoid mutating original dates
    const t1 = new Date(d1);
    const t2 = new Date(d2);
    
    // Normalize to Midnight for safety (ignore time)
    t1.setHours(0,0,0,0);
    t2.setHours(0,0,0,0);
    
    // Adjust t2 to be the Monday of its week
    const day2 = t2.getDay() || 7; // 1 (Mon) ... 7 (Sun)
    const startOfWeek = new Date(t2);
    startOfWeek.setDate(t2.getDate() - day2 + 1);
    
    // End of week is Start + 6 days
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    // Check if t1 is in [Start, End]
    return t1 >= startOfWeek && t1 <= endOfWeek;
}

function isSameMonth(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth();
}

function isSameYear(d1, d2) {
    // Standard calendar year for ease of "Last Year" navigation
    return d1.getFullYear() === d2.getFullYear();
    
    // Formerly rolling: return d1 >= oneYearAgo && d1 <= d2;
}

// Search State
let searchCriteria = {
    keyword: '',
    category: 'all',
    dateFrom: null,
    dateTo: null,
    amountMin: null,
    amountMax: null
};

function getFilteredTransactions() {
    // Search Mode
    if (currentFilter === 'search') {
        return transactions.filter(t => {
            // Keyword (Note or Category Name)
            if (searchCriteria.keyword) {
                const kw = searchCriteria.keyword.toLowerCase();
                const noteMatch = (t.note || '').toLowerCase().includes(kw);
                const catMatch = t.category.toLowerCase().includes(kw);
                if (!noteMatch && !catMatch) return false;
            }
            
            // Category
            if (searchCriteria.category !== 'all' && t.category !== searchCriteria.category) {
                return false;
            }
            
            // Date Range
            if (searchCriteria.dateFrom) {
                const d = new Date(t.date); d.setHours(0,0,0,0);
                const from = new Date(searchCriteria.dateFrom); from.setHours(0,0,0,0);
                if (d < from) return false;
            }
            if (searchCriteria.dateTo) {
                const d = new Date(t.date); d.setHours(0,0,0,0);
                const to = new Date(searchCriteria.dateTo); to.setHours(0,0,0,0);
                if (d > to) return false;
            }
            
            // Amount Range
            if (searchCriteria.amountMin !== null && t.amount < searchCriteria.amountMin) return false;
            if (searchCriteria.amountMax !== null && t.amount > searchCriteria.amountMax) return false;
            
            return true;
        });
    }

    const targetDate = new Date(currentViewDate); // Use view state
    targetDate.setHours(23, 59, 59, 999);
    
    return transactions.filter(t => {
        const tDate = t.date; // already Date object
        if (currentFilter === 'day') return isSameDay(tDate, targetDate);
        if (currentFilter === 'week') return isSameWeek(tDate, targetDate);
        if (currentFilter === 'month') return isSameMonth(tDate, targetDate);
        if (currentFilter === 'year') return isSameYear(tDate, targetDate);
        if (currentFilter === 'all') return true;
        return true;
    });
}

// Comparison Logic
function renderComparison(currentTotal) {
    if (currentFilter === 'all') {
        expenseComparisonEl.style.display = 'none';
        return;
    }

    const targetDate = new Date(currentViewDate);
    let prevTotal = 0;
    
    let prevFilterFn = () => false;
    
    if (currentFilter === 'day') {
        // Yesterday (relative to target)
        const yesterday = new Date(targetDate);
        yesterday.setDate(targetDate.getDate() - 1);
        prevFilterFn = (t) => isSameDay(t.date, yesterday);
    } else if (currentFilter === 'week') {
        // Last Week
        const lastWeek = new Date(targetDate);
        lastWeek.setDate(targetDate.getDate() - 7);
        prevFilterFn = (t) => isSameWeek(t.date, lastWeek);
    } else if (currentFilter === 'month') {
        // Last Month
        const lastMonth = new Date(targetDate);
        lastMonth.setMonth(targetDate.getMonth() - 1);
        prevFilterFn = (t) => isSameMonth(t.date, lastMonth);
    } else if (currentFilter === 'year') {
         // Last Year
         const lastYear = new Date(targetDate);
         lastYear.setFullYear(targetDate.getFullYear() - 1);
         prevFilterFn = (t) => isSameYear(t.date, lastYear);
    }
    
    const prevTransactions = transactions.filter(prevFilterFn);
    prevTotal = prevTransactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    
    if (prevTotal === 0) {
        expenseComparisonEl.style.display = 'none';
        return;
    }
    
    const diff = currentTotal - prevTotal;
    const percent = ((diff / prevTotal) * 100).toFixed(0);
    
    expenseComparisonEl.style.display = 'flex';
    expenseComparisonEl.className = 'comparison-badge'; 
    expenseComparisonEl.innerHTML = '';
    
    if (diff > 0) {
        expenseComparisonEl.classList.add('up');
        expenseComparisonEl.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> +${percent}%`;
    } else if (diff < 0) {
        expenseComparisonEl.classList.add('down');
        expenseComparisonEl.innerHTML = `<i class="fa-solid fa-arrow-trend-down"></i> ${percent}%`;
    } else {
        expenseComparisonEl.innerText = "Giống kỳ trước";
    }
}

const btnDeleteTransaction = document.getElementById('btn-delete-transaction');
const btnSaveTransaction = document.getElementById('btn-save-transaction');

let editingTransactionId = null;

// Analysis Trend State
let currentTrendFilter = '7days'; // 7days, 6months
let currentTrendCategory = 'all';

// ... inside renderAnalysis call ...
function renderAnalysis() {
    // Reset Tab to Overview
    switchTab('overview');
    
    populateCustomTrendDropdown();
    
    renderAnalysisOverview();
    renderTrendChart();
    renderCategoryBreakdown();
    renderForecast();
    renderCalendarHeatmap();
}

const LUMP_SUM_CATEGORIES = ['Tiền Nhà', 'Tiết Kiệm']; // Re-added bills

function calculateMedian(values) {
    if (values.length === 0) return 0;
    
    // Sort numbers
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
}

let currentHeatmapDate = new Date();

function changeHeatmapMonth(offset) {
    currentHeatmapDate.setMonth(currentHeatmapDate.getMonth() + offset);
    renderCalendarHeatmap();
}

function showDayDetail(day, month, year, amount, upperBound) {
    const modal = document.getElementById('modal-day-detail');
    if (!modal) return;

    // Filter transactions for this specific day
    const dailyTx = transactions.filter(t => 
        t.date && t.date.getDate() === day && t.date.getMonth() === month && t.date.getFullYear() === year
    );

    // 1. Header
    document.getElementById('dd-date').innerText = `Ngày ${day} tháng ${month + 1}`;
    document.getElementById('dd-total').innerText = formatCurrency(amount);

    // 2. Comparison (High/Low)
    const compEl = document.getElementById('dd-comparison');
    if (amount === 0) {
        compEl.className = 'comparison-badge down';
        compEl.innerHTML = '<i class="fa-solid fa-piggy-bank"></i> Tuyệt vời! Không tiêu gì cả.';
    } else {
        const ratio = upperBound > 0 ? (amount / upperBound) : 0;
        if (ratio >= 1.0) {
            compEl.className = 'comparison-badge up';
            compEl.innerHTML = `<i class="fa-solid fa-fire"></i> Cao báo động (Top 10% tháng)`;
        } else if (ratio > 0.6) {
            compEl.className = 'comparison-badge up';
            compEl.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> Khá cao so với thường lệ`;
        } else {
            compEl.className = 'comparison-badge down';
            compEl.innerHTML = `<i class="fa-solid fa-check"></i> Chi tiêu trong mức ổn định`;
        }
    }

    // 3. Top Categories
    const catList = document.getElementById('dd-categories');
    catList.innerHTML = '';
    
    if (dailyTx.length > 0) {
        // Aggregation
        const groups = {};
        dailyTx.forEach(t => {
            groups[t.category] = (groups[t.category] || 0) + parseFloat(t.amount);
        });
        
        // Sort & Render Top 3
        Object.entries(groups)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .forEach(([cat, amt]) => {
                const percent = (amt / amount) * 100;
                
                const item = document.createElement('div');
                item.className = 'breakdown-item';
                item.innerHTML = `
                    <div class="bd-header">
                        <div class="bd-cat">
                           <span>${cat}</span>
                        </div>
                        <span class="bd-amount">${formatCurrency(amt)}</span>
                    </div>
                    <div class="progress-track" style="height:4px">
                        <div class="progress-fill" style="width: ${percent}%; opacity:0.8"></div>
                    </div>
                `;
                catList.appendChild(item);
            });
    } else {
        catList.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding:1rem;">Không có giao dịch nào.</div>';
    }

    // 4. Insight Short
    const insightEl = document.getElementById('dd-insight');
    if (amount === 0) {
        insightEl.innerText = "Duy trì những ngày 'No Spend' thế này sẽ giúp bạn tiết kiệm đáng kể!";
    } else if (dailyTx.length > 3) {
        insightEl.innerText = `Bạn đã thực hiện ${dailyTx.length} giao dịch hôm nay. Cẩn thận các khoản chi lặt vặt cộng dồn!`;
    } else {
         // Check if mainly fixed cost
         const hasFixed = dailyTx.some(t => LUMP_SUM_CATEGORIES.includes(t.category));
         if (hasFixed) insightEl.innerText = "Chủ yếu là các khoản định phí lớn. Không đáng lo nếu đây là ngày chi trả định kỳ.";
         else insightEl.innerText = "Chi tiêu rải rác. Hãy xem xét lại các danh mục chiếm tỷ trọng lớn.";
    }

    modal.classList.add('active');
}

// Ensure close button and overlay click works
document.addEventListener('DOMContentLoaded', () => {
    const modalDD = document.getElementById('modal-day-detail');
    const btnCloseDD = document.getElementById('close-day-detail');
    
    if (modalDD) {
        if (btnCloseDD) {
            btnCloseDD.addEventListener('click', () => {
                modalDD.classList.remove('active');
            });
        }
        
        // Close on overlay click
        modalDD.addEventListener('click', (e) => {
            if (e.target === modalDD) {
                modalDD.classList.remove('active');
            }
        });
    }
});


function renderCalendarHeatmap() {
    const gridEl = document.getElementById('heatmap-grid');
    const labelEl = document.getElementById('heatmap-month-label');
    
    // Bind buttons if not already (simple check, or re-bind safe)
    const btnPrev = document.getElementById('cal-prev');
    const btnNext = document.getElementById('cal-next');
    
    if (btnPrev && !btnPrev.hasAttribute('onclick')) {
         btnPrev.onclick = () => changeHeatmapMonth(-1);
         btnNext.onclick = () => changeHeatmapMonth(1);
    }
    
    if (!gridEl) return;
    
    gridEl.innerHTML = '';
    
    const targetDate = currentHeatmapDate; 
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth(); // 0-11
    
    if (labelEl) labelEl.innerText = `Tháng ${month + 1}/${year}`;
    
    // 2. Aggregate Data
    const dailyTotals = {};
    const amounts = []; // For percentile calculation
    
    transactions.forEach(t => {
        if (t.date && t.date.getMonth() === month && t.date.getFullYear() === year) {
            const day = t.date.getDate();
            dailyTotals[day] = (dailyTotals[day] || 0) + (parseFloat(t.amount) || 0);
        }
    });

    // Collect non-zero amounts for robust scaling
    Object.values(dailyTotals).forEach(v => {
        if (v > 0) amounts.push(v);
    });

    // 3. Determine Scale (Smart Upper Bound P90)
    let upperBound = 0;
    if (amounts.length > 0) {
        amounts.sort((a, b) => a - b);
        const p90Index = Math.floor(amounts.length * 0.9);
        upperBound = amounts[p90Index];
        if (upperBound === 0) upperBound = amounts[amounts.length - 1];
    }
    
    // 3. Grid Logic
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayObj = new Date(year, month, 1);
    let startDayOfWeek = firstDayObj.getDay(); // 0 (Sun) - 6 (Sat)
    
    // Convert to Monday Start
    let offset = (startDayOfWeek + 6) % 7;
    
    // Render Empty Cells (Offset)
    for (let i = 0; i < offset; i++) {
        const div = document.createElement('div');
        div.className = 'heatmap-day empty';
        gridEl.appendChild(div);
    }
    
    // Render Days
    const today = new Date();
    today.setHours(0,0,0,0);
    
    for (let day = 1; day <= daysInMonth; day++) {
        const amount = dailyTotals[day] || 0;
        const div = document.createElement('div');
        
        let level = 0;
        if (amount > 0) {
            if (upperBound === 0) {
                level = 1; 
            } else {
                const ratio = amount / upperBound;
                if (ratio >= 1.0) level = 4;
                else if (ratio > 0.6) level = 3; 
                else if (ratio > 0.3) level = 2; 
                else level = 1; 
            }
        }
        
        const cellDate = new Date(year, month, day);
        const isFuture = cellDate > today;
        const isToday = cellDate.getTime() === today.getTime();

        let extraClass = '';
        if (isToday) extraClass = 'today';
        if (isFuture) extraClass += ' future';
        
        div.className = `heatmap-day level-${level} ${extraClass}`;
        
        if (isFuture) {
            div.title = `${day}/${month+1}: Chưa đến`;
        } else if (amount === 0) {
            div.title = `${day}/${month+1}: Không chi tiêu`;
             // Add onclick for zero spend days too (to show "No Spend" insight)
             div.onclick = () => showDayDetail(day, month, year, amount, upperBound);
        } else {
            div.title = `${day}/${month+1}: ${formatCurrency(amount)}`;
            div.onclick = () => showDayDetail(day, month, year, amount, upperBound);
        }
        
        div.innerHTML = `<span class="day-num">${day}</span>`;
        gridEl.appendChild(div);
    }
}

function renderForecast() {
    const container = document.getElementById('forecast-container');
    if (!container) return;
    
    // 1. Data Setup (Current Month)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysPassed = now.getDate();
    const daysRemaining = daysInMonth - daysPassed;
    
    // Filter Current Month Transactions
    const currentMonthTx = transactions.filter(t => 
        t.date && t.date.getMonth() === currentMonth && t.date.getFullYear() === currentYear
    );
    const currentTotal = currentMonthTx.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    
    // 2. Hybrid Forecasting Logic
    
    // Step A: Calculate Median History for Lump Sum Categories (Last 6 Months for better stability)
    const historicalFixedData = {}; // { 'Tiền Nhà': [5tr, 5tr, 5tr], ... }
    
    // Loop back 6 months
    for (let i = 1; i <= 6; i++) {
        const d = new Date(currentYear, currentMonth - i, 1);
        
        // Get transactions for that past month
        const mTx = transactions.filter(t => 
            t.date && t.date.getMonth() === d.getMonth() && t.date.getFullYear() === d.getFullYear()
        );
        
        if (mTx.length > 0) {
            // Group by category
            const catSums = {};
            mTx.forEach(t => {
                if (LUMP_SUM_CATEGORIES.includes(t.category)) {
                    catSums[t.category] = (catSums[t.category] || 0) + (parseFloat(t.amount) || 0);
                }
            });
            
            // Push to history
            Object.keys(catSums).forEach(cat => {
                if (!historicalFixedData[cat]) historicalFixedData[cat] = [];
                historicalFixedData[cat].push(catSums[cat]);
            });
        }
    }
    
    // Calculate Medians
    const medianFixedCosts = {}; 
    Object.keys(historicalFixedData).forEach(cat => {
        medianFixedCosts[cat] = calculateMedian(historicalFixedData[cat]);
    });

    // Baseline Average (Total) for comparison
    let baselineTotal = 0;
    let baselineCount = 0;
    for (let i = 1; i <= 3; i++) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const mSum = transactions
            .filter(t => t.date && t.date.getMonth() === d.getMonth() && t.date.getFullYear() === d.getFullYear())
            .reduce((s,t) => s + (parseFloat(t.amount)||0), 0);
        if(mSum > 0) {
            baselineTotal += mSum;
            baselineCount++;
        }
    }
    const averageTotal = baselineCount > 0 ? (baselineTotal / baselineCount) : 0;


    // Step B: Calculate Projected Variable Spending (Smart Burn Rate)
    // Identify current variable spending (Month to Date)
    let currentVariableTotal = 0;
    currentMonthTx.forEach(t => {
        if (!LUMP_SUM_CATEGORIES.includes(t.category)) {
            currentVariableTotal += (parseFloat(t.amount) || 0);
        }
    });

    // Strategy: Use "Rolling 7 Days" Average for Burn Rate
    // 1. Get transactions from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0,0,0,0);
    
    const last7DaysTx = transactions.filter(t => {
        const tDate = t.date; // Object
        return tDate >= sevenDaysAgo && tDate <= new Date() && !LUMP_SUM_CATEGORIES.includes(t.category);
    });

    let last7DaysTotal = last7DaysTx.reduce((sum, t) => sum + (parseFloat(t.amount)||0), 0);
    
    let dailyBurnRate = 0;
    let burnRateSource = '7 ngày gần nhất';
    
    if (transactions.length > 0) {
        const oldestTx = transactions[transactions.length - 1]; // Sorted desc usually? logic below assumes existence
        // Actually app.js data is sorted desc in `renderTransactions` but `transactions` array order depends on snapshot
        // Snapshot order is orderBy date desc. So [0] is newest. [last] is oldest.
        // Let's assume transactions is safe.
        
        // Find actual oldest for safety
        let minDate = new Date();
        if (transactions.length > 0) {
             const dates = transactions.map(t => t.date);
             minDate = new Date(Math.min(...dates));
        }

        const dataAgeDays = (new Date() - minDate) / (1000 * 60 * 60 * 24);
        
        if (dataAgeDays < 7 && daysPassed > 0) {
            // New user (< 1 week), use Month Average
            dailyBurnRate = currentVariableTotal / daysPassed;
            burnRateSource = 'trung bình tháng';
        } else {
            // Established user, use 7-Day Rolling with Smart Divisor
            // Count distinct active days in the last 7 days window
            const activeDays = new Set(last7DaysTx.map(t => t.date.toDateString())).size;
            
            // Formula: last7DaysTotal / max(activeDays, 3)
            // This prevents "0 spending days" from dragging down the average too much (conservative forecast)
            // And prevents "1 day spike" from blowing up the average (min divisor 3)
            const divisor = Math.max(activeDays, 3);
            dailyBurnRate = divisor > 0 ? (last7DaysTotal / divisor) : 0;
        }
    } else {
        dailyBurnRate = 0;
    }
    
    let projectedVariable = (dailyBurnRate * daysRemaining); 
    
    
    // Step C: Calculate Projected Fixed Spending (Median + Logic)
    let projectedFixedTotal = 0;
    let pendingFixedItems = []; 

    // Strictly strictly forecast only for currently defined LUMP_SUM_CATEGORIES
    // Do NOT merge with historical keys to avoid zombie categories or double counting if logic changes
    const targetFixedCats = LUMP_SUM_CATEGORIES;
    
    let expectedFixedSum = 0;
    
    targetFixedCats.forEach(cat => {
         const currentPaid = currentMonthTx.filter(t => t.category === cat).reduce((s,t) => s + t.amount, 0);
         // Get median from history, or 0 if no history
         const medianVal = medianFixedCosts[cat] || 0;
         
         if (medianVal > 0) {
             // Logic: If currentPaid is significantly less than Median (e.g. < 90%), assume remainder needed
             // If currentPaid >= 90% Median, assume Done
             
             if (currentPaid >= (medianVal * 0.9)) {
                 // Counts as Paid
                 expectedFixedSum += currentPaid; 
             } else {
                 // Not Paid / Partially Paid -> Expect to reach Median
                 expectedFixedSum += Math.max(currentPaid, medianVal); 
                 
                 // Pending list Logic
                 if (currentPaid < (medianVal * 0.1)) {
                     // Only warn if almost nothing paid
                     pendingFixedItems.push({ cat, amount: medianVal });
                 }
             }
         } else {
             // No history? Trust current. 
             // If it's 0, we add 0. If they paid, we add paid.
             expectedFixedSum += currentPaid;
         }
    });

    // Final Projection Calculation
    // Total = Current Variable (Paid) + Projected Variable (Future) + Expected Fixed (Paid + Future Remainder)
    
    // Note regarding Double Counting:
    // currentVariableTotal is strictly Non-LumpSum transactions.
    // expectedFixedSum is strictly LumpSum transactions (Actual + Predicted Remainder).
    // They are mutually exclusive sets of categories. Safe to add.
    
    let projectedTotal = currentVariableTotal + projectedVariable + expectedFixedSum;

    // Sanity
    if (projectedTotal < currentTotal) projectedTotal = currentTotal;

    
    // 4. Analysis Message
    let statusClass = 'neutral';

    let statusIcon = 'fa-scale-balanced';
    let message = 'Chi tiêu đang ở mức ổn định.';
    
    const diffPercent = averageTotal > 0 ? ((projectedTotal - averageTotal) / averageTotal * 100) : 0;
    
    if (diffPercent > 10) {
        statusClass = 'danger';
        statusIcon = 'fa-triangle-exclamation';
        message = `Dự kiến cao hơn TB <b>${diffPercent.toFixed(0)}%</b>`;
    } else if (diffPercent < -10) {
        statusClass = 'success';
        statusIcon = 'fa-piggy-bank';
        message = `Dự kiến tiết kiệm <b>${Math.abs(diffPercent).toFixed(0)}%</b>`;
    }

    if (pendingFixedItems.length > 0) {
        const names = pendingFixedItems.map(i => i.cat).join(', ');
        message += `<div style="font-size:0.8rem; margin-top:4px; opacity:0.8; font-weight:normal">Chưa đóng: ${names}</div>`;
    }
    
    // 5. Render UI
    const progressLimit = Math.max(projectedTotal, averageTotal * 1.25) || projectedTotal || 100; 
    const currentWidth = (currentTotal / progressLimit) * 100;
    const projectedWidth = ((projectedTotal - currentTotal) / progressLimit) * 100; 
    const avgPos = (averageTotal / progressLimit) * 100;

    container.innerHTML = `
        <div class="analysis-card full-width forecast-card ${statusClass}">
            <div class="fc-header">
                <div class="fc-icon"><i class="fa-solid ${statusIcon}"></i></div>
                <div class="fc-info">
                    <span class="fc-title">Dự báo cuối tháng</span>
                    <span class="fc-amount">${formatCurrency(projectedTotal)}</span>
                </div>
            </div>
            <div class="fc-message">${message}</div>
            
            <div class="forecast-bar-container">
                <div class="fb-labels">
                    <span>Thực tế: ${formatCurrency(currentTotal)}</span>
                    <span style="opacity:0.6">TB 3 tháng: ${formatCurrency(averageTotal)}</span>
                </div>
                <div class="fb-track">
                    ${avgPos > 0 ? `<div class="fb-marker" style="left: ${Math.min(avgPos, 100)}%"></div>` : ''}
                    <div class="fb-fill current" style="width: ${Math.min(currentWidth, 100)}%"></div>
                    <div class="fb-fill projected" style="left: ${Math.min(currentWidth, 100)}%; width: ${Math.min(projectedWidth, 100 - currentWidth)}%"></div>
                </div>
                <div class="fb-legend"> 
                    <small><span class="dot current"></span> Đã chi</small>
                    <small><span class="dot projected"></span> Dự kiến thêm</small>
                </div>
            </div>
        </div>
        
        <div class="analysis-card full-width" style="margin-top:1rem">
            <h4 style="font-size:0.9rem; color:var(--text-muted); margin-bottom:0.8rem;">Chi tiết dự báo</h4>
            
            <div class="details-row" style="margin-bottom:0.5rem; justify-content:space-between; font-size:0.9rem;">
                <span style="color:var(--text-muted)">Sinh hoạt (${daysRemaining} ngày tới):</span>
                <b style="color:var(--text-light)">+${formatCurrency(projectedVariable)}</b>
            </div>
             <div class="details-row" style="margin-bottom:0.5rem; justify-content:space-between; font-size:0.9rem;">
                 <span style="color:var(--text-muted)">Định phí kỳ vọng:</span>
                 <b style="color:var(--text-light)">+${formatCurrency(expectedFixedSum - currentMonthTx.filter(t => LUMP_SUM_CATEGORIES.includes(t.category)).reduce((s,t)=>s+t.amount,0))}</b>
             </div>
            <div class="details-row" style="margin-top:0.5rem; padding-top:0.5rem; border-top:1px solid rgba(255,255,255,0.1); justify-content:space-between; font-size:0.9rem;">
                 <span>Tốc độ tiêu (${burnRateSource}):</span>
                 <b>${formatCurrency(dailyBurnRate)}/ngày</b>
            </div>
        </div>
    `;
}


function populateCustomTrendDropdown() {
    const optionsContainer = document.getElementById('trend-category-options');
    const label = document.getElementById('trend-category-label');
    
    if (optionsContainer && label) {
        optionsContainer.innerHTML = '';
        
        // "All" Option
        addCustomOption(optionsContainer, 'all', 'Tất cả danh mục');
        
        // Categories
        Array.from(categories).forEach(cat => {
            addCustomOption(optionsContainer, cat, cat);
        });
        
        // Set initial label
        label.innerText = currentTrendCategory === 'all' ? 'Tất cả danh mục' : currentTrendCategory;
    }
}

function addCustomOption(container, value, text) {
    const div = document.createElement('div');
    div.className = 'custom-option';
    if (value === currentTrendCategory) div.classList.add('selected');
    
    // Icon
    const iconClass = categoryIcons[value] || (value === 'all' ? 'fa-layer-group' : categoryIcons['default']);
    
    div.innerHTML = `<i class="fa-solid ${iconClass}" style="width:20px; text-align:center;"></i> ${text}`;
    
    div.addEventListener('click', () => {
        currentTrendCategory = value;
        document.getElementById('trend-category-label').innerText = text;
        
        // Close dropdown
        document.getElementById('trend-category-wrapper').classList.remove('open');
        
        // Update selection UI
        document.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
        div.classList.add('selected');
        
        // Render
        renderTrendChart();
    });
    
    container.appendChild(div);
}

function switchTab(tabName) {
    // Buttons
    document.querySelectorAll('.modal-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabName);
    });
    
    // Content
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.toggle('active', c.id === `tab-${tabName}`);
    });
}

// Tab Listeners
document.querySelectorAll('.modal-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
    });
});

function renderAnalysisOverview() {
    const filtered = getFilteredTransactions();
    const total = filtered.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const overviewEl = document.getElementById('analysis-overview');
    
    // ... logic for overview ...
    const count = filtered.length;
    let maxTx = 0;
    let maxTxObj = null;
    let avgTx = 0;
    
    if (count > 0) {
        maxTxObj = filtered.reduce((prev, current) => (parseFloat(prev.amount) > parseFloat(current.amount)) ? prev : current);
        maxTx = parseFloat(maxTxObj.amount);
        avgTx = total / count;
    }

    overviewEl.innerHTML = `
        <div class="analysis-card">
            <div class="ac-icon"><i class="fa-solid fa-receipt"></i></div>
            <span class="ac-label">Số giao dịch</span>
            <span class="ac-value">${count}</span>
        </div>
        <div class="analysis-card">
            <div class="ac-icon"><i class="fa-solid fa-scale-balanced"></i></div>
            <span class="ac-label">Trung bình/GD</span>
            <span class="ac-value">${formatCurrency(avgTx)}</span>
        </div>
        <div class="analysis-card full-width">
            <div class="ac-icon"><i class="fa-solid fa-crown"></i></div>
            <span class="ac-label">Chi tiêu lớn nhất</span>
            <span class="ac-value highlight">${formatCurrency(maxTx)}</span>
            <span class="ac-label" style="font-size:0.9rem; margin-top:2px;">${maxTxObj ? (maxTxObj.note || maxTxObj.category) : ''}</span>
            <span class="ac-label" style="font-size:0.8rem;">${maxTxObj ? maxTxObj.date.toLocaleString('vi-VN') : ''}</span>
        </div>
    `;
}

function renderCategoryBreakdown() {
     const filtered = getFilteredTransactions();
     const total = filtered.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
     
     // 1. Calculate Current Period Totals
     const catTotals = {};
     filtered.forEach(t => {
        catTotals[t.category] = (catTotals[t.category] || 0) + (parseFloat(t.amount) || 0);
    });
    
    // 2. Calculate Previous Period Totals (for Comparison)
    // Same logic as renderComparison
    let prevFilterFn = () => false;
    const targetDate = new Date(currentViewDate);
    
    if (currentFilter === 'day') {
        const yesterday = new Date(targetDate);
        yesterday.setDate(targetDate.getDate() - 1);
        prevFilterFn = (t) => isSameDay(t.date, yesterday);
    } else if (currentFilter === 'week') {
        const lastWeek = new Date(targetDate);
        lastWeek.setDate(targetDate.getDate() - 7);
        prevFilterFn = (t) => isSameWeek(t.date, lastWeek);
    } else if (currentFilter === 'month') {
        const lastMonth = new Date(targetDate);
        lastMonth.setMonth(targetDate.getMonth() - 1);
        prevFilterFn = (t) => isSameMonth(t.date, lastMonth);
    } else if (currentFilter === 'year') {
         const lastYear = new Date(targetDate);
         lastYear.setFullYear(targetDate.getFullYear() - 1);
         prevFilterFn = (t) => isSameYear(t.date, lastYear);
    }
    
    const prevTransactions = transactions.filter(prevFilterFn);
    const prevCatTotals = {};
    prevTransactions.forEach(t => {
        prevCatTotals[t.category] = (prevCatTotals[t.category] || 0) + (parseFloat(t.amount) || 0);
    });

    // 3. Render
    const sortedCats = Object.entries(catTotals).sort(([,a], [,b]) => b - a);
    
    categoryBreakdownEl.innerHTML = '';
    
    if (sortedCats.length === 0) {
        categoryBreakdownEl.innerHTML = '<p style="text-align:center; color:var(--text-muted)">Chưa có dữ liệu</p>';
        return;
    }
    
    sortedCats.forEach(([cat, amount]) => {
        const percent = ((amount / total) * 100).toFixed(1);
        const iconClass = categoryIcons[cat] || categoryIcons['default'];
        
        // Calculate Trend
        const prevAmount = prevCatTotals[cat] || 0;
        let trendHtml = '';
        
        if (prevAmount > 0) {
            const diff = amount - prevAmount;
            const diffPercent = ((diff / prevAmount) * 100).toFixed(0);
            
            if (diff > 0) {
                trendHtml = `<span class="trend-tag up"><i class="fa-solid fa-arrow-trend-up"></i> ${diffPercent}%</span>`;
            } else if (diff < 0) {
                 // diffPercent is negative already
                trendHtml = `<span class="trend-tag down"><i class="fa-solid fa-arrow-trend-down"></i> ${Math.abs(diffPercent)}%</span>`;
            } else {
                 trendHtml = `<span class="trend-tag neutral">-</span>`;
            }
        } else if (amount > 0 && currentFilter !== 'all') {
             // New spending
             trendHtml = `<span class="trend-tag new">Mới</span>`;
        }
        
        const div = document.createElement('div');
        div.className = 'breakdown-item';
        div.innerHTML = `
            <div class="bd-header">
                <div class="bd-cat">
                     <i class="fa-solid ${iconClass}" style="color:var(--primary)"></i> 
                     <span class="cat-label">${cat}</span>
                     ${trendHtml}
                </div>
                <div class="bd-amount">${formatCurrency(amount)} <small>(${percent}%)</small></div>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width: ${percent}%"></div>
            </div>
        `;
        categoryBreakdownEl.appendChild(div);
    });
}

function renderTrendChart() {
    const container = document.getElementById('trend-chart-container');
    container.innerHTML = '';
    
    const now = new Date();
    const dataPoints = []; // { label: 'Mon', value: 1000 }
    
    if (currentTrendFilter === '7days') {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const label = d.toLocaleDateString('vi-VN', { weekday: 'short' }); // T2, T3
            
            // Sum data
            const sum = transactions
                .filter(t => isSameDay(t.date, d))
                .filter(t => currentTrendCategory === 'all' || t.category === currentTrendCategory) 
                .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
                
            dataPoints.push({ label, value: sum });
        }
    } else { // 6months
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now);
            d.setMonth(now.getMonth() - i);
            // Label: T1, T12
            const label = `T${d.getMonth() + 1}`;
            
            const sum = transactions
                .filter(t => isSameMonth(t.date, d))
                .filter(t => currentTrendCategory === 'all' || t.category === currentTrendCategory)
                .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
                
            dataPoints.push({ label, value: sum });
        }
    }
    
    // Find Max for scaling
    const maxVal = Math.max(...dataPoints.map(p => p.value));
    
    dataPoints.forEach(p => {
        const height = maxVal > 0 ? (p.value / maxVal * 100) : 0;
        const isMax = p.value === maxVal && maxVal > 0;
        
        // Compact value format (e.g. 150k, 1.2tr)
        let valText = p.value.toLocaleString('vi-VN');
        if (p.value >= 1000000) valText = (p.value / 1000000).toFixed(1) + 'tr';
        else if (p.value >= 1000) valText = (p.value / 1000).toFixed(0) + 'k';
        if (p.value === 0) valText = '';
        
        const col = document.createElement('div');
        col.className = 'chart-bar-col';
        col.innerHTML = `
            <div class="chart-value">${valText}</div>
            <div class="chart-bar ${isMax ? 'is-max' : ''}" style="height: ${height}%"></div>
            <div class="chart-label">${p.label}</div>
        `;
        container.appendChild(col);
    });
    
    // Update Toggles UI matches Filter
    document.getElementById('btn-trend-7d').classList.toggle('active', currentTrendFilter === '7days');
    document.getElementById('btn-trend-6m').classList.toggle('active', currentTrendFilter === '6months');
}

// Trend Event Listeners (ensure bound once)
const btnTrend7d = document.getElementById('btn-trend-7d');
const btnTrend6m = document.getElementById('btn-trend-6m');
// Custom Dropdown Trigger Listener
const trendWrapper = document.getElementById('trend-category-wrapper');
const trendTrigger = document.getElementById('trend-category-trigger');

if (btnTrend7d && btnTrend6m) { // Check existence
    btnTrend7d.addEventListener('click', () => {
        currentTrendFilter = '7days';
        renderTrendChart();
    });
    
    btnTrend6m.addEventListener('click', () => {
        currentTrendFilter = '6months';
        renderTrendChart();
    });
}

if (trendTrigger) {
    trendTrigger.addEventListener('click', () => {
        trendWrapper.classList.toggle('open');
    });
    
    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!trendWrapper.contains(e.target)) {
            trendWrapper.classList.remove('open');
        }
    });
}


// Render
function renderTransactions() {
    const filtered = getFilteredTransactions();

    // Calculate Balance
    const total = filtered.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    
    // Calculate Comparison
    renderComparison(total);
    
    totalBalanceEl.textContent = formatCurrency(total);
    
    // Update Filter Label
    const now = new Date(currentViewDate); // Use View Date
    const today = new Date();
    
    let label = '';
    if (currentFilter === 'day') {
        if (isSameDay(now, today)) label = `Hôm nay, ${now.getDate()}/${now.getMonth()+1}`;
        else {
            const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
            if(isSameDay(now, yesterday)) label = `Hôm qua, ${now.getDate()}/${now.getMonth()+1}`;
            else label = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`;
        }
    }
    else if (currentFilter === 'week') {
        // Calculate week start (Monday)
        const day = now.getDay() || 7; 
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - day + 1);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        
        label = `Tuần: ${startOfWeek.getDate()}/${startOfWeek.getMonth()+1} - ${endOfWeek.getDate()}/${endOfWeek.getMonth()+1}`;
        if (isSameWeek(now, today)) label += " (Nay)";
    }
    else if (currentFilter === 'month') {
        label = `Tháng ${now.getMonth()+1}/${now.getFullYear()}`;
        if (isSameMonth(now, today)) label += " (Nay)";
    }
    else if (currentFilter === 'year') {
        label = `Năm ${now.getFullYear()}`;
        if (isSameYear(now, today)) label += " (Nay)";
    }
    else if (currentFilter === 'all') label = `Toàn bộ thời gian`;
    
    filterLabel.textContent = label;
    currentMonthLabel.textContent = label;

    // List
    transactionsListEl.innerHTML = '';
    
    if (filtered.length === 0) {
        transactionsListEl.innerHTML = '<div class="loading-spinner">Không có giao dịch nào</div>';
        return;
    }

    // Sort descending
    filtered.sort((a,b) => b.date - a.date);

    // Group by Date first to calculate sums
    const groups = {};
    const order = [];
    
    filtered.forEach(t => {
        const dateKey = t.date.toLocaleDateString('vi-VN');
        if (!groups[dateKey]) {
            groups[dateKey] = {
                date: t.date,
                items: [],
                total: 0
            };
            order.push(dateKey);
        }
        groups[dateKey].items.push(t);
        groups[dateKey].total += (parseFloat(t.amount) || 0);
    });

    order.forEach(dateKey => {
        const group = groups[dateKey];
        
        // Group Container
        const groupContainer = document.createElement('div');
        groupContainer.className = 'transaction-group';

        // Header
        const header = document.createElement('div');
        header.className = 'date-group-header';
        
        let dayLabel = '';
        if (isSameDay(group.date, today)) {
             dayLabel = 'Hôm nay';
        } else {
             const yesterday = new Date(today);
             yesterday.setDate(today.getDate() - 1);
             if (isSameDay(group.date, yesterday)) {
                 dayLabel = 'Hôm qua';
             } else {
                 const rawDay = group.date.toLocaleDateString('vi-VN', { weekday: 'long' });
                 dayLabel = rawDay.charAt(0).toUpperCase() + rawDay.slice(1);
             }
        }
        
        const datePart = group.date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        header.innerHTML = `
            <span>${dayLabel}, ${datePart}</span>
            <span class="daily-total">-${formatCurrency(group.total)}</span>
        `;
        groupContainer.appendChild(header);
        
        // Items
        group.items.forEach(t => {
            const item = document.createElement('div');
            item.className = 'transaction-item';
            item.style.cursor = 'pointer';
            item.onclick = () => openEditModal(t); // Click to Edit
            
            const iconClass = categoryIcons[t.category] || categoryIcons['default'];
            const timeStr = t.date.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
            
            item.innerHTML = `
                <div class="trans-icon">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div class="trans-details">
                    <span class="cat-name trans-note">${t.note || t.category}</span>
                    <span class="trans-date">${t.category} • ${timeStr}</span>
                </div>
                <div class="trans-amount">
                    -${formatCurrency(t.amount)}
                </div>
            `;
            groupContainer.appendChild(item);
        });

        transactionsListEl.appendChild(groupContainer);
    });
}

function renderCategories() {
    // Keep the "Add New" button
    const addBtn = document.getElementById('btn-add-category-trigger');
    // Clear check to avoid duplicates if re-rendering
    // But simplistic approach: clear all except button
    // Actually, simple innerHTML clear and re-append
    
    // Save addBtn wrapper
    const parent = categorySelector;
    const tempBtn = addBtn.cloneNode(true);
    
    parent.innerHTML = '';
    
    // Add categories
    Array.from(categories).forEach(cat => {
        const div = document.createElement('div');
        div.className = 'category-item';
        div.dataset.category = cat; // For easier selection
        div.onclick = () => selectCategory(div, cat);
        
        const iconClass = categoryIcons[cat] || categoryIcons['default'];
        
        div.innerHTML = `
            <div class="icon"><i class="fa-solid ${iconClass}"></i></div>
            <span>${cat}</span>
        `;
        parent.appendChild(div);
    });
    
    // Append button at end
    parent.appendChild(tempBtn);
    
    // Re-attach event listener to new button
    tempBtn.addEventListener('click', () => {
        modalCategory.classList.add('active');
    });
}

// Interactions
function selectCategory(el, catName) {
    document.querySelectorAll('.category-item').forEach(i => i.classList.remove('selected'));
    el.classList.add('selected');
    selectedCategoryInput.value = catName;
}

// Filter Chips
filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = chip.dataset.filter;
        currentViewDate = new Date(); // Reset to today on filter change
        renderTransactions();
    });
});

// Modal Handlers
function openEditModal(transaction) {
    editingTransactionId = transaction.id;
    
    // Fill Data
    // Format amount with dots
    const amountStr = transaction.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    document.getElementById('amount-input').value = amountStr;
    
    document.getElementById('date-input').valueAsDate = transaction.date;
    document.getElementById('note-input').value = transaction.note || '';
    
    // Select Category
    selectedCategoryInput.value = transaction.category;
    const catItems = document.querySelectorAll('.category-item');
    catItems.forEach(item => {
        if(item.dataset.category === transaction.category) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    
    // UI Changes
    btnDeleteTransaction.style.display = 'block'; // Show Delete
    btnSaveTransaction.innerText = 'Lưu thay đổi';
    btnSaveTransaction.disabled = false;
    
    modalTransaction.classList.add('active');
}

// Auto-format Amount Input & Suggestions
const amountInput = document.getElementById('amount-input');
const amountSuggestions = document.getElementById('amount-suggestions');

if (amountInput) {
    amountInput.addEventListener('input', (e) => {
        const originalVal = e.target.value;
        let valueStr = originalVal.replace(/\D/g, '');
        let valueNum = parseInt(valueStr);
        
        // Format with dots
        if (valueStr) {
            const formatted = valueStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            if (e.target.value !== formatted) {
                // Only update if changed to avoid cursor jumping issues (basic)
                 e.target.value = formatted;
            }
        } else {
             e.target.value = '';
        }

        // Suggestions Logic
        if (amountSuggestions) {
            amountSuggestions.innerHTML = '';
            
            if (valueNum > 0 && valueNum < 100000000) { // Limit max input base
                 const candidates = [];
                 
                 // Shortcuts logic:
                 // 5 -> 5.000 (k), 50.000, 500.000
                 // 50 -> 50.000 (k), 500.000, 5.000.000 (tr)
                 
                 if (valueNum < 1000) {
                     candidates.push({ val: valueNum * 1000, suffix: 'k' }); // 5k
                     candidates.push({ val: valueNum * 10000, suffix: '' }); // 50k
                     if (valueNum < 100) candidates.push({ val: valueNum * 100000, suffix: '' }); // 500k
                 } else if (valueNum < 1000000) {
                     candidates.push({ val: valueNum * 1000, suffix: 'k' }); // 500k -> 500tr (too big?) or 50 -> 50k
                 }
                 
                 // Standard Finance App Logic (Append 000)
                 // If I type "50", I likely want "50.000"
                 // If I type "200", I likely want "200.000"
                 // Check specific ranges
                 
                 const opts = new Set();
                 const finalCands = [];
                 
                 // Always suggest appending '000' (The "k" shortcut)
                 const kVal = parseInt(valueStr + '000');
                 if (kVal < 1000000000) finalCands.push({ val: kVal, suffix: 'k' });
                 
                 // If input is small (e.g. 5, 10, 50), suggest 0000 (10k range)
                 if (valueStr.length <= 2) {
                     const tenKVal = parseInt(valueStr + '0000');
                     if (tenKVal < 1000000000) finalCands.push({ val: tenKVal, suffix: '' });
                 }
                 
                 // Suggest 'Million' (000 000) if reasonable
                 if (valueStr.length <= 3) { // 5 -> 5tr, 500 -> 500tr
                      const mVal = parseInt(valueStr + '000000');
                      if (mVal < 10000000000 && mVal !== kVal) finalCands.push({ val: mVal, suffix: 'tr' });
                 }

                 // Render
                 finalCands.forEach(item => {
                     if (opts.has(item.val)) return;
                     opts.add(item.val);
                     
                     const sFormatted = item.val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                     
                     const chip = document.createElement('div');
                     chip.className = 'suggestion-chip';
                     chip.innerText = sFormatted;
                     
                     chip.onclick = () => {
                         amountInput.value = sFormatted;
                         amountInput.focus();
                         amountSuggestions.innerHTML = ''; 
                     };
                     
                     amountSuggestions.appendChild(chip);
                 });
            }
        }
    });
}

fabAdd.addEventListener('click', () => {
    // Reset for Add Mode
    editingTransactionId = null;
    transactionForm.reset();
    document.getElementById('date-input').valueAsDate = new Date();
    document.querySelectorAll('.category-item').forEach(i => i.classList.remove('selected'));
    selectedCategoryInput.value = '';
    
    // UI Changes
    btnDeleteTransaction.style.display = 'none'; // Hide Delete
    btnSaveTransaction.innerText = 'Lưu';
    btnSaveTransaction.disabled = false;
    
    modalTransaction.classList.add('active');
    document.getElementById('amount-input').focus();
});

closeTransactionModalBtn.addEventListener('click', () => {
    modalTransaction.classList.remove('active');
});

// Initial binding for category add is in renderCategories now

closeCategoryModalBtn.addEventListener('click', () => {
    modalCategory.classList.remove('active');
});

// ... Button handlers for new modal
btnShowAnalysis.addEventListener('click', () => {
    renderAnalysis();
    modalAnalysis.classList.add('active');
});

closeAnalysisModalBtn.addEventListener('click', () => {
    modalAnalysis.classList.remove('active');
});

// Settings Modal Logic
if (btnSettings) {
    btnSettings.addEventListener('click', () => {
        modalSettings.classList.add('active');
    });
}

if (closeSettingsModalBtn) {
    closeSettingsModalBtn.addEventListener('click', () => {
        modalSettings.classList.remove('active');
    });
}

// Close Settings Modal on Overlay Click
if (modalSettings) {
    modalSettings.addEventListener('click', (e) => {
        if (e.target === modalSettings) {
            modalSettings.classList.remove('active');
        }
    });
}

// Export Data
if (btnExportData) {
    btnExportData.addEventListener('click', () => {
        if (transactions.length === 0) {
            showToast("Không có dữ liệu để xuất!", "info");
            return;
        }

        // CSV Header
        // Add BOM for Excel UTF-8 compatibility
        let csvContent = "\uFEFF"; 
        csvContent += "Date,Amount,Category,Note,Type\n";

        // CSV Rows
        transactions.forEach(t => {
            // Safe string handling
            const dateStr = t.date ? t.date.toISOString() : "";
            // Wrap fields in quotes if they contain commas
            let noteStr = (t.note || "").replace(/"/g, '""'); 
            if (noteStr.includes(',') || noteStr.includes('\n')) {
                noteStr = `"${noteStr}"`;
            }
            
            const row = `${dateStr},${t.amount},${t.category},${noteStr},${t.type}`;
            csvContent += row + "\n";
        });

        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `chi_tieu_backup_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast("Đã tải xuống file CSV!");
    });
}

// Form Submissions
transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (btnSaveTransaction.disabled) return;

    // Parse Amount (remove dots)
    const rawAmount = document.getElementById('amount-input').value.replace(/\./g, '');
    const amount = parseFloat(rawAmount); // Should handle empty string if validation passes
    
    const category = selectedCategoryInput.value;
    const dateInput = document.getElementById('date-input').value; // yyyy-mm-dd
    const note = document.getElementById('note-input').value;
    
    if(!category) {
        showToast("Vui lòng chọn danh mục!", "error");
        return;
    }

    if (isNaN(amount) || amount <= 0) {
        showToast("Vui lòng nhập số tiền hợp lệ!", "error");
        return;
    }

    // Disable button to prevent double click
    const originalBtnText = btnSaveTransaction.innerText;
    btnSaveTransaction.disabled = true;
    btnSaveTransaction.innerText = 'Đang lưu...';

    // Preserve time if editing
    let txDate = new Date(dateInput);
    if (editingTransactionId) {
        const original = transactions.find(t => t.id === editingTransactionId);
        if (original && original.date) {
            txDate.setHours(original.date.getHours(), original.date.getMinutes(), original.date.getSeconds());
        }
    } else {
        const now = new Date();
        txDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    }

    const txData = {
        amount,
        category,
        date: txDate, 
        note,
        type: 'Expense'
    };
    
    // ---------------------------------------------------------
    // OPTIMISTIC UPDATE
    // ---------------------------------------------------------
    const tempId = editingTransactionId || ('temp_' + Date.now());
    
    if (editingTransactionId) {
        // UPDATE LOCAL
        const index = transactions.findIndex(t => t.id === editingTransactionId);
        if (index !== -1) {
            transactions[index] = { ...transactions[index], ...txData };
        }
    } else {
        // ADD LOCAL with Temp ID
        const newTx = {
            id: tempId,
            ...txData,
            createdAt: new Date().toISOString()
        };
        transactions.unshift(newTx);
    }

    // Update UI Immediately
    renderTransactions();
    modalTransaction.classList.remove('active');
    transactionForm.reset();
    
    // ---------------------------------------------------------
    // ASYNC SERVER SYNC
    // ---------------------------------------------------------
    if (db) {
        try {
            if (editingTransactionId) {
                await updateDoc(doc(db, "transactions", editingTransactionId), {
                     ...txData,
                    updatedAt: serverTimestamp()
                });
                showToast("Đã cập nhật chi tiêu!");
            } else {
                const docRef = await addDoc(collection(db, "transactions"), {
                    ...txData,
                    createdAt: serverTimestamp()
                });
                
                // Update the local item with real ID
                const localItem = transactions.find(t => t.id === tempId);
                if (localItem) {
                    localItem.id = docRef.id;
                }
                showToast("Đã thêm chi tiêu thành công!");
            }
        } catch (err) {
            console.error("Error saving transaction", err);
            showToast("Lỗi lưu dữ liệu! Vui lòng kiểm tra mạng.", "error");
            // Optional: Revert local change if critical
        } finally {
            // Reset Button State (ready for next time modal opens)
            btnSaveTransaction.disabled = false;
            btnSaveTransaction.innerText = 'Lưu';
        }
    } else {
        // Offline / No DB
        btnSaveTransaction.disabled = false;
        btnSaveTransaction.innerText = 'Lưu';
    }
});

const modalConfirm = document.getElementById('modal-confirm');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const btnCancelDelete = document.getElementById('btn-cancel-delete');


btnDeleteTransaction.addEventListener('click', () => {
    if (editingTransactionId) {
        modalConfirm.classList.add('active');
    }
});

btnCancelDelete.addEventListener('click', () => {
    modalConfirm.classList.remove('active');
});

btnConfirmDelete.addEventListener('click', async () => {
    if (editingTransactionId) {
        // Delete
        const index = transactions.findIndex(t => t.id === editingTransactionId);
        if (index !== -1) {
            transactions.splice(index, 1);
        }
        
        renderTransactions();
        modalTransaction.classList.remove('active');
        modalConfirm.classList.remove('active');
        
        if (db) {
             try {
                await deleteDoc(doc(db, "transactions", editingTransactionId));
                showToast("Đã xóa khoản chi!");
            } catch (err) {
                console.error("Error deleting", err);
                showToast("Lỗi xóa dữ liệu!", "error");
            }
        }
    }
});


categoryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('new-category-name').value.trim();
    if(name) {
        categories.add(name);
        renderCategories();
        modalCategory.classList.remove('active');
        categoryForm.reset();
        showToast(`Đã thêm danh mục: ${name}`);
    }
});

// Close modals on outside click updated
// Close modals on outside click updated
window.onclick = (e) => {
    if (e.target == modalTransaction) modalTransaction.classList.remove('active');
    if (e.target == modalCategory) modalCategory.classList.remove('active');
    if (e.target == modalAnalysis) modalAnalysis.classList.remove('active');
    if (e.target == modalSearch) modalSearch.classList.remove('active');
};


// ====================
// Search Logic
// ====================
const btnShowSearch = document.getElementById('btn-show-search');
const modalSearch = document.getElementById('modal-search');
const closeSearchModalBtn = document.getElementById('close-search-modal');
const searchForm = document.getElementById('search-form');
const btnResetSearch = document.getElementById('btn-reset-search');

// Open Search
if (btnShowSearch) {
    btnShowSearch.addEventListener('click', () => {
        populateSearchCategoryDropdown();
        modalSearch.classList.add('active');
    });
}

// Close Search
if (closeSearchModalBtn) {
    closeSearchModalBtn.addEventListener('click', () => {
        modalSearch.classList.remove('active');
    });
}

// Submit Search
if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Gather Data
        const keyword = document.getElementById('search-keyword').value.trim();
        const category = document.getElementById('search-category-input').value;
        const dateFrom = document.getElementById('search-date-from').value;
        const dateTo = document.getElementById('search-date-to').value;
        const amountMin = document.getElementById('search-amount-min').value;
        const amountMax = document.getElementById('search-amount-max').value;
        
        // Update State
        searchCriteria = {
            keyword,
            category,
            dateFrom: dateFrom ? new Date(dateFrom) : null,
            dateTo: dateTo ? new Date(dateTo) : null,
            amountMin: amountMin ? parseFloat(amountMin) : null,
            amountMax: amountMax ? parseFloat(amountMax) : null
        };
        
        // Activate Filter
        currentFilter = 'search';
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active')); // Visually deselect chips
        
        renderTransactions();
        modalSearch.classList.remove('active');
        
        // Show Toast/Indicator
        showToast("Đang hiển thị kết quả tìm kiếm", "info");
    });
}

// Reset Search
if (btnResetSearch) {
    btnResetSearch.addEventListener('click', () => {
        searchForm.reset();
        document.getElementById('search-category-input').value = 'all';
        document.getElementById('search-category-label').innerText = 'Tất cả';
        document.querySelectorAll('#search-category-options .custom-option').forEach(o => o.classList.remove('selected'));
        // Select first one if exists
        const first = document.querySelector('#search-category-options .custom-option');
        if(first) first.classList.add('selected');
    });
}


// Search Category Dropdown Logic
const searchCatWrapper = document.getElementById('search-category-wrapper');
const searchCatTrigger = document.getElementById('search-category-trigger');

if (searchCatTrigger) {
    searchCatTrigger.addEventListener('click', () => {
        searchCatWrapper.classList.toggle('open');
    });
    
    // Close outside
    document.addEventListener('click', (e) => {
        if (!searchCatWrapper.contains(e.target)) {
            searchCatWrapper.classList.remove('open');
        }
    });
}

function populateSearchCategoryDropdown() {
    const container = document.getElementById('search-category-options');
    if (!container) return;
    
    // Only populate if empty (or force refresh if categories change often)
    container.innerHTML = '';
    
    // "All" option
    addSearchOption(container, 'all', 'Tất cả');
    
    // Categories
    Array.from(categories).forEach(cat => {
        addSearchOption(container, cat, cat);
    });
    
    // Sync current UI
    const currentVal = document.getElementById('search-category-input').value;
    const label = document.getElementById('search-category-label');
    label.innerText = currentVal === 'all' ? 'Tất cả' : currentVal;
}

function addSearchOption(container, value, text) {
     const div = document.createElement('div');
     div.className = 'custom-option';
     
     const currentVal = document.getElementById('search-category-input').value;
     if (value === currentVal) div.classList.add('selected');
     
     // Icon
     const iconClass = categoryIcons[value] || (value === 'all' ? 'fa-layer-group' : categoryIcons['default']);
     div.innerHTML = `<i class="fa-solid ${iconClass}" style="width:20px; text-align:center;"></i> ${text}`;
     
     div.addEventListener('click', () => {
         // Update Input
         document.getElementById('search-category-input').value = value;
         // Update Label
         document.getElementById('search-category-label').innerText = text;
         
         // UI
         document.querySelectorAll('#search-category-options .custom-option').forEach(o => o.classList.remove('selected'));
         div.classList.add('selected');
         
         // Close
         document.getElementById('search-category-wrapper').classList.remove('open');
     });
     
     container.appendChild(div);
}
