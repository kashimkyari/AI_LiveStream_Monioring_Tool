# routes.py
import os
import time
import json
import uuid
import base64
import shutil
from collections import defaultdict
from datetime import datetime, timedelta
import cv2
import numpy as np
from PIL import Image
import m3u8
import requests
from flask import request, jsonify, session, send_from_directory, current_app
from config import app
from extensions import db
from models import User, Stream, Assignment, Log, ChatKeyword, FlaggedObject, TelegramRecipient
from utils import allowed_file, login_required
from notifications import send_chat_telegram_notification
from scraping import scrape_stripchat_data, run_scrape_job, scrape_jobs
from detection import detect_frame, detect_chat, update_flagged_objects, refresh_keywords
from monitoring import start_monitoring, start_notification_monitor

@app.route("/api/detect-chat", methods=["POST"])
def detect_chat_from_image():
    if "chat_image" not in request.files:
        return jsonify({"message": "No chat image provided"}), 400
    file = request.files["chat_image"]
    filename = os.path.basename(file.filename)
    if not filename:
        return jsonify({"message": "Invalid filename"}), 400
    timestamp = int(time.time() * 1000)
    new_filename = f"{timestamp}_{filename}"
    chat_image_path = os.path.join(app.config["CHAT_IMAGES_FOLDER"], new_filename)
    file.save(chat_image_path)
    image = Image.open(chat_image_path)
    import pytesseract
    ocr_text = pytesseract.image_to_string(image)
    refresh_keywords()
    flagged_keywords = [kw.keyword for kw in ChatKeyword.query.all()]
    detected_keywords = [kw for kw in flagged_keywords if kw.lower() in ocr_text.lower()]
    if detected_keywords:
        flagged_filename = f"flagged_{new_filename}"
        flagged_filepath = os.path.join(app.config["FLAGGED_CHAT_IMAGES_FOLDER"], flagged_filename)
        shutil.move(chat_image_path, flagged_filepath)
        description = (
            "Chat flagged: Detected keywords " + ", ".join(detected_keywords) +
            ". OCR text: " + ocr_text
        )
        log_entry = Log(
            room_url="chat",
            event_type="chat_detection",
            details={"keywords": detected_keywords, "ocr_text": ocr_text},
        )
        db.session.add(log_entry)
        db.session.commit()
        send_chat_telegram_notification(flagged_filepath, description)
        return jsonify({"message": "Flagged keywords detected", "keywords": detected_keywords})
    else:
        return jsonify({"message": "No flagged keywords detected"})

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get("username")
    user = User.query.filter(
        (User.username == username) | (User.email == username)
    ).filter_by(password=data.get("password")).first()
    if user:
        session.permanent = True
        session["user_id"] = user.id
        return jsonify({"message": "Login successful", "role": user.role})
    return jsonify({"message": "Invalid credentials"}), 401

@app.route("/api/logout", methods=["POST"])
def logout():
    session.pop("user_id", None)
    return jsonify({"message": "Logged out"})

@app.route("/api/session", methods=["GET"])
def check_session():
    if "user_id" in session:
        user = db.session.get(User, session["user_id"])
        if user is None:
            return jsonify({"logged_in": False}), 401
        return jsonify({"logged_in": True, "user": user.serialize()})
    return jsonify({"logged_in": False}), 401

@app.route("/api/agents", methods=["GET"])
@login_required(role="admin")
def get_agents():
    agents = User.query.filter_by(role="agent").all()
    return jsonify([agent.serialize() for agent in agents])

@app.route("/api/agents", methods=["POST"])
@login_required(role="admin")
def create_agent():
    data = request.get_json()
    required_fields = ["username", "password", "firstname", "lastname", "email", "phonenumber"]
    if any(field not in data for field in required_fields):
        return jsonify({"message": "Missing required fields"}), 400
    if User.query.filter((User.username == data["username"]) | (User.email == data["email"])).first():
        return jsonify({"message": "Username or email exists"}), 400
    agent = User(
        username=data["username"],
        password=data["password"],
        firstname=data["firstname"],
        lastname=data["lastname"],
        email=data["email"],
        phonenumber=data["phonenumber"],
        staffid=data.get("staffid"),
        role="agent",
    )
    db.session.add(agent)
    db.session.commit()
    return jsonify({"message": "Agent created", "agent": agent.serialize()}), 201

@app.route("/api/agents/<int:agent_id>", methods=["PUT"])
@login_required(role="admin")
def update_agent(agent_id):
    agent = User.query.filter_by(id=agent_id, role="agent").first()
    if not agent:
        return jsonify({"message": "Agent not found"}), 404
    data = request.get_json()
    updates = {}
    if "username" in data and (new_uname := data["username"].strip()):
        agent.username = new_uname
        updates["username"] = new_uname
    if "password" in data and (new_pwd := data["password"].strip()):
        agent.password = new_pwd
        updates["password"] = "updated"
    db.session.commit()
    return jsonify({"message": "Agent updated", "updates": updates})

@app.route("/api/agents/<int:agent_id>", methods=["DELETE"])
@login_required(role="admin")
def delete_agent(agent_id):
    agent = User.query.filter_by(id=agent_id, role="agent").first()
    if not agent:
        return jsonify({"message": "Agent not found"}), 404
    db.session.delete(agent)
    db.session.commit()
    return jsonify({"message": "Agent deleted"})

@app.route("/api/streams", methods=["GET"])
@login_required(role="admin")
def get_streams():
    streams = Stream.query.all()
    return jsonify([stream.serialize() for stream in streams])

@app.route("/api/streams", methods=["POST"])
@login_required(role="admin")
def create_stream():
    data = request.get_json()
    room_url = data.get("room_url", "").strip().lower()
    if not room_url:
        return jsonify({"message": "Room URL required"}), 400
    platform = data.get("platform", "Chaturbate").strip()
    if platform.lower() == "chaturbate" and "chaturbate.com/" not in room_url:
        return jsonify({"message": "Invalid Chaturbate URL"}), 400
    if platform.lower() == "stripchat" and "stripchat.com/" not in room_url:
        return jsonify({"message": "Invalid Stripchat URL"}), 400
    streamer = room_url.rstrip("/").split("/")[-1]
    if Stream.query.filter_by(room_url=room_url).first():
        return jsonify({"message": "Stream exists"}), 400
    stream = Stream(
        room_url=room_url,
        streamer_username=streamer,
        type=platform.lower()
    )
    if platform.lower() == "stripchat":
        scraped_data = scrape_stripchat_data(room_url)
        if scraped_data:
            stream.streamer_uid = scraped_data["streamer_uid"]
            stream.edge_server_url = scraped_data["edge_server_url"]
            stream.blob_url = scraped_data.get("blob_url")
            stream.static_thumbnail = scraped_data.get("static_thumbnail")
        else:
            return jsonify({"message": "Failed to scrape Stripchat details for the provided URL"}), 500
    db.session.add(stream)
    db.session.commit()
    return jsonify({
        "message": "Stream created",
        "stream": stream.serialize(),
        "thumbnail": f"https://jpeg.live.mmcdn.com/stream?room={streamer}&f=0.8399472484345041"
    }), 201

@app.route("/api/streams/<int:stream_id>", methods=["PUT"])
@login_required(role="admin")
def update_stream(stream_id):
    stream = Stream.query.get(stream_id)
    if not stream:
        return jsonify({"message": "Stream not found"}), 404
    data = request.get_json()
    if "room_url" in data and (new_url := data["room_url"].strip()):
        platform = data.get("platform", stream.type).strip()
        if platform.lower() == "chaturbate" and "chaturbate.com/" not in new_url:
            return jsonify({"message": "Invalid Chaturbate URL"}), 400
        if platform.lower() == "stripchat" and "stripchat.com/" not in new_url:
            return jsonify({"message": "Invalid Stripchat URL"}), 400
        stream.room_url = new_url
        stream.streamer_username = new_url.rstrip("/").split("/")[-1]
        if stream.type.lower() == "stripchat":
            scraped_data = scrape_stripchat_data(new_url)
            if scraped_data:
                stream.streamer_uid = scraped_data["streamer_uid"]
                stream.edge_server_url = scraped_data["edge_server_url"]
                stream.blob_url = scraped_data.get("blob_url")
                stream.static_thumbnail = scraped_data.get("static_thumbnail")
            else:
                return jsonify({"message": "Failed to scrape Stripchat details for updated URL"}), 500
    if "platform" in data:
        stream.type = data["platform"].strip().lower()
    db.session.commit()
    return jsonify({"message": "Stream updated", "stream": stream.serialize()})

@app.route("/api/streams/<int:stream_id>", methods=["DELETE"])
@login_required(role="admin")
def delete_stream(stream_id):
    stream = Stream.query.get(stream_id)
    if not stream:
        return jsonify({"message": "Stream not found"}), 404
    assignments = stream.assignments
    for assignment in assignments:
        db.session.delete(assignment)
    db.session.delete(stream)
    db.session.commit()
    return jsonify({"message": "Stream deleted"})

@app.route("/api/scrape/stripchat", methods=["POST"])
@login_required(role="admin")
def scrape_stripchat_endpoint():
    data = request.get_json()
    url = data.get("room_url", "").strip().lower()
    if not url:
        return jsonify({"message": "Room URL required"}), 400
    if "stripchat.com/" not in url:
        return jsonify({"message": "Invalid Stripchat URL"}), 400
    job_id = str(uuid.uuid4())
    scrape_jobs[job_id] = {"progress": 0, "message": "Job created"}
    import threading
    threading.Thread(target=run_scrape_job, args=(job_id, url), daemon=True).start()
    return jsonify({"message": "Scrape job started", "job_id": job_id})

@app.route("/api/scrape/progress/<job_id>", methods=["GET"])
@login_required(role="admin")
def get_scrape_progress(job_id):
    job = scrape_jobs.get(job_id)
    if not job:
        return jsonify({"message": "Job ID not found"}), 404
    return jsonify(job)

@app.route("/api/keywords", methods=["GET"])
@login_required(role="admin")
def get_keywords():
    keywords = ChatKeyword.query.all()
    return jsonify([kw.serialize() for kw in keywords])

@app.route("/api/keywords", methods=["POST"])
@login_required(role="admin")
def create_keyword():
    data = request.get_json()
    keyword = data.get("keyword", "").strip()
    if not keyword:
        return jsonify({"message": "Keyword required"}), 400
    if ChatKeyword.query.filter_by(keyword=keyword).first():
        return jsonify({"message": "Keyword exists"}), 400
    kw = ChatKeyword(keyword=keyword)
    db.session.add(kw)
    db.session.commit()
    refresh_keywords()
    return jsonify({"message": "Keyword added", "keyword": kw.serialize()}), 201

@app.route("/api/keywords/<int:keyword_id>", methods=["PUT"])
@login_required(role="admin")
def update_keyword(keyword_id):
    kw = ChatKeyword.query.get(keyword_id)
    if not kw:
        return jsonify({"message": "Keyword not found"}), 404
    data = request.get_json()
    new_kw = data.get("keyword", "").strip()
    if not new_kw:
        return jsonify({"message": "New keyword required"}), 400
    kw.keyword = new_kw
    db.session.commit()
    refresh_keywords()
    return jsonify({"message": "Keyword updated", "keyword": kw.serialize()})

@app.route("/api/keywords/<int:keyword_id>", methods=["DELETE"])
@login_required(role="admin")
def delete_keyword(keyword_id):
    kw = ChatKeyword.query.get(keyword_id)
    if not kw:
        return jsonify({"message": "Keyword not found"}), 404
    db.session.delete(kw)
    db.session.commit()
    refresh_keywords()
    return jsonify({"message": "Keyword deleted"})

@app.route("/api/objects", methods=["GET"])
@login_required(role="admin")
def get_objects():
    objects = FlaggedObject.query.all()
    return jsonify([obj.serialize() for obj in objects])

@app.route("/api/objects", methods=["POST"])
@login_required(role="admin")
def create_object():
    data = request.get_json()
    obj_name = data.get("object_name", "").strip()
    if not obj_name:
        return jsonify({"message": "Object name required"}), 400
    if FlaggedObject.query.filter_by(object_name=obj_name).first():
        return jsonify({"message": "Object exists"}), 400
    obj = FlaggedObject(object_name=obj_name)
    db.session.add(obj)
    db.session.commit()
    return jsonify({"message": "Object added", "object": obj.serialize()}), 201

@app.route("/api/objects/<int:object_id>", methods=["PUT"])
@login_required(role="admin")
def update_object(object_id):
    obj = FlaggedObject.query.get(object_id)
    if not obj:
        return jsonify({"message": "Object not found"}), 404
    data = request.get_json()
    new_name = data.get("object_name", "").strip()
    if not new_name:
        return jsonify({"message": "New name required"}), 400
    obj.object_name = new_name
    db.session.commit()
    return jsonify({"message": "Object updated", "object": obj.serialize()})

@app.route("/api/objects/<int:object_id>", methods=["DELETE"])
@login_required(role="admin")
def delete_object(object_id):
    obj = FlaggedObject.query.get(object_id)
    if not obj:
        return jsonify({"message": "Object not found"}), 404
    db.session.delete(obj)
    db.session.commit()
    return jsonify({"message": "Object deleted"})

@app.route("/api/telegram_recipients", methods=["GET"])
@login_required(role="admin")
def get_telegram_recipients():
    recipients = TelegramRecipient.query.all()
    return jsonify([r.serialize() for r in recipients])

@app.route("/api/telegram_recipients", methods=["POST"])
@login_required(role="admin")
def create_telegram_recipient():
    data = request.get_json()
    username = data.get("telegram_username")
    chat_id = data.get("chat_id")
    if not username or not chat_id:
        return jsonify({"message": "Telegram username and chat_id required"}), 400
    if TelegramRecipient.query.filter_by(telegram_username=username).first():
        return jsonify({"message": "Recipient exists"}), 400
    recipient = TelegramRecipient(telegram_username=username, chat_id=chat_id)
    db.session.add(recipient)
    db.session.commit()
    return jsonify({"message": "Recipient added", "recipient": recipient.serialize()}), 201

@app.route("/api/telegram_recipients/<int:recipient_id>", methods=["DELETE"])
@login_required(role="admin")
def delete_telegram_recipient(recipient_id):
    recipient = TelegramRecipient.query.get(recipient_id)
    if not recipient:
        return jsonify({"message": "Recipient not found"}), 404
    db.session.delete(recipient)
    db.session.commit()
    return jsonify({"message": "Recipient deleted"})

@app.route("/api/dashboard", methods=["GET"])
@login_required(role="admin")
def get_dashboard():
    streams = Stream.query.all()
    data = []
    for stream in streams:
        assignment = stream.assignments[0] if stream.assignments else None
        data.append({
            **stream.serialize(),
            "agent": assignment.agent.serialize() if assignment else None,
            "confidence": 0.8
        })
    return jsonify({"ongoing_streams": len(data), "streams": data})

@app.route("/api/agent/dashboard", methods=["GET"])
@login_required(role="agent")
def get_agent_dashboard():
    agent_id = session["user_id"]
    assignments = Assignment.query.filter_by(agent_id=agent_id).all()
    return jsonify({
        "ongoing_streams": len(assignments),
        "assignments": [a.stream.serialize() for a in assignments if a.stream]
    })

@app.route("/api/test/visual", methods=["POST"])
@login_required(role="admin")
def test_visual():
    if "video" not in request.files:
        return jsonify({"message": "No file uploaded"}), 400
    file = request.files["video"]
    if not allowed_file(file.filename):
        return jsonify({"message": "Invalid file type"}), 400
    filename = file.filename
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    file.save(filepath)
    import cv2
    cap = cv2.VideoCapture(filepath)
    ret, frame = cap.read()
    cap.release()
    os.remove(filepath)
    if not ret:
        return jsonify({"message": "Error reading video"}), 400
    results = detect_frame(frame)
    return jsonify({"results": results})

@app.route("/api/test/visual/frame", methods=["POST"])
@login_required(role="admin")
def test_visual_frame():
    if "frame" not in request.files:
        return jsonify({"message": "No frame uploaded"}), 400
    file = request.files["frame"]
    try:
        img = Image.open(file.stream).convert("RGB")
        frame = np.array(img)
        results = detect_frame(frame)
        return jsonify({"results": results})
    except Exception as e:
        return jsonify({"message": "Processing error: " + str(e)}), 500

@app.route("/api/test/visual/stream", methods=["GET"])
@login_required(role="admin")
def stream_visual():
    def generate():
        import json
        import time
        import cv2
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
                        if "class" in det:
                            detected_objects_set.add(det["class"])
                    payload = {
                        "results": results,
                        "detected_objects": list(detected_objects_set),
                        "model": "yolov10m"
                    }
                    yield "data: " + json.dumps(payload) + "\n\n"
                except Exception as e:
                    yield "data: " + json.dumps({"error": "Detection error: " + str(e)}) + "\n\n"
                time.sleep(0.5)
        finally:
            cap.release()
    return current_app.response_class(generate(), mimetype="text/event-stream")

@app.route("/detection-images/<filename>")
def serve_detection_image(filename):
    return send_from_directory("detections", filename)

@app.route("/api/detection-events", methods=["GET"])
def detection_events():
    def generate():
        import json
        import time
        while True:
            try:
                cutoff = datetime.utcnow() - timedelta(seconds=15)
                logs = Log.query.filter(
                    Log.timestamp >= cutoff,
                    Log.event_type == "object_detection"
                ).all()
                stream_detections = defaultdict(list)
                for log in logs:
                    stream_detections[log.room_url].extend(log.details.get("detections", []))
                for url, detections in stream_detections.items():
                    payload = json.dumps({
                        "stream_url": url,
                        "detections": detections
                    })
                    yield f"data: {payload}\n\n"
                time.sleep(2)
            except Exception as e:
                time.sleep(5)
    return current_app.response_class(generate(), mimetype="text/event-stream")

@app.route("/api/detect", methods=["POST"])
def unified_detect():
    data = request.get_json()
    text = data.get("text", "")
    visual_frame = data.get("visual_frame", None)
    audio_flag = None
    visual_results = []
    if visual_frame:
        visual_results = detect_frame(np.array(visual_frame))
    chat_results = detect_chat(text)
    return jsonify({
        "audio": audio_flag,
        "chat": chat_results,
        "visual": visual_results
    })

@app.route("/api/detect-objects", methods=["POST"])
@login_required()
def detect_objects():
    try:
        data = request.get_json()
        if "image_data" not in data:
            return jsonify({"error": "Missing image data"}), 400
        try:
            img_bytes = base64.b64decode(data["image_data"])
            img = Image.open(BytesIO(img_bytes)).convert("RGB")
            frame = np.array(img)
        except Exception as e:
            return jsonify({"error": "Invalid image data"}), 400
        update_flagged_objects()
        results = detect_frame(frame)
        height, width = frame.shape[:2]
        detections = []
        for det in results:
            try:
                x1 = (det["box"][0] / width) * 100
                y1 = (det["box"][1] / height) * 100
                x2 = (det["box"][2] / width) * 100
                y2 = (det["box"][3] / height) * 100
                detections.append({
                    "class": det["class"],
                    "confidence": det["confidence"],
                    "box": [x1, y1, x2, y2],
                    "source": "ai"
                })
            except KeyError:
                continue
        return jsonify({"detections": detections})
    except Exception as e:
        return jsonify({"error": "Processing failed"}), 500

@app.route("/api/notification-events")
def notification_events():
    def generate():
        import json
        import time
        while True:
            try:
                cutoff = datetime.utcnow() - timedelta(seconds=30)
                logs = Log.query.filter(
                    Log.timestamp >= cutoff,
                    Log.event_type == "object_detection"
                ).order_by(Log.timestamp.desc()).all()
                for log in logs:
                    for det in log.details.get("detections", []):
                        payload = {
                            "type": "detection",
                            "stream": log.room_url,
                            "object": det.get("class", "object"),
                            "confidence": det.get("confidence", 0),
                            "id": log.id,
                        }
                        yield "data: " + json.dumps(payload) + "\n\n"
                time.sleep(1)
            except Exception as e:
                time.sleep(5)
    return current_app.response_class(generate(), mimetype="text/event-stream")

@app.route("/health")
def health():
    return "OK", 200

@app.route("/api/livestream", methods=["POST"])
def get_livestream():
    data = request.get_json()
    if not data or "url" not in data:
        return jsonify({"error": "Missing M3U8 URL"}), 400
    m3u8_url = data["url"]
    try:
        response = requests.get(m3u8_url, timeout=10)
        if response.status_code != 200:
            return jsonify({"error": "Failed to fetch M3U8 file"}), 500
        playlist = m3u8.loads(response.text)
        if not playlist.playlists:
            return jsonify({"error": "No valid streams found"}), 400
        stream_url = playlist.playlists[0].uri
        return jsonify({"stream_url": stream_url})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
