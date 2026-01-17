export function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

export function isSameWeek(d1, d2) {
    const t1 = new Date(d1);
    const t2 = new Date(d2);
    
    t1.setHours(0,0,0,0);
    t2.setHours(0,0,0,0);
    
    const day2 = t2.getDay() || 7; 
    const startOfWeek = new Date(t2);
    startOfWeek.setDate(t2.getDate() - day2 + 1);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    return t1 >= startOfWeek && t1 <= endOfWeek;
}

export function isSameMonth(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth();
}

export function isSameYear(d1, d2) {
    return d1.getFullYear() === d2.getFullYear();
}
