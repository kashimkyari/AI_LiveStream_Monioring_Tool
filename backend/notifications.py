import os
import logging
from config import app
from models import Log, TelegramRecipient, Stream, Assignment, User
from extensions import db
from telegram import Bot
from concurrent.futures import ThreadPoolExecutor

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
executor = ThreadPoolExecutor(max_workers=5)  # Thread pool for notifications


def get_bot(token=None):
    """Return a Telegram Bot instance."""
    if token is None:
        token = TELEGRAM_TOKEN
    return Bot(token=token)

def send_text_message(msg, chat_id, token=None):
    try:
        bot = Bot(token or TELEGRAM_TOKEN)
        bot.sendMessage(chat_id=chat_id, text=msg)
        logging.info(f"Telegram message sent to chat_id {chat_id}.")
        return True
    except Exception as e:
        logging.error(f"Failed to send Telegram message to chat_id {chat_id}: {e}")
        return False

def send_notifications(log_entry, detections=None):
    try:
        details = log_entry.details
        streamer = details.get('streamer_name', 'Unknown Streamer')
        platform = details.get('platform', 'Unknown Platform').capitalize()
        confidence = details.get('confidence', 0)
        
        if log_entry.event_type == 'object_detection':
            message = f"🚨 Visual Detection on {platform}\n"
            message += f"Streamer: {streamer}\n"
            message += f"Detected {len(detections)} objects\n"
            message += f"Confidence: {confidence:.0%}"
            
            # Include image if available
            if details.get('annotated_image'):
                send_telegram_image(
                    details['annotated_image'], 
                    message,
                    log_entry.id
                )
            else:
                send_text_message(message)
                
        elif log_entry.event_type == 'audio_detection':
            message = f"🔊 Audio Detection on {platform}\n"
            message += f"Streamer: {streamer}\n"
            message += f"Keyword: {details['keyword']}\n"
            message += f"Confidence: {confidence:.0%}"
            send_text_message(message)
            
    except Exception as e:
        logging.error(f"Notification error: {str(e)}")