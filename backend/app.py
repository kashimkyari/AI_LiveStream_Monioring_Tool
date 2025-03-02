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
from notifications import send_notification

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
    'pool_size': 20,           # Increased pool size
    'max_overflow': 40,        # Increased overflow limit
    'pool_timeout': 60,        # Increased timeout (seconds)
    'pool_recycle': 3600,      # Recycle connections every hour
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
    if not User.query.filter_by(username='admin').first():
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
    if not User.query.filter_by(username='agent').first():
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
model = torch.hub.load('ultralytics/yolov5', 'yolov5s', pretrained=True, trust_repo=True)
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
    results = model(frame)
    detections = results.xyxy[0]
    detected = []
    for *box, conf, cls in detections:
        class_name = model.names[int(cls)].lower()
        flagged_obj = next((obj for obj in flagged_objects if obj['name'] == class_name), None)
        if flagged_obj and conf.item() >= flagged_obj['threshold']:
            detected.append({
                'class': class_name,
                'confidence': conf.item(),
                'box': [float(x) for x in box],
                'threshold': flagged_obj['threshold']
            })
    return detected

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

@app.route('/api/test/visual/stream', methods=['GET'])
@login_required(role='admin')
def stream_visual():
    def generate():
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            yield "data: " + json.dumps({"error": "Could not open video source"}) + "\n\n"
            return
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    yield "data: " + json.dumps({"error": "Frame capture failed"}) + "\n\n"
                    continue
                
                try:
                    results = detect_frame(frame)
                    yield "data: " + json.dumps(results) + "\n\n"
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
        with app.app_context():  # Use context manager
            while True:
                try:
                    logs = Log.query.filter(
                        Log.event_type.in_(['object_detection', 'combined_detection'])
                    ).order_by(Log.timestamp.desc()).limit(10).all()
                    
                    for log in logs:
                        yield f"data: {json.dumps({'stream_url': log.room_url, 'detections': log.details.get('detections', [])})}\n\n"
                    time.sleep(2)
                except Exception as e:
                    print(f"SSE Error: {str(e)}")
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
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
            print(f"Stream {stream_url} not found in database")
            return

        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            print(f"Failed to open video stream: {stream_url}")
            return

        last_notification = time.time()
        chat_coords = {
            'chaturbate': (0.7, 0.1, 0.98, 0.9),
            'stripchat': (0.65, 0.05, 0.95, 0.85)
        }

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    print(f"Frame read failed for {stream_url}")
                    time.sleep(10)
                    continue

                detections = []
                try:
                    update_flagged_objects()
                    update_flagged_keywords()

                    visual_results = detect_frame(frame)
                    detections.extend(visual_results)

                    platform = stream.platform.lower()
                    if platform in chat_coords:
                        h, w = frame.shape[:2]
                        x1, y1, x2, y2 = chat_coords[platform]
                        chat_roi = frame[int(y1*h):int(y2*h), int(x1*w):int(x2*w)]
                        chat_text = pytesseract.image_to_string(chat_roi)
                        chat_detection = detect_chat(chat_text)
                        if chat_detection.get('status') == 'flagged':
                            for kw in chat_detection.get('keywords', []):
                                detections.append({
                                    'class': f"CHAT: {kw}",
                                    'confidence': 1.0,
                                    'box': [80, 90, 100, 95]
                                })

                    if detections:
                        log = Log(
                            room_url=stream_url,
                            event_type='combined_detection',
                            details={'detections': detections}
                        )
                        db.session.add(log)
                        
                        if time.time() - last_notification > 60:
                            send_notification(f"Alerts in {stream_url}: {len(detections)} items detected")
                            last_notification = time.time()
                        
                        db.session.commit()

                except Exception as e:
                    print(f"Detection error in {stream_url}: {str(e)}")
                    db.session.rollback()

                time.sleep(10)
        finally:
            cap.release()
            print(f"Stopped monitoring {stream_url}")
    finally:
        app_ctx.pop()

# -------------------------------
# Main Execution
# -------------------------------
if __name__ == '__main__':
    with app.app_context():
        start_monitoring()
    app.run(host='0.0.0.0', port=5000, threaded=True)
