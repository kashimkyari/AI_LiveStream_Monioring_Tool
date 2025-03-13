import re
import logging
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import uuid

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

def scrape_stripchat_data(url, progress_callback=None):
    """
    Scrape streamer details from a Stripchat URL.

    Uses cloudscraper (if available) to bypass Cloudflare protections.
    Falls back to a requests session with retries if cloudscraper is not installed.
    
    Returns:
        dict: Containing streamer_uid, edge_server_url, blob_url, and static_thumbnail.
        Returns None if any step fails.
    """
    try:
        # Attempt to import and use cloudscraper for Cloudflare bypass.
        try:
            import cloudscraper
            scraper = cloudscraper.create_scraper()  # cloudscraper handles Cloudflare challenges
            logging.info("Using cloudscraper for scraping.")
        except ImportError:
            logging.warning("cloudscraper not installed, falling back to requests.")
            scraper = requests.Session()
            retries = Retry(total=3, backoff_factor=1, status_forcelist=[406, 429, 500, 502, 503, 504])
            adapter = HTTPAdapter(max_retries=retries)
            scraper.mount("https://", adapter)
        
        # Define headers to mimic a real browser.
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",  # Additional header to mimic browser locale
        }
        
        if progress_callback:
            progress_callback(10, "Fetching Stripchat page")
        response = scraper.get(url, timeout=10, headers=headers)
        
        # Check response status code to catch HTTP errors early.
        if response.status_code != 200:
            logging.error("Failed to fetch page: HTTP %s", response.status_code)
            if progress_callback:
                progress_callback(100, f"Error: HTTP {response.status_code}")
            return None

        html = response.text or ""
        logging.info("Fetched page for URL: %s", url)
        
        if progress_callback:
            progress_callback(30, "Parsing HTML")
        
        # Use regex to locate the static thumbnail image.
        pattern_static = r'<img[^>]+src="(https://img\.doppiocdn\.com/thumbs/[^"]+_webp)"'
        match_static = re.search(pattern_static, html)
        if match_static:
            static_thumbnail = match_static.group(1)
            logging.info("Static thumbnail found: %s", static_thumbnail)
        else:
            logging.warning("No static thumbnail found for URL: %s", url)
            if progress_callback:
                progress_callback(100, "Error: Static thumbnail not found")
            return None
        
        # Extract the streamer UID from the thumbnail URL.
        match_uid = re.search(r"/(\d+)_webp", static_thumbnail)
        if match_uid:
            uid = match_uid.group(1)
        else:
            logging.error("Failed to extract streamer UID from thumbnail: %s", static_thumbnail)
            if progress_callback:
                progress_callback(100, "Error: UID extraction failed")
            return None
        
        # Construct the new edge server URL using the extracted UID.
        new_edge_url = f"https://b-hls-06.doppiocdn.live/hls/{uid}/{uid}.m3u8"
        
        if progress_callback:
            progress_callback(80, "Extracting streamer details")
        
        result = {
            "streamer_uid": uid,
            "edge_server_url": new_edge_url,
            "blob_url": None,
            "static_thumbnail": static_thumbnail,
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
    result = scrape_stripchat_data(url, progress_callback=lambda p, m: update_job_progress(job_id, p, m))
    if result:
        scrape_jobs[job_id]["result"] = result
    else:
        scrape_jobs[job_id]["error"] = "Scraping failed"
    update_job_progress(job_id, 100, scrape_jobs[job_id].get("error", "Scraping complete"))

