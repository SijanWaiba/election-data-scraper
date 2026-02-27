(function () {
    // Prevent multiple injections
    if (window.voterSelectorInjected) return;
    window.voterSelectorInjected = true;

    // This script handles interactive selection
    let isSelectingButton = false;

    function handleMouseOver(e) {
        if (isSelectingButton) {
            e.target.style.outline = '3px solid #007bff';
            e.target.style.cursor = 'crosshair';
            e.preventDefault();
            e.stopPropagation();
        }
    }

    function handleMouseOut(e) {
        if (isSelectingButton) {
            e.target.style.outline = '';
            e.target.style.cursor = '';
        }
    }

    function getCssSelector(el) {
        if (!(el instanceof Element)) return;
        var path = [];
        while (el.nodeType === Node.ELEMENT_NODE) {
            var selector = el.nodeName.toLowerCase();
            if (el.id) {
                selector += '#' + el.id;
                path.unshift(selector);
                break;
            } else {
                var sib = el, nth = 1;
                while (sib = sib.previousElementSibling) {
                    if (sib.nodeName.toLowerCase() == selector) nth++;
                }
                if (nth != 1) selector += ":nth-of-type(" + nth + ")";
            }
            path.unshift(selector);
            el = el.parentNode;
        }
        return path.join(" > ");
    }

    function handleClick(e) {
        if (isSelectingButton) {
            e.preventDefault();
            e.stopPropagation();

            e.target.style.outline = '';
            e.target.style.cursor = '';

            cleanup();

            const selector = getCssSelector(e.target);
            console.log("Voter Scraper: Selected element: ", selector);

            // Send message to background script instead of popup directly
            chrome.runtime.sendMessage({ action: "button_selected", selector: selector }, response => {
                if (chrome.runtime.lastError) {
                    console.error("Voter Scraper Error sending selected button:", chrome.runtime.lastError);
                }
            });
        }
    }

    function handleKeydown(e) {
        if (isSelectingButton && e.key === 'Escape') {
            cleanup();
            chrome.runtime.sendMessage({ action: "selection_cancelled" });
        }
    }

    function cleanup() {
        isSelectingButton = false;
        document.removeEventListener('mouseover', handleMouseOver, true);
        document.removeEventListener('mouseout', handleMouseOut, true);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('keydown', handleKeydown, true);
        delete window.voterSelectorInjected; // Allow re-injection later if needed
    }

    // Start it immediately upon injection
    isSelectingButton = true;
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeydown, true);

    console.log("Voter Scraper: Interactive selector injected and waiting for click.");
})();
