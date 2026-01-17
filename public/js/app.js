import { initListeners } from './modules/ui_events.js';
import { renderCategories, renderTransactions } from './modules/ui_render.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Render initial static UI parts
    renderCategories();
    renderTransactions(); // Initial empty render/loading state
    
    // Set today's date for initial hidden form state if needed
    const dateInput = document.getElementById('date-input');
    if(dateInput) dateInput.valueAsDate = new Date();

    // Init Logic & Listeners
    initListeners();
});
