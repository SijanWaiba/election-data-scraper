# Nepalese Voter List Scraper

A Google Chrome extension designed to scrape tabulated election/voter list data from the Election Commission of Nepal's website (`voterlist.election.gov.np`). The scraper efficiently handles automatic pagination across multiple pages and exports all aggregated data into a single, comprehensive CSV file.

## Features
- **Interactive Element Selection:** Select the "Next" pagination button by hovering over it and clicking.
- **Robust Background Processing:** Uses a Manifest V3 Service Worker (`background.js`) to continuously orchestrate the scraping script (`scraper.js`) across consecutive pages, ensuring it doesn't break upon navigation.
- **Deduplication and Integrity:** Aggregates table headers properly only from the first page and fetches rows from the rest.
- **Real-Time Status Tracking:** Watch your progress (e.g., "Scraped 250 rows so far...") inside the extension popup UI.
- **Export to CSV:** Stop anytime to grab what you have, or let it finish and auto-download the entire dataset.

## How the Code Works

The extension consists of 5 main components:
1. `manifest.json`: Configuration for Chrome extensions, specifying permissions for active tabs, scripting, downloads, and the background worker.
2. `popup.html` & `popup.js`: Providing the graphical interface to interact with the extension. It updates status dynamically by communicating with the background script.
3. `selector.js`: A script that injects into the active tab to enable the interactive CSS selection of the "Next" button.
4. `scraper.js`: A specialized script that reads the contents of HTML tables and tries to identify the maximum number of entries to expect. It parses the DOM to pull out text into structured row arrays.
5. `background.js`: The heart of the extension. It stores the scraped table data and directs the page to load the next chunk of data via automated "clicks" until the final page is reached. Once completed, it merges the data and triggers the file download (`voter_list_all_pages.csv`).

## Step-by-Step Usage Guide

### 1. Install the Extension
1. Open Google Chrome and type `chrome://extensions/` in your address bar.
2. Toggle on the **Developer mode** switch at the top right of the page.
3. Click the **Load unpacked** button at the top left.
4. Select this directory/folder (where `manifest.json` is located).

### 2. Prepare the Page
1. Go to the [Election Commission Voter List page](https://voterlist.election.gov.np/).
2. Submit your search filters (State, District, Municipality, Ward, Polling Center, etc.).
3. Wait for the tabular data and the pagination controls (like the **"Next"** button) to appear on the screen.

### 3. Setup the Scraper
1. Click the **Nepalese Voter List Scraper extension icon** found in your Chrome toolbar (puzzle piece icon at the top right).
2. Click the **1. Select "Next" Button** in the popup window.
3. *Move your mouse over to the web page:* You will notice elements highlighting with a blue outline as you hover over them.
4. Carefully position your cursor over the **Next Page** button and Left Click it. 
5. The extension popup will now update to say "Status: Ready to scrape!".

### 4. Start Scraping
1. Click **2. Start Scraping All Pages** inside the extension popup.
2. **Leave the tab open.** Watch the pages load one by one. The extension popup will continuously update showing you how many rows have been extracted.
3. The scraper will try to find exactly when to finish based on the pagination info text. If there isn't any, it runs until the "Next" button disappears or becomes disabled.

### 5. Download the Data
1. If you need to stop midway, click **Stop & Download**, and it will download exactly what it grabbed so far.
2. If left to run to completion, it will automatically package the extracted tabular data into a spreadsheet named `voter_list_all_pages.csv` and trigger the download via Chrome's downloads API.
