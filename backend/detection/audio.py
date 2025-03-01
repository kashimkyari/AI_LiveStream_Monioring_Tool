import random

def detect(stream_url):
    # Simulated audio detection (unchanged)
    if random.randint(0, 10) > 8:
        return "Audio anomaly detected"
    return None

