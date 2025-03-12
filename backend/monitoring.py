# monitoring.py
import time
import threading
import uuid
import json
import concurrent.futures
import logging
from datetime import datetime, timedelta
from collections import defaultdict
from PIL import Image
import numpy as np
import cv2
import requests
from io import BytesIO
import os
from config import app
from extensions import db
from models import Stream, Log, Assignment
from notifications import send_full_telegram_notification_sync
from detection import detect_frame, update_flagged_objects

monitoring_executor = concurrent.futures.ThreadPoolExecutor(max_workers=20)

def monitor_stream(stream_url):
    max_retries = 5
    cooldown = 60
    max_sleep = 300
    retries = 0
    session_requests = requests.Session()
    while True:
        with app.app_context():
            stream = Stream.query.filter_by(room_url=stream_url).first()
            if not stream:
                logging.info("Stream %s not found. Exiting monitor.", stream_url)
                return

            streamer = stream_url.rstrip("/").split("/")[-1]
            try:
                thumbnail_url = f"https://jpeg.live.mmcdn.com/stream?room={streamer}"
                response = session_requests.get(thumbnail_url, stream=True, timeout=10)
                if response.status_code != 200:
                    raise Exception("Thumbnail fetch failed")
                img = Image.open(BytesIO(response.content)).convert("RGB")
                detection_id = str(uuid.uuid4())
                image_path = f"detections/{detection_id}.jpg"
                os.makedirs("detections", exist_ok=True)
                img.save(image_path)
                update_flagged_objects()
                frame = np.array(img)
                detections = detect_frame(frame)
                if detections:
                    detection_data = {
                        "detections": detections,
                        "image_url": f"/detection-images/{detection_id}.jpg",
                        "stream_id": stream.id,
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                    log_entry = Log(
                        room_url=stream_url,
                        event_type="object_detection",
                        details=detection_data,
                    )
                    db.session.add(log_entry)
                    db.session.commit()
                retries = 0
            except Exception as e:
                logging.error("Monitoring error for %s: %s", stream_url, e)
                retries += 1
                sleep_time = min(cooldown * (2 ** retries), max_sleep)
                logging.info("Retrying %s in %s seconds...", stream_url, sleep_time)
                time.sleep(sleep_time)
        time.sleep(10)

def start_monitoring():
    with app.app_context():
        streams = Stream.query.all()
        if len(streams) > 20:
            logging.warning("Number of streams (%s) exceeds max concurrent limit (20).", len(streams))
        for stream in streams:
            monitoring_executor.submit(monitor_stream, stream.room_url)
            logging.info("Submitted monitoring task for %s", stream.room_url)

def start_notification_monitor():
    def monitor_notifications():
        last_notified_time = datetime.utcnow() - timedelta(seconds=5)
        while True:
            try:
                with app.app_context():
                    logs = Log.query.filter(
                        Log.timestamp > last_notified_time,
                        Log.event_type == "object_detection"
                    ).all()
                    for log in logs:
                        detections = log.details.get("detections", [])
                        if detections:
                            send_full_telegram_notification_sync(log, detections)
                    if logs:
                        last_notified_time = max(log.timestamp for log in logs)
            except Exception as e:
                logging.error("Notification monitor error: %s", e)
            time.sleep(2)
    threading.Thread(target=monitor_notifications, daemon=True).start()
