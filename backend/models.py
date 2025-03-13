# models.py
from datetime import datetime
from extensions import db  # Import db from extensions

class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    firstname = db.Column(db.String(80), nullable=False)
    lastname = db.Column(db.String(80), nullable=False)
    phonenumber = db.Column(db.String(20), nullable=False)
    staffid = db.Column(db.String(20))
    password = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(10), nullable=False, default="agent")

    # Relationship with Assignment
    assignments = db.relationship("Assignment", back_populates="agent")

    def serialize(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "firstname": self.firstname,
            "lastname": self.lastname,
            "phonenumber": self.phonenumber,
            "staffid": self.staffid,
            "role": self.role,
        }

class Stream(db.Model):
    __tablename__ = "streams"
    id = db.Column(db.Integer, primary_key=True)
    room_url = db.Column(db.String(300), unique=True, nullable=False)
    streamer_username = db.Column(db.String(100))
    type = db.Column(db.String(50))  # Discriminator column

    # Relationship with Assignment
    assignments = db.relationship("Assignment", back_populates="stream")

    __mapper_args__ = {
        'polymorphic_on': type,
        'polymorphic_identity': 'stream',
    }

    def serialize(self):
        return {
            "id": self.id,
            "room_url": self.room_url,
            "streamer_username": self.streamer_username,
            "platform": self.type.capitalize() if self.type else None,
        }


# Chaturbate Stream Model
class ChaturbateStream(Stream):
    __tablename__ = "chaturbate_streams"
    id = db.Column(db.Integer, db.ForeignKey("streams.id"), primary_key=True)

    __mapper_args__ = {
        'polymorphic_identity': 'chaturbate'
    }

    def serialize(self):
        data = super().serialize()
        data["platform"] = "Chaturbate"
        return data

# Stripchat Stream Model
class StripchatStream(Stream):
    __tablename__ = "stripchat_streams"
    id = db.Column(db.Integer, db.ForeignKey("streams.id"), primary_key=True)
    streamer_uid = db.Column(db.String(50), nullable=True)
    edge_server_url = db.Column(db.String(300), nullable=True)
    blob_url = db.Column(db.String(300), nullable=True)
    static_thumbnail = db.Column(db.String(300), nullable=True)

    __mapper_args__ = {
        'polymorphic_identity': 'stripchat'
    }

    def serialize(self):
        data = super().serialize()
        data.update({
            "platform": "Stripchat",
            "streamer_uid": self.streamer_uid,
            "edge_server_url": self.edge_server_url,
            "blob_url": self.blob_url,
            "static_thumbnail": self.static_thumbnail,
        })
        return data

class Assignment(db.Model):
    __tablename__ = "assignments"
    id = db.Column(db.Integer, primary_key=True)
    agent_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    stream_id = db.Column(db.Integer, db.ForeignKey("streams.id"), nullable=False)
    
    # Relationships
    agent = db.relationship("User", back_populates="assignments")
    stream = db.relationship("Stream", back_populates="assignments")
    
class Log(db.Model):
    __tablename__ = "logs"
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    room_url = db.Column(db.String(300))
    event_type = db.Column(db.String(50))
    details = db.Column(db.JSON)

    def serialize(self):
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat(),
            "room_url": self.room_url,
            "event_type": self.event_type,
            "details": self.details,
        }

class ChatKeyword(db.Model):
    __tablename__ = "chat_keywords"
    id = db.Column(db.Integer, primary_key=True)
    keyword = db.Column(db.String(100), unique=True, nullable=False)

    def serialize(self):
        return {"id": self.id, "keyword": self.keyword}

class FlaggedObject(db.Model):
    __tablename__ = "flagged_objects"
    id = db.Column(db.Integer, primary_key=True)
    object_name = db.Column(db.String(100), unique=True, nullable=False)
    confidence_threshold = db.Column(db.Numeric(3, 2), default=0.8)

    def serialize(self):
        return {
            "id": self.id,
            "object_name": self.object_name,
            "confidence_threshold": float(self.confidence_threshold),
        }

class TelegramRecipient(db.Model):
    __tablename__ = "telegram_recipients"
    id = db.Column(db.Integer, primary_key=True)
    telegram_username = db.Column(db.String(50), unique=True, nullable=False)
    chat_id = db.Column(db.String(50), nullable=False)

    def serialize(self):
        return {
            "id": self.id,
            "telegram_username": self.telegram_username,
            "chat_id": self.chat_id,
        }
