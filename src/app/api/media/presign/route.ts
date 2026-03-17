import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
const MAX_IMAGE = 20 * 1024 * 1024
const MAX_VIDEO = 200 * 1024 * 1024

export async function POST(req: NextRequest) {
  const { fileName, fileType, fileSize, listingId } = await req.json()
  if (!ALLOWED_TYPES.includes(fileType)) return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
  const isVideo = fileType.startsWith('video/')
  if (fileSize > (isVideo ? MAX_VIDEO : MAX_IMAGE)) return NextResponse.json({ error: 'File too large' }, { status: 400 })
  const ext = fileName.split('.').pop()?.toLowerCase() ?? 'jpg'
  const folder = isVideo ? 'videos' : 'raw'
  const key = `${folder}/${listingId ?? 'draft'}/${randomUUID()}.${ext}`
  const presignedUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: process.env.AWS_S3_BUCKET!, Key: key, ContentType: fileType }), { expiresIn: 300 })
  const publicUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
  return NextResponse.json({ presignedUrl, key, publicUrl })
}
