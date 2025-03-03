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
from flask import Flask, request, jsonify, session, current_app
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

# Import the Bot class directly from the python-telegram-bot package
from telegram import Bot

# Import send_notification if needed from your notifications module
from notifications import send_notification

# Initialize Telegram Bot using environment variables
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "AAGWrWMrqzQkDP8bkKe3gafC42r_Ridr0gY")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "8175749575")
bot = Bot(token=TELEGRAM_TOKEN)

from collections import defaultdict

OBJECT_CACHE_TIME = 5
last_object_update = 0

def update_flagged_objects():
    global last_object_update, flagged_objects
    now = time.time()
    if now - last_object_update > OBJECT_CACHE_TIME:
        with app.app_context():
            objects = FlaggedObject.query.all()
            flagged_objects = [{
                'name': obj.object_name.lower(),
                'threshold': float(obj.confidence_threshold)
            } for obj in objects]
        last_object_update = now

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
        # Connect to default database "postgres"
        conn = psycopg2.connect(dbname="postgres", user=DB_USER, password=DB_PASSWORD, host=DB_HOST, port=DB_PORT)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM pg_database WHERE datname=%s", (NEW_DB_NAME,))
        exists = cur.fetchone() is not None
        cur.close()
        conn.close()
        if not exists:
            # Create the database if it doesn't exist
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

# -------------------------------
# Models (from models_db.py)
# -------------------------------
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
    assignments = db.relationship('Assignment', back_populates='stream')
    
    def serialize(self):
        return {
            'id': self.id,
            'room_url': self.room_url,
            'platform': self.platform,
            'streamer_username': self.streamer_username
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

# -------------------------------
# App Initialization (Original app.py)
# -------------------------------
# Ensure the database exists before initializing the app
ensure_database()

app = Flask(__name__)
CORS(
    app,
    resources={r"/api/*": {
        "origins": "*",
        "expose_headers": ["Content-Type", "Cache-Control", "X-Requested-With"]
    }}
)
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
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
app.config['UPLOAD_FOLDER'] = 'uploads'
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov'}

db.init_app(app)

# Teardown to remove session and release connections
@app.teardown_appcontext
def shutdown_session(exception=None):
    db.session.remove()

with app.app_context():
    db.create_all()
    
    # Check and create admin user
    admin_exists = db.session.query(
        User.query.filter(
            (User.username == 'admin') | 
            (User.email == 'admin@example.com')
        ).exists()
    ).scalar()
    
    if not admin_exists:
        admin_user = User(
            username='admin',
            password='admin',
            email='admin@example.com',
            firstname='Admin',
            lastname='User',
            phonenumber='000-000-0000',
            role='admin'
        )
        db.session.add(admin_user)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            print("Admin user already exists with different credentials")

    # Check and create agent user
    agent_exists = db.session.query(
        User.query.filter(
            (User.username == 'agent') | 
            (User.email == 'agent@example.com')
        ).exists()
    ).scalar()
    
    if not agent_exists:
        agent_user = User(
            username='agent',
            password='agent',
            email='agent@example.com',
            firstname='Agent',
            lastname='User',
            phonenumber='111-111-1111',
            role='agent'
        )
        db.session.add(agent_user)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            print("Agent user already exists with different credentials")
    
    db.session.commit()

# -------------------------------
# Detection Functions Integration
# -------------------------------
# Audio Detection (from audio.py)
def detect_audio(stream_url):
    if random.randint(0, 10) > 8:
        return "Audio anomaly detected"
    return None

# Chat Detection (from chat.py)
nlp = spacy.load("en_core_web_sm")
matcher = spacy.matcher.Matcher(nlp.vocab)

def refresh_keywords():
    with app.app_context():
        keywords = [kw.keyword.lower() for kw in ChatKeyword.query.all()]
    global matcher
    matcher = spacy.matcher.Matcher(nlp.vocab)
    for word in keywords:
        pattern = [{"LOWER": word}]
        matcher.add(word, [pattern])

def detect_chat(stream_url):
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

# Visual Detection (from visual.py)
# model = torch.hub.load('ultralytics/yolov5s', 'yolov5s', pretrained=True, trust_repo=True)
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
    # Resize the frame for consistent processing
    frame = cv2.resize(frame, (640, 480))
    results = model(frame)
    # Get the detections tensor from the first result
    boxes = results[0].boxes.data  # Tensor of shape (n, 6): [x1, y1, x2, y2, conf, cls]
    processed = []
    for detection in boxes:
        # Convert detection to numpy array if necessary
        detection = detection.cpu().numpy()  # [x1, y1, x2, y2, conf, cls]
        x1, y1, x2, y2, conf, cls = detection
        cls = int(cls)
        # Get the class name. model.names might be a list or dict.
        if isinstance(model.names, dict):
            class_name = model.names.get(cls, "unknown").lower()
        else:
            class_name = model.names[cls].lower() if cls < len(model.names) else "unknown"
        flagged_obj = next((obj for obj in flagged_objects if obj['name'] == class_name), None)
        if flagged_obj and conf >= flagged_obj['threshold']:
            processed.append({
                'class': class_name,
                'confidence': float(conf),
                'box': [float(x1), float(y1), float(x2), float(y2)]
            })
    return processed



def detect_visual(stream_url):
    cap = cv2.VideoCapture(stream_url)
    ret, frame = cap.read()
    cap.release()
    return detect_frame(frame) if ret else None

# -------------------------------
# Helper Functions and Decorators
# -------------------------------
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def login_required(role=None):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                return jsonify({'message': 'Authentication required'}), 401
            user = db.session.get(User, session['user_id'])
            if role and (user is None or user.role != role):
                return jsonify({'message': 'Unauthorized'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

flagged_keywords = []
def update_flagged_keywords():
    global flagged_keywords
    with app.app_context():
        keywords = ChatKeyword.query.all()
        flagged_keywords = [kw.keyword for kw in keywords]
update_flagged_keywords()

# -------------------------------
# New Helper: Check if a stream is online
# -------------------------------
def is_stream_online(stream_url):
    # Extract streamer name from URL
    streamer = stream_url.rstrip('/').split('/')[-1]
    thumbnail_url = f"https://jpeg.live.mmcdn.com/stream?room={streamer}&f=0.8399472484345041"
    try:
        response = requests.head(thumbnail_url, timeout=5)
        return response.status_code == 200
    except Exception as e:
        print(f"Error checking stream status: {e}")
        return False

# -------------------------------
# New Helper: Telegram Notification
# -------------------------------
def send_telegram_notification(description, stream_url):
    # Use the thumbnail from the stream URL as the image
    streamer = stream_url.rstrip('/').split('/')[-1]
    thumbnail_url = f"https://jpeg.live.mmcdn.com/stream?room={streamer}&f=0.8399472484345041"
    try:
        bot.send_photo(chat_id=TELEGRAM_CHAT_ID, photo=thumbnail_url, caption=description)
    except Exception as e:
        print(f"Error sending telegram notification: {e}")

def start_notification_monitor():
    def monitor_notifications():
        last_notified_time = datetime.utcnow() - timedelta(seconds=5)
        while True:
            try:
                with app.app_context():
                    logs = Log.query.filter(
                        Log.timestamp > last_notified_time,
                        Log.event_type == 'object_detection'
                    ).all()
                    for log in logs:
                        for det in log.details.get('detections', []):
                            description = f"Detected {det.get('class')} with confidence {det.get('confidence'):.2f} in stream {log.room_url}"
                            send_telegram_notification(description, log.room_url)
                    if logs:
                        last_notified_time = max(log.timestamp for log in logs)
            except Exception as e:
                print(f"Notification monitor error: {e}")
            time.sleep(2)
    thread = threading.Thread(target=monitor_notifications, daemon=True)
    thread.start()

# -------------------------------
# Original API Routes (from app.py)
# -------------------------------
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    user = User.query.filter(
        (User.username == username) | 
        (User.email == username)
    ).filter_by(password=data.get('password')).first()
    
    if user:
        session.permanent = True
        session['user_id'] = user.id
        return jsonify({'message': 'Login successful', 'role': user.role})
    return jsonify({'message': 'Invalid credentials'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
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
    if not (agent_id := data.get('agent_id')) or not (stream_id := data.get('stream_id')):
        return jsonify({'message': 'Agent and Stream required'}), 400
    
    if not (stream := Stream.query.get(stream_id)):
        return jsonify({'message': 'Stream not found'}), 404

    if existing := Assignment.query.filter_by(stream_id=stream.id).first():
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
    if not (agent := User.query.filter_by(id=agent_id, role='agent').first()):
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
    if not (agent := User.query.filter_by(id=agent_id, role='agent').first()):
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
    if not (room_url := data.get('room_url', '').strip().lower()):
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
        streamer_username=streamer
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
    if not (stream := Stream.query.get(stream_id)):
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
    if not (stream := Stream.query.get(stream_id)):
        return jsonify({'message': 'Stream not found'}), 404
    # Delete any associated assignments first
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
    if not (keyword := data.get('keyword', '').strip()):
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
    if not (kw := ChatKeyword.query.get(keyword_id)):
        return jsonify({'message': 'Keyword not found'}), 404
    
    data = request.get_json()
    if not (new_kw := data.get('keyword', '').strip()):
        return jsonify({'message': 'New keyword required'}), 400
    
    kw.keyword = new_kw
    db.session.commit()
    update_flagged_keywords()
    return jsonify({'message': 'Keyword updated', 'keyword': kw.serialize()})

@app.route('/api/keywords/<int:keyword_id>', methods=['DELETE'])
@login_required(role='admin')
def delete_keyword(keyword_id):
    if not (kw := ChatKeyword.query.get(keyword_id)):
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
    if not (obj_name := data.get('object_name', '').strip()):
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
    if not (obj := FlaggedObject.query.get(object_id)):
        return jsonify({'message': 'Object not found'}), 404
    
    data = request.get_json()
    if not (new_name := data.get('object_name', '').strip()):
        return jsonify({'message': 'New name required'}), 400
    
    obj.object_name = new_name
    db.session.commit()
    return jsonify({'message': 'Object updated', 'object': obj.serialize()})

@app.route('/api/objects/<int:object_id>', methods=['DELETE'])
@login_required(role='admin')
def delete_object(object_id):
    if not (obj := FlaggedObject.query.get(object_id)):
        return jsonify({'message': 'Object not found'}), 404
    db.session.delete(obj)
    db.session.commit()
    return jsonify({'message': 'Object deleted'})

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

# -------------------------------
# Updated Livestream Preview with Dynamic Detected Objects List
# -------------------------------
@app.route('/api/test/visual/stream', methods=['GET'])
@login_required(role='admin')
def stream_visual():
    def generate():
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            yield "data: " + json.dumps({"error": "Could not open video source"}) + "\n\n"
            return
        # Initialize a set to keep track of detected objects dynamically
        detected_objects_set = set()
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    yield "data: " + json.dumps({"error": "Frame capture failed"}) + "\n\n"
                    continue
                try:
                    results = detect_frame(frame)
                    # Update the set with newly detected object classes
                    for det in results:
                        if 'class' in det:
                            detected_objects_set.add(det['class'])
                    payload = {
                        'results': results,
                        'detected_objects': list(detected_objects_set),
                        'model': 'yolov5s'
                    }
                    yield "data: " + json.dumps(payload) + "\n\n"
                except Exception as e:
                    yield "data: " + json.dumps({"error": f"Detection error: {str(e)}"}) + "\n\n"
                time.sleep(0.5)
        finally:
            cap.release()
    return app.response_class(generate(), mimetype='text/event-stream')

# -------------------------------
# Monitoring and Unified Detection
# -------------------------------
@app.route('/api/detection-events', methods=['GET'])
def detection_events():
    def generate():
        with app.app_context():
            while True:
                try:
                    # Get detections from last 15 seconds
                    cutoff = datetime.utcnow() - timedelta(seconds=15)
                    logs = Log.query.filter(
                        Log.timestamp >= cutoff,
                        Log.event_type == 'object_detection'
                    ).all()
                    
                    # Group by stream URL
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
    audio_flag = detect_audio(data.get('stream_url', ''))
    visual_results = []
    if visual_frame:
        visual_results = detect_frame(np.array(visual_frame))
    chat_results = detect_chat(text)
    return jsonify({
        'audio': audio_flag,
        'chat': chat_results,
        'visual': visual_results
    })

def detect_frame(frame):
    # Resize the frame for consistent processing
    frame = cv2.resize(frame, (640, 480))
    results = model(frame)
    
    # Process YOLOv8 results
    detections = []
    for result in results:
        boxes = result.boxes.data.cpu().numpy()
        for detection in boxes:
            x1, y1, x2, y2, conf, cls = detection
            class_id = int(cls)
            class_name = model.names[class_id].lower()
            
            # Check against flagged objects
            flagged_obj = next((obj for obj in flagged_objects 
                              if obj['name'] == class_name), None)
            if flagged_obj and conf >= flagged_obj['threshold']:
                detections.append({
                    'class': class_name,
                    'confidence': float(conf),
                    'box': [float(x1), float(y1), float(x2), float(y2)]
                })
    
    return detections

@app.route('/api/detect-objects', methods=['POST'])
@login_required()
def detect_objects():
    try:
        data = request.get_json()
        if 'image_data' not in data:
            return jsonify({'error': 'Missing image data'}), 400
        
        # Decode base64
        try:
            img_bytes = base64.b64decode(data['image_data'])
            img = Image.open(BytesIO(img_bytes)).convert('RGB')
            frame = np.array(img)
        except Exception as e:
            return jsonify({'error': 'Invalid image data'}), 400

        # Perform detection
        update_flagged_objects()
        results = detect_frame(frame)

        # Convert boxes to percentages
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

def start_monitoring():
    with app.app_context():
        streams = Stream.query.all()
        for stream in streams:
            thread = threading.Thread(
                target=monitor_stream,
                args=(stream.room_url,),
                daemon=True
            )
            thread.start()
            print(f"Started monitoring thread for {stream.room_url}")

def monitor_stream(stream_url):
    app_ctx = app.app_context()
    app_ctx.push()
    
    try:
        stream = Stream.query.filter_by(room_url=stream_url).first()
        if not stream:
            return

        retries = 0
        max_retries = 5
        cooldown = 60  # 1 minute base

        while retries < max_retries:
            try:
                if not is_stream_online(stream_url):
                    raise Exception("Stream offline")
                
                # Detection logic here
                retries = 0  # Reset on success
                time.sleep(10)
                
            except Exception as e:
                print(f"Monitoring error: {str(e)}")
                retries += 1
                sleep_time = cooldown * (2 ** retries)
                print(f"Retrying in {sleep_time}s...")
                time.sleep(sleep_time)
                
        print(f"Stopped monitoring {stream_url}")
        
    finally:
        app_ctx.pop()

@app.route('/api/notification-events')
def notification_events():
    def generate():
        with app.app_context():
            last_id = 0
            while True:
                try:
                    cutoff = datetime.utcnow() - timedelta(seconds=2)
                    logs = Log.query.filter(
                        Log.timestamp >= cutoff,
                        Log.event_type == 'object_detection'
                    ).all()
                    
                    grouped = defaultdict(list)
                    for log in logs:
                        for det in log.details.get('detections', []):
                            grouped[(log.room_url, det['class'])].append(det['confidence'])
                    
                    for (stream, cls), confs in grouped.items():
                        yield f"data: {json.dumps({'type': 'detection','stream': stream,'object': cls,'confidence': max(confs),'id': last_id + 1})}\n\n"
                        last_id += 1
                    
                    time.sleep(1)
                except Exception as e:
                    print(f"SSE Error: {str(e)}")
                    time.sleep(5)
    return app.response_class(generate(), mimetype='text/event-stream')

# -------------------------------
# Main Execution
# -------------------------------
if __name__ == '__main__':
    with app.app_context():
        start_monitoring()
        start_notification_monitor()
    app.run(host='0.0.0.0', port=5000, threaded=True)
