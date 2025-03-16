import sys
import types
import tempfile
import os

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
import uuid
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

# Use Selenium Wire's undetected-chromedriver if installed
try:
    from seleniumwire.undetected_chromedriver import webdriver as wire_uc
    USE_UNDETECTED = True
    logging.info("Using Selenium Wire's undetected_chromedriver for better bypass capabilities.")
except ImportError:
    from seleniumwire import webdriver
    USE_UNDETECTED = False
    logging.info("Selenium Wire's undetected_chromedriver not installed. Using standard Selenium Wire webdriver.")

from selenium.webdriver.chrome.options import Options

# Configure logging for major events only
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Dictionary to hold scraping job statuses
scrape_jobs = {}
executor = ThreadPoolExecutor(max_workers=5)

def update_job_progress(job_id, percent, message):
    scrape_jobs[job_id] = {
        "progress": percent,
        "message": message,
    }
    logging.info("Job %s progress: %s%% - %s", job_id, percent, message)

def fetch_m3u8_from_page(url, cookies=None, timeout=90):
    """
    Opens the page in a headless browser (CLI-only) and injects user-provided cookies 
    (which should represent an active session on Chaturbate or Stripchat) so that the
    consent wall is bypassed. Then, it scans network requests for an .m3u8 URL.
    """
    logging.info("Opening URL: %s", url)
    
    chrome_options = Options()
    # Always run headless for a CLI-only environment.
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--ignore-certificate-errors")
    # Use a realistic user agent.
    chrome_options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/92.0.4515.131 Safari/537.36"
    )

    # Use a unique user-data directory for isolation.
    unique_user_data_dir = tempfile.mkdtemp()
    chrome_options.add_argument(f"--user-data-dir={unique_user_data_dir}")

    # Initialize the driver via Selenium Wire.
    if USE_UNDETECTED:
        driver = wire_uc.Chrome(options=chrome_options)
    else:
        driver = webdriver.Chrome(options=chrome_options)

    # Configure Selenium Wire to capture .m3u8 requests.
    driver.scopes = ['.*\\.m3u8']

    try:
        # If cookies are provided, inject them:
        if cookies is not None:
            # Determine the base URL from the provided target URL.
            parsed = urlparse(url)
            base_url = f"{parsed.scheme}://{parsed.netloc}"
            logging.info("Navigating to base domain: %s", base_url)
            driver.get(base_url)
            # Inject each cookie into the browser session.
            for cookie in cookies:
                try:
                    driver.add_cookie(cookie)
                    logging.info("Injected cookie: %s", cookie.get("name"))
                except Exception as e:
                    logging.info("Could not add cookie %s: %s", cookie, e)
            # Now navigate to the target URL.
            logging.info("Navigating to target URL after cookie injection.")
            driver.get(url)
        else:
            driver.get(url)

        # Allow time for the page to load and for any network requests to occur.
        time.sleep(5)

        found_url = None
        elapsed = 0

        # Poll network requests until an .m3u8 URL is found or the timeout is reached.
        while elapsed < timeout:
            for request in driver.requests:
                if request.response and ".m3u8" in request.url:
                    found_url = request.url
                    logging.info("Found M3U8 URL: %s", found_url)
                    break
            if found_url:
                break
            time.sleep(1)
            elapsed += 1

        if not found_url:
            logging.warning("No M3U8 URL found after %s seconds", timeout)
        return found_url

    except Exception as e:
        logging.error("Error fetching M3U8 URL: %s", e)
        return None

    finally:
        driver.quit()
        logging.info("Driver closed.")

def scrape_chaturbate_data(url, cookies=None, progress_callback=None):
    logging.info("Scraping Chaturbate page: %s", url)
    try:
        if progress_callback:
            progress_callback(10, "Fetching Chaturbate page")

        chaturbate_m3u8_url = fetch_m3u8_from_page(url, cookies=cookies)
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
        logging.info("Chaturbate scrape complete for %s", streamer_username)

        if progress_callback:
            progress_callback(100, "Scraping complete")
        return result

    except Exception as e:
        logging.error("Error scraping Chaturbate URL %s: %s", url, e)
        if progress_callback:
            progress_callback(100, f"Error: {e}")
        return None

def scrape_stripchat_data(url, cookies=None, progress_callback=None):
    logging.info("Scraping Stripchat page: %s", url)
    try:
        if progress_callback:
            progress_callback(10, "Fetching Stripchat page")

        stripchat_m3u8_url = fetch_m3u8_from_page(url, cookies=cookies)
        if not stripchat_m3u8_url:
            logging.error("Failed to fetch m3u8 URL for Stripchat stream.")
            if progress_callback:
                progress_callback(100, "Error: Failed to fetch m3u8 URL")
            return None

        # Remove the lowLatency parameter if present.
        if "playlistType=lowLatency" in stripchat_m3u8_url:
            stripchat_m3u8_url = stripchat_m3u8_url.split('?')[0]

        streamer_username = url.rstrip("/").split("/")[-1]

        result = {
            "streamer_username": streamer_username,
            "stripchat_m3u8_url": stripchat_m3u8_url,
        }
        logging.info("Stripchat scrape complete for %s", streamer_username)

        if progress_callback:
            progress_callback(100, "Scraping complete")
        return result

    except Exception as e:
        logging.error("Error scraping Stripchat URL %s: %s", url, e)
        if progress_callback:
            progress_callback(100, f"Error: {e}")
        return None

def run_scrape_job(job_id, url, cookies=None):
    logging.info("Starting scrape job %s for URL: %s", job_id, url)
    update_job_progress(job_id, 0, "Starting scrape job")
    
    if "chaturbate.com" in url:
        result = scrape_chaturbate_data(url, cookies=cookies, progress_callback=lambda p, m: update_job_progress(job_id, p, m))
    elif "stripchat.com" in url:
        result = scrape_stripchat_data(url, cookies=cookies, progress_callback=lambda p, m: update_job_progress(job_id, p, m))
    else:
        logging.error("Unsupported platform for URL: %s", url)
        result = None

    if result:
        scrape_jobs[job_id]["result"] = result
        logging.info("Scrape job %s completed successfully.", job_id)
    else:
        scrape_jobs[job_id]["error"] = "Scraping failed"
        logging.error("Scrape job %s failed.", job_id)

    update_job_progress(job_id, 100, scrape_jobs[job_id].get("error", "Scraping complete"))
