import { LUMP_SUM_CATEGORIES } from './constants.js';

// Cluster definitions
const REGULAR_CATEGORIES = ['Ăn Uống', 'Xe', 'Xăng', 'Nước', 'Tiền Đt', 'Thuốc Men'];
// Spiky or irregular variable categories
const SPIKY_CATEGORIES = ['Đồ Dùng Cá Nhân', 'In Giấy Tờ', 'Chi Phí Khác'];

function calculateMedian(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
}

function calculateVariance(values, mean) {
    if (values.length < 2) return 0;
    const squareDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / (values.length - 1); // Sample variance
    return Math.sqrt(avgSquareDiff); // Return Standard Deviation
}

function calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= sorted.length) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
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

    // Step B: Calculate Projected Variable Spending (Clustered)
    let currentVariableTotal = 0;
    currentMonthTx.forEach(t => {
        if (!LUMP_SUM_CATEGORIES.includes(t.category)) {
            currentVariableTotal += (parseFloat(t.amount) || 0);
        }
    });
    
    // Rolling 30 Days Analysis for Confidence & Variance
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0,0,0,0);
    
    const last30DaysTx = transactions.filter(t => t.date >= thirtyDaysAgo && t.date <= new Date() && !LUMP_SUM_CATEGORIES.includes(t.category));

    // B1. Split transactions into clusters
    const regularTx = [];
    const spikyTx = [];
    
    // Helper to check cluster
    const getCluster = (cat) => {
        if (LUMP_SUM_CATEGORIES.includes(cat)) return 'fixed';
        if (REGULAR_CATEGORIES.includes(cat)) return 'regular';
        return 'spiky'; // Default to spiky for unknown categories or defined spiky ones
    };

    last30DaysTx.forEach(t => {
        const cluster = getCluster(t.category);
        if (cluster === 'regular') regularTx.push(t);
        else if (cluster === 'spiky') spikyTx.push(t);
    });

    // B2. Process Regular Cluster (EWMA)
    const dailyRegularMap = {};
    regularTx.forEach(t => {
        const dKey = t.date.toDateString();
        dailyRegularMap[dKey] = (dailyRegularMap[dKey] || 0) + parseFloat(t.amount);
    });
    
    // Create full 30-day regular array
    const dailyRegularValues = [];
    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dailyRegularValues.push(dailyRegularMap[d.toDateString()] || 0);
    }

    let regularBurnRate = 0;
    // Calculate EWMA for Regular
    const alpha = 0.3;
    const chronologicalRegular = [...dailyRegularValues].reverse();
    let ewmaRegular = chronologicalRegular[0] || 0;
    for (let i = 1; i < chronologicalRegular.length; i++) {
        ewmaRegular = (chronologicalRegular[i] * alpha) + (ewmaRegular * (1 - alpha));
    }
    regularBurnRate = ewmaRegular;

    // B3. Process Spiky Cluster (Weekly Median / Average)
    // Spiky spending is better estimated by weekly volume rather than daily smooth
    const dailySpikyMap = {};
    spikyTx.forEach(t => {
        const dKey = t.date.toDateString();
        dailySpikyMap[dKey] = (dailySpikyMap[dKey] || 0) + parseFloat(t.amount);
    });
    
     const dailySpikyValues = [];
    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dailySpikyValues.push(dailySpikyMap[d.toDateString()] || 0);
    }
    
    // Use simple average for Spiky over the window, as median might be 0 for sparse data
    // Or median of non-zero days if we want typical "hit" size.
    // Let's use average daily over 30 days to be safe and conservative for spiky.
    const spikyTotal30 = dailySpikyValues.reduce((a,b) => a+b, 0);
    let spikyBurnRate = spikyTotal30 / 30;

    // Combine Burn Rates
    let dailyBurnRate = regularBurnRate + spikyBurnRate;
    let burnRateSource = 'xu hướng (Phân cụm)';

    // B4. Combined Uncertainty
    // Calculate IQR/Percentile for Regular only (since Spiky is erratic)
    const p75Reg = calculatePercentile(dailyRegularValues, 75);
    const p25Reg = calculatePercentile(dailyRegularValues, 25);
    const iqrReg = p75Reg - p25Reg;
    
    // For spiky, uncertainty is higher, assume standard deviation of spiky values
    const stdDevSpiky = calculateVariance(dailySpikyValues, spikyBurnRate);
    
    // Total Uncertainty ~= sqrt(UncertaintyRegular^2 + UncertaintySpiky^2)
    // Regular uncertainty metric
    const uncReg = iqrReg;
    // Spiky uncertainty metric (using StdDev as proxy for spread)
    const uncSpiky = stdDevSpiky;
    
    const combinedDailyUncertainty = Math.sqrt((uncReg * uncReg) + (uncSpiky * uncSpiky));
    let variableUncertainty = combinedDailyUncertainty * Math.sqrt(daysRemaining);

    // Confidence Calculation (Adjusted)
    // Calculate daily variable spending for variance
    const dailyVariableMap = {};
    last30DaysTx.forEach(t => {
        const dKey = t.date.toDateString();
        dailyVariableMap[dKey] = (dailyVariableMap[dKey] || 0) + parseFloat(t.amount);
    });

    // Create full 30-day array including zeros
    const dailyVariableValues = [];
    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dKey = d.toDateString();
        dailyVariableValues.push(dailyVariableMap[dKey] || 0);
    }
    const daysWithData = new Set(last30DaysTx.map(t => t.date.toDateString())).size;
    const dataDensity = Math.min(daysWithData / 30, 1); // 0 to 1

    const stdDevCombined = calculateVariance(dailyVariableValues, dailyBurnRate); // Use overall for score
    const cv = dailyBurnRate > 0 ? (stdDevCombined / dailyBurnRate) : 0;
    const consistencyScore = Math.max(0, 1 - Math.min(cv, 1));
    const timeScore = daysPassed / daysInMonth; 
    let confidence = (dataDensity * 40) + (consistencyScore * 40) + (timeScore * 20);
    if (daysWithData < 3) confidence = 10;
     
    const projectedVariable = (dailyBurnRate * daysRemaining); 
    
    // Cap uncertainty
    const maxUncertainty = projectedVariable * 0.6;
    if (variableUncertainty > maxUncertainty) variableUncertainty = maxUncertainty;

    let projectedVariableMin = Math.max(0, projectedVariable - variableUncertainty);
    let projectedVariableMax = projectedVariable + variableUncertainty;

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
    let projectedMin = currentVariableTotal + projectedVariableMin + expectedFixedSum;
    let projectedMax = currentVariableTotal + projectedVariableMax + expectedFixedSum;
    
    // Floor at current total
    if (projectedTotal < currentTotal) projectedTotal = currentTotal;
    if (projectedMin < currentTotal) projectedMin = currentTotal;
    if (projectedMax < currentTotal) projectedMax = currentTotal;

    return {
        projectedTotal,
        projectedMin,
        projectedMax,
        confidence: Math.round(confidence),
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
