import cv2
import numpy as np
import spacy
from spacy.matcher import Matcher
import threading
import logging
from models import ChatKeyword, FlaggedObject
from config import app
from extensions import db

# Load the spaCy language model and initialize the matcher
nlp = spacy.load("en_core_web_sm")
matcher = Matcher(nlp.vocab)

def refresh_keywords():
    """Refresh the keyword matcher with flagged chat keywords from the database."""
    with app.app_context():
        keywords = [kw.keyword.lower() for kw in ChatKeyword.query.all()]
    global matcher
    matcher = Matcher(nlp.vocab)
    for word in keywords:
        pattern = [{"LOWER": word}]
        matcher.add(word, [pattern])

def detect_chat(stream_url=""):
    """Detect flagged keywords in a sample chat message."""
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

def update_flagged_objects():
    """Return the list of flagged objects from the database."""
    with app.app_context():
        objects = FlaggedObject.query.all()
        return [
            {"name": obj.object_name.lower(), "threshold": float(obj.confidence_threshold)}
            for obj in objects
        ]

def detect_frame(frame):
    """
    Backend object detection is now disabled because detection is handled in React using TensorFlow.
    This function always returns an empty list.
    """
    return []
