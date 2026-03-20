import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: process.env.AWS_REGION || "eu-west-3",
});

const BUCKET = process.env.S3_BUCKET_ASSETS!;

export async function createUploadPresignedPost(
  s3Key: string,
  contentType: string,
  maxSizeBytes: number = 10 * 1024 * 1024,
) {
  return createPresignedPost(client, {
    Bucket: BUCKET,
    Key: s3Key,
    Conditions: [
      ["content-length-range", 0, maxSizeBytes],
      ["eq", "$Content-Type", contentType],
    ],
    Fields: { "Content-Type": contentType },
    Expires: 300,
  });
}

export async function createDownloadPresignedUrl(s3Key: string) {
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }),
    { expiresIn: 3600 },
  );
}

export async function deleteS3Object(s3Key: string) {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }));
}
