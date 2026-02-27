// This script only runs when explicitly requested, returns data and dies.
(function () {
    function getTable() {
        let table = document.querySelector('table.table-bordered, table.table-striped, table#tbl_data, #print_div table');
        if (!table) {
            const tables = document.querySelectorAll('table');
            let maxRows = 0;
            tables.forEach(t => {
                if (t.rows.length > maxRows) {
                    maxRows = t.rows.length;
                    table = t;
                }
            });
        }
        return table;
    }

    function getTotalEntries() {
        // Look for common DataTables or similar pagination info strings
        // "Showing 1 to 10 of 50 entries"
        const infoElements = document.querySelectorAll('.dataTables_info, [role="status"], div[id$="_info"]');
        let infoText = "";

        for (let el of infoElements) {
            if (el.innerText.toLowerCase().includes('entries') || el.innerText.toLowerCase().includes('of')) {
                infoText = el.innerText;
                break;
            }
        }

        if (!infoText) {
            // fallback: just search all small text elements
            const allDivs = document.querySelectorAll('div, span, p');
            for (let el of allDivs) {
                const text = el.innerText.trim();
                // Match patterns like "Of 1500 entries" or "1 to 50 of 300"
                if (text.length > 5 && text.length < 100 && /(showing|of)\s+[\d,]+\s+(entries|items|records|rows)/i.test(text)) {
                    infoText = text;
                    break;
                }
            }
        }

        if (infoText) {
            // Regex to pull out the largest number in the string which is usually the total
            // E.g., "Showing 1 to 50 of 1,234 entries" -> matches 1, 50, 1,234. We take the last/largest.
            const matches = infoText.match(/[\d,]+/g);
            if (matches && matches.length >= 1) {
                // Remove commas and parse int
                // Usually the last number makes sense "of X"
                const lastNumRaw = matches[matches.length - 1].replace(/,/g, '');
                const total = parseInt(lastNumRaw, 10);
                if (!isNaN(total)) {
                    return total;
                }
            }
        }

        return null;
    }

    let table = getTable();
    if (!table) return { data: [], totalEntries: null };

    let pageData = [];
    let rows = table.rows;
    let startIdx = 0;

    // Get Headers (we always get them, background script filters duplicates)
    if (rows.length > 0) {
        let headerRow = rows[0];
        let headers = [];

        // Check if first row is inside thead
        if (headerRow.parentNode.tagName.toLowerCase() === 'thead') {
            for (let j = 0; j < headerRow.cells.length; j++) {
                let cellText = headerRow.cells[j].innerText.trim().replace(/"/g, '""');
                headers.push(`"${cellText}"`);
            }
            pageData.push(headers);

            // Adjust start index for data rows
            if (table.tBodies.length > 0 && Array.from(table.tBodies[0].rows).includes(headerRow)) {
                // body and header mixed
                startIdx = 1;
            } else if (table.tBodies.length > 0) {
                rows = table.tBodies[0].rows;
                startIdx = 0;
            } else {
                startIdx = 1;
            }
        } else {
            for (let j = 0; j < headerRow.cells.length; j++) {
                let cellText = headerRow.cells[j].innerText.trim().replace(/"/g, '""');
                headers.push(`"${cellText}"`);
            }
            pageData.push(headers);
            startIdx = 1;
        }
    }

    // Get Data Rows
    for (let i = startIdx; i < rows.length; i++) {
        let row = rows[i];
        let rowData = [];
        for (let j = 0; j < row.cells.length; j++) {
            let cellText = row.cells[j].innerText.trim().replace(/"/g, '""');
            rowData.push(`"${cellText}"`);
        }

        if (rowData.length > 0 && rowData.join("") !== '""'.repeat(rowData.length)) {
            pageData.push(rowData);
        }
    }

    let total = getTotalEntries();
    return { data: pageData, totalEntries: total };
})();
