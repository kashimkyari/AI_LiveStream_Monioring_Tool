#!/usr/bin/env python
import sys
import types
import tempfile  # For generating unique user-data directories
import os
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from seleniumwire import webdriver
from selenium.webdriver.chrome.options import Options
from flask import Flask, request, jsonify

# --- Monkey Patch for blinker._saferef (must be at the very top) ---
if 'blinker._saferef' not in sys.modules:
    import weakref
    saferef = types.ModuleType("blinker._saferef")
    class SafeRef(weakref.ref):
        def __init__(self, ob, callback=None):
            super().__init__(ob, callback)
            self._hash = hash(ob)
        def __hash__(self):
            return self._hash
        def __eq__(self, other):
            try:
                return self() is other()
            except Exception:
                return False
    saferef.SafeRef = SafeRef
    sys.modules["blinker._saferef"] = saferef
# --- End of Monkey Patch ---

# Configure logging to output to the terminal.
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()]
)

# Global dictionary to hold scraping job statuses.
scrape_jobs = {}
executor = ThreadPoolExecutor(max_workers=5)  # Thread pool for parallel scraping

def update_job_progress(job_id, percent, message):
    scrape_jobs[job_id] = {
        "progress": percent,
        "message": message,
    }
    logging.info("Job %s progress: %s%% - %s", job_id, percent, message)

def fetch_m3u8_from_page(url, timeout=90):
    """
    Attempt to fetch the .m3u8 URL from the page using a direct connection.
    Stealth tweaks are applied to reduce blockages:
      - Running in non-headless mode (since headless browsers are often flagged)
      - A standard user agent is used.
      - The AutomationControlled flag is disabled.
      - A temporary user-data directory is used.
    """
    chrome_options = Options()
    # Running in non-headless mode (remove headless flag)
    # Uncomment the next line to run headless if necessary.
    # chrome_options.add_argument("--headless")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    # Stealth tweaks
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_argument("start-maximized")
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                "AppleWebKit/537.36 (KHTML, like Gecko) "
                                "Chrome/134.0.0.0 Safari/537.36")
    unique_user_data_dir = tempfile.mkdtemp()
    chrome_options.add_argument(f"--user-data-dir={unique_user_data_dir}")

    driver = webdriver.Chrome(options=chrome_options)
    # Capture only .m3u8 requests.
    driver.scopes = ['.*\\.m3u8']

    try:
        logging.info("Opening URL: %s", url)
        driver.get(url)
        time.sleep(5)  # Allow page to load network requests.

        found_url = None
        elapsed = 0
        logged_requests = set()

        while elapsed < timeout:
            for request in driver.requests:
                if request.url not in logged_requests:
                    logging.info("Captured request: %s", request.url)
                    logged_requests.add(request.url)
                if request.response and ".m3u8" in request.url:
                    found_url = request.url
                    logging.info("Found M3U8 URL: %s", found_url)
                    break
            if found_url:
                break
            time.sleep(1)
            elapsed += 1

        if not found_url:
            logging.error("Timeout reached after %s seconds without finding a .m3u8 URL", timeout)
        return found_url if found_url else None

    except Exception as e:
        logging.error("Error fetching M3U8 URL: %s", e)
        return None

    finally:
        driver.quit()

def scrape_chaturbate_data(url, progress_callback=None):
    try:
        if progress_callback:
            progress_callback(10, "Fetching Chaturbate page")
        chaturbate_m3u8_url = fetch_m3u8_from_page(url)
        if not chaturbate_m3u8_url:
            logging.error("Failed to fetch m3u8 URL for Chaturbate stream.")
            if progress_callback:
                progress_callback(100, "Error: Failed to fetch m3u8 URL")
            return None
        streamer_username = url.rstrip("/").split("/")[-1]
        result = {
            "streamer_username": streamer_username,
            "chaturbate_m3u8_url": chaturbate_m3u8_url,
        }
        logging.info("Scraped details: %s", result)
        if progress_callback:
            progress_callback(100, "Scraping complete")
        return result

    except Exception as e:
        logging.error("Error scraping Chaturbate URL %s: %s", url, e)
        if progress_callback:
            progress_callback(100, f"Error: {e}")
        return None

def scrape_stripchat_data(url, progress_callback=None):
    try:
        if progress_callback:
            progress_callback(10, "Fetching Stripchat page")
        stripchat_m3u8_url = fetch_m3u8_from_page(url)
        if not stripchat_m3u8_url:
            logging.error("Failed to fetch m3u8 URL for Stripchat stream.")
            if progress_callback:
                progress_callback(100, "Error: Failed to fetch m3u8 URL")
            return None
        if "playlistType=lowLatency" in stripchat_m3u8_url:
            stripchat_m3u8_url = stripchat_m3u8_url.split('?')[0]
        streamer_username = url.rstrip("/").split("/")[-1]
        result = {
            "streamer_username": streamer_username,
            "stripchat_m3u8_url": stripchat_m3u8_url,
        }
        logging.info("Scraped details: %s", result)
        if progress_callback:
            progress_callback(100, "Scraping complete")
        return result

    except Exception as e:
        logging.error("Error scraping Stripchat URL %s: %s", url, e)
        if progress_callback:
            progress_callback(100, f"Error: {e}")
        return None

def run_scrape_job(job_id, url):
    update_job_progress(job_id, 0, "Starting scrape job")
    if "chaturbate.com" in url:
        result = scrape_chaturbate_data(url, progress_callback=lambda p, m: update_job_progress(job_id, p, m))
    elif "stripchat.com" in url:
        result = scrape_stripchat_data(url, progress_callback=lambda p, m: update_job_progress(job_id, p, m))
    else:
        logging.error("Unsupported platform for URL: %s", url)
        result = None

    if result:
        scrape_jobs[job_id]["result"] = result
    else:
        scrape_jobs[job_id]["error"] = "Scraping failed"
    update_job_progress(job_id, 100, scrape_jobs[job_id].get("error", "Scraping complete"))
    return scrape_jobs[job_id]

# Flask application to handle stream addition from the frontend.
app = Flask(__name__)

@app.route('/api/streams', methods=['POST'])
def add_stream():
    data = request.get_json()
    if not data or "url" not in data:
        return jsonify({"error": "No URL provided"}), 400

    url = data["url"]
    job_id = str(uuid.uuid4())
    # Run the scrape job synchronously.
    result = run_scrape_job(job_id, url)
    if "error" in result:
        return jsonify({"error": result["error"]}), 500
    return jsonify(result["result"]), 200


