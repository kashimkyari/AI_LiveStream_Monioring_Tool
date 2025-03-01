import spacy
from spacy.matcher import Matcher
from models_db import ChatKeyword, db
from flask import current_app

# Load NLP model
nlp = spacy.load("en_core_web_sm")
matcher = Matcher(nlp.vocab)

def refresh_keywords():
    """Refresh keywords from database"""
    with current_app.app_context():
        keywords = [kw.keyword.lower() for kw in ChatKeyword.query.all()]
    # Rebuild matcher patterns
    matcher = Matcher(nlp.vocab)
    for word in keywords:
        pattern = [{"LOWER": word}]
        matcher.add(word, [pattern])

def detect(stream_url):
    """Detect flagged keywords in chat using NLP"""
    refresh_keywords()  # Always get latest keywords
    
    # In production this would process real chat stream
    # Here using sample message for demonstration
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
            'status': 'flagged',
            'keywords': list(detected),
            'message': sample_message
        }
    return {'status': 'clean'}