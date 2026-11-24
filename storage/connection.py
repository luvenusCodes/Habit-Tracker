import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv(override=False)


def get_db_connection():
    ssl_disabled = os.getenv("DB_SSL_DISABLED", "true").lower() == "true"

    connect_kwargs = {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "user": os.getenv("DB_USER", "habit_user"),
        "password": os.getenv("DB_PASSWORD", ""),
        "database": os.getenv("DB_NAME", "habit_tracker_v2"),
        "port": int(os.getenv("DB_PORT", 3306)),
        "ssl_disabled": ssl_disabled,
        "connection_timeout": 10,
    }

    ssl_ca = os.getenv("DB_SSL_CA")
    if not ssl_disabled and ssl_ca and os.path.exists(ssl_ca):
        connect_kwargs["ssl_ca"] = ssl_ca

    return mysql.connector.connect(**connect_kwargs)