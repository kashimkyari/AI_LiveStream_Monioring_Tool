import cv2
import torch
import numpy as np
from models_db import db, FlaggedObject

# Load YOLOv5 model from torch.hub
model = torch.hub.load('ultralytics/yolov5', 'yolov5s', pretrained=True, trust_repo=True)
flagged_objects = []

def update_flagged_objects():
    """Update flagged objects from database with their thresholds"""
    global flagged_objects
    with db.app.app_context():
        objects = FlaggedObject.query.all()
        flagged_objects = [{
            'name': obj.object_name.lower(),
            'threshold': obj.confidence_threshold
        } for obj in objects]

def detect_frame(frame):
    results = model(frame)
    detections = results.xyxy[0]
    detected = []
    
    for *box, conf, cls in detections:
        class_name = model.names[int(cls)].lower()
        
        # Find matching flagged object
        flagged_obj = next(
            (obj for obj in flagged_objects if obj['name'] == class_name),
            None
        )
        
        if flagged_obj and conf.item() >= flagged_obj['threshold']:
            detected.append({
                'class': class_name,
                'confidence': conf.item(),
                'box': [float(x) for x in box],
                'threshold': flagged_obj['threshold']
            })
    
    return detected

def detect(stream_url):
    """Legacy detection function for video streams"""
    cap = cv2.VideoCapture(stream_url)
    ret, frame = cap.read()
    cap.release()
    return detect_frame(frame) if ret else None