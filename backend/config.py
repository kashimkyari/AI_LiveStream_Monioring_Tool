# config.py
import os
import logging
from datetime import timedelta
from flask import Flask
from flask_cors import CORS
from extensions import db  # Import the db instance from extensions

# -----------------------------------------------------------------------------
# Logging Configuration
# -----------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s in %(module)s: %(message)s'
)

# -----------------------------------------------------------------------------
# Flask App Initialization & Configuration
# -----------------------------------------------------------------------------
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "http://127.0.0.1:3000"}}, supports_credentials=True)

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///stream_monitor.db"
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_size": 200,
    "max_overflow": 4000,
    "pool_timeout": 600,
    "pool_recycle": 3600,
    "pool_pre_ping": True,
}
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = "supersecretkey"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=1)
app.config["UPLOAD_FOLDER"] = "uploads"
app.config["CHAT_IMAGES_FOLDER"] = os.path.join(app.config["UPLOAD_FOLDER"], "chat_images")
app.config["FLAGGED_CHAT_IMAGES_FOLDER"] = os.path.join(app.config["UPLOAD_FOLDER"], "flagged_chat_images")

# Create necessary directories
os.makedirs(app.config["CHAT_IMAGES_FOLDER"], exist_ok=True)
os.makedirs(app.config["FLAGGED_CHAT_IMAGES_FOLDER"], exist_ok=True)

# Initialize the database with the app context.
db.init_app(app)

@app.teardown_appcontext
def shutdown_session(exception=None):
    db.session.remove()
