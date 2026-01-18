import { state } from './state.js';
import { categoryIcons, LUMP_SUM_CATEGORIES } from './constants.js';
import { formatCurrency } from '../utils.js';
import { getFilteredTransactions } from './transaction_service.js';
import { isSameDay, isSameWeek, isSameMonth, isSameYear } from './date_utils.js';
import { calculateForecast } from './forecast_service.js';

// DOM Elements
const totalBalanceEl = document.getElementById('total-balance');
const transactionsListEl = document.getElementById('transactions-list');
const filterLabel = document.getElementById('filter-label');
const currentMonthLabel = document.getElementById('current-month');
const expenseComparisonEl = document.getElementById('expense-comparison');
const categoryBreakdownEl = document.getElementById('category-breakdown');
const trendChartContainer = document.getElementById('trend-chart-container');
const forecastContainer = document.getElementById('forecast-container');
const heatmapGridEl = document.getElementById('heatmap-grid');
const heatmapLabelEl = document.getElementById('heatmap-month-label');

export function renderTransactions() {
    const filtered = getFilteredTransactions();

    // Calculate Balance
    const total = filtered.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    
    // Calculate Comparison
    renderComparison(total);
    
    if(totalBalanceEl) totalBalanceEl.textContent = formatCurrency(total);
    
    // Update Filter Label
    const now = new Date(state.filter.viewDate); 
    const today = new Date();
    
    let label = '';
    if (state.filter.current === 'day') {
        const weekday = now.toLocaleDateString('vi-VN', { weekday: 'long' });
        if (isSameDay(now, today)) label = `Hôm nay, ${weekday}, ${now.getDate()}/${now.getMonth()+1}`;
        else {
            const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
            if(isSameDay(now, yesterday)) label = `Hôm qua, ${weekday}, ${now.getDate()}/${now.getMonth()+1}`;
            else label = `${weekday}, ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`;
        }
    }
    else if (state.filter.current === 'week') {
        const day = now.getDay() || 7; 
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - day + 1);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        
        label = `Tuần: ${startOfWeek.getDate()}/${startOfWeek.getMonth()+1} - ${endOfWeek.getDate()}/${endOfWeek.getMonth()+1}`;
        if (isSameWeek(now, today)) label += " (Nay)";
    }
    else if (state.filter.current === 'month') {
        label = `Tháng ${now.getMonth()+1}/${now.getFullYear()}`;
        if (isSameMonth(now, today)) label += " (Nay)";
    }
    else if (state.filter.current === 'year') {
        label = `Năm ${now.getFullYear()}`;
        if (isSameYear(now, today)) label += " (Nay)";
    }
    else if (state.filter.current === 'all') label = `Toàn bộ thời gian`;
    else if (state.filter.current === 'search') label = `Kết quả tìm kiếm`;
    
    // Add Offline Indicator - REMOVED as requested
    /*
    if (!navigator.onLine) {
        label += ' <span style="font-size:0.8em; color:#ff9800; margin-left:8px;"><i class="fa-solid fa-wifi-slash"></i> Offline</span>';
    }
    */
    
    // if(filterLabel) filterLabel.innerHTML = label; // Element removed from UI
    if(currentMonthLabel) currentMonthLabel.innerHTML = label; // Use innerHTML because label might contain HTML now

    // List
    if(transactionsListEl) {
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
                item.dataset.id = t.id;
                
                const iconClass = categoryIcons[t.category] || categoryIcons['default'];
                const timeStr = t.date.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
                
                let pendingHtml = '';
                if (t.pending) {
                    pendingHtml = `<span class="pending-badge" style="font-size:0.75em; padding: 2px 6px; border-radius: 4px; background: rgba(255, 193, 7, 0.2); color: #ffc107; margin-left:6px; display:inline-flex; align-items:center; gap:3px;"><i class="fa-solid fa-clock-rotate-left"></i> Chờ Sync</span>`;
                }
                
                item.innerHTML = `
                    <div class="trans-icon">
                        <i class="fa-solid ${iconClass}"></i>
                    </div>
                    <div class="trans-details">
                        <span class="cat-name trans-note">${t.note || t.category}</span>
                        <span class="trans-date">${t.category} • ${timeStr} ${pendingHtml}</span>
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
}

function renderComparison(currentTotal) {
    if (!expenseComparisonEl) return;
    
    if (state.filter.current === 'all' || state.filter.current === 'search') {
        expenseComparisonEl.style.display = 'none';
        return;
    }

    const targetDate = new Date(state.filter.viewDate);
    let prevTotal = 0;
    
    let prevFilterFn = () => false;
    
    if (state.filter.current === 'day') {
        const yesterday = new Date(targetDate);
        yesterday.setDate(targetDate.getDate() - 1);
        prevFilterFn = (t) => isSameDay(t.date, yesterday);
    } else if (state.filter.current === 'week') {
        const lastWeek = new Date(targetDate);
        lastWeek.setDate(targetDate.getDate() - 7);
        prevFilterFn = (t) => isSameWeek(t.date, lastWeek);
    } else if (state.filter.current === 'month') {
        const lastMonth = new Date(targetDate);
        lastMonth.setMonth(targetDate.getMonth() - 1);
        prevFilterFn = (t) => isSameMonth(t.date, lastMonth);
    } else if (state.filter.current === 'year') {
         const lastYear = new Date(targetDate);
         lastYear.setFullYear(targetDate.getFullYear() - 1);
         prevFilterFn = (t) => isSameYear(t.date, lastYear);
    }
    
    const prevTransactions = state.transactions.filter(t => {
        // 1. Time Filter
        if (!prevFilterFn(t)) return false;
        
        // 2. Category Filter (Fix: Compare Apples to Apples)
        if (state.filter.listCategory && state.filter.listCategory !== 'all') {
            if (t.category !== state.filter.listCategory) return false;
        }
        
        return true;
    });
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

export function renderCategories() {
    const parent = document.getElementById('category-selector');
    if (!parent) return;
    
    const addBtn = document.getElementById('btn-add-category-trigger');
    const tempBtn = addBtn ? addBtn.cloneNode(true) : null;
    
    parent.innerHTML = '';
    
    state.categories.forEach(cat => {
        const div = document.createElement('div');
        div.className = 'category-item';
        div.dataset.category = cat;
        
        const iconClass = categoryIcons[cat] || categoryIcons['default'];
        
        div.innerHTML = `
            <div class="icon"><i class="fa-solid ${iconClass}"></i></div>
            <span>${cat}</span>
        `;
        parent.appendChild(div);
    });
    
    if (tempBtn) {
        parent.appendChild(tempBtn);
        // Bind click via events.js or let it bubble
        tempBtn.classList.add('add-new-cat-btn'); // Ensure class key
    }
}

export function renderAnalysisOverview() {
    const overviewEl = document.getElementById('analysis-overview');
    if(!overviewEl) return;

    const filtered = getFilteredTransactions();
    const total = filtered.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
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

export function renderCategoryBreakdown() {
     if (!categoryBreakdownEl) return;
     
     const filtered = getFilteredTransactions();
     const total = filtered.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
     
     const catTotals = {};
     filtered.forEach(t => {
        catTotals[t.category] = (catTotals[t.category] || 0) + (parseFloat(t.amount) || 0);
    });

    // Comparison Logic
    let prevFilterFn = () => false;
    const targetDate = new Date(state.filter.viewDate);
    
    if (state.filter.current === 'day') {
        const yesterday = new Date(targetDate);
        yesterday.setDate(targetDate.getDate() - 1);
        prevFilterFn = (t) => isSameDay(t.date, yesterday);
    } else if (state.filter.current === 'week') {
        const lastWeek = new Date(targetDate);
        lastWeek.setDate(targetDate.getDate() - 7);
        prevFilterFn = (t) => isSameWeek(t.date, lastWeek);
    } else if (state.filter.current === 'month') {
        const lastMonth = new Date(targetDate);
        lastMonth.setMonth(targetDate.getMonth() - 1);
        prevFilterFn = (t) => isSameMonth(t.date, lastMonth);
    } else if (state.filter.current === 'year') {
         const lastYear = new Date(targetDate);
         lastYear.setFullYear(targetDate.getFullYear() - 1);
         prevFilterFn = (t) => isSameYear(t.date, lastYear);
    }
    
    const prevTransactions = state.transactions.filter(prevFilterFn);
    const prevCatTotals = {};
    prevTransactions.forEach(t => {
        prevCatTotals[t.category] = (prevCatTotals[t.category] || 0) + (parseFloat(t.amount) || 0);
    });
    
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
                trendHtml = `<span class="trend-tag down"><i class="fa-solid fa-arrow-trend-down"></i> ${Math.abs(diffPercent)}%</span>`;
            } else {
                 trendHtml = `<span class="trend-tag neutral">-</span>`;
            }
        } else if (amount > 0 && state.filter.current !== 'all') {
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

export function renderForecast() {
    if (!forecastContainer) return;
    const result = calculateForecast(state.transactions);
    
    let statusClass = 'neutral';
    let statusIcon = 'fa-scale-balanced';
    let message = 'Chi tiêu đang ở mức ổn định.';
    
    const diffPercent = result.averageTotal > 0 ? ((result.projectedTotal - result.averageTotal) / result.averageTotal * 100) : 0;
    
    if (diffPercent > 10) {
        statusClass = 'danger';
        statusIcon = 'fa-triangle-exclamation';
        message = `Dự kiến cao hơn TB <b>${diffPercent.toFixed(0)}%</b>`;
    } else if (diffPercent < -10) {
        statusClass = 'success';
        statusIcon = 'fa-piggy-bank';
        message = `Dự kiến tiết kiệm <b>${Math.abs(diffPercent).toFixed(0)}%</b>`;
    }

    if (result.pendingFixedItems.length > 0) {
        const names = result.pendingFixedItems.map(i => i.cat).join(', ');
        message += `<div style="font-size:0.8rem; margin-top:4px; opacity:0.8; font-weight:normal">Chưa đóng: ${names}</div>`;
    }
    
    const progressLimit = Math.max(result.projectedTotal, result.averageTotal * 1.25) || result.projectedTotal || 100; 
    const currentWidth = (result.currentTotal / progressLimit) * 100;
    const projectedWidth = ((result.projectedTotal - result.currentTotal) / progressLimit) * 100; 
    const avgPos = (result.averageTotal / progressLimit) * 100;

    forecastContainer.innerHTML = `
        <div class="analysis-card full-width forecast-card ${statusClass}">
            <div class="fc-header">
                <div class="fc-icon"><i class="fa-solid ${statusIcon}"></i></div>
                <div class="fc-info" style="flex:1">
                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:2px;">
                        <span class="fc-title">Dự báo cuối tháng</span>
                        <span style="font-size:0.8rem; color:${result.confidence >= 70 ? '#4caf50' : (result.confidence >= 40 ? '#ff9800' : '#f44336')}; white-space:nowrap;">
                            Độ chính xác: ${result.confidence}%
                        </span>
                    </div>
                    <span class="fc-amount">${formatCurrency(result.projectedTotal)}</span>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                        Min: ${formatCurrency(result.projectedMin)} - Max: ${formatCurrency(result.projectedMax)}
                    </div>
                </div>
            </div>
            <div class="fc-message">${message}</div>
            
            <div class="forecast-bar-container">
                <div class="fb-labels">
                    <span>Thực tế: ${formatCurrency(result.currentTotal)}</span>
                    <span style="opacity:0.6">TB 3 tháng: ${formatCurrency(result.averageTotal)}</span>
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
                <span style="color:var(--text-muted)">Sinh hoạt (${result.daysRemaining} ngày tới):</span>
                <b style="color:var(--text-light)">+${formatCurrency(result.projectedVariable)}</b>
            </div>
             <div class="details-row" style="margin-bottom:0.5rem; justify-content:space-between; font-size:0.9rem;">
                 <span style="color:var(--text-muted)">Định phí kỳ vọng:</span>
                 <b style="color:var(--text-light)">+${formatCurrency(result.expectedFixedSum - result.currentFixedPaid)}</b>
             </div>
            <div class="details-row" style="margin-top:0.5rem; padding-top:0.5rem; border-top:1px solid rgba(255,255,255,0.1); justify-content:space-between; font-size:0.9rem;">
                 <span>Tốc độ chi tiêu dự kiến:</span>
                 <b>${formatCurrency(result.dailyBurnRate)}/ngày</b>
            </div>
        </div>
    `;
}

export function renderTrendChart() {
    if (!trendChartContainer) return;
    
    // Also render spending speed
    renderSpendingSpeed();

    trendChartContainer.innerHTML = '';
    
    const now = new Date();
    const dataPoints = [];
    
    if (state.trend.filter === '7days') {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const label = d.toLocaleDateString('vi-VN', { weekday: 'short' });
            
            const sum = state.transactions
                .filter(t => isSameDay(t.date, d))
                .filter(t => state.trend.category === 'all' || t.category === state.trend.category) 
                .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
                
            dataPoints.push({ label, value: sum });
        }
    } else { // 6months
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now);
            d.setMonth(now.getMonth() - i);
            const label = `T${d.getMonth() + 1}`;
            
            const sum = state.transactions
                .filter(t => isSameMonth(t.date, d))
                .filter(t => state.trend.category === 'all' || t.category === state.trend.category)
                .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
                
            dataPoints.push({ label, value: sum });
        }
    }
    
    const maxVal = Math.max(...dataPoints.map(p => p.value));
    
    dataPoints.forEach(p => {
        const height = maxVal > 0 ? (p.value / maxVal * 100) : 0;
        const isMax = p.value === maxVal && maxVal > 0;
        
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
        trendChartContainer.appendChild(col);
    });
}

export function renderCalendarHeatmap() {
    if (!heatmapGridEl) return;
    heatmapGridEl.innerHTML = '';
    
    const targetDate = state.heatmap.currentDate; 
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    
    if (heatmapLabelEl) heatmapLabelEl.innerText = `Tháng ${month + 1}/${year}`;
    
    const dailyTotals = {};
    const amounts = [];
    
    state.transactions.forEach(t => {
        if (t.date && t.date.getMonth() === month && t.date.getFullYear() === year) {
            const day = t.date.getDate();
            dailyTotals[day] = (dailyTotals[day] || 0) + (parseFloat(t.amount) || 0);
        }
    });

    Object.values(dailyTotals).forEach(v => {
        if (v > 0) amounts.push(v);
    });

    let upperBound = 0;
    if (amounts.length > 0) {
        amounts.sort((a, b) => a - b);
        const p90Index = Math.floor(amounts.length * 0.9);
        upperBound = amounts[p90Index] || amounts[amounts.length - 1];
    }
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayObj = new Date(year, month, 1);
    let offset = (firstDayObj.getDay() + 6) % 7; 
    
    for (let i = 0; i < offset; i++) {
        const div = document.createElement('div');
        div.className = 'heatmap-day empty';
        heatmapGridEl.appendChild(div);
    }
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    for (let day = 1; day <= daysInMonth; day++) {
        const amount = dailyTotals[day] || 0;
        const div = document.createElement('div');
        
        let level = 0;
        if (amount > 0) {
            if (upperBound === 0) level = 1; 
            else {
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
        div.innerHTML = `<span class="day-num">${day}</span>`;
        
        div.dataset.day = day;
        div.dataset.month = month;
        div.dataset.year = year;
        div.dataset.amount = amount;
        div.dataset.upperBound = upperBound;
        
        heatmapGridEl.appendChild(div);
    }
}

export function renderDayDetail(day, month, year, amount, upperBound) {
    const modal = document.getElementById('modal-day-detail');
    if (!modal) return;
    
    const dailyTx = state.transactions.filter(t => 
        t.date && t.date.getDate() === day && t.date.getMonth() === month && t.date.getFullYear() === year
    );

    document.getElementById('dd-date').innerText = `Ngày ${day} tháng ${month + 1}`;
    document.getElementById('dd-total').innerText = formatCurrency(amount);

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

    const catList = document.getElementById('dd-categories');
    catList.innerHTML = '';
    
    if (dailyTx.length > 0) {
        const groups = {};
        dailyTx.forEach(t => {
            groups[t.category] = (groups[t.category] || 0) + parseFloat(t.amount);
        });
        
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

    const insightEl = document.getElementById('dd-insight');
    // Simple check
    if (amount === 0) {
        insightEl.innerText = "Duy trì những ngày 'No Spend' thế này sẽ giúp bạn tiết kiệm đáng kể!";
    } else if (dailyTx.length > 3) {
        insightEl.innerText = `Bạn đã thực hiện ${dailyTx.length} giao dịch hôm nay. Cẩn thận các khoản chi lặt vặt cộng dồn!`;
    } else {
         const hasFixed = dailyTx.some(t => LUMP_SUM_CATEGORIES.includes(t.category));
         if (hasFixed) insightEl.innerText = "Chủ yếu là các khoản định phí lớn. Không đáng lo nếu đây là ngày chi trả định kỳ.";
         else insightEl.innerText = "Chi tiêu rải rác. Hãy xem xét lại các danh mục chiếm tỷ trọng lớn.";
    }

    modal.classList.add('active');
}

export function switchTab(tabName) {
    document.querySelectorAll('.modal-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.toggle('active', c.id === `tab-${tabName}`);
    });
}

function addCustomOption(container, value, text) {
    const div = document.createElement('div');
    div.className = 'custom-option';
    if (value === state.trend.category) div.classList.add('selected');
    div.dataset.value = value;
    div.classList.add('trend-option-item'); 
    
    const iconClass = categoryIcons[value] || (value === 'all' ? 'fa-layer-group' : categoryIcons['default']);
    div.innerHTML = `<i class="fa-solid ${iconClass}" style="width:20px; text-align:center;"></i> ${text}`;
    
    container.appendChild(div);
}

export function populateCustomTrendDropdown() {
    const optionsContainer = document.getElementById('trend-category-options');
    const label = document.getElementById('trend-category-label');
    
    if (optionsContainer && label) {
        optionsContainer.innerHTML = '';
        addCustomOption(optionsContainer, 'all', 'Tất cả danh mục');
        state.categories.forEach(cat => {
            addCustomOption(optionsContainer, cat, cat);
        });
        label.innerText = state.trend.category === 'all' ? 'Tất cả danh mục' : state.trend.category;
    }
}

// Helper for Main Filter Options
function addCustomMainOption(container, value, text) {
    const div = document.createElement('div');
    div.className = 'custom-option main-cat-option-item';
    if (value === (state.filter.listCategory || 'all')) div.classList.add('selected');
    div.dataset.value = value;
    
    const iconClass = categoryIcons[value] || (value === 'all' ? 'fa-layer-group' : categoryIcons['default']);
    div.innerHTML = `<i class="fa-solid ${iconClass}" style="width:20px; text-align:center;"></i> ${text}`;
    
    container.appendChild(div);
}

export function renderMainCategoryOptions() {
    const optionsContainer = document.getElementById('main-category-options');
    const label = document.getElementById('main-category-label');
    
    if (!optionsContainer || !label) return;
    
    optionsContainer.innerHTML = '';
    
    // Add "All"
    addCustomMainOption(optionsContainer, 'all', 'Tất cả');
    
    // Add Categories
    state.categories.forEach(cat => {
        addCustomMainOption(optionsContainer, cat, cat);
    });
    
    // Update Label
    const currentVal = state.filter.listCategory || 'all';
    label.innerText = currentVal === 'all' ? 'Tất cả' : currentVal;
    
    // Update active class in dropdown if open (optional re-render)
}

export function renderSpendingSpeed() {
    const container = document.getElementById('spending-speed-container');
    if (!container) return;
    
    const now = new Date();
    
    // 1. Current Period (10 Days) - Smoother than 7 days, reduces weekend false alarms
    const currentWindowDays = 10;
    const currentStart = new Date(now);
    currentStart.setDate(now.getDate() - (currentWindowDays - 1));
    currentStart.setHours(0,0,0,0);
    
    // Filter Transactions
    const currentTx = state.transactions.filter(t => 
        t.date >= currentStart && t.date <= now && !LUMP_SUM_CATEGORIES.includes(t.category)
    );
    
    const currentTotals = {};
    const currentFrequency = {}; // Track unique days active
    let currentGrandTotal = 0;
    
    currentTx.forEach(t => {
        const amount = parseFloat(t.amount) || 0;
        const dateStr = t.date.toDateString();
        
        currentTotals[t.category] = (currentTotals[t.category] || 0) + amount;
        currentGrandTotal += amount;
        
        // Track frequency
        if (!currentFrequency[t.category]) currentFrequency[t.category] = new Set();
        currentFrequency[t.category].add(dateStr);
    });

    // 2. Baseline Period (Previous 30 Days)
    // We compare "Average 10-day spending" from the last month
    const baseWindowDays = 30;
    const baseStart = new Date(currentStart);
    baseStart.setDate(baseStart.getDate() - baseWindowDays);
    const baseEnd = new Date(currentStart);
    baseEnd.setDate(baseEnd.getDate() - 1);
    baseEnd.setHours(23,59,59,999);
    
    const baseTx = state.transactions.filter(t => 
        t.date >= baseStart && t.date <= baseEnd && !LUMP_SUM_CATEGORIES.includes(t.category)
    );
    
    const baseTotals = {};
    baseTx.forEach(t => {
         const amount = parseFloat(t.amount) || 0;
        baseTotals[t.category] = (baseTotals[t.category] || 0) + amount;
    });
    
    // 3. Compare and Find Anomalies (Smart Thresholds)
    const anomalies = [];
    
    Object.keys(currentTotals).forEach(cat => {
        const currentSum = currentTotals[cat];
        const baseSum = baseTotals[cat] || 0;
        
        // Normalize Baseline to match Current Window (10 days)
        // e.g. (Total 30 days / 30) * 10
        const baselineNorm = (baseSum / baseWindowDays) * currentWindowDays;
        
        // Calculate Category Importance (Weight in current spending)
        const weight = currentGrandTotal > 0 ? (currentSum / currentGrandTotal) : 0;
        const daysActive = currentFrequency[cat] ? currentFrequency[cat].size : 0;
        
        // Dynamic Threshold based on Importance
        // Major category (>20%): Strict threshold (1.15x is warning)
        // Minor category (<5%): Loose threshold (1.4x is warning)
        let threshold = 1.25; // Default
        if (weight > 0.2) threshold = 1.15;
        if (weight < 0.05) threshold = 1.4;
        
        // Logic for New Categories (No history)
        if (baselineNorm === 0) {
             // Only warn if: > 300k OR appears on >= 2 distinct days
             if (currentSum > 300000 || daysActive >= 2) {
                 anomalies.push({ cat, currentSum, baselineNorm, ratio: 100, diff: currentSum, weight, isNew: true });
             }
        } 
        // Logic for Existing Categories
        else if (currentSum > 50000) { 
             const ratio = currentSum / baselineNorm;
             const diff = currentSum - baselineNorm;
             
             // Check Threshold
             if (ratio > threshold) {
                 // Only flag if absolute difference is meaningful (> 50k for minor, > 100k for major)
                 const minDiff = weight < 0.05 ? 50000 : 100000;
                 if (diff > minDiff) {
                    anomalies.push({ cat, currentSum, baselineNorm, ratio, diff, weight, isNew: false });
                 }
             }
        }
    });
    
    // Sort by Impact (Difference amount)
    anomalies.sort((a,b) => b.diff - a.diff);
    
    // 4. Render
    let contentHtml = '';
    
    if (anomalies.length > 0) {
        const topAnomalies = anomalies.slice(0, 2);
        
        contentHtml = topAnomalies.map(item => {
            const percent = ((item.ratio - 1) * 100).toFixed(0);
            const iconClass = categoryIcons[item.cat] || categoryIcons['default'];
            const diffFormatted = formatCurrency(item.diff);
            
            // Visual Bar Logic
            // The whole bar width represents 'Current Sum' (100%)
            // The 'Normal' portion is (Base / Current) %
            // The rest is 'Excess'
            let normalPercent = (item.baselineNorm / item.currentSum) * 100;
            if (normalPercent > 100) normalPercent = 100; // Should not happen given logic, but safety
            if (item.baselineNorm === 0) normalPercent = 0; // New category
            
            let message = '';
            if (item.baselineNorm === 0) message = 'Chi phí mới';
            else message = `Tăng <b>${percent}%</b>`;
            
            return `
                <div style="background:rgba(255,255,255,0.03); border-radius:12px; padding:12px; margin-bottom:12px;">
                    <!-- Header -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:32px; height:32px; border-radius:10px; background:rgba(255, 71, 87, 0.15); display:flex; align-items:center; justify-content:center; color:#ff4757; font-size:0.9rem;">
                                <i class="fa-solid ${iconClass}"></i>
                            </div>
                            <div>
                                <div style="font-size:0.9rem; font-weight:600; color:var(--text-main); line-height:1.2;">${item.cat}</div>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${message}</div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:0.9rem; font-weight:700; color:#ff4757;">+${diffFormatted}</div>
                            <div style="font-size:0.7rem; color:var(--text-muted); opacity:0.8;">Vượt mức</div>
                        </div>
                    </div>
                    
                    <!-- Visual Bar -->
                    <div style="width:100%; height:8px; background:rgba(255, 71, 87, 0.25); border-radius:4px; position:relative; overflow:hidden; margin-bottom:6px;">
                        <div style="position:absolute; top:0; left:0; height:100%; width:${normalPercent}%; background:rgba(255,255,255,0.3); border-right:1px solid rgba(0,0,0,0.2);"></div>
                    </div>
                    
                    <!-- Footer Numbers -->
                    <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted);">
                        <span>Thường lệ: ${formatCurrency(item.baselineNorm)}</span>
                        <span>Hiện tại: <b style="color:var(--text-light)">${formatCurrency(item.currentSum)}</b></span>
                    </div>
                </div>
            `;
        }).join('');
        
        // No need for regex replacement as we use cards now with margin-bottom

    } else {
        // Safe state
        contentHtml = `
            <div style="display:flex; align-items:center; gap:12px;">
                 <div style="width:40px; height:40px; border-radius:12px; background:rgba(46, 204, 113, 0.1); display:flex; align-items:center; justify-content:center; color:#2ecc71; flex-shrink:0;">
                    <i class="fa-solid fa-check" style="font-size:1.1rem"></i>
                 </div>
                 <div>
                    <div style="font-size:0.95rem; font-weight:600; color:var(--text-main);">Chi tiêu ổn định</div>
                    <div style="font-size:0.85rem; color:var(--text-muted);">Không có danh mục nào tăng bất thường trong 10 ngày qua.</div>
                 </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="analysis-card full-width" style="padding: 16px; margin-bottom: 0; display:block;">
             <div style="font-size:0.9rem; font-weight:600; color:var(--text-main); opacity: 0.9; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Cảnh báo chi tiêu</div>
             ${contentHtml}
        </div>
    `;
}
