import time
import threading
import concurrent.futures
import logging
from datetime import datetime, timedelta
from config import app
from extensions import db
from models import Stream, Log, Assignment
from notifications import *

monitoring_executor = concurrent.futures.ThreadPoolExecutor(max_workers=20)

def monitor_stream(stream_url):
    while True:
        with app.app_context():
            stream = Stream.query.filter_by(room_url=stream_url).first()
            if not stream:
                logging.info("Stream %s not found. Exiting monitor.", stream_url)
                return
            logging.info("Backend object detection is disabled for stream: %s", stream_url)
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
                            send_notifications(log, detections)
                    if logs:
                        last_notified_time = max(log.timestamp for log in logs)
            except Exception as e:
                logging.error("Notification monitor error: %s", e)
            time.sleep(2)
    threading.Thread(target=monitor_notifications, daemon=True).start()