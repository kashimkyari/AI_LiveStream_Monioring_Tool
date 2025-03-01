from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(10), nullable=False, default='agent')
    assignments = db.relationship('Assignment', back_populates='agent')

    def serialize(self):
        return {
            'id': self.id,
            'username': self.username,
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
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
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
        return {
            'id': self.id,
            'keyword': self.keyword
        }

class FlaggedObject(db.Model):
    __tablename__ = 'flagged_objects'
    id = db.Column(db.Integer, primary_key=True)
    object_name = db.Column(db.String(100), unique=True, nullable=False)
    confidence_threshold = db.Column(db.Float, default=0.8)

    def serialize(self):
        return {
            'id': self.id,
            'object_name': self.object_name,
            'confidence_threshold': self.confidence_threshold
        }