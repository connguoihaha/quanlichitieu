import { initListeners } from './modules/ui_events.js';
import { renderCategories, renderTransactions, renderTransactionsSkeleton } from './modules/ui_render.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Show skeleton loading immediately for fast perceived load
    renderTransactionsSkeleton();
    
    // Render initial static UI parts
    renderCategories();
    
    // Set today's date for initial hidden form state if needed
    const dateInput = document.getElementById('date-input');
    if(dateInput) dateInput.valueAsDate = new Date();

    // Init Logic & Listeners (this will replace skeleton with real data)
    initListeners();
});
