(function () {
    let currentTabId = null;
    let currentSelector = null;

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs.length > 0) {
            currentTabId = tabs[0].id;

            // Sync state with background worker
            chrome.runtime.sendMessage({ action: "get_status" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log("Popup: Could not connect to background", chrome.runtime.lastError);
                    return;
                }

                if (response && response.isScraping) {
                    document.getElementById('selectBtn').style.display = 'none';
                    document.getElementById('startBtn').style.display = 'block';
                    document.getElementById('startBtn').disabled = true;
                    document.getElementById('stopBtn').disabled = false;
                    document.getElementById('statusText').innerText = `Status: Scraping in progress. Scraped ${response.count} rows...`;
                } else if (response && response.hasSelector) {
                    // We already selected a button previously but haven't started yet
                    document.getElementById('selectBtn').style.display = 'none';
                    document.getElementById('startBtn').style.display = 'block';
                    document.getElementById('statusText').innerText = `Status: Ready to scrape!`;
                }
            });
        }
    });

    const btnSelect = document.getElementById('selectBtn');
    const btnStart = document.getElementById('startBtn');
    const btnStop = document.getElementById('stopBtn');
    const txtStatus = document.getElementById('statusText');

    if (!btnSelect || !btnStart || !btnStop || !txtStatus) {
        return; // UI not ready
    }

    btnSelect.addEventListener('click', async () => {
        if (!currentTabId) return;
        txtStatus.innerText = "Status: Injecting selector...";

        chrome.scripting.executeScript({
            target: { tabId: currentTabId },
            files: ['selector.js']
        }, () => {
            if (chrome.runtime.lastError) {
                txtStatus.innerText = "Error injecting selector.";
                console.error(chrome.runtime.lastError);
            } else {
                btnSelect.disabled = true;
                txtStatus.innerText = "Status: Click the 'Next' button on the page.";
            }
        });
    });

    btnStart.addEventListener('click', async () => {
        if (!currentTabId) return;

        chrome.runtime.sendMessage({ action: "start_scraping", tabId: currentTabId }, function (response) {
            if (chrome.runtime.lastError) {
                txtStatus.innerText = "Error starting background task.";
                return;
            }

            if (response && response.status === "started") {
                btnStart.disabled = true;
                btnStop.disabled = false;
                txtStatus.innerText = "Status: Scraping in progress...";
            }
        });
    });

    btnStop.addEventListener('click', async () => {
        chrome.runtime.sendMessage({ action: "stop_scraping" }, function (response) {
            if (chrome.runtime.lastError) return;

            if (response && response.status === "stopped") {
                resetUI();
            }
        });
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "selection_confirmed") {
            currentSelector = request.selector;
            btnSelect.style.display = 'none';
            btnStart.style.display = 'block';
            txtStatus.innerText = `Status: Ready to scrape!`;
        } else if (request.action === "update_status") {
            txtStatus.innerText = `Status: Scraped ${request.count} rows so far...`;
        } else if (request.action === "scraping_complete") {
            txtStatus.innerText = `Status: Complete! Downloaded ${request.count} rows.`;
            resetUI();
        } else if (request.action === "scraping_error") {
            txtStatus.innerText = `Error: ${request.error}`;
            resetUI();
        } else if (request.action === "selection_cancelled") {
            btnSelect.disabled = false;
            txtStatus.innerText = `Status: Selection cancelled.`;
        } else if (request.action === "trigger_download") {
            triggerDownload(request.data, request.filename);
        }

        // Always send a response to avoid "message channel closed" warnings
        sendResponse({ status: "acknowledged" });
        return true;
    });

    function triggerDownload(csvContent, filename) {
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        // We can use the chrome.downloads API now
        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false
        });
    }

    function resetUI() {
        btnStart.disabled = false;
        btnStop.disabled = true;
    }
})();
