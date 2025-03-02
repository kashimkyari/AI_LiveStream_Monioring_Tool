# models_db.py (PostgreSQL-optimized models)
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)  # Must provide
    firstname = db.Column(db.String(80), nullable=False)  # Must provide
    lastname = db.Column(db.String(80), nullable=False)  # Must provide
    phonenumber = db.Column(db.String(20), nullable=False)  # Must provide
    staffid = db.Column(db.String(20))  # Optional
    password = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(10), nullable=False, default='agent')

class Stream(db.Model):
    __tablename__ = 'streams'
    id = db.Column(db.Integer, primary_key=True)
    room_url = db.Column(db.String(300), unique=True, nullable=False)
    platform = db.Column(db.String(50), nullable=False, default='Chaturbate')
    streamer_username = db.Column(db.String(100))
    assignments = db.relationship('Assignment', back_populates='stream')

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

class ChatKeyword(db.Model):
    __tablename__ = 'chat_keywords'
    id = db.Column(db.Integer, primary_key=True)
    keyword = db.Column(db.String(100), unique=True, nullable=False)

class FlaggedObject(db.Model):
    __tablename__ = 'flagged_objects'
    id = db.Column(db.Integer, primary_key=True)
    object_name = db.Column(db.String(100), unique=True, nullable=False)
    confidence_threshold = db.Column(db.Numeric(3, 2), default=0.8)