import os
import sys
import json
import boto3
import subprocess
import zipfile

ENVS = ["stg", "prd"]

env = sys.argv[1]

if env not in ENVS:
    print(f"Invalid env: {env}")
    exit(-1)

home_repo = os.getcwd()
home_env = f"{home_repo}/environments/{env}"
project_path = f"{home_repo}/code/crons/lambda_hono_every_hour"

with open(f"{home_env}/deploy.{env}.json", "r") as config_file:
    config = json.load(config_file)

try:
    import dotenv
    dotenv.load_dotenv(f"{home_env}/.env.{env}.deploy")
    print("Loaded .env file")
except:
    print("No .env file found")

function_name = os.getenv("LAMBDA_CRON_STG" if env == "stg" else "LAMBDA_CRON_PRD")


def build(path):
    subprocess.run(["npm", "install"], cwd=path, check=True)
    subprocess.run(["npm", "run", "build"], cwd=path, check=True)


def make_zip(path, zip_path):
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for folder in ["dist", "node_modules"]:
            folder_path = os.path.join(path, folder)
            for root, dirs, files in os.walk(folder_path):
                for file in files:
                    full_path = os.path.join(root, file)
                    arcname = os.path.relpath(full_path, path)
                    zf.write(full_path, arcname)
    print(f"Zipped to {zip_path}")


def deploy_lambda(function_name, zip_path):
    client = boto3.client(
        "lambda",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION", "eu-west-3"),
    )
    with open(zip_path, "rb") as f:
        client.update_function_code(FunctionName=function_name, ZipFile=f.read())
    waiter = client.get_waiter("function_updated")
    waiter.wait(FunctionName=function_name)
    print(f"Function code updated: {function_name}")
    client.update_function_configuration(
        FunctionName=function_name,
        Environment={"Variables": {k: v for k, v in {
            "DB_HOST": os.getenv("DB_HOST"),
            "DB_PORT": os.getenv("DB_PORT", "5432"),
            "DB_USER": os.getenv("DB_USER"),
            "DB_PASSWORD": os.getenv("DB_PASSWORD"),
            "DB_NAME": os.getenv("DB_NAME"),
            "DB_SSL": "true",
            "AWS_REGION": os.getenv("AWS_REGION", "eu-west-3"),
            "S3_BUCKET_ASSETS": os.getenv("S3_BUCKET_ASSETS"),
        }.items() if v}},
    )
    print("Function configuration updated")


try:
    zip_path = f"/tmp/cron-{env}.zip"
    build(project_path)
    make_zip(project_path, zip_path)
    deploy_lambda(function_name, zip_path)
    print("Deploy complete!")
except Exception as e:
    print(f"Deploy failed: {e}")
    exit(-1)
