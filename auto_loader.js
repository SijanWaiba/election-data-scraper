(function () {
    // Expected to receive data from background injection:
    // args: [indicesArray, waitDelayMs]

    function runAutoFlow(indices, waitDelayMs) {
        console.log("Voter Scraper: Starting auto flow with indices", indices, "and delay", waitDelayMs);

        let currentIndex = 0;
        let lastSelectedText = "";

        function processNextDropdown() {
            const selects = Array.from(document.querySelectorAll('select'));
            const availableSelects = selects.filter(s => s.offsetParent !== null && !s.disabled && s.options.length > 1);

            console.log(`Voter Scraper: Found ${availableSelects.length} available dropdowns. Processing index ${currentIndex}...`);

            if (currentIndex < availableSelects.length && currentIndex < indices.length) {
                const selectElement = availableSelects[currentIndex];
                const targetOptionIndex = parseInt(indices[currentIndex], 10) || 1;

                // Ensure the target index is within bounds, otherwise pick the last one
                const finalIndex = Math.min(targetOptionIndex, selectElement.options.length - 1);

                if (selectElement.selectedIndex !== finalIndex) {
                    selectElement.selectedIndex = finalIndex;
                    lastSelectedText = selectElement.options[finalIndex].text.trim();
                    console.log(`Voter Scraper: Selected "${lastSelectedText}" on dropdown ${currentIndex}.`);

                    // Dispatch change event to trigger site logic
                    const event = new Event('change', { bubbles: true });
                    selectElement.dispatchEvent(event);

                    currentIndex++;
                    console.log(`Voter Scraper: Waiting ${waitDelayMs}ms for next dropdown...`);
                    setTimeout(processNextDropdown, waitDelayMs);
                } else {
                    // Already selected, move to next
                    currentIndex++;
                    processNextDropdown();
                }
            } else {
                // Done selecting parameters
                console.log("Voter Scraper: Parameter selection complete. Finding submit button...");
                finishFlowAndSubmit();
            }
        }

        function finishFlowAndSubmit() {
            // Find search/submit button
            // typical buttons: input[type="submit"], button.btn, #btnSubmit, etc.
            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
            const submitBtn = buttons.find(b => {
                const text = (b.innerText || b.value || "").toLowerCase();
                return b.offsetParent !== null && !b.disabled &&
                    (text.includes('search') || text.includes('submit') || text.includes('submit') || text.includes('view') || text.includes('खोज्नुहोस'));
            }) || buttons.find(b => b.offsetParent !== null && !b.disabled && b.className.includes('btn-primary'));

            if (submitBtn) {
                console.log("Voter Scraper: Found submit button. Clicking it...", submitBtn);
                const oldTableCount = document.querySelectorAll('table').length;

                submitBtn.click();

                // Wait for a new table or table content to appear
                let retries = 0;
                const checkTable = setInterval(() => {
                    const newTableCount = document.querySelectorAll('table').length;
                    const tables = document.querySelectorAll('table');
                    const hasData = tables.length > 0 && Array.from(tables).some(t => t.rows.length > 2); // At least header + 1 data row

                    if (newTableCount > oldTableCount || hasData) {
                        clearInterval(checkTable);
                        console.log("Voter Scraper: Table data loaded. Notifying background script to start scraping.");
                        // Clean filename string
                        const cleanFilename = (lastSelectedText || "auto_scrape").replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".csv";
                        chrome.runtime.sendMessage({
                            action: "auto_flow_complete",
                            filename: cleanFilename,
                            success: true
                        });
                    } else if (retries > 40) { // 20 seconds
                        clearInterval(checkTable);
                        console.error("Voter Scraper: Timeout waiting for table data.");
                        chrome.runtime.sendMessage({
                            action: "auto_flow_complete",
                            success: false,
                            error: "Timeout waiting for data table to load after submit."
                        });
                    }
                    retries++;
                }, 500);
            } else {
                console.error("Voter Scraper: Could not find a submit button.");
                chrome.runtime.sendMessage({
                    action: "auto_flow_complete",
                    success: false,
                    error: "Could not find a Submit or Search button."
                });
            }
        }

        // Start the process
        setTimeout(processNextDropdown, 1000);
    }

    // The script is injected by background.js which passes the arguments in the executeScript configuration
    // Since args are only accessible if we wrap in func: (), and we injected this as a file...
    // We will listen for a message to provide the init params
    chrome.runtime.onMessage.addListener(function listener(request, sender, sendResponse) {
        if (request.action === "init_auto_flow") {
            chrome.runtime.onMessage.removeListener(listener); // Only run once
            runAutoFlow(request.indices, request.waitDelayMs);
            sendResponse({ status: "started" });
        }
        return true;
    });

    console.log("Voter Scraper: Auto-loader script injected, waiting for init parameters...");
})();
