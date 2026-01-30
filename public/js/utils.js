export function formatCurrency(amount) {
    if (!amount) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        // Handle comma in quotes if necessary, but simple split for now based on file sample
        // Sample: 2026-01-14 05:09:40 +0000,Tiền Đt,10000.00,Tiền Đt,Expense
        
        // Regex to split by comma but ignore commas inside quotes (standard CSV)
        const row = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        
        // Fallback or simple split if no quotes complexity
        const cols = lines[i].split(',');
        
        if (cols.length >= headers.length) {
            const entry = {};
            // Date, Note, Amount, Category, Type
            // Sample headers: Date,Note,Amount,Category,Type
            // We map them to our internal model
            
            // Handle Date (2026-01-14 05:09:40 +0000)
            entry.date = cols[0].trim(); 
            entry.note = cols[1].trim();
            entry.amount = parseFloat(cols[2]);
            entry.category = cols[3].trim();
            entry.type = cols[4].trim(); // Expense
            
            data.push(entry);
        }
    }
    return data;
}

export function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    
    // Icon mapping for different types
    const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info'
    };
    
    const iconClass = icons[type] || icons.success;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span class="toast-message">${message}</span>
        <div class="toast-progress">
            <div class="toast-progress-bar" style="animation-duration: ${duration}ms"></div>
        </div>
    `;
    
    // Click to dismiss
    toast.addEventListener('click', () => dismissToast(toast));
    
    container.appendChild(toast);
    
    // Auto dismiss
    const timeoutId = setTimeout(() => dismissToast(toast), duration);
    toast.dataset.timeoutId = timeoutId;
}

function dismissToast(toast) {
    if (toast.classList.contains('dismissing')) return;
    
    toast.classList.add('dismissing');
    clearTimeout(toast.dataset.timeoutId);
    
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    setTimeout(() => toast.remove(), 300);
}

