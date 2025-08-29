# loop.fun API Documentation

## Overview
The loop.fun API provides endpoints for uploading, streaming, and managing video content. All video uploads are handled as binary data streams supporting various video formats.

## Base URL
```
http://localhost:3001/api
```

## Endpoints

### Health Check
**GET** `/health`

Returns server status and current timestamp.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Upload Video
**POST** `/videos/upload`

Upload a video file using multipart/form-data.

**Request:**
- Content-Type: `multipart/form-data`
- Field name: `video`
- Supported formats: MP4, MPEG, QuickTime, AVI, WebM, OGG, FLV, 3GPP, WMV
- Max file size: 500MB

**Response (Success - 201):**
```json
{
  "success": true,
  "message": "Video uploaded successfully",
  "data": {
    "videoId": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "550e8400-e29b-41d4-a716-446655440000.mp4",
    "originalName": "my-video.mp4",
    "mimeType": "video/mp4",
    "size": 15728640,
    "uploadedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response (Error - 400):**
```json
{
  "success": false,
  "message": "No video file provided",
  "error": "VIDEO_FILE_REQUIRED"
}
```

### Get Video Metadata
**GET** `/videos/{videoId}`

Retrieve metadata for a specific video.

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "videoId": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "550e8400-e29b-41d4-a716-446655440000.mp4",
    "originalName": "my-video.mp4",
    "mimeType": "video/mp4",
    "size": 15728640,
    "uploadedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Stream Video
**GET** `/videos/{videoId}/stream`

Stream video content with support for range requests (seeking).

**Headers:**
- Range: `bytes=0-1023` (optional, for partial content)

**Response:**
- Content-Type: Video MIME type
- Content-Length: File size
- Accept-Ranges: bytes (for range requests)
- Content-Range: bytes start-end/total (for partial content)

### List All Videos
**GET** `/videos`

Get a list of all uploaded videos.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "videoId": "550e8400-e29b-41d4-a716-446655440000",
      "filename": "550e8400-e29b-41d4-a716-446655440000.mp4",
      "originalName": "my-video.mp4",
      "mimeType": "video/mp4",
      "size": 15728640,
      "uploadedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

### Delete Video
**DELETE** `/videos/{videoId}`

Delete a video and its associated file.

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Video deleted successfully"
}
```

## Supported Video Formats

| Format | MIME Type | Extension |
|--------|-----------|-----------|
| MP4 | video/mp4 | .mp4 |
| MPEG | video/mpeg | .mpg, .mpeg |
| QuickTime | video/quicktime | .mov |
| AVI | video/x-msvideo | .avi |
| WebM | video/webm | .webm |
| OGG | video/ogg | .ogv |
| FLV | video/x-flv | .flv |
| 3GPP | video/3gpp | .3gp |
| WMV | video/x-ms-wmv | .wmv |

## Error Codes

| Code | Description |
|------|-------------|
| VIDEO_FILE_REQUIRED | No video file provided in upload |
| INVALID_FILE_TYPE | File type not supported |
| FILE_TOO_LARGE | File exceeds 500MB limit |
| TOO_MANY_FILES | More than one file in upload |
| VIDEO_NOT_FOUND | Video ID not found |
| FILE_NOT_FOUND | Video file missing from disk |
| UPLOAD_FAILED | Server error during upload |
| INTERNAL_ERROR | Generic server error |
| NOT_FOUND | Endpoint not found |

## Example Usage

### Upload with cURL
```bash
curl -X POST \
  http://localhost:3001/api/videos/upload \
  -H 'Content-Type: multipart/form-data' \
  -F 'video=@/path/to/video.mp4'
```

### Stream in HTML
```html
<video controls>
  <source src="http://localhost:3001/api/videos/{videoId}/stream" type="video/mp4">
</video>
```

### Upload with JavaScript
```javascript
const formData = new FormData();
formData.append('video', videoFile);

const response = await fetch('/api/videos/upload', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result);
```