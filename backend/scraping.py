import sys
import types
import tempfile  # New import for generating unique user-data directories

# --- Monkey Patch for blinker._saferef ---
if 'blinker._saferef' not in sys.modules:
    saferef = types.ModuleType('blinker._saferef')
    import weakref
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
    sys.modules['blinker._saferef'] = saferef
# --- End of Monkey Patch ---

import re
import logging
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import uuid
import time
from seleniumwire import webdriver
from selenium.webdriver.chrome.options import Options

# Global dictionary to hold scraping job statuses.
scrape_jobs = {}

def update_job_progress(job_id, percent, message):
    """
    Update the progress status of a scraping job.
    
    Critical Log: Outputs job progress with percentage and message.
    """
    scrape_jobs[job_id] = {
        "progress": percent,
        "message": message,
    }
    logging.info("Job %s progress: %s%% - %s", job_id, percent, message)

def fetch_m3u8_from_page(url, timeout=30):
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    # Specify a unique user data directory for each session to avoid conflicts.
    unique_user_data_dir = tempfile.mkdtemp()
    chrome_options.add_argument(f"--user-data-dir={unique_user_data_dir}")

    driver = webdriver.Chrome(options=chrome_options)
    driver.scopes = ['.*\\.m3u8']

    try:
        logging.info(f"Opening URL: {url}")
        driver.get(url)
        time.sleep(5)  # Allow page to load network requests.

        found_url = None
        elapsed = 0

        while elapsed < timeout:
            for request in driver.requests:
                if request.response and ".m3u8" in request.url:
                    found_url = request.url
                    logging.info(f"Found M3U8 URL: {found_url}")
                    break
            if found_url:
                break
            time.sleep(1)
            elapsed += 1

        return found_url if found_url else None

    except Exception as e:
        logging.error(f"Error fetching M3U8 URL: {e}")
        return None

    finally:
        driver.quit()


def scrape_chaturbate_data(url, progress_callback=None):
    """
    Scrape streamer details from a Chaturbate URL.
    
    Returns:
        dict: Containing streamer_username and m3u8_url.
    """
    try:
        if progress_callback:
            progress_callback(10, "Fetching Chaturbate page")

        # Fetch the m3u8 URL using Selenium Wire
        m3u8_url = fetch_m3u8_from_page(url)
        if not m3u8_url:
            logging.error("Failed to fetch m3u8 URL for Chaturbate stream.")
            if progress_callback:
                progress_callback(100, "Error: Failed to fetch m3u8 URL")
            return None

        # Extract the streamer username from the URL
        streamer_username = url.rstrip("/").split("/")[-1]

        result = {
            "streamer_username": streamer_username,
            "m3u8_url": m3u8_url,
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
        # Fetch the m3u8 URL using Selenium Wire
        m3u8_url = fetch_m3u8_from_page(url)
        if not m3u8_url:
            logging.error("Failed to fetch m3u8 URL for Stripchat stream.")
            if progress_callback:
                progress_callback(100, "Error: Failed to fetch m3u8 URL")
            return None

        # Remove the '?playlistType=lowLatency' query parameter if present
        if "playlistType=lowLatency" in m3u8_url:
            m3u8_url = m3u8_url.split('?')[0]

        # Extract the streamer username from the URL
        streamer_username = url.rstrip("/").split("/")[-1]

        result = {
            "streamer_username": streamer_username,
            "m3u8_url": m3u8_url,
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
    """
    Run a scraping job for the given URL, update job progress, and store the result.
    
    Ensures that the job status reflects either the scraped result or an error message.
    """
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
