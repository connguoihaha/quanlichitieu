import { state } from './state.js';
import { isSameDay, isSameWeek, isSameMonth, isSameYear } from './date_utils.js';

export function getFilteredTransactions() {
    // Search Mode
    if (state.filter.current === 'search') {
        return state.transactions.filter(t => {
            const sc = state.filter.searchCriteria;
            
            // Keyword (Note or Category Name)
            if (sc.keyword) {
                const kw = sc.keyword.toLowerCase();
                const noteMatch = (t.note || '').toLowerCase().includes(kw);
                const catMatch = t.category.toLowerCase().includes(kw);
                if (!noteMatch && !catMatch) return false;
            }
            
            // Category
            if (sc.category !== 'all' && t.category !== sc.category) {
                return false;
            }
            
            // Date Range
            if (sc.dateFrom) {
                const d = new Date(t.date); d.setHours(0,0,0,0);
                const from = new Date(sc.dateFrom); from.setHours(0,0,0,0);
                if (d < from) return false;
            }
            if (sc.dateTo) {
                const d = new Date(t.date); d.setHours(0,0,0,0);
                const to = new Date(sc.dateTo); to.setHours(0,0,0,0);
                if (d > to) return false;
            }
            
            // Amount Range
            if (sc.amountMin !== null && t.amount < sc.amountMin) return false;
            if (sc.amountMax !== null && t.amount > sc.amountMax) return false;
            
            return true;
        });
    }

    const targetDate = new Date(state.filter.viewDate);
    targetDate.setHours(23, 59, 59, 999);
    
    return state.transactions.filter(t => {
        const tDate = t.date; 
        if (state.filter.current === 'day') return isSameDay(tDate, targetDate);
        if (state.filter.current === 'week') return isSameWeek(tDate, targetDate);
        if (state.filter.current === 'month') return isSameMonth(tDate, targetDate);
        if (state.filter.current === 'year') return isSameYear(tDate, targetDate);
        if (state.filter.current === 'all') return true;
        return true;
    });
}
