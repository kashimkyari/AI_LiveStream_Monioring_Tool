# db_utils.py
import psycopg2
from psycopg2 import pool, sql
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = "postgresql://postgres:password@localhost/stream_monitor"

# Connection pool setup
connection_pool = None

try:
    connection_pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=1,
        maxconn=10,
        dsn=DATABASE_URL
    )
    logger.info("Successfully created connection pool")
except Exception as e:
    logger.error("Error creating connection pool: %s", e)
    raise

@contextmanager
def get_cursor():
    """Context manager for handling database connections"""
    conn = None
    try:
        conn = connection_pool.getconn()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            yield cursor
            conn.commit()
    except Exception as e:
        logger.error("Database error: %s", e)
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            connection_pool.putconn(conn)

def execute_query(query, params=None, fetchone=False):
    """Execute a SQL query and return results"""
    try:
        with get_cursor() as cursor:
            cursor.execute(query, params)
            if cursor.description:
                if fetchone:
                    return cursor.fetchone()
                return cursor.fetchall()
            return None
    except Exception as e:
        logger.error("Query execution failed: %s", e)
        raise

def init_db():
    """Initialize database tables"""
    tables = [
        """
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(80) UNIQUE NOT NULL,
            email VARCHAR(120) UNIQUE NOT NULL,
            firstname VARCHAR(80) NOT NULL,
            lastname VARCHAR(80) NOT NULL,
            phonenumber VARCHAR(20) NOT NULL,
            staffid VARCHAR(20),
            password VARCHAR(120) NOT NULL,
            role VARCHAR(10) NOT NULL DEFAULT 'agent'
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS streams (
            id SERIAL PRIMARY KEY,
            room_url VARCHAR(300) UNIQUE NOT NULL,
            platform VARCHAR(50) NOT NULL DEFAULT 'Chaturbate',
            streamer_username VARCHAR(100)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS assignments (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER NOT NULL REFERENCES users(id),
            stream_id INTEGER NOT NULL REFERENCES streams(id),
            UNIQUE (stream_id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS logs (
            id SERIAL PRIMARY KEY,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            room_url VARCHAR(300),
            event_type VARCHAR(50),
            details JSONB
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS chat_keywords (
            id SERIAL PRIMARY KEY,
            keyword VARCHAR(100) UNIQUE NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS flagged_objects (
            id SERIAL PRIMARY KEY,
            object_name VARCHAR(100) UNIQUE NOT NULL,
            confidence_threshold NUMERIC(3,2) DEFAULT 0.8
        )
        """
    ]

    try:
        with get_cursor() as cursor:
            for table in tables:
                cursor.execute(table)
            
            # Create initial admin user if not exists
            admin_exists = execute_query(
                "SELECT 1 FROM users WHERE username = 'admin'",
                fetchone=True
            )
            if not admin_exists:
                execute_query(
                    """
                    INSERT INTO users 
                        (username, password, email, firstname, lastname, phonenumber, role)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    ('admin', 'admin', 'admin@example.com', 
                     'Admin', 'User', '000-000-0000', 'admin')
                )

            # Create initial agent user if not exists
            agent_exists = execute_query(
                "SELECT 1 FROM users WHERE username = 'agent'",
                fetchone=True
            )
            if not agent_exists:
                execute_query(
                    """
                    INSERT INTO users 
                        (username, password, email, firstname, lastname, phonenumber, role)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    ('agent', 'agent', 'agent@example.com', 
                     'Agent', 'User', '111-111-1111', 'agent')
                )

    except Exception as e:
        logger.error("Database initialization failed: %s", e)
        raise

def get_user_by_id(user_id):
    """Get user by ID"""
    return execute_query(
        "SELECT * FROM users WHERE id = %s",
        (user_id,),
        fetchone=True
    )

def close_pool():
    """Close all connections in the pool"""
    if connection_pool:
        connection_pool.closeall()
        logger.info("Closed all database connections")

# Register close_pool to be called on application exit
import atexit
atexit.register(close_pool)