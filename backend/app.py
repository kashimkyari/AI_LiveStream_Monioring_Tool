import os
import sys
import json
import threading
import time
import random
import spacy
import cv2
import torch
import numpy as np
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from flask import Flask, request, jsonify, session, current_app, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from functools import wraps
from datetime import datetime, timedelta
from urllib.parse import urlparse
from werkzeug.utils import secure_filename
from bs4 import BeautifulSoup
import requests
from io import BytesIO
from PIL import Image
import pytesseract
import base64
from ultralytics import YOLO
import uuid
import shutil
from collections import defaultdict
from spacy.matcher import Matcher
from telegram import Bot
from sqlalchemy import text
import asyncio

# =============================================================================
# Configuration & Initialization
# =============================================================================

# Telegram Bot initialization (using synchronous calls)
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "8175749575:AAGWrWMrqzQkDP8bkKe3gafC42r_Ridr0gY")
bot = Bot(token=TELEGRAM_TOKEN)

# Allowed file types for video uploads
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov'}

# Global variables for duplicate telegram notifications
notification_lock = threading.Lock()
last_notification_times = {}

# Global flags for monitoring threads (only active when a user/admin is logged in)
monitoring_enabled = False
monitoring_threads_started = False
notification_monitor_started = False

# -------------------------------
# Database Existence Check
# -------------------------------
def ensure_database():
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_USER = os.getenv("DB_USER", "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
    NEW_DB_NAME = os.getenv("NEW_DB_NAME", "stream_monitor")
    try:
        conn = psycopg2.connect(dbname="postgres", user=DB_USER, password=DB_PASSWORD, host=DB_HOST, port=DB_PORT)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM pg_database WHERE datname=%s", (NEW_DB_NAME,))
        exists = cur.fetchone() is not None
        cur.close()
        conn.close()
        if not exists:
            conn = psycopg2.connect(dbname="postgres", user=DB_USER, password=DB_PASSWORD, host=DB_HOST, port=DB_PORT)
            conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            cur = conn.cursor()
            cur.execute(f"CREATE DATABASE {NEW_DB_NAME};")
            print(f"Database '{NEW_DB_NAME}' created successfully!")
            cur.close()
            conn.close()
        else:
            print(f"Database '{NEW_DB_NAME}' already exists.")
    except psycopg2.Error as e:
        print(f"Error ensuring database: {e}")

# =============================================================================
# Models & Database Setup
# =============================================================================
db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    firstname = db.Column(db.String(80), nullable=False)
    lastname = db.Column(db.String(80), nullable=False)
    phonenumber = db.Column(db.String(20), nullable=False)
    staffid = db.Column(db.String(20))
    password = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(10), nullable=False, default='agent')
    assignments = db.relationship('Assignment', back_populates='agent')

    def serialize(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'firstname': self.firstname,
            'lastname': self.lastname,
            'phonenumber': self.phonenumber,
            'staffid': self.staffid,
            'role': self.role
        }

class Stream(db.Model):
    __tablename__ = 'streams'
    id = db.Column(db.Integer, primary_key=True)
    room_url = db.Column(db.String(300), unique=True, nullable=False)
    platform = db.Column(db.String(50), nullable=False, default='Chaturbate')
    streamer_username = db.Column(db.String(100))
    online = db.Column(db.Boolean, default=True)  # New field to track online status
    assignments = db.relationship('Assignment', back_populates='stream')

    def serialize(self):
        return {
            'id': self.id,
            'room_url': self.room_url,
            'platform': self.platform,
            'streamer_username': self.streamer_username,
            'online': self.online
        }

class Assignment(db.Model):
    __tablename__ = 'assignments'
    id = db.Column(db.Integer, primary_key=True)
    agent_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    stream_id = db.Column(db.Integer, db.ForeignKey('streams.id'), nullable=False)
    agent = db.relationship('User', back_populates='assignments')
    stream = db.relationship('Stream', back_populates='assignments')

class Log(db.Model):
    __tablename__ = 'logs'
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    room_url = db.Column(db.String(300))
    event_type = db.Column(db.String(50))
    details = db.Column(db.JSON)

    def serialize(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'room_url': self.room_url,
            'event_type': self.event_type,
            'details': self.details
        }

class ChatKeyword(db.Model):
    __tablename__ = 'chat_keywords'
    id = db.Column(db.Integer, primary_key=True)
    keyword = db.Column(db.String(100), unique=True, nullable=False)

    def serialize(self):
        return {'id': self.id, 'keyword': self.keyword}

class FlaggedObject(db.Model):
    __tablename__ = 'flagged_objects'
    id = db.Column(db.Integer, primary_key=True)
    object_name = db.Column(db.String(100), unique=True, nullable=False)
    confidence_threshold = db.Column(db.Numeric(3, 2), default=0.8)

    def serialize(self):
        return {
            'id': self.id,
            'object_name': self.object_name,
            'confidence_threshold': float(self.confidence_threshold)
        }

class TelegramRecipient(db.Model):
    __tablename__ = 'telegram_recipients'
    id = db.Column(db.Integer, primary_key=True)
    telegram_username = db.Column(db.String(50), unique=True, nullable=False)
    chat_id = db.Column(db.String(50), nullable=False)

    def serialize(self):
        return {
            'id': self.id,
            'telegram_username': self.telegram_username,
            'chat_id': self.chat_id
        }

# =============================================================================
# Flask App Initialization & Configuration
# =============================================================================
ensure_database()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql+psycopg2://postgres:password@localhost/stream_monitor'
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_size': 20,
    'max_overflow': 40,
    'pool_timeout': 60,
    'pool_recycle': 3600,
    'pool_pre_ping': True
}
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'supersecretkey'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=5)  # Session expires after 5 minutes of inactivity
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['CHAT_IMAGES_FOLDER'] = os.path.join(app.config['UPLOAD_FOLDER'], 'chat_images')
app.config['FLAGGED_CHAT_IMAGES_FOLDER'] = os.path.join(app.config['UPLOAD_FOLDER'], 'flagged_chat_images')
os.makedirs(app.config['CHAT_IMAGES_FOLDER'], exist_ok=True)
os.makedirs(app.config['FLAGGED_CHAT_IMAGES_FOLDER'], exist_ok=True)

db.init_app(app)

@app.teardown_appcontext
def shutdown_session(exception=None):
    db.session.remove()

with app.app_context():
    db.create_all()
    # ------------------------------------------------------------------------
    # Schema update: add "online" column to streams table if it doesn't exist.
    # ------------------------------------------------------------------------
    insp = db.inspect(db.engine)
    stream_columns = [col['name'] for col in insp.get_columns('streams')]
    if 'online' not in stream_columns:
        with db.engine.connect() as connection:
            connection.execute(text("ALTER TABLE streams ADD COLUMN online BOOLEAN DEFAULT TRUE"))
            connection.commit()
        print("Added 'online' column to streams table.")

    # Create default admin user if not exists
    if not User.query.filter_by(role='admin').first():
        admin = User(
            username='admin',
            password='admin',
            email='admin@example.com',
            firstname='Admin',
            lastname='User',
            phonenumber='000-000-0000',
            role='admin'
        )
        db.session.add(admin)
        db.session.commit()
    # Optionally create an agent user
    if not User.query.filter_by(role='agent').first():
        agent = User(
            username='agent',
            password='agent',
            email='agent@example.com',
            firstname='Agent',
            lastname='User',
            phonenumber='111-111-1111',
            role='agent'
        )
        db.session.add(agent)
        db.session.commit()

# Refresh flagged keywords from DB
flagged_keywords = []
def update_flagged_keywords():
    global flagged_keywords
    with app.app_context():
        keywords = ChatKeyword.query.all()
        flagged_keywords = [kw.keyword for kw in keywords]
update_flagged_keywords()

# =============================================================================
# Utility Functions & Decorators
# =============================================================================

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Strict login: only allow if a user is logged in and has role 'admin' or 'agent'
def login_required(role=None):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                return jsonify({'message': 'Authentication required'}), 401
            user = db.session.get(User, session['user_id'])
            if user is None or user.role not in ['admin', 'agent']:
                return jsonify({'message': 'Unauthorized'}), 403
            if role and user.role != role:
                return jsonify({'message': 'Unauthorized'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# =============================================================================
# Session Refresh on Each Request
# =============================================================================
@app.before_request
def refresh_session():
    session.permanent = True
    session.modified = True

# =============================================================================
# Detection Functions
# =============================================================================

# Load spaCy model and initialize matcher
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
    # For demonstration; replace with real chat text
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
            'status': 'flagged',
            'keywords': list(detected),
            'message': sample_message
        }
    return {'status': 'clean'}

# Load YOLOv8 model for visual detection
model = YOLO("yolov8s.pt")
flagged_objects = []

def update_flagged_objects():
    global flagged_objects
    with app.app_context():
        objects = FlaggedObject.query.all()
        flagged_objects = [{
            'name': obj.object_name.lower(),
            'threshold': float(obj.confidence_threshold)
        } for obj in objects]

def detect_frame(frame):
    frame = cv2.resize(frame, (640, 480))
    results = model(frame)
    detections = []
    for result in results:
        boxes = result.boxes.data.cpu().numpy()
        for detection in boxes:
            x1, y1, x2, y2, conf, cls = detection
            class_id = int(cls)
            if isinstance(model.names, dict):
                class_name = model.names.get(class_id, "unknown").lower()
            else:
                class_name = model.names[class_id].lower() if class_id < len(model.names) else "unknown"
            flagged_obj = next((obj for obj in flagged_objects if obj['name'] == class_name), None)
            if flagged_obj and conf >= flagged_obj['threshold']:
                detections.append({
                    'class': class_name,
                    'confidence': float(conf),
                    'box': [float(x1), float(y1), float(x2), float(y2)]
                })
    return detections

# =============================================================================
# Telegram Notification Functions (synchronous calls)
# =============================================================================

def send_full_telegram_notification(log, detection):
    try:
        # Remove throttling for aggressive notifications

        room_url = log.room_url
        streamer = room_url.rstrip('/').split('/')[-1]
        stream = Stream.query.filter_by(room_url=room_url).first()
        if stream:
            platform = stream.platform
            streamer_name = stream.streamer_username
            assignment = Assignment.query.filter_by(stream_id=stream.id).first()
            agent = assignment.agent if assignment else None
        else:
            platform = "Unknown"
            streamer_name = streamer
            agent = None

        agent_name = f"{agent.firstname} {agent.lastname}" if agent else "None"
        timestamp = log.timestamp.strftime("%Y-%m-%d %H:%M:%S")

        # Open and annotate the detection image with bounding box and label
        detection_image_path = log.details.get("image_path")
        if detection_image_path and os.path.exists(detection_image_path):
            image = Image.open(detection_image_path).convert("RGB")
            # Resize image to 640x480 for consistency
            image = image.resize((640, 480))
            draw = ImageDraw.Draw(image)
            box = detection.get('box')  # Expected format: [x1, y1, x2, y2]
            if box:
                # Draw bounding box in red with a width of 3 pixels
                draw.rectangle(box, outline="red", width=3)
                # Prepare label text with class and confidence
                label = f"{detection.get('class')} ({detection.get('confidence'):.2f})"
                try:
                    font = ImageFont.truetype("arial.ttf", 16)
                except Exception:
                    font = ImageFont.load_default()
                text_size = draw.textsize(label, font=font)
                # Draw a filled rectangle behind the text for readability
                text_origin = (box[0], max(box[1] - text_size[1], 0))
                draw.rectangle([text_origin, (text_origin[0] + text_size[0], text_origin[1] + text_size[1])], fill="red")
                draw.text(text_origin, label, fill="white", font=font)
            annotated_io = BytesIO()
            image.save(annotated_io, format="JPEG")
            annotated_io.seek(0)
        else:
            annotated_io = None

        caption = (
            f"🚨 Detection Alert!\n"
            f"Object: {detection.get('class')}\n"
            f"Confidence: {detection.get('confidence'):.2f}\n"
            f"Streamer: {streamer_name}\n"
            f"Platform: {platform}\n"
            f"Agent: {agent_name}\n"
            f"Timestamp: {timestamp}"
        )

        tasks = []
        # Notify assigned agent if one exists
        if agent:
            agent_recipient = TelegramRecipient.query.filter_by(telegram_username=agent.username).first()
            if agent_recipient:
                if annotated_io:
                    annotated_io.seek(0)
                    tasks.append(bot.send_photo(chat_id=agent_recipient.chat_id, photo=annotated_io, caption=caption))
                else:
                    tasks.append(bot.send_message(chat_id=agent_recipient.chat_id, text=caption))

        # Notify all admin recipients (excluding the agent if already notified)
        admin_recipients = TelegramRecipient.query.all()
        for recipient in admin_recipients:
            if agent and recipient.telegram_username == agent.username:
                continue
            if annotated_io:
                annotated_io.seek(0)
                tasks.append(bot.send_photo(chat_id=recipient.chat_id, photo=annotated_io, caption=caption))
            else:
                tasks.append(bot.send_message(chat_id=recipient.chat_id, text=caption))

        # Run all telegram tasks concurrently using a new asyncio event loop
        if tasks:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(asyncio.gather(*tasks))
            loop.close()

    except Exception as e:
        print(f"Notification error: {str(e)}")

def send_chat_telegram_notification(image_path, description):
    try:
        with open(image_path, "rb") as image_file:
            bot.send_photo(chat_id=os.getenv("TELEGRAM_CHAT_ID"), photo=image_file, caption=description)
    except Exception as e:
        print(f"Error sending chat telegram notification: {e}")

# =============================================================================
# Monitoring Functions
# =============================================================================

def monitor_stream(stream_url):
    while monitoring_enabled:
        with app.app_context():
            stream = Stream.query.filter_by(room_url=stream_url).first()
            if not stream or not stream.online:
                break
            streamer = stream_url.rstrip('/').split('/')[-1]
            thumbnail_url = f"https://jpeg.live.mmcdn.com/stream?room={streamer}"
            try:
                response = requests.get(thumbnail_url, stream=True, timeout=10)
                # If thumbnail fetch returns non-200 (e.g., 400), mark stream offline immediately.
                if response.status_code != 200:
                    print(f"Thumbnail fetch failed for {stream_url} with status code {response.status_code}. Marking offline.")
                    stream.online = False
                    db.session.commit()
                    break

                img = Image.open(BytesIO(response.content)).convert('RGB')
                detection_id = str(uuid.uuid4())
                # Save to temp folder
                temp_detection_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'temp_detections')
                os.makedirs(temp_detection_folder, exist_ok=True)
                image_path = os.path.join(temp_detection_folder, f"{detection_id}.jpg")
                img.save(image_path)

                update_flagged_objects()
                frame = np.array(img)
                detections = detect_frame(frame)

                if detections:
                    detection_data = {
                        'detections': detections,
                        'image_path': image_path,
                        'stream_id': stream.id,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    log = Log(
                        room_url=stream_url,
                        event_type='object_detection',
                        details=detection_data
                    )
                    db.session.add(log)
                    db.session.commit()
            except Exception as e:
                print(f"Monitoring error for {stream_url}: {str(e)}")
        time.sleep(10)

def start_monitoring():
    with app.app_context():
        streams = Stream.query.all()
        for stream in streams:
            if stream.online:
                thread = threading.Thread(
                    target=monitor_stream,
                    args=(stream.room_url,),
                    daemon=True
                )
                thread.start()
                print(f"Started monitoring thread for {stream.room_url}")

def start_notification_monitor():
    def monitor_notifications():
        last_notified_time = datetime.utcnow() - timedelta(seconds=5)
        while monitoring_enabled:
            try:
                with app.app_context():
                    logs = Log.query.filter(
                        Log.timestamp > last_notified_time,
                        Log.event_type == 'object_detection'
                    ).all()
                    for log in logs:
                        detections = log.details.get('detections', [])
                        for detection in detections:
                            send_full_telegram_notification(log, detection)
                    if logs:
                        last_notified_time = max(log.timestamp for log in logs)
            except Exception as e:
                print(f"Notification monitor error: {e}")
            time.sleep(2)
    threading.Thread(target=monitor_notifications, daemon=True).start()

# =============================================================================
# Chat Image Detection & Cleanup Functions
# =============================================================================

@app.route('/api/detect-chat', methods=['POST'])
def detect_chat_from_image():
    if 'chat_image' not in request.files:
        return jsonify({'message': 'No chat image provided'}), 400

    file = request.files['chat_image']
    filename = secure_filename(file.filename)
    if not filename:
        return jsonify({'message': 'Invalid filename'}), 400

    timestamp = int(time.time() * 1000)
    new_filename = f"{timestamp}_{filename}"
    chat_image_path = os.path.join(app.config['CHAT_IMAGES_FOLDER'], new_filename)
    file.save(chat_image_path)

    image = Image.open(chat_image_path)
    ocr_text = pytesseract.image_to_string(image)

    update_flagged_keywords()

    detected_keywords = [keyword for keyword in flagged_keywords if keyword.lower() in ocr_text.lower()]

    if detected_keywords:
        flagged_filename = f"flagged_{new_filename}"
        flagged_filepath = os.path.join(app.config['FLAGGED_CHAT_IMAGES_FOLDER'], flagged_filename)
        shutil.move(chat_image_path, flagged_filepath)

        description = (
            f"Chat flagged: Detected keywords {', '.join(detected_keywords)}. OCR text: {ocr_text}"
        )

        log = Log(
            room_url="chat",
            event_type='chat_detection',
            details={'keywords': detected_keywords, 'ocr_text': ocr_text}
        )
        db.session.add(log)
        db.session.commit()

        send_chat_telegram_notification(flagged_filepath, description)
        return jsonify({'message': 'Flagged keywords detected', 'keywords': detected_keywords})
    else:
        return jsonify({'message': 'No flagged keywords detected'})

def cleanup_chat_images():
    chat_folder = app.config['CHAT_IMAGES_FOLDER']
    now = time.time()
    for filename in os.listdir(chat_folder):
        filepath = os.path.join(chat_folder, filename)
        if os.path.isfile(filepath):
            if now - os.path.getctime(filepath) > 20:
                try:
                    os.remove(filepath)
                except Exception as e:
                    print(f"Error deleting file {filepath}: {e}")

def start_chat_cleanup_thread():
    def cleanup_loop():
        while True:
            try:
                cleanup_chat_images()
            except Exception as e:
                print(f"Chat cleanup error: {e}")
            time.sleep(20)
    threading.Thread(target=cleanup_loop, daemon=True).start()

# =============================================================================
# API Routes
# =============================================================================

@app.route('/api/login', methods=['POST'])
def login():
    global monitoring_enabled, monitoring_threads_started, notification_monitor_started
    data = request.get_json()
    username = data.get('username')
    user = User.query.filter(
        (User.username == username) | (User.email == username)
    ).filter_by(password=data.get('password')).first()
    if user:
        session.permanent = True
        session['user_id'] = user.id
        # Enable monitoring on login
        if not monitoring_enabled:
            monitoring_enabled = True
        if not monitoring_threads_started:
            start_monitoring()
            monitoring_threads_started = True
        if not notification_monitor_started:
            start_notification_monitor()
            notification_monitor_started = True
        return jsonify({'message': 'Login successful', 'role': user.role})
    return jsonify({'message': 'Invalid credentials'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    global monitoring_enabled, monitoring_threads_started, notification_monitor_started
    monitoring_enabled = False
    monitoring_threads_started = False
    notification_monitor_started = False
    return jsonify({'message': 'Logged out'})

@app.route('/api/session', methods=['GET'])
def check_session():
    if 'user_id' in session:
        user = db.session.get(User, session['user_id'])
        if user is None:
            return jsonify({'logged_in': False}), 401
        return jsonify({'logged_in': True, 'user': user.serialize()})
    return jsonify({'logged_in': False}), 401

@app.route('/api/assign', methods=['POST'])
@login_required(role='admin')
def assign_stream():
    data = request.get_json()
    agent_id = data.get('agent_id')
    stream_id = data.get('stream_id')
    if not agent_id or not stream_id:
        return jsonify({'message': 'Agent and Stream required'}), 400

    stream = Stream.query.get(stream_id)
    if not stream:
        return jsonify({'message': 'Stream not found'}), 404

    existing = Assignment.query.filter_by(stream_id=stream.id).first()
    if existing:
        db.session.delete(existing)

    db.session.add(Assignment(agent_id=agent_id, stream_id=stream.id))
    db.session.commit()
    return jsonify({'message': 'Assignment successful'})

@app.route('/api/logs', methods=['GET'])
@login_required()
def get_logs():
    return jsonify([log.serialize() for log in Log.query.all()])

@app.route('/api/agents', methods=['GET'])
@login_required(role='admin')
def get_agents():
    return jsonify([agent.serialize() for agent in User.query.filter_by(role='agent').all()])

@app.route('/api/agents', methods=['POST'])
@login_required(role='admin')
def create_agent():
    data = request.get_json()
    required_fields = ['username', 'password', 'firstname', 'lastname', 'email', 'phonenumber']
    if any(field not in data for field in required_fields):
        return jsonify({'message': 'Missing required fields'}), 400
    if User.query.filter((User.username == data['username']) | (User.email == data['email'])).first():
        return jsonify({'message': 'Username or email exists'}), 400
    agent = User(
        username=data['username'],
        password=data['password'],
        firstname=data['firstname'],
        lastname=data['lastname'],
        email=data['email'],
        phonenumber=data['phonenumber'],
        staffid=data.get('staffid'),
        role='agent'
    )
    db.session.add(agent)
    db.session.commit()
    return jsonify({'message': 'Agent created', 'agent': agent.serialize()}), 201

@app.route('/api/agents/<int:agent_id>', methods=['PUT'])
@login_required(role='admin')
def update_agent(agent_id):
    agent = User.query.filter_by(id=agent_id, role='agent').first()
    if not agent:
        return jsonify({'message': 'Agent not found'}), 404
    data = request.get_json()
    updates = {}
    if 'username' in data and (new_uname := data['username'].strip()):
        agent.username = new_uname
        updates['username'] = new_uname
    if 'password' in data and (new_pwd := data['password'].strip()):
        agent.password = new_pwd
        updates['password'] = 'updated'
    db.session.commit()
    return jsonify({'message': 'Agent updated', 'updates': updates})

@app.route('/api/agents/<int:agent_id>', methods=['DELETE'])
@login_required(role='admin')
def delete_agent(agent_id):
    agent = User.query.filter_by(id=agent_id, role='agent').first()
    if not agent:
        return jsonify({'message': 'Agent not found'}), 404
    db.session.delete(agent)
    db.session.commit()
    return jsonify({'message': 'Agent deleted'})

@app.route('/api/streams', methods=['GET'])
@login_required(role='admin')
def get_streams():
    return jsonify([stream.serialize() for stream in Stream.query.all()])

@app.route('/api/streams', methods=['POST'])
@login_required(role='admin')
def create_stream():
    data = request.get_json()
    room_url = data.get('room_url', '').strip().lower()
    if not room_url:
        return jsonify({'message': 'Room URL required'}), 400
    platform = data.get('platform', 'Chaturbate').strip()
    if platform.lower() == "chaturbate" and "chaturbate.com/" not in room_url:
        return jsonify({'message': 'Invalid Chaturbate URL'}), 400
    if platform.lower() == "stripchat" and "stripchat.com/" not in room_url:
        return jsonify({'message': 'Invalid Stripchat URL'}), 400
    streamer = room_url.rstrip('/').split('/')[-1]
    if Stream.query.filter_by(room_url=room_url).first():
        return jsonify({'message': 'Stream exists'}), 400
    stream = Stream(
        room_url=room_url,
        platform=platform,
        streamer_username=streamer,
        online=True
    )
    db.session.add(stream)
    db.session.commit()
    return jsonify({
        'message': 'Stream created',
        'stream': stream.serialize(),
        'thumbnail': f'https://jpeg.live.mmcdn.com/stream?room={streamer}&f=0.8399472484345041'
    }), 201

@app.route('/api/streams/<int:stream_id>', methods=['PUT'])
@login_required(role='admin')
def update_stream(stream_id):
    stream = Stream.query.get(stream_id)
    if not stream:
        return jsonify({'message': 'Stream not found'}), 404
    data = request.get_json()
    if 'room_url' in data and (new_url := data['room_url'].strip()):
        platform = data.get('platform', stream.platform).strip()
        if platform.lower() == 'chaturbate' and 'chaturbate.com/' not in new_url:
            return jsonify({'message': 'Invalid Chaturbate URL'}), 400
        if platform.lower() == 'stripchat' and 'stripchat.com/' not in new_url:
            return jsonify({'message': 'Invalid Stripchat URL'}), 400
        stream.room_url = new_url
        stream.streamer_username = new_url.rstrip('/').split('/')[-1]
    if 'platform' in data:
        stream.platform = data['platform'].strip()
    db.session.commit()
    return jsonify({'message': 'Stream updated', 'stream': stream.serialize()})

@app.route('/api/streams/<int:stream_id>', methods=['DELETE'])
@login_required(role='admin')
def delete_stream(stream_id):
    stream = Stream.query.get(stream_id)
    if not stream:
        return jsonify({'message': 'Stream not found'}), 404
    assignments = Assignment.query.filter_by(stream_id=stream.id).all()
    for assignment in assignments:
        db.session.delete(assignment)
    db.session.delete(stream)
    db.session.commit()
    return jsonify({'message': 'Stream deleted'})

@app.route('/api/keywords', methods=['GET'])
@login_required(role='admin')
def get_keywords():
    return jsonify([kw.serialize() for kw in ChatKeyword.query.all()])

@app.route('/api/keywords', methods=['POST'])
@login_required(role='admin')
def create_keyword():
    data = request.get_json()
    keyword = data.get('keyword', '').strip()
    if not keyword:
        return jsonify({'message': 'Keyword required'}), 400
    if ChatKeyword.query.filter_by(keyword=keyword).first():
        return jsonify({'message': 'Keyword exists'}), 400
    kw = ChatKeyword(keyword=keyword)
    db.session.add(kw)
    db.session.commit()
    update_flagged_keywords()
    return jsonify({'message': 'Keyword added', 'keyword': kw.serialize()}), 201

@app.route('/api/keywords/<int:keyword_id>', methods=['PUT'])
@login_required(role='admin')
def update_keyword(keyword_id):
    kw = ChatKeyword.query.get(keyword_id)
    if not kw:
        return jsonify({'message': 'Keyword not found'}), 404
    data = request.get_json()
    new_kw = data.get('keyword', '').strip()
    if not new_kw:
        return jsonify({'message': 'New keyword required'}), 400
    kw.keyword = new_kw
    db.session.commit()
    update_flagged_keywords()
    return jsonify({'message': 'Keyword updated', 'keyword': kw.serialize()})

@app.route('/api/keywords/<int:keyword_id>', methods=['DELETE'])
@login_required(role='admin')
def delete_keyword(keyword_id):
    kw = ChatKeyword.query.get(keyword_id)
    if not kw:
        return jsonify({'message': 'Keyword not found'}), 404
    db.session.delete(kw)
    db.session.commit()
    update_flagged_keywords()
    return jsonify({'message': 'Keyword deleted'})

@app.route('/api/objects', methods=['GET'])
@login_required(role='admin')
def get_objects():
    return jsonify([obj.serialize() for obj in FlaggedObject.query.all()])

@app.route('/api/objects', methods=['POST'])
@login_required(role='admin')
def create_object():
    data = request.get_json()
    obj_name = data.get('object_name', '').strip()
    if not obj_name:
        return jsonify({'message': 'Object name required'}), 400
    if FlaggedObject.query.filter_by(object_name=obj_name).first():
        return jsonify({'message': 'Object exists'}), 400
    obj = FlaggedObject(object_name=obj_name)
    db.session.add(obj)
    db.session.commit()
    return jsonify({'message': 'Object added', 'object': obj.serialize()}), 201

@app.route('/api/objects/<int:object_id>', methods=['PUT'])
@login_required(role='admin')
def update_object(object_id):
    obj = FlaggedObject.query.get(object_id)
    if not obj:
        return jsonify({'message': 'Object not found'}), 404
    data = request.get_json()
    new_name = data.get('object_name', '').strip()
    if not new_name:
        return jsonify({'message': 'New name required'}), 400
    obj.object_name = new_name
    db.session.commit()
    return jsonify({'message': 'Object updated', 'object': obj.serialize()})

@app.route('/api/objects/<int:object_id>', methods=['DELETE'])
@login_required(role='admin')
def delete_object(object_id):
    obj = FlaggedObject.query.get(object_id)
    if not obj:
        return jsonify({'message': 'Object not found'}), 404
    db.session.delete(obj)
    db.session.commit()
    return jsonify({'message': 'Object deleted'})

@app.route('/api/telegram_recipients', methods=['GET'])
@login_required(role='admin')
def get_telegram_recipients():
    recipients = TelegramRecipient.query.all()
    return jsonify([r.serialize() for r in recipients])

@app.route('/api/telegram_recipients', methods=['POST'])
@login_required(role='admin')
def create_telegram_recipient():
    data = request.get_json()
    username = data.get('telegram_username')
    chat_id = data.get('chat_id')
    if not username or not chat_id:
        return jsonify({'message': 'Telegram username and chat_id required'}), 400
    if TelegramRecipient.query.filter_by(telegram_username=username).first():
        return jsonify({'message': 'Recipient exists'}), 400
    recipient = TelegramRecipient(telegram_username=username, chat_id=chat_id)
    db.session.add(recipient)
    db.session.commit()
    return jsonify({'message': 'Recipient added', 'recipient': recipient.serialize()}), 201

@app.route('/api/telegram_recipients/<int:recipient_id>', methods=['DELETE'])
@login_required(role='admin')
def delete_telegram_recipient(recipient_id):
    recipient = TelegramRecipient.query.get(recipient_id)
    if not recipient:
        return jsonify({'message': 'Recipient not found'}), 404
    db.session.delete(recipient)
    db.session.commit()
    return jsonify({'message': 'Recipient deleted'})

@app.route('/api/dashboard', methods=['GET'])
@login_required(role='admin')
def get_dashboard():
    streams = Stream.query.all()
    data = []
    for stream in streams:
        assignment = Assignment.query.filter_by(stream_id=stream.id).first()
        data.append({
            **stream.serialize(),
            "agent": assignment.agent.serialize() if assignment else None,
            "confidence": 0.8
        })
    return jsonify({"ongoing_streams": len(data), "streams": data})

@app.route('/api/agent/dashboard', methods=['GET'])
@login_required(role='agent')
def get_agent_dashboard():
    agent_id = session['user_id']
    assignments = Assignment.query.filter_by(agent_id=agent_id).all()
    return jsonify({
        "ongoing_streams": len(assignments),
        "assignments": [a.stream.serialize() for a in assignments if a.stream]
    })

@app.route('/api/test/visual', methods=['POST'])
@login_required(role='admin')
def test_visual():
    if 'video' not in request.files:
        return jsonify({'message': 'No file uploaded'}), 400
    file = request.files['video']
    if not allowed_file(file.filename):
        return jsonify({'message': 'Invalid file type'}), 400
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    file.save(filepath)
    cap = cv2.VideoCapture(filepath)
    ret, frame = cap.read()
    cap.release()
    os.remove(filepath)
    if not ret:
        return jsonify({'message': 'Error reading video'}), 400
    results = detect_frame(frame)
    return jsonify({'results': results})

@app.route('/api/test/visual/frame', methods=['POST'])
@login_required(role='admin')
def test_visual_frame():
    if 'frame' not in request.files:
        return jsonify({'message': 'No frame uploaded'}), 400
    file = request.files['frame']
    try:
        img = Image.open(file.stream).convert('RGB')
        frame = np.array(img)
        results = detect_frame(frame)
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'message': f'Processing error: {str(e)}'}), 500

@app.route('/api/test/visual/stream', methods=['GET'])
@login_required(role='admin')
def stream_visual():
    def generate():
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            yield "data: " + json.dumps({"error": "Could not open video source"}) + "\n\n"
            return
        detected_objects_set = set()
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    yield "data: " + json.dumps({"error": "Frame capture failed"}) + "\n\n"
                    continue
                try:
                    results = detect_frame(frame)
                    for det in results:
                        if 'class' in det:
                            detected_objects_set.add(det['class'])
                    payload = {
                        'results': results,
                        'detected_objects': list(detected_objects_set),
                        'model': 'yolov8'
                    }
                    yield "data: " + json.dumps(payload) + "\n\n"
                except Exception as e:
                    yield "data: " + json.dumps({"error": f"Detection error: {str(e)}"}) + "\n\n"
                time.sleep(0.5)
        finally:
            cap.release()
    return app.response_class(generate(), mimetype='text/event-stream')

@app.route('/detection-images/<filename>')
def serve_detection_image(filename):
    return send_from_directory('detections', filename)

@app.route('/api/detection-events', methods=['GET'])
def detection_events():
    def generate():
        with app.app_context():
            while True:
                try:
                    cutoff = datetime.utcnow() - timedelta(seconds=15)
                    logs = Log.query.filter(
                        Log.timestamp >= cutoff,
                        Log.event_type == 'object_detection'
                    ).all()
                    stream_detections = defaultdict(list)
                    for log in logs:
                        stream_detections[log.room_url].extend(log.details.get('detections', []))
                    for url, detections in stream_detections.items():
                        payload = json.dumps({
                            'stream_url': url,
                            'detections': detections
                        })
                        yield f"data: {payload}\n\n"
                    time.sleep(2)
                except Exception as e:
                    print(f"SSE Error: {str(e)}")
                    time.sleep(5)
    return app.response_class(generate(), mimetype='text/event-stream')

@app.route('/api/detect', methods=['POST'])
def unified_detect():
    data = request.get_json()
    text = data.get('text', '')
    visual_frame = data.get('visual_frame', None)
    audio_flag = None
    visual_results = []
    if visual_frame:
        visual_results = detect_frame(np.array(visual_frame))
    chat_results = detect_chat(text)
    return jsonify({
        'audio': audio_flag,
        'chat': chat_results,
        'visual': visual_results
    })

# Only allow object detection if an admin or agent is logged in.
@app.route('/api/detect-objects', methods=['POST'])
@login_required()  
def detect_objects():
    try:
        data = request.get_json()
        if 'image_data' not in data:
            return jsonify({'error': 'Missing image data'}), 400
        try:
            img_bytes = base64.b64decode(data['image_data'])
            img = Image.open(BytesIO(img_bytes)).convert('RGB')
            frame = np.array(img)
        except Exception as e:
            return jsonify({'error': 'Invalid image data'}), 400
        update_flagged_objects()
        results = detect_frame(frame)
        height, width = frame.shape[:2]
        detections = []
        for det in results:
            try:
                x1 = (det['box'][0] / width) * 100
                y1 = (det['box'][1] / height) * 100
                x2 = (det['box'][2] / width) * 100
                y2 = (det['box'][3] / height) * 100
                detections.append({
                    'class': det['class'],
                    'confidence': det['confidence'],
                    'box': [x1, y1, x2, y2],
                    'source': 'ai'
                })
            except KeyError:
                continue
        return jsonify({'detections': detections})
    except Exception as e:
        print(f"Detection error: {str(e)}")
        return jsonify({'error': 'Processing failed'}), 500

@app.route('/api/notification-events')
def notification_events():
    def generate():
        with app.app_context():
            while True:
                try:
                    cutoff = datetime.utcnow() - timedelta(seconds=30)
                    logs = Log.query.filter(
                        Log.timestamp >= cutoff,
                        Log.event_type == 'object_detection'
                    ).order_by(Log.timestamp.desc()).all()
                    for log in logs:
                        for det in log.details.get('detections', []):
                            payload = {
                                'type': 'detection',
                                'stream': log.room_url,
                                'object': det.get('class', 'object'),
                                'confidence': det.get('confidence', 0),
                                'id': log.id
                            }
                            yield f"data: {json.dumps(payload)}\n\n"
                    time.sleep(1)
                except Exception as e:
                    print(f"SSE Error: {str(e)}")
                    time.sleep(5)
    return app.response_class(generate(), mimetype='text/event-stream')

# =============================================================================
# Main Execution
# =============================================================================
if __name__ == '__main__':
    with app.app_context():
        start_chat_cleanup_thread()
    app.run(host='0.0.0.0', port=5000, threaded=True)
