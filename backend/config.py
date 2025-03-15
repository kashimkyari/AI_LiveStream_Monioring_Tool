import os
import logging
from datetime import timedelta
from flask import Flask
from flask_cors import CORS
from extensions import db
from flask_caching import Cache

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "http://127.0.0.1:3000"}}, supports_credentials=True)

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///stream_monitor.db"
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_size": 20,
    "max_overflow": 40,
    "pool_timeout": 30,
    "pool_recycle": 3600,
}
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = "supersecretkey"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=1)
app.config["UPLOAD_FOLDER"] = "uploads"
app.config["CHAT_IMAGES_FOLDER"] = os.path.join(app.config["UPLOAD_FOLDER"], "chat_images")
app.config["FLAGGED_CHAT_IMAGES_FOLDER"] = os.path.join(app.config["UPLOAD_FOLDER"], "flagged_chat_images")

# Redis caching
app.config["CACHE_TYPE"] = "RedisCache"
app.config["CACHE_REDIS_URL"] = "redis://localhost:6379/0"
cache = Cache(app)

os.makedirs(app.config["CHAT_IMAGES_FOLDER"], exist_ok=True)
os.makedirs(app.config["FLAGGED_CHAT_IMAGES_FOLDER"], exist_ok=True)

db.init_app(app)

@app.teardown_appcontext
def shutdown_session(exception=None):
    db.session.remove()