import os
import sys
import json
import boto3
import mimetypes

FOLDERS = ["www-assets"]
ENVS = ["stg", "prd"]

folder = sys.argv[1]
env = sys.argv[2]

if env not in ENVS:
    print(f"Invalid env: {env}")
    exit(-1)

if folder not in FOLDERS:
    print(f"Invalid folder: {folder}")
    exit(-1)

home_repo = os.getcwd()
home_code = f"{home_repo}/code"
home_env = f"{home_repo}/environments/{env}"

with open(f"{home_env}/deploy.{env}.json", "r") as config_file:
    config = json.load(config_file)

try:
    import dotenv
    dotenv.load_dotenv(f"{home_env}/.env.{env}.deploy")
    print("Loaded .env file")
except:
    print("No .env file found")


def upload_to_s3(bucket, local_folder, prefix):
    client = boto3.client(
        "s3",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION", "eu-west-3"),
    )
    for root, dirs, files in os.walk(local_folder):
        for filename in files:
            try:
                extension = os.path.splitext(filename)[-1]
                content_type = mimetypes.types_map[extension]
            except Exception:
                content_type = "application/octet-stream"
            local_path = os.path.join(root, filename)
            relative_path = os.path.relpath(local_path, local_folder)
            s3_key = f"{prefix}{relative_path}"
            client.upload_file(
                local_path, bucket, s3_key,
                ExtraArgs={"ContentType": content_type},
            )
            print(f"  uploaded {s3_key}")
    print(f"deploy {folder} to s3://{bucket}/{prefix}")


try:
    upload_to_s3(
        os.getenv("S3_BUCKET_ASSETS"),
        f"{home_code}/{folder}",
        f"{env}/",
    )
    print("Deploy complete!")
except Exception as e:
    print(f"Deploy failed: {e}")
    exit(-1)
