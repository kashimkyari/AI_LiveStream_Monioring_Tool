import re
import logging
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import uuid

# Global dictionary to hold scraping job statuses.
scrape_jobs = {}

def update_job_progress(job_id, percent, message):
    """Update the progress status of a scraping job."""
    scrape_jobs[job_id] = {
        "progress": percent,
        "message": message,
    }
    logging.info("Job %s progress: %s%% - %s", job_id, percent, message)

def scrape_stripchat_data(url, progress_callback=None):
    """
    Scrape streamer details from a Stripchat URL.
    Returns a dictionary with streamer_uid, edge_server_url, blob_url, and static_thumbnail.
    If any step fails, returns None.
    """
    session = requests.Session()
    retries = Retry(total=3, backoff_factor=1, status_forcelist=[406, 429, 500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    try:
        if progress_callback:
            progress_callback(10, "Fetching Stripchat page")
        response = session.get(url, timeout=10, headers=headers)
        html = response.text or ""
        logging.info("Fetched page for URL: %s", url)
        if progress_callback:
            progress_callback(30, "Parsing HTML")
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
        match_uid = re.search(r"/(\d+)_webp", static_thumbnail)
        if match_uid:
            uid = match_uid.group(1)
        else:
            logging.error("Failed to extract streamer UID from thumbnail: %s", static_thumbnail)
            if progress_callback:
                progress_callback(100, "Error: UID extraction failed")
            return None
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
    """
    update_job_progress(job_id, 0, "Starting scrape job")
    result = scrape_stripchat_data(url, progress_callback=lambda p, m: update_job_progress(job_id, p, m))
    if result:
        scrape_jobs[job_id]["result"] = result
    else:
        scrape_jobs[job_id]["error"] = "Scraping failed"
    update_job_progress(job_id, 100, scrape_jobs[job_id].get("error", "Scraping complete"))
