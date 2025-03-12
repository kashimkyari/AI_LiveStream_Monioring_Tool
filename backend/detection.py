# detection.py
import cv2
import numpy as np
import torch
import spacy
from spacy.matcher import Matcher
import threading
import logging
from models import ChatKeyword, FlaggedObject
from config import app
from extensions import db
from ultralytics import YOLO

nlp = spacy.load("en_core_web_sm")
matcher = Matcher(nlp.vocab)

def refresh_keywords():
    with app.app_context():
        keywords = [kw.keyword.lower() for kw in ChatKeyword.query.all()]
    global matcher
    matcher = Matcher(nlp.vocab)
    for word in keywords:
        pattern = [{"LOWER": word}]
        matcher.add(word, [pattern])

def detect_chat(stream_url=""):
    refresh_keywords()
    sample_message = "Sample chat message containing flagged keywords"
    doc = nlp(sample_message.lower())
    matches = matcher(doc)
    detected = set()
    if matches:
        for match_id, start, end in matches:
            span = doc[start:end]
            detected.add(span.text)
    if detected:
        return {
            "status": "flagged",
            "keywords": list(detected),
            "message": sample_message,
        }
    return {"status": "clean"}

detection_lock = threading.Lock()
device = "cuda" if torch.cuda.is_available() else "cpu"
model = YOLO("yolov10m.pt")
model.to(device)

flagged_objects = []

def update_flagged_objects():
    global flagged_objects
    with app.app_context():
        objects = FlaggedObject.query.all()
        flagged_objects = [
            {"name": obj.object_name.lower(), "threshold": float(obj.confidence_threshold)}
            for obj in objects
        ]

def detect_frame(frame):
    frame = cv2.resize(frame, (640, 480))
    detections = []
    try:
        with detection_lock:
            results = model(frame)
        for result in results:
            boxes = result.boxes.data.cpu().numpy()
            for detection in boxes:
                x1, y1, x2, y2, conf, cls = detection
                class_id = int(cls)
                if isinstance(model.names, dict):
                    class_name = model.names.get(class_id, "unknown").lower()
                else:
                    class_name = model.names[class_id].lower() if class_id < len(model.names) else "unknown"
                flagged_obj = next((obj for obj in flagged_objects if obj["name"] == class_name), None)
                if flagged_obj and conf >= flagged_obj["threshold"]:
                    detections.append({
                        "class": class_name,
                        "confidence": float(conf),
                        "box": [float(x1), float(y1), float(x2), float(y2)]
                    })
    except Exception as e:
        logging.error("Error during frame detection: %s", e)
    return detections
