from config import app
from extensions import db
from models import User
from routes import *
from cleanup import start_chat_cleanup_thread, start_detection_cleanup_thread
import logging

with app.app_context():
    db.create_all()
    # Create default admin if none exists.
    if not User.query.filter_by(role="admin").first():
        admin = User(
            username="admin",
            password="admin",
            email="admin@example.com",
            firstname="Admin",
            lastname="User",
            phonenumber="000-000-0000",
            role="admin",
        )
        db.session.add(admin)
        db.session.commit()
    # Create default agent if none exists.
    if not User.query.filter_by(role="agent").first():
        agent = User(
            username="agent",
            password="agent",
            email="agent@example.com",
            firstname="Agent",
            lastname="User",
            phonenumber="111-111-1111",
            role="agent",
        )
        db.session.add(agent)
        db.session.commit()

# Start background tasks.
start_notification_monitor()
start_chat_cleanup_thread()
start_detection_cleanup_thread()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, threaded=True, debug=False)

# gunicorn --workers 5 --bind 0.0.0.0:5000 main:app 
