# utils.py
import os
from functools import wraps
from flask import session, jsonify
from config import app
from models import User
from extensions import db

ALLOWED_EXTENSIONS = {"mp4", "avi", "mov"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def login_required(role=None):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if "user_id" not in session:
                return jsonify({"message": "Authentication required"}), 401
            user = db.session.get(User, session["user_id"])
            if role and (user is None or user.role != role):
                return jsonify({"message": "Unauthorized"}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator
