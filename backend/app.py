import os
import sys
import json
import threading
import time
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from urllib.parse import urlparse
from models_db import db, User, Stream, Log, Assignment, ChatKeyword, FlaggedObject
from notifications import send_notification
from detection import visual, audio, chat
from functools import wraps
from datetime import timedelta
import requests
from bs4 import BeautifulSoup
from werkzeug.utils import secure_filename
import cv2
import base64
import numpy as np
from io import BytesIO
from PIL import Image
import pytesseract

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///monitor.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'supersecretkey'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
app.config['UPLOAD_FOLDER'] = 'uploads'
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov'}

db.init_app(app)

with app.app_context():
    db.create_all()
    if not User.query.filter_by(username='admin').first():
        admin_user = User(username='admin', password='admin', role='admin')
        db.session.add(admin_user)
    if not User.query.filter_by(username='agent').first():
        agent_user = User(username='agent', password='agent', role='agent')
        db.session.add(agent_user)
    db.session.commit()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def login_required(role=None):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                return jsonify({'message': 'Authentication required'}), 401
            if role:
                user = User.query.get(session['user_id'])
                if user.role != role:
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

# visual.py
def detect_frame(frame):
    results = model(frame)
    # Compares detected objects against flagged list
    for *box, conf, cls in detections:
        class_name = model.names[int(cls)].lower()
        flagged_obj = next((obj for obj in flagged_objects if obj['name'] == class_name), None)

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(username=data.get('username'), password=data.get('password')).first()
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
        user = User.query.get(session['user_id'])
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
    if not (username := data.get('username')) or not (password := data.get('password')):
        return jsonify({'message': 'Username and password required'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'message': 'Username exists'}), 400
    
    agent = User(username=username, password=password, role='agent')
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
        if platform == 'Chaturbate' and 'chaturbate.com/' not in new_url:
            return jsonify({'message': 'Invalid Chaturbate URL'}), 400
        if platform == 'Stripchat' and 'stripchat.com/' not in new_url:
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
    
    visual.CONF_THRESHOLD = float(request.args.get('threshold', 0.5))
    results = visual.detect_frame(frame)
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
        results = visual.detect_frame(frame)
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
                    results = visual.detect_frame(frame)
                    yield "data: " + json.dumps(results) + "\n\n"
                except Exception as e:
                    yield "data: " + json.dumps({"error": f"Detection error: {str(e)}"}) + "\n\n"
                
                time.sleep(0.5)
        finally:
            cap.release()
    
    return app.response_class(generate(), mimetype='text/event-stream')

@app.route('/api/scrape', methods=['POST'])
@login_required()
def scrape_stream():
    data = request.get_json()
    if not (room_url := data.get('room_url', '').strip()):
        return jsonify({'message': 'Room URL required'}), 400
    
    try:
        res = requests.get(room_url, timeout=10)
        if res.status_code != 200:
            return jsonify({'message': 'Invalid response from platform'}), 400
        
        soup = BeautifulSoup(res.text, 'html.parser')
        streamer = room_url.rstrip('/').split('/')[-1]
        
        return jsonify({
            'room_url': room_url,
            'streamer': streamer,
            'thumbnail': f'https://jpeg.live.mmcdn.com/stream?room={streamer}&f=0.8399472484345041',
            'title': soup.title.string if soup.title else ''
        })
    except Exception as e:
        return jsonify({'message': f'Scraping failed: {str(e)}'}), 500

def monitor_stream(stream_url):
    app_ctx = app.app_context()
    app_ctx.push()  # Push once at the beginning
    
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
            'chaturbate': (0.7, 0.1, 0.98, 0.9),  # Right-side chat area
            'stripchat': (0.65, 0.05, 0.95, 0.85)  # Right-side chat area
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
                    # Update detection models from DB
                    visual.update_flagged_objects()
                    update_flagged_keywords()

                    # Perform object detection
                    visual_results = visual.detect_frame(frame)
                    detections.extend(visual_results)

                    # OCR Chat Monitoring
                    platform = stream.platform.lower()
                    if platform in chat_coords:
                        h, w = frame.shape[:2]
                        x1, y1, x2, y2 = chat_coords[platform]
                        
                        # Extract chat region
                        chat_roi = frame[
                            int(y1*h):int(y2*h),
                            int(x1*w):int(x2*w)
                        ]
                        
                        # Perform OCR detection
                        _, flagged_keywords = ocr_detect_frame(chat_roi)
                        for kw in flagged_keywords:
                            detections.append({
                                'class': f"CHAT: {kw}",
                                'confidence': 1.0,
                                'box': [80, 90, 100, 95]  # Bottom-right position
                            })

                    # Handle detections
                    if detections:
                        log = Log(
                            room_url=stream_url,
                            event_type='combined_detection',
                            details={'detections': detections}
                        )
                        db.session.add(log)
                        
                        # Throttle notifications
                        if time.time() - last_notification > 60:
                            send_notification(
                                f"Alerts in {stream_url}: {len(detections)} items detected"
                            )
                            last_notification = time.time()
                        
                        db.session.commit()

                except Exception as e:
                    print(f"Detection error in {stream_url}: {str(e)}")
                    db.session.rollback()

                time.sleep(10)  # Processing interval

        finally:
            cap.release()
            print(f"Stopped monitoring {stream_url}")
    finally:
        app_ctx.pop()  # Ensure we pop the context when done

@app.route('/api/detection-events', methods=['GET'])
def detection_events():
    def generate():
        app_ctx = app.app_context()
        app_ctx.push()  # Push a single application context that lasts for the generator's lifetime
        
        try:
            while True:
                try:
                    logs = Log.query.filter(
                        Log.event_type.in_(['object_detection', 'combined_detection'])
                    ).order_by(Log.timestamp.desc()).limit(10).all()
                    
                    for log in logs:
                        yield f"data: {json.dumps({'stream_url': log.room_url, 'detections': log.details['detections']})}\n\n"

                    
                    time.sleep(2)
                except Exception as e:
                    print(f"SSE Error: {str(e)}")
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
                    time.sleep(5)
        finally:
            app_ctx.pop()  # Ensure we clean up the context when the generator is done

    return app.response_class(generate(), mimetype='text/event-stream')

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

if __name__ == '__main__':
    with app.app_context():
        start_monitoring()
    app.run(host='0.0.0.0', port=5000, threaded=True)