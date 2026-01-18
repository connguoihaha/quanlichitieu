import { state, setTransactions } from './state.js';
import { categoryIcons } from './constants.js';
import * as render from './ui_render.js';
import * as storage from './storage.js';
import { showToast } from '../utils.js';

export function initListeners() {
    // Initialize Swipe Modal Logic
    initSwipeModal();
    
    // 1. Initial Data Load
    storage.listenToTransactions((data, fromCache) => {
        setTransactions(data);
        render.renderTransactions();
        
        // Update analysis if open
        const modalAnalysis = document.getElementById('modal-analysis');
        if (modalAnalysis && modalAnalysis.classList.contains('active')) {
             render.renderAnalysisOverview();
             render.renderCategoryBreakdown();
             render.renderTrendChart();
             render.renderForecast();
             render.renderCalendarHeatmap();
        }
        
    }, (err) => {
        showToast("Lỗi đồng bộ dữ liệu!", "error");
    });

    // 2. Filter Chips
    document.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip[data-filter]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.filter.current = chip.dataset.filter;
            state.filter.viewDate = new Date(); 
            render.renderTransactions();
        });
    });

    // 3. Swipe Handling
    const headerEl = document.querySelector('.main-header');
    if (headerEl) {
        headerEl.addEventListener('touchstart', e => {
            state.ui.touchStartX = e.changedTouches[0].screenX;
            state.ui.touchStartY = e.changedTouches[0].screenY;
        }, false);

        headerEl.addEventListener('touchend', e => {
            state.ui.touchEndX = e.changedTouches[0].screenX;
            state.ui.touchEndY = e.changedTouches[0].screenY;
            handleSwipe();
        }, false);
    }

    // 4. Modals
    const modalTransaction = document.getElementById('modal-transaction');
    const fabAdd = document.getElementById('fab-add');
    const closeTxBtn = document.getElementById('close-transaction-modal');
    
    if (fabAdd) {
        fabAdd.addEventListener('click', () => {
             openTransactionModal();
        });
    }

    if (closeTxBtn) {
        closeTxBtn.addEventListener('click', () => {
            modalTransaction.classList.remove('active');
        });
    }

    // Edit Transaction (Delegation)
    const listEl = document.getElementById('transactions-list');
    if (listEl) {
        listEl.addEventListener('click', (e) => {
            const item = e.target.closest('.transaction-item');
            if (item && item.dataset.id) {
                const tx = state.transactions.find(t => t.id === item.dataset.id);
                if (tx) openTransactionModal(tx);
            }
        });
    }

    // Transaction Form Submit
    const txForm = document.getElementById('transaction-form');
    const btnSaveTx = document.getElementById('btn-save-transaction');
    
    if (txForm) {
        txForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (btnSaveTx.disabled) return;

            const rawAmount = document.getElementById('amount-input').value.replace(/\./g, '');
            const amount = parseFloat(rawAmount);
            const category = document.getElementById('selected-category').value;
            const dateInput = document.getElementById('date-input').value;
            const note = document.getElementById('note-input').value;

            if (!category) {
                showToast("Vui lòng chọn danh mục!", "error");
                return;
            }
            if (isNaN(amount) || amount <= 0) {
                showToast("Vui lòng nhập số tiền hợp lệ!", "error");
                return;
            }

            btnSaveTx.disabled = true;
            btnSaveTx.innerText = 'Đang lưu...';

            let txDate = new Date(dateInput);
            if (state.ui.editingTransactionId) {
                const original = state.transactions.find(t => t.id === state.ui.editingTransactionId);
                if (original && original.date) {
                    txDate.setHours(original.date.getHours(), original.date.getMinutes(), original.date.getSeconds());
                }
            } else {
                 const now = new Date();
                 txDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
            }

            const txData = {
                amount,
                category,
                date: txDate, // Firestore handles JS Date -> Timestamp
                note,
                type: 'Expense'
            };

            try {
                const savePromise = state.ui.editingTransactionId 
                    ? storage.updateTransactionInDb(state.ui.editingTransactionId, txData)
                    : storage.addTransactionToDb(txData);

                // If offline, don't wait for promise (optimistic UI)
                if (!navigator.onLine) {
                    showToast("Đã lưu (Offline mode)");
                    modalTransaction.classList.remove('active');
                    txForm.reset();
                    btnSaveTx.disabled = false;
                    btnSaveTx.innerText = 'Lưu';
                    // We let the promise run in background
                    savePromise.catch(err => showToast("Lỗi lưu offline!", "error"));
                    return;
                }

                await savePromise;
                
                if (state.ui.editingTransactionId) showToast("Đã cập nhật chi tiêu!");
                else showToast("Đã thêm chi tiêu thành công!");
                
                modalTransaction.classList.remove('active');
                txForm.reset();
            } catch (err) {
                showToast("Lỗi lưu dữ liệu!", "error");
            } finally {
                if (navigator.onLine) {
                    btnSaveTx.disabled = false;
                    btnSaveTx.innerText = 'Lưu';
                }
            }
        });
    }
    
    // Delete Transaction
    const btnDelete = document.getElementById('btn-delete-transaction');
    const modalConfirm = document.getElementById('modal-confirm');
    const btnConfirmDelete = document.getElementById('btn-confirm-delete');
    const btnCancelDelete = document.getElementById('btn-cancel-delete');
    
    if (btnDelete) {
        btnDelete.addEventListener('click', () => {
            if (!navigator.onLine) {
                showToast("Không thể xóa khi Offline!", "error");
                return;
            }
            if (state.ui.editingTransactionId) modalConfirm.classList.add('active');
        });
    }
    
    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', async () => {
            if (state.ui.editingTransactionId) {
                 await storage.deleteTransactionFromDb(state.ui.editingTransactionId);
                 showToast("Đã xóa khoản chi!");
                 modalConfirm.classList.remove('active');
                 modalTransaction.classList.remove('active');
            }
        });
    }
    
    if (btnCancelDelete) {
        btnCancelDelete.addEventListener('click', () => modalConfirm.classList.remove('active'));
    }
    
    // Category Selector Delegation
    const catSelector = document.getElementById('category-selector');
    if (catSelector) {
        catSelector.addEventListener('click', (e) => {
            const item = e.target.closest('.category-item');
            if (item) {
                if (item.classList.contains('add-new-cat-btn')) {
                    document.getElementById('modal-category').classList.add('active');
                } else {
                    document.querySelectorAll('.category-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    document.getElementById('selected-category').value = item.dataset.category;
                }
            }
        });
    }

    // Add Category Form
    const catForm = document.getElementById('category-form');
    if (catForm) {
        catForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('new-category-name').value.trim();
            if(name) {
                state.categories.add(name);
                render.renderCategories();
                document.getElementById('modal-category').classList.remove('active');
                catForm.reset();
                showToast(`Đã thêm danh mục: ${name}`);
            }
        });
    }
    
    // Amount Input Formatting
    const amountInput = document.getElementById('amount-input');
    const amountSuggestions = document.getElementById('amount-suggestions');
    if (amountInput) {
        amountInput.addEventListener('input', (e) => {
             const originalVal = e.target.value;
             let valueStr = originalVal.replace(/\D/g, '');
             let valueNum = parseInt(valueStr);
             
             if (valueStr) {
                 const formatted = valueStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                 if (e.target.value !== formatted) e.target.value = formatted;
             } else {
                 e.target.value = '';
             }
             
             if (amountSuggestions && valueNum > 0 && valueNum < 100000000) {
                 amountSuggestions.innerHTML = '';
                 const opts = new Set();
                 const addOpt = (val, s) => {
                     if(opts.has(val)) return;
                     opts.add(val);
                     const chip = document.createElement('div');
                     chip.className = 'suggestion-chip';
                     chip.innerText = val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                     chip.onclick = () => {
                         amountInput.value = chip.innerText;
                         amountInput.focus();
                         amountSuggestions.innerHTML = '';
                     };
                     amountSuggestions.appendChild(chip);
                 };
                 
                 if (valueNum < 1000) {
                     addOpt(valueNum * 1000);
                     addOpt(valueNum * 10000);
                     if (valueNum < 100) addOpt(valueNum * 100000);
                 } else if (valueNum < 1000000) {
                     addOpt(valueNum * 1000);
                 }
                 addOpt(parseInt(valueStr + '000'));
             } else if (amountSuggestions) {
                 amountSuggestions.innerHTML = '';
             }
        });
    }

    // Analysis Modal
    const btnShowAnalysis = document.getElementById('btn-show-analysis');
    const modalAnalysis = document.getElementById('modal-analysis');
    
    if (btnShowAnalysis) {
        btnShowAnalysis.addEventListener('click', () => {
            render.switchTab('overview');
            render.populateCustomTrendDropdown();
            render.renderAnalysisOverview();
            render.renderCategoryBreakdown();
            render.renderTrendChart();
            render.renderForecast();
            render.renderCalendarHeatmap();
            modalAnalysis.classList.add('active');
        });
    }
    
    // Tab switching
    document.querySelectorAll('.modal-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            render.switchTab(btn.dataset.tab);
        });
    });

    // Trend Filter Buttons
    const btnTrend7d = document.getElementById('btn-trend-7d');
    const btnTrend6m = document.getElementById('btn-trend-6m');
    
    if (btnTrend7d) btnTrend7d.addEventListener('click', () => {
        state.trend.filter = '7days';
        btnTrend7d.classList.add('active');
        btnTrend6m.classList.remove('active');
        render.renderTrendChart();
    });
    
    if (btnTrend6m) btnTrend6m.addEventListener('click', () => {
        state.trend.filter = '6months';
        btnTrend6m.classList.add('active');
        btnTrend7d.classList.remove('active');
        render.renderTrendChart();
    });
    
    // Spending Speed Filter
    const speedContainer = document.getElementById('spending-speed-container');
    if(speedContainer) {
        speedContainer.addEventListener('click', (e) => {
            if(e.target.classList.contains('speed-chip')) {
                 const days = parseInt(e.target.dataset.days);
                 state.trend.speedDays = days;
                 render.renderSpendingSpeed(); 
            }
        });
    }
    
    // Trend Dropdown
    const trendWrapper = document.getElementById('trend-category-wrapper');
    const trendTrigger = document.getElementById('trend-category-trigger');
    const trendOptions = document.getElementById('trend-category-options');
    
    if (trendTrigger) {
        trendTrigger.addEventListener('click', () => trendWrapper.classList.toggle('open'));
    }
    
    if (trendOptions) {
        trendOptions.addEventListener('click', (e) => {
            const item = e.target.closest('.trend-option-item');
            if (item) {
                state.trend.category = item.dataset.value;
                document.getElementById('trend-category-label').innerText = item.dataset.text || item.innerText;
                trendWrapper.classList.remove('open');
                document.querySelectorAll('.trend-option-item').forEach(o => o.classList.remove('selected'));
                item.classList.add('selected');
                render.renderTrendChart();
            }
        });
    }

    // Calendar Navigation
    const btnPrev = document.getElementById('cal-prev');
    const btnNext = document.getElementById('cal-next');
    
    if(btnPrev) btnPrev.addEventListener('click', () => {
        state.heatmap.currentDate.setMonth(state.heatmap.currentDate.getMonth() - 1);
        render.renderCalendarHeatmap();
    });
    
    if(btnNext) btnNext.addEventListener('click', () => {
        state.heatmap.currentDate.setMonth(state.heatmap.currentDate.getMonth() + 1);
        render.renderCalendarHeatmap();
    });

    // Heatmap Click Delegation
    const heatmapGrid = document.getElementById('heatmap-grid');
    if (heatmapGrid) {
        heatmapGrid.addEventListener('click', (e) => {
            const dayEl = e.target.closest('.heatmap-day');
            // Prevent clicking future days
            if (dayEl && dayEl.classList.contains('future')) {
                return;
            }
            if (dayEl && dayEl.dataset.day) {
                const { day, month, year, amount, upperBound } = dayEl.dataset;
                render.renderDayDetail(
                    parseInt(day), parseInt(month), parseInt(year), 
                    parseFloat(amount), parseFloat(upperBound)
                );
            }
        });
    }

    // Modals Close Overlay
    // Modals Close Overlay
    const handleOutsideClick = (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            e.preventDefault(); // Prevent ghost clicks on touch
            e.target.classList.remove('active');
        }
    };

    window.addEventListener('click', handleOutsideClick);
    window.addEventListener('touchend', handleOutsideClick);
    
    document.querySelectorAll('.btn-close').forEach(btn => {
        const close = (e) => {
            e.preventDefault();
            const modal = btn.closest('.modal-overlay');
            if (modal) modal.classList.remove('active');
        };
        btn.addEventListener('click', close);
        btn.addEventListener('touchend', close);
    });

    // --- Search & Export ---

    const btnShowSearch = document.getElementById('btn-show-search');
    const modalSearch = document.getElementById('modal-search');
    
    if (btnShowSearch) {
        btnShowSearch.addEventListener('click', () => {
            // Need populateSearchCategoryDropdown? 
            // Reuse populateCustomTrendDropdown logic or implement new one?
            // Let's rely on init if simple, or we need to add that helper to ui_render.
            // For now, assume it's simple enough to not crash, or add helper.
            // Adding helper to populate options here
            const opts = document.getElementById('search-category-options');
            if (opts) {
                opts.innerHTML = '';
                const add = (v, t) => {
                    const d = document.createElement('div');
                    d.className = 'custom-option';
                    
                    const iconClass = categoryIcons[v] || (v === 'all' ? 'fa-layer-group' : categoryIcons['default']);
                    d.innerHTML = `<i class="fa-solid ${iconClass}" style="width:20px; text-align:center;"></i> ${t}`;
                    
                    d.onclick = () => {
                        document.getElementById('search-category-input').value = v;
                        document.getElementById('search-category-label').innerText = t;
                        document.getElementById('search-category-wrapper').classList.remove('open');
                    };
                    opts.appendChild(d);
                };
                add('all', 'Tất cả');
                state.categories.forEach(c => add(c, c));
            }
            modalSearch.classList.add('active');
        });
    }
    
    const searchCatTrigger = document.getElementById('search-category-trigger');
     if (searchCatTrigger) {
        searchCatTrigger.addEventListener('click', () => {
            document.getElementById('search-category-wrapper').classList.toggle('open');
        });
    }

    const searchForm = document.getElementById('search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const keyword = document.getElementById('search-keyword').value.trim();
            const category = document.getElementById('search-category-input').value;
            const dateFrom = document.getElementById('search-date-from').value;
            const dateTo = document.getElementById('search-date-to').value;
            const amountMin = document.getElementById('search-amount-min').value;
            const amountMax = document.getElementById('search-amount-max').value;
            
            state.filter.searchCriteria = {
                keyword,
                category,
                dateFrom: dateFrom ? new Date(dateFrom) : null,
                dateTo: dateTo ? new Date(dateTo) : null,
                amountMin: amountMin ? parseFloat(amountMin) : null,
                amountMax: amountMax ? parseFloat(amountMax) : null
            };
            
            state.filter.current = 'search';
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            render.renderTransactions();
            modalSearch.classList.remove('active');
            showToast("Đang hiển thị kết quả tìm kiếm", "info");
        });
    }

    const btnResetSearch = document.getElementById('btn-reset-search');
    if(btnResetSearch) {
        btnResetSearch.addEventListener('click', () => {
            searchForm.reset();
            document.getElementById('search-category-input').value = 'all';
            document.getElementById('search-category-label').innerText = 'Tất cả';
        });
    }

    // Settings & Export
    const btnSettings = document.getElementById('btn-settings');
    const modalSettings = document.getElementById('modal-settings');
    if (btnSettings) {
        btnSettings.addEventListener('click', () => {
            modalSettings.classList.add('active');
        });
    }

    const btnExport = document.getElementById('btn-export-data');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            if (state.transactions.length === 0) {
                showToast("Không có dữ liệu để xuất!", "info");
                return;
            }
            let csvContent = "\uFEFF"; 
            csvContent += "Date,Amount,Category,Note,Type\n";
            state.transactions.forEach(t => {
                const dateStr = t.date ? t.date.toISOString() : "";
                let noteStr = (t.note || "").replace(/"/g, '""'); 
                if (noteStr.includes(',') || noteStr.includes('\n')) noteStr = `"${noteStr}"`;
                const row = `${dateStr},${t.amount},${t.category},${noteStr},${t.type}`;
                csvContent += row + "\n";
            });
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `chi_tieu_backup_${new Date().toISOString().slice(0,10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast("Đã tải xuống file CSV!");
        });
    }
}

function handleSwipe() {
    const xDiff = state.ui.touchEndX - state.ui.touchStartX;
    const yDiff = state.ui.touchEndY - state.ui.touchStartY;
    
    if (Math.abs(xDiff) > Math.abs(yDiff) && Math.abs(xDiff) > 50) {
        if (state.filter.current === 'all') return;
        
        const direction = xDiff > 0 ? -1 : 1;
        const card = document.querySelector('.balance-card');
        
        if (card) {
            // Check if future swipe
            const nextDate = new Date(state.filter.viewDate);
            if (state.filter.current === 'day') {
                nextDate.setDate(nextDate.getDate() + direction);
            } else if (state.filter.current === 'week') {
                nextDate.setDate(nextDate.getDate() + (direction * 7));
            } else if (state.filter.current === 'month') {
                nextDate.setMonth(nextDate.getMonth() + direction);
            } else if (state.filter.current === 'year') {
                nextDate.setFullYear(nextDate.getFullYear() + direction);
            }

            // Prevent future
            const today = new Date();
            // Reset time part for accurate comparison
            const compareNext = new Date(nextDate);
            const compareToday = new Date(today);
            compareNext.setHours(0,0,0,0);
            compareToday.setHours(0,0,0,0);

            if (direction === 1 && compareNext > compareToday) {
                 return; 
            }

            card.classList.remove('swipe-effect-next', 'swipe-effect-prev');
            void card.offsetWidth; 
            card.classList.add(direction === 1 ? 'swipe-effect-next' : 'swipe-effect-prev');
            setTimeout(() => card.classList.remove('swipe-effect-next', 'swipe-effect-prev'), 300);
        
            if (state.filter.current === 'day') {
                state.filter.viewDate.setDate(state.filter.viewDate.getDate() + direction);
            } else if (state.filter.current === 'week') {
                state.filter.viewDate.setDate(state.filter.viewDate.getDate() + (direction * 7));
            } else if (state.filter.current === 'month') {
                state.filter.viewDate.setMonth(state.filter.viewDate.getMonth() + direction);
            } else if (state.filter.current === 'year') {
                state.filter.viewDate.setFullYear(state.filter.viewDate.getFullYear() + direction);
            }
            render.renderTransactions();
        }
    }
}

function openTransactionModal(tx = null) {
    const modalTransaction = document.getElementById('modal-transaction');
    const form = document.getElementById('transaction-form');
    
    if (tx) {
        state.ui.editingTransactionId = tx.id;
        document.getElementById('amount-input').value = tx.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        document.getElementById('date-input').valueAsDate = tx.date;
        document.getElementById('note-input').value = tx.note || '';
        document.getElementById('selected-category').value = tx.category;
        
        document.querySelectorAll('.category-item').forEach(item => {
            if(item.dataset.category === tx.category) item.classList.add('selected');
            else item.classList.remove('selected');
        });

        document.getElementById('btn-delete-transaction').style.display = 'block';
        document.getElementById('btn-save-transaction').innerText = 'Lưu thay đổi';
    } else {
        state.ui.editingTransactionId = null;
        form.reset();
        document.getElementById('date-input').valueAsDate = new Date();
        document.getElementById('selected-category').value = '';
        document.querySelectorAll('.category-item').forEach(i => i.classList.remove('selected'));
        
        document.getElementById('btn-delete-transaction').style.display = 'none';
        document.getElementById('btn-save-transaction').innerText = 'Lưu';
        document.getElementById('amount-input').focus();
    }
    
    modalTransaction.classList.add('active');
}

function initSwipeModal() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let startScrollTop = 0;

        modal.addEventListener('touchstart', (e) => {
             startScrollTop = modal.scrollTop;
             if (startScrollTop > 0) return;
             startY = e.touches[0].clientY;
             isDragging = true;
             modal.style.transition = 'none';
        }, {passive: true});

        modal.addEventListener('touchmove', (e) => {
             if (!isDragging) return;
             currentY = e.touches[0].clientY;
             const diff = currentY - startY;
             if (diff > 0) {
                 if (e.cancelable) e.preventDefault(); 
                 modal.style.transform = `translateY(${diff}px)`;
             }
        }, {passive: false});

        modal.addEventListener('touchend', (e) => {
             if (!isDragging) return;
             isDragging = false;
             modal.style.transition = '';
             
             const diff = currentY - startY || 0;
             if (diff > 120) {
                 const overlay = modal.closest('.modal-overlay');
                 if (overlay) overlay.classList.remove('active');
                 modal.style.transform = ''; 
             } else {
                 modal.style.transform = '';
             }
             startY = 0;
             currentY = 0;
        });
    });
}
