import os
import logging
import requests
import cv2
import numpy as np
from io import BytesIO
from PIL import Image
from config import app
from models import Log, TelegramRecipient, Stream, Assignment, User
from extensions import db
from telegram import Bot
from twilio.rest import Client

# Telegram Configuration
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "YOUR_TELEGRAM_TOKEN_HERE")

def get_bot(token=None):
    """Return a Telegram Bot instance using the provided token or environment variable."""
    if token is None:
        token = TELEGRAM_TOKEN
    return Bot(token=token)

def send_text_message(msg, chat_id, token=None):
    """Send a simple text message to the specified Telegram chat ID."""
    bot_instance = get_bot(token)
    bot_instance.sendMessage(chat_id=chat_id, text=msg)

# Twilio WhatsApp Configuration
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER")

def send_whatsapp_message(phone_number, message):
    """Send a WhatsApp message using Twilio API."""
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        client.messages.create(
            from_=f"whatsapp:{TWILIO_WHATSAPP_NUMBER}",
            body=message,
            to=f"whatsapp:{phone_number}"
        )
    except Exception as e:
        logging.error("WhatsApp notification error: %s", e)

def send_full_telegram_notification_sync(log, detections):
    """
    Build a notification caption from log details and detections,
    fetch a thumbnail image, annotate it with detection boxes, and send it as a photo via Telegram.
    """
    try:
        room_url = log.room_url
        streamer = room_url.rstrip("/").split("/")[-1]
        stream = Stream.query.filter_by(room_url=room_url).first()
        if stream:
            platform = stream.type or "Unknown"
            streamer_name = stream.streamer_username
            assignment = Assignment.query.filter_by(stream_id=stream.id).first()
            agent = assignment.agent if assignment else None
        else:
            platform = "Unknown"
            streamer_name = streamer
            agent = None

        agent_name = f"{agent.firstname} {agent.lastname}" if agent else "None"
        agent_phone = agent.phonenumber if agent else "None"
        timestamp = log.timestamp.strftime("%Y-%m-%d %H:%M:%S")

        caption = "🚨 Detection Alert!\nDetections:\n"
        for det in detections:
            caption += f"- {det.get('class', 'object')}: {det.get('confidence', 0):.2f}\n"
        caption += (
            f"Streamer: {streamer_name}\n"
            f"Platform: {platform}\n"
            f"Agent: {agent_name}\n"
            f"Agent Phone: {agent_phone}\n"
            f"Timestamp: {timestamp}"
        )

        thumbnail_url = f"https://jpeg.live.mmcdn.com/stream?room={streamer}"
        response = requests.get(thumbnail_url, stream=True, timeout=128)
        if response.status_code == 200:
            image_data = response.content
            nparr = np.frombuffer(image_data, np.uint8)
            img_cv = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            # Annotate the image with bounding boxes and labels for each detection.
            for detection in detections:
                box = detection.get("box")
                class_name = detection.get("class", "object")
                confidence = detection.get("confidence", 0)
                if box:
                    x1, y1, x2, y2 = map(int, box)
                    cv2.rectangle(img_cv, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    label = "{}: {:.2f}".format(class_name, confidence)
                    (w, h), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
                    cv2.rectangle(img_cv, (x1, y1 - h - baseline), (x1 + w, y1), (0, 255, 0), -1)
                    cv2.putText(img_cv, label, (x1, y1 - baseline),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
            retval, buffer = cv2.imencode(".jpg", img_cv)
            annotated_image_io = BytesIO(buffer.tobytes())
            annotated_image_io.seek(0)
            img_io = annotated_image_io
        else:
            img_io = thumbnail_url

        bot_instance = get_bot()
        if agent:
            agent_recipient = TelegramRecipient.query.filter_by(telegram_username=agent.username).first()
            if agent_recipient:
                try:
                    bot_instance.send_photo(chat_id=agent_recipient.chat_id, photo=img_io, caption=caption)
                except Exception as e:
                    logging.error("Error sending to agent: %s", e)
        admin_recipients = TelegramRecipient.query.all()
        for recipient in admin_recipients:
            if agent and recipient.telegram_username == agent.username:
                continue
            try:
                bot_instance.send_photo(chat_id=recipient.chat_id, photo=img_io, caption=caption)
            except Exception as e:
                logging.error("Error sending to admin: %s", e)

    except Exception as e:
        logging.error("Notification error: %s", e)

def send_chat_telegram_notification(image_path, description):
    """
    Send a chat notification by reading the image from disk and sending it via Telegram.
    This function is used by routes to notify when flagged keywords are detected in chat images.
    """
    try:
        with open(image_path, "rb") as image_file:
            bot_instance = get_bot()
            bot_instance.send_photo(chat_id=os.getenv("TELEGRAM_CHAT_ID"), photo=image_file, caption=description)
    except Exception as e:
        logging.error("Error sending chat telegram notification: %s", e)

def send_notifications(log, detections):
    """
    Unified notification function that sends alerts via both WhatsApp and Telegram.
    Agents receive notifications based on their assignment; admins receive all alerts.
    """
    try:
        room_url = log.room_url
        stream = Stream.query.filter_by(room_url=room_url).first()
        assignment = Assignment.query.filter_by(stream_id=stream.id).first() if stream else None
        agent = assignment.agent if assignment else None

        timestamp = log.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        detections_text = "\n".join([f"- {d['class']}: {d['confidence']:.2f}" for d in detections])
        message = (f"🚨 Detection Alert!\nDetections:\n{detections_text}\n"
                   f"Streamer: {stream.streamer_username}\nTimestamp: {timestamp}")

        # Send notifications to the agent
        if agent:
            agent_telegram = TelegramRecipient.query.filter_by(telegram_username=agent.username).first()
            if agent_telegram:
                send_text_message(message, agent_telegram.chat_id)
            send_whatsapp_message(agent.phonenumber, message)

        # Send notifications to all admins
        admin_recipients = TelegramRecipient.query.all()
        for admin in admin_recipients:
            if agent and admin.telegram_username == agent.username:
                continue
            send_text_message(message, admin.chat_id)
            admin_user = User.query.filter_by(username=admin.telegram_username).first()
            if admin_user:
                send_whatsapp_message(admin_user.phonenumber, message)
    except Exception as e:
        logging.error("Error sending notifications: %s", e)
