import { LUMP_SUM_CATEGORIES } from './constants.js';

function calculateMedian(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
}

export function calculateForecast(transactions) {
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
    
    // Step A: Calculate Median History for Lump Sum Categories (Last 6 Months)
    const historicalFixedData = {}; 
    
    for (let i = 1; i <= 6; i++) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const mTx = transactions.filter(t => 
            t.date && t.date.getMonth() === d.getMonth() && t.date.getFullYear() === d.getFullYear()
        );
        
        if (mTx.length > 0) {
            const catSums = {};
            mTx.forEach(t => {
                if (LUMP_SUM_CATEGORIES.includes(t.category)) {
                    catSums[t.category] = (catSums[t.category] || 0) + (parseFloat(t.amount) || 0);
                }
            });
            
            Object.keys(catSums).forEach(cat => {
                if (!historicalFixedData[cat]) historicalFixedData[cat] = [];
                historicalFixedData[cat].push(catSums[cat]);
            });
        }
    }
    
    const medianFixedCosts = {}; 
    Object.keys(historicalFixedData).forEach(cat => {
        medianFixedCosts[cat] = calculateMedian(historicalFixedData[cat]);
    });

    // Baseline Average (Total) for comparison (Last 3 months)
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

    // Step B: Calculate Projected Variable Spending
    let currentVariableTotal = 0;
    currentMonthTx.forEach(t => {
        if (!LUMP_SUM_CATEGORIES.includes(t.category)) {
            currentVariableTotal += (parseFloat(t.amount) || 0);
        }
    });

    // Rolling 7 Days Average for Burn Rate
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0,0,0,0);
    
    const last7DaysTx = transactions.filter(t => {
        const tDate = t.date; 
        return tDate >= sevenDaysAgo && tDate <= new Date() && !LUMP_SUM_CATEGORIES.includes(t.category);
    });

    const last7DaysTotal = last7DaysTx.reduce((sum, t) => sum + (parseFloat(t.amount)||0), 0);
    
    let dailyBurnRate = 0;
    let burnRateSource = '7 ngày gần nhất';
    
    if (transactions.length > 0) {
        let minDate = new Date();
        const dates = transactions.map(t => t.date);
        if (dates.length > 0) minDate = new Date(Math.min(...dates));

        const dataAgeDays = (new Date() - minDate) / (1000 * 60 * 60 * 24);
        
        if (dataAgeDays < 7 && daysPassed > 0) {
            dailyBurnRate = currentVariableTotal / daysPassed;
            burnRateSource = 'trung bình tháng';
        } else {
            const activeDays = new Set(last7DaysTx.map(t => t.date.toDateString())).size;
            const divisor = Math.max(activeDays, 3);
            dailyBurnRate = divisor > 0 ? (last7DaysTotal / divisor) : 0;
        }
    }
    
    const projectedVariable = (dailyBurnRate * daysRemaining); 
    
    // Step C: Calculate Projected Fixed Spending
    let expectedFixedSum = 0;
    const pendingFixedItems = []; 
    
    LUMP_SUM_CATEGORIES.forEach(cat => {
         const currentPaid = currentMonthTx.filter(t => t.category === cat).reduce((s,t) => s + t.amount, 0);
         const medianVal = medianFixedCosts[cat] || 0;
         
         if (medianVal > 0) {
             if (currentPaid >= (medianVal * 0.9)) {
                 expectedFixedSum += currentPaid; 
             } else {
                 expectedFixedSum += Math.max(currentPaid, medianVal); 
                 if (currentPaid < (medianVal * 0.1)) {
                     pendingFixedItems.push({ cat, amount: medianVal });
                 }
             }
         } else {
             expectedFixedSum += currentPaid;
         }
    });

    let projectedTotal = currentVariableTotal + projectedVariable + expectedFixedSum;
    if (projectedTotal < currentTotal) projectedTotal = currentTotal;

    return {
        projectedTotal,
        currentTotal,
        averageTotal,
        projectedVariable,
        dailyBurnRate,
        burnRateSource,
        expectedFixedSum,
        pendingFixedItems,
        daysRemaining,
        currentFixedPaid: currentMonthTx.filter(t => LUMP_SUM_CATEGORIES.includes(t.category)).reduce((s,t)=>s+t.amount,0)
    };
}
