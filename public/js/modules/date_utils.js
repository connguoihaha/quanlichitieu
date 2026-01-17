export function isSameDay(d1, d2) {
    return d1.getDate() === d2.getDate() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getFullYear() === d2.getFullYear();
}

export function isSameWeek(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);
    
    const day1 = d1.getDay() || 7;
    const day2 = d2.getDay() || 7;
    
    d1.setDate(d1.getDate() - day1 + 1);
    d2.setDate(d2.getDate() - day2 + 1);
    
    return isSameDay(d1, d2);
}

export function isSameMonth(d1, d2) {
    return d1.getMonth() === d2.getMonth() &&
           d1.getFullYear() === d2.getFullYear();
}

export function isSameYear(d1, d2) {
    return d1.getFullYear() === d2.getFullYear();
}
