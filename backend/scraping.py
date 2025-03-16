#!/usr/bin/env python
import sys
import types
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

import os
import re
import random
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()]
)

scrape_jobs = {}
executor = ThreadPoolExecutor(max_workers=5)

def update_job_progress(job_id, percent, message):
    scrape_jobs[job_id] = {
        "progress": percent,
        "message": message,
    }
    logging.info("Job %s progress: %s%% - %s", job_id, percent, message)

def fetch_m3u8_from_page(url, timeout=30):
    """Fetch M3U8 URL from page scripts using stealthy Selenium configuration."""
    chrome_options = Options()
    
    # Stealth configuration
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option("useAutomationExtension", False)
    chrome_options.add_argument(f"user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36")
    chrome_options.add_argument("--window-size=1920,1080")

    driver = webdriver.Chrome(options=chrome_options)
    
    try:
        # Remove navigator.webdriver property
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        logging.info("Loading page: %s", url)
        driver.get(url)
        
        # Wait for page to initialize
        time.sleep(8)
        
        # Search script tags for HLS configuration
        pattern = re.compile(r"hls\.loadSource\(\s*['\"]([^'\"]+)['\"]\s*\)")
        scripts = driver.find_elements(By.TAG_NAME, 'script')
        
        m3u8_url = None
        for script in scripts:
            content = script.get_attribute('innerHTML')
            match = pattern.search(content)
            if match:
                m3u8_url = match.group(1)
                logging.info("Found M3U8 in script: %s", m3u8_url)
                break

        if not m3u8_url:
            # Fallback: Search page source for M3U8 pattern
            page_source = driver.page_source
            url_matches = re.findall(r'https?://[^\s"\']+\.m3u8', page_source)
            if url_matches:
                m3u8_url = url_matches[0]
                logging.info("Found M3U8 in page source: %s", m3u8_url)

        return m3u8_url

    except Exception as e:
        logging.error("Error during M3U8 extraction: %s", e)
        return None
    finally:
        driver.quit()

def scrape_chaturbate_data(url, progress_callback=None):
    """Scrape Chaturbate stream data with enhanced stealth measures."""
    try:
        if progress_callback:
            progress_callback(20, "Initializing stealth browser")
        
        m3u8_url = fetch_m3u8_from_page(url)
        if not m3u8_url:
            raise Exception("M3U8 URL not found")

        username = url.strip('/').split('/')[-1]
        return {
            "streamer_username": username,
            "chaturbate_m3u8_url": m3u8_url
        }
    except Exception as e:
        logging.error("Chaturbate scrape error: %s", e)
        if progress_callback:
            progress_callback(100, f"Error: {str(e)}")
        return None

def scrape_stripchat_data(url, progress_callback=None):
    """Scrape Stripchat stream data with enhanced stealth measures."""
    try:
        if progress_callback:
            progress_callback(20, "Initializing stealth browser")
        
        m3u8_url = fetch_m3u8_from_page(url)
        if not m3u8_url:
            raise Exception("M3U8 URL not found")

        username = url.strip('/').split('/')[-1]
        return {
            "streamer_username": username,
            "stripchat_m3u8_url": m3u8_url.split('?')[0]
        }
    except Exception as e:
        logging.error("Stripchat scrape error: %s", e)
        if progress_callback:
            progress_callback(100, f"Error: {str(e)}")
        return None

def run_scrape_job(job_id, url):
    """Execute scraping job with progress tracking."""
    update_job_progress(job_id, 0, "Initializing")
    try:
        if "chaturbate.com" in url:
            result = scrape_chaturbate_data(
                url, 
                lambda p, m: update_job_progress(job_id, p, m)
            )
        elif "stripchat.com" in url:
            result = scrape_stripchat_data(
                url,
                lambda p, m: update_job_progress(job_id, p, m)
            )
        else:
            raise ValueError("Unsupported platform")
            
        if result:
            scrape_jobs[job_id]["result"] = result
            update_job_progress(job_id, 100, "Complete")
        else:
            raise ValueError("No results found")
            
    except Exception as e:
        logging.error("Job %s failed: %s", job_id, e)
        update_job_progress(job_id, 100, f"Error: {str(e)}")