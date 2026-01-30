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

// Median of non-zero values - better for Spiky categories
function calculateMedianNonZero(values) {
    const nonZero = values.filter(v => v > 0);
    if (nonZero.length === 0) return 0;
    return calculateMedian(nonZero);
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

// Check if a date falls on a weekend (Sat/Sun)
function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}



// Calculate weekend ratio for remaining days
function getWeekendRatio(daysRemaining) {
    if (daysRemaining <= 0) return { weekendDays: 0, weekdayDays: 0, ratio: 1.0 };
    
    const now = new Date();
    let weekendDays = 0;
    let weekdayDays = 0;
    
    for (let i = 1; i <= daysRemaining; i++) {
        const futureDate = new Date(now);
        futureDate.setDate(now.getDate() + i);
        if (isWeekend(futureDate)) {
            weekendDays++;
        } else {
            weekdayDays++;
        }
    }
    
    return { weekendDays, weekdayDays };
}

// Calculate adaptive alpha based on volatility
function calculateAdaptiveAlpha(values, baseAlpha = 0.3) {
    if (values.length < 7) return baseAlpha;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = calculateVariance(values, mean);
    const cv = mean > 0 ? stdDev / mean : 0; // Coefficient of Variation
    
    // High volatility (cv > 0.8) → lower alpha (more smoothing, 0.15)
    // Low volatility (cv < 0.3) → higher alpha (more responsive, 0.4)
    // Normal → base alpha
    if (cv > 0.8) return 0.15;
    if (cv > 0.5) return 0.2;
    if (cv < 0.3) return 0.4;
    return baseAlpha;
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

    // B2. Process Regular Cluster (EWMA with Adaptive Alpha + Weekend Factor)
    const dailyRegularMap = {};
    const dailyRegularWeekendMap = {}; // Track weekend vs weekday separately
    const dailyRegularWeekdayMap = {};
    
    regularTx.forEach(t => {
        const dKey = t.date.toDateString();
        const amount = parseFloat(t.amount);
        dailyRegularMap[dKey] = (dailyRegularMap[dKey] || 0) + amount;
        
        if (isWeekend(t.date)) {
            dailyRegularWeekendMap[dKey] = (dailyRegularWeekendMap[dKey] || 0) + amount;
        } else {
            dailyRegularWeekdayMap[dKey] = (dailyRegularWeekdayMap[dKey] || 0) + amount;
        }
    });
    
    // Create full 30-day regular array
    const dailyRegularValues = [];
    const weekendValues = [];
    const weekdayValues = [];
    
    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dKey = d.toDateString();
        const amount = dailyRegularMap[dKey] || 0;
        dailyRegularValues.push(amount);
        
        if (isWeekend(d)) {
            weekendValues.push(dailyRegularWeekendMap[dKey] || 0);
        } else {
            weekdayValues.push(dailyRegularWeekdayMap[dKey] || 0);
        }
    }

    // Calculate Adaptive Alpha based on volatility
    const adaptiveAlpha = calculateAdaptiveAlpha(dailyRegularValues);
    
    // Calculate EWMA for Regular with Adaptive Alpha
    const chronologicalRegular = [...dailyRegularValues].reverse();
    let ewmaRegular = chronologicalRegular[0] || 0;
    for (let i = 1; i < chronologicalRegular.length; i++) {
        ewmaRegular = (chronologicalRegular[i] * adaptiveAlpha) + (ewmaRegular * (1 - adaptiveAlpha));
    }
    
    // Calculate Weekend/Weekday burn rates
    const avgWeekend = weekendValues.length > 0 ? weekendValues.reduce((a,b) => a+b, 0) / weekendValues.length : ewmaRegular;
    const avgWeekday = weekdayValues.length > 0 ? weekdayValues.reduce((a,b) => a+b, 0) / weekdayValues.length : ewmaRegular;
    
    // Get weekend distribution for remaining days
    const { weekendDays, weekdayDays } = getWeekendRatio(daysRemaining);
    
    // Weighted regular burn rate based on remaining day types
    let regularBurnRate;
    if (daysRemaining > 0) {
        const totalProjectedRegular = (avgWeekend * weekendDays) + (avgWeekday * weekdayDays);
        regularBurnRate = totalProjectedRegular / daysRemaining;
    } else {
        regularBurnRate = ewmaRegular;
    }

    // B3. Process Spiky Cluster (IMPROVED: Median of non-zero + frequency)
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
    
    // IMPROVED: Use Median of non-zero values * frequency ratio
    const medianSpiky = calculateMedianNonZero(dailySpikyValues);
    const spikyDaysCount = dailySpikyValues.filter(v => v > 0).length;
    const spikyFrequency = spikyDaysCount / 30; // How often spiky spending occurs
    
    // Expected spiky per day = median hit size * frequency
    let spikyBurnRate = medianSpiky * spikyFrequency;

    // Combine Burn Rates
    let dailyBurnRate = regularBurnRate + spikyBurnRate;
    
    let burnRateSource = 'xu hướng (Phân cụm v2)';

    // B5. Combined Uncertainty
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
    
    // Dynamic weights: as month progresses, timeScore becomes more important
    // Early month: dataDensity and consistency matter more
    // Late month: timeScore dominates (we're mostly just reporting actuals)
    const timeWeight = 20 + (timeScore * 30); // 20% → 50% as month progresses
    const remainingWeight = 80 - (timeScore * 30); // 80% → 50%
    const dataWeight = remainingWeight * 0.5;
    const consistWeight = remainingWeight * 0.5;
    
    let confidence = (dataDensity * dataWeight) + (consistencyScore * consistWeight) + (timeScore * timeWeight);
    
    // Floor based on days remaining: fewer days = higher minimum confidence
    // With 1 day left, floor is 75%. With 7 days left, floor is 40%.
    const daysRemainingFloor = Math.max(40, 90 - (daysRemaining * 5));
    if (confidence < daysRemainingFloor && daysRemaining <= 7) {
        confidence = daysRemainingFloor;
    }
    
    if (daysWithData < 3) confidence = 10;
     
    const projectedVariable = (dailyBurnRate * daysRemaining); 
    
    // Cap uncertainty
    const maxUncertainty = projectedVariable * 0.6;
    if (variableUncertainty > maxUncertainty) variableUncertainty = maxUncertainty;

    let projectedVariableMin = Math.max(0, projectedVariable - variableUncertainty);
    let projectedVariableMax = projectedVariable + variableUncertainty;

    // Step C: Calculate Projected Fixed Spending (IMPROVED: More flexible detection)
    let expectedFixedSum = 0;
    const pendingFixedItems = []; 
    
    LUMP_SUM_CATEGORIES.forEach(cat => {
        const currentPaid = currentMonthTx.filter(t => t.category === cat).reduce((s,t) => s + t.amount, 0);
        const medianVal = medianFixedCosts[cat] || 0;
        const historicalValues = historicalFixedData[cat] || [];
        
        // IMPROVED: Use 75th percentile as threshold for "fully paid"
        // This handles cases where payments vary slightly
        const threshold = historicalValues.length >= 3 
            ? calculatePercentile(historicalValues, 25) * 0.8 
            : medianVal * 0.7;
        
        if (medianVal > 0) {
            if (currentPaid >= threshold) {
                // Already paid (at least close to minimum historical amount)
                expectedFixedSum += currentPaid; 
            } else {
                // Not yet paid or partial - expect median
                expectedFixedSum += Math.max(currentPaid, medianVal); 
                if (currentPaid < threshold * 0.2) {
                    // Less than 20% of minimum threshold = likely not paid yet
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
        currentFixedPaid: currentMonthTx.filter(t => LUMP_SUM_CATEGORIES.includes(t.category)).reduce((s,t)=>s+t.amount,0),
        // Additional metadata
        weekendDays,
        weekdayDays,
        adaptiveAlpha: adaptiveAlpha.toFixed(2)
    };
}
