
    // Swipe down to close modals (Mobile UX)
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let startScrollTop = 0;

        modal.addEventListener('touchstart', (e) => {
             startScrollTop = modal.scrollTop;
             // Only allow drag if we are at the very top of the modal
             if (startScrollTop > 0) return;
             
             startY = e.touches[0].clientY;
             isDragging = true;
             // Remove transition for direct 1:1 movement latency-free
             modal.style.transition = 'none';
        }, {passive: true});

        modal.addEventListener('touchmove', (e) => {
             if (!isDragging) return;
             
             currentY = e.touches[0].clientY;
             const diff = currentY - startY;

             // We only care if pulling DOWN
             if (diff > 0) {
                 // Logic check: if overlay is center-modal, we might want to preserve scale(1)
                 // But simpler to just translate. 
                 
                 // CRITICAL: Prevent default to stop scrolling the body/document behind
                 if (e.cancelable) e.preventDefault(); 
                 
                 modal.style.transform = `translateY(${diff}px)`;
             } else {
                 // If moving UP, treat as normal scroll or invalid drag
                 // Reset if we mistakenly started dragging
                 // But usually diff>0 is the only case we handle here
             }
        }, {passive: false});

        modal.addEventListener('touchend', (e) => {
             if (!isDragging) return;
             isDragging = false;
             
             // Restore transition for smooth snap/exit
             modal.style.transition = '';
             // Force reflow/style update might be needed if browsers are lazy, but usually fine.
             
             const diff = currentY - startY || 0;
             const threshold = 120; // px
             
             if (diff > threshold) {
                 const overlay = modal.closest('.modal-overlay');
                 if (overlay) overlay.classList.remove('active');
                 // Clear inline transform so CSS classes determine final state
                 modal.style.transform = ''; 
             } else {
                 // Snap back to open state
                 modal.style.transform = '';
             }
             
             startY = 0;
             currentY = 0;
        });
    });
