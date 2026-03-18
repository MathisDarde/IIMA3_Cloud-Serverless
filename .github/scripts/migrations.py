import os
import sys
import glob
import psycopg2

ENVS = ["stg", "prd"]
env = sys.argv[1] if len(sys.argv) > 1 else "stg"

if env not in ENVS:
    print(f"Invalid env: {env}")
    exit(-1)

home_repo = os.getcwd()
home_env = f"{home_repo}/environments/{env}"

try:
    import dotenv
    dotenv.load_dotenv(f"{home_env}/.env.{env}.deploy")
    dotenv.load_dotenv(f"{home_repo}/.env")
    print("Loaded .env file")
except:
    print("No .env file found")

conn = psycopg2.connect(
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT", "5432")),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    dbname=os.getenv("DB_NAME"),
    sslmode="require",
)

migrations_dir = os.path.join(home_repo, "code", "database", "migrations")
sql_files = sorted(glob.glob(f"{migrations_dir}/*.sql"))

cursor = conn.cursor()
try:
    for sql_file in sql_files:
        filename = os.path.basename(sql_file)
        with open(sql_file, "r") as f:
            sql = f.read()
        print(f"Running {filename}...")
        cursor.execute(sql)
        conn.commit()
        print(f"✓ {filename}")
    print("All migrations complete.")
except Exception as e:
    conn.rollback()
    print(f"Migration failed: {e}")
    exit(-1)
finally:
    cursor.close()
    conn.close()
