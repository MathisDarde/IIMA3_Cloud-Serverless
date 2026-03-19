import os
import sys
import json
import boto3
import mimetypes
import subprocess
import time

FOLDERS = ["www-user", "www-admin"]
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
project_path = f"{home_code}/{folder}"

with open(f"{home_env}/deploy.{env}.json", "r") as config_file:
    config = json.load(config_file)

try:
    import dotenv
    dotenv.load_dotenv(f"{home_env}/.env.{env}.deploy")
    print("Loaded .env file")
except:
    print("No .env file found")

FOLDER_KEY = "user" if folder == "www-user" else "admin"
DISTRIBUTION_KEY = "DISTRIBUTION_USER" if folder == "www-user" else "DISTRIBUTION_ADMIN"


def build_react(path):
    api_url = os.getenv("API_URL_STG") if env == "stg" else os.getenv("API_URL_PRD")
    build_env = {**os.environ, "VITE_BASE_API_URL": api_url or ""}
    subprocess.run(["npm", "install", "--legacy-peer-deps"], cwd=path, check=True)
    subprocess.run(["npm", "run", "build"], cwd=path, check=True, env=build_env)


def get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name="eu-north-1",
    )


def clear_s3(bucket, prefix):
    client = get_s3_client()
    res = client.list_objects_v2(Bucket=bucket, Prefix=prefix)
    if res.get("KeyCount", 0) == 0:
        print("No files to clear")
        return
    objects_to_delete = [{"Key": obj["Key"]} for obj in res["Contents"]]
    client.delete_objects(Bucket=bucket, Delete={"Objects": objects_to_delete})
    print("Bucket prefix cleared")


def upload_to_s3(bucket, local_folder, prefix):
    client = get_s3_client()
    for root, dirs, files in os.walk(local_folder):
        for filename in files:
            try:
                extension = os.path.splitext(filename)[-1]
                content_type = mimetypes.types_map[extension]
            except Exception:
                content_type = "application/octet-stream"
            local_path = os.path.join(root, filename)
            relative_path = os.path.relpath(local_path, local_folder)
            s3_key = f"{prefix}/{relative_path}"
            client.upload_file(
                local_path, bucket, s3_key,
                ExtraArgs={"ContentType": content_type},
            )
            print(f"  uploaded {s3_key}")
    print(f"deploy {folder} to s3://{bucket}/{prefix}/")


def invalidate_cache(distribution_id):
    client = boto3.client(
        "cloudfront",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION", "eu-west-3"),
    )
    client.create_invalidation(
        DistributionId=distribution_id,
        InvalidationBatch={
            "Paths": {"Quantity": 1, "Items": ["/*"]},
            "CallerReference": str(time.time()),
        },
    )
    print(f"CloudFront invalidation created for {distribution_id}")


try:
    bucket = os.getenv("S3_BUCKET_STG") if env == "stg" else os.getenv("S3_BUCKET_PRD")
    build_react(project_path)
    clear_s3(bucket, FOLDER_KEY)
    upload_to_s3(bucket, f"{project_path}/dist", FOLDER_KEY)
    invalidate_cache(config[DISTRIBUTION_KEY])
    print("Deploy complete!")
except Exception as e:
    print(f"Deploy failed: {e}")
    exit(-1)
