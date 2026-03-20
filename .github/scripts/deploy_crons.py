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
rule_name = f"{function_name}-hourly-backup"
target_id = "db-hourly-backup"
handler_name = "dist/index.handler"


def build(path):
    subprocess.run(["npm", "install"], cwd=path, check=True)
    subprocess.run(["npm", "run", "build"], cwd=path, check=True)
    built_entry = os.path.join(path, "dist", "index.js")
    if not os.path.exists(built_entry):
        raise RuntimeError(f"Build output not found: {built_entry}")


def make_zip(path, zip_path):
    os.makedirs(os.path.dirname(zip_path), exist_ok=True)
    if os.path.exists(zip_path):
        os.remove(zip_path)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for folder in ["dist", "node_modules"]:
            folder_path = os.path.join(path, folder)
            if not os.path.isdir(folder_path):
                raise RuntimeError(f"Missing folder for packaging: {folder_path}")
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
        region_name=config.get("AWS_REGION", "eu-west-3"),
    )
    with open(zip_path, "rb") as f:
        client.update_function_code(FunctionName=function_name, ZipFile=f.read())
    waiter = client.get_waiter("function_updated")
    waiter.wait(FunctionName=function_name)
    print(f"Function code updated: {function_name}")
    client.update_function_configuration(
        FunctionName=function_name,
        Handler=handler_name,
        Environment={"Variables": {k: v for k, v in {
            "DB_HOST": os.getenv("DB_HOST"),
            "DB_PORT": os.getenv("DB_PORT", "5432"),
            "DB_USER": os.getenv("DB_USER"),
            "DB_PASSWORD": os.getenv("DB_PASSWORD"),
            "DB_NAME": os.getenv("DB_NAME"),
            "DB_SSL": "true",
            "S3_BACKUP_BUCKET": os.getenv("S3_BUCKET_BACKUP") or config.get("S3_BACKUP_BUCKET") or os.getenv("S3_BUCKET_ASSETS"),
            "S3_BACKUP_PREFIX": os.getenv("S3_BACKUP_PREFIX") or "database/hourly",
            "AWS_REGION": config.get("AWS_REGION", "eu-west-3"),
        }.items() if v}},
    )
    print(f"Function configuration updated (handler={handler_name})")


def ensure_hourly_schedule(function_name):
    region = config.get("AWS_REGION", "eu-west-3")
    events_client = boto3.client(
        "events",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=region,
    )
    lambda_client = boto3.client(
        "lambda",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=region,
    )

    rule = events_client.put_rule(
        Name=rule_name,
        ScheduleExpression="rate(1 hour)",
        State="ENABLED",
        Description="Run DB backup lambda every hour",
    )
    rule_arn = rule["RuleArn"]

    function_arn = lambda_client.get_function(FunctionName=function_name)["Configuration"]["FunctionArn"]
    events_client.put_targets(
        Rule=rule_name,
        Targets=[{"Id": target_id, "Arn": function_arn}],
    )

    statement_id = f"AllowEventBridgeInvoke-{rule_name}"[:100]
    try:
        lambda_client.add_permission(
            FunctionName=function_name,
            StatementId=statement_id,
            Action="lambda:InvokeFunction",
            Principal="events.amazonaws.com",
            SourceArn=rule_arn,
        )
    except lambda_client.exceptions.ResourceConflictException:
        print("Invoke permission already exists")

    print(f"Hourly schedule configured: {rule_name}")


try:
    zip_path = os.path.join(project_path, "artifacts", f"cron-{env}.zip")
    build(project_path)
    make_zip(project_path, zip_path)
    deploy_lambda(function_name, zip_path)
    ensure_hourly_schedule(function_name)
    print("Deploy complete!")
except Exception as e:
    print(f"Deploy failed: {e}")
    exit(-1)
