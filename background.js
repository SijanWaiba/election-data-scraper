let allData = [];
let isScraping = false;
let isAutoLoading = false;
let targetTabId = null;
let nextButtonSelector = null;
let targetExpectedEntries = null;
let autoFilename = "voter_list_all_pages.csv";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "button_selected") {
        nextButtonSelector = request.selector;
        console.log("Background: Received selected button: ", nextButtonSelector);

        chrome.runtime.sendMessage({ action: "selection_confirmed", selector: nextButtonSelector }).catch(() => { });
        sendResponse({ status: "ok" });
        return true;
    }

    if (request.action === "start_scraping") {
        if (!isScraping) {
            isScraping = true;
            allData = [];
            targetExpectedEntries = null; // reset
            targetTabId = request.tabId;
            nextButtonSelector = nextButtonSelector || request.selector || ".next, .paginate_button.next, [title='Next'], a:contains('Next'), button:contains('Next')";
            console.log("Background: Starting scrape on tab ", targetTabId, " with selector ", nextButtonSelector);

            scrapeCurrentPageAndProceed();
            sendResponse({ status: "started" });
        } else {
            sendResponse({ status: "already_running" });
        }
    } else if (request.action === "start_auto_flow") {
        if (!isAutoLoading && !isScraping) {
            isAutoLoading = true;
            targetTabId = request.tabId;
            console.log("Background: Injecting auto loader...");

            chrome.scripting.executeScript({
                target: { tabId: targetTabId },
                files: ['auto_loader.js']
            }, () => {
                if (chrome.runtime.lastError) {
                    isAutoLoading = false;
                    sendResponse({ status: "error" });
                    return;
                }

                // Once injected, send the parameters
                setTimeout(() => {
                    chrome.tabs.sendMessage(targetTabId, {
                        action: "init_auto_flow",
                        indices: request.indices,
                        waitDelayMs: request.waitDelayMs
                    });
                }, 500);
            });
            sendResponse({ status: "started" });
        } else {
            sendResponse({ status: "already_running" });
        }
    } else if (request.action === "auto_flow_complete") {
        isAutoLoading = false;
        if (request.success) {
            autoFilename = request.filename || "voter_list_all_pages.csv";
            console.log("Background: Auto flow complete. Starting scrape with filename: ", autoFilename);

            // Trigger start scraping
            isScraping = true;
            allData = [];
            targetExpectedEntries = null;
            nextButtonSelector = "li.next:not(.disabled) a, .paginate_button.next:not(.disabled), [title='Next'], a:contains('Next')"; // Default guess
            scrapeCurrentPageAndProceed();
        } else {
            console.error("Background: Auto flow failed: ", request.error);
            chrome.runtime.sendMessage({ action: "scraping_error", error: request.error }).catch(() => { });
        }
    } else if (request.action === "stop_scraping") {
        isScraping = false;
        isAutoLoading = false;
        exportDataToCSV();
        sendResponse({ status: "stopped" });
    } else if (request.action === "get_status") {
        sendResponse({
            isScraping: isScraping,
            isAutoLoading: isAutoLoading,
            count: allData.length > 0 ? allData.length - 1 : 0,
            expected: targetExpectedEntries,
            hasSelector: nextButtonSelector !== null
        });
    }
    return true;
});

function scrapeCurrentPageAndProceed() {
    if (!isScraping || !targetTabId) return;

    chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        files: ['scraper.js']
    }, (injectionResults) => {
        if (chrome.runtime.lastError || !injectionResults || !injectionResults[0]) {
            console.error("Background: Error injecting scraper", chrome.runtime.lastError);
            isScraping = false;
            chrome.runtime.sendMessage({ action: "scraping_error", error: "Failed to read page" });
            return;
        }

        const resultObj = injectionResults[0].result;

        if (resultObj && resultObj.data && resultObj.data.length > 0) {
            const scrapedData = resultObj.data;
            const scrapedTotal = resultObj.totalEntries;

            // Set the target based on the first page read
            if (targetExpectedEntries === null && scrapedTotal !== null) {
                targetExpectedEntries = scrapedTotal;
                console.log(`Background: Target entries set to ${targetExpectedEntries}`);
            }

            if (allData.length === 0) {
                allData = allData.concat(scrapedData); // Includes header
            } else {
                allData = allData.concat(scrapedData.slice(1)); // Skip header
            }

            let currentDataRows = allData.length - 1; // minus header
            console.log(`Background: Scraped ${scrapedData.length - 1} rows. Total: ${currentDataRows} / ${targetExpectedEntries || 'Unknown'}`);

            chrome.runtime.sendMessage({
                action: "update_status",
                count: currentDataRows,
                expected: targetExpectedEntries
            }).catch(() => { });

            // Stop condition check: did we reach the total entries?
            if (targetExpectedEntries !== null && currentDataRows >= targetExpectedEntries) {
                console.log(`Background: Target of ${targetExpectedEntries} entries reached. Scraping complete.`);
                isScraping = false;
                exportDataToCSV();
                chrome.runtime.sendMessage({ action: "scraping_complete", count: currentDataRows }).catch(() => { });
                return;
            }

            // Otherwise, click the next button
            clickNextButtonAndWait();
        } else {
            console.log("Background: No data found on this page.");
            isScraping = false;
            exportDataToCSV();
            chrome.runtime.sendMessage({ action: "scraping_complete", count: allData.length > 0 ? allData.length - 1 : 0 }).catch(() => { });
        }
    });
}

function clickNextButtonAndWait() {
    if (!isScraping || !targetTabId) return;

    chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: (selector) => {
            // First try the user-provided or default selector
            let btn = null;
            try {
                btn = document.querySelector(selector);
            } catch (e) { }

            // If not found, fallback to searching for typical "Next" buttons
            if (!btn) {
                const buttons = Array.from(document.querySelectorAll('a, button, li'));
                btn = buttons.find(b => {
                    const text = (b.innerText || b.value || "").toLowerCase().trim();
                    return (text === 'next' || text === 'forward' || text === 'अर्को') &&
                        b.offsetParent !== null && !b.className.includes('disabled');
                });

                if (!btn) {
                    // Try to find an 'a' inside a 'li.next' which is common in pagination
                    const nextLi = document.querySelector('li.next:not(.disabled)');
                    if (nextLi) btn = nextLi.querySelector('a') || nextLi;
                }
            }

            if (btn && !btn.closest('.disabled') && !btn.disabled) {
                const table = document.querySelector('table.table-bordered, table.table-striped, table#tbl_data, #print_div table') || document.querySelector('table');
                const currentHtml = table ? table.innerHTML : "";
                btn.click();
                return { success: true, oldHtml: currentHtml, foundSelector: true };
            }
            return { success: false };
        },
        args: [nextButtonSelector]
    }, (injectionResults) => {
        if (chrome.runtime.lastError || !injectionResults || !injectionResults[0]) {
            console.error("Background: Error clicking next", chrome.runtime.lastError);
            isScraping = false;
            exportDataToCSV();
            return;
        }

        const result = injectionResults[0].result;

        if (result && result.success) {
            console.log("Background: Clicked next button. Waiting for page load...");
            setTimeout(() => {
                waitForDataToChange(result.oldHtml);
            }, 1000);

        } else {
            // Button not found or is disabled -> we hit the end normally
            console.log("Background: Next button not found or disabled. End of pages.");
            isScraping = false;
            exportDataToCSV();
            let currentDataRows = allData.length > 0 ? allData.length - 1 : 0;
            chrome.runtime.sendMessage({ action: "scraping_complete", count: currentDataRows }).catch(() => { });
        }
    });
}


function waitForDataToChange(oldHtml) {
    if (!isScraping || !targetTabId) return;

    let retries = 0;
    const maxRetries = 15; // increased retries slightly
    const pollInterval = 500;

    const checkData = () => {
        chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            func: () => {
                const table = document.querySelector('table.table-bordered, table.table-striped, table#tbl_data, #print_div table') || document.querySelector('table');
                return table ? table.innerHTML : "";
            }
        }, (injectionResults) => {
            if (chrome.runtime.lastError || !injectionResults || !injectionResults[0]) {
                if (retries < maxRetries) {
                    retries++;
                    setTimeout(checkData, pollInterval);
                } else {
                    console.log("Background: Tab navigated away or died.");
                    isScraping = false;
                    exportDataToCSV();
                }
                return;
            }

            const newHtml = injectionResults[0].result;

            if (newHtml && newHtml !== oldHtml && newHtml.length > 50) { // simple length check to ensure it ain't empty
                console.log("Background: Data changed! Proceeding to scrape next page...");
                setTimeout(scrapeCurrentPageAndProceed, 500);
            } else if (retries < maxRetries) {
                retries++;
                // Check if the oldHtml check failed because it's a SPA that alters the *style* instead of replacing innerHTML, 
                // but usually full tables trigger innerHTML replacements.
                setTimeout(checkData, pollInterval);
            } else {
                console.warn("Background: Timeout waiting for data to change. Proceeding anyway...");
                scrapeCurrentPageAndProceed();
            }
        });
    };

    checkData();
}


function exportDataToCSV() {
    if (allData.length <= 1) { // Only header or empty
        console.log("Background: No data to export");
        chrome.runtime.sendMessage({ action: "scraping_error", error: "No data was collected." }).catch(() => { });
        return;
    }

    let csvContent = "";
    allData.forEach(row => {
        csvContent += row.join(",") + "\r\n";
    });

    let filenameToUse = autoFilename || "voter_list_all_pages.csv";

    chrome.runtime.sendMessage({
        action: "trigger_download",
        data: csvContent,
        filename: filenameToUse
    }).catch(() => {
        chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            func: (csvData, fName) => {
                const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
                const blob = new Blob([bom, csvData], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", fName);
                document.body.appendChild(link);
                link.click();
                setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
            },
            args: [csvContent, filenameToUse]
        }).catch(err => console.error("Could not trigger download via active tab either", err));
    });
}
