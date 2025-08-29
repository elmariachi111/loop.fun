import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Video MIME types validation
const videoMimeTypes = [
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo', // .avi
  'video/webm',
  'video/ogg',
  'video/x-flv',
  'video/3gpp',
  'video/x-ms-wmv'
];

// Multer configuration for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueId}${extension}`);
  }
});

const fileFilter = (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (videoMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only video files are allowed: ${videoMimeTypes.join(', ')}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
    files: 1 // Only one file at a time
  }
});

// Types
interface VideoUploadResponse {
  success: boolean;
  message: string;
  data?: {
    videoId: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    uploadedAt: string;
  };
  error?: string;
}

interface VideoMetadata {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  path: string;
}

// In-memory storage for video metadata (use database in production)
const videoDatabase: VideoMetadata[] = [];

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Upload video endpoint
app.post('/api/videos/upload', upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No video file provided',
        error: 'VIDEO_FILE_REQUIRED'
      } as VideoUploadResponse);
    }

    const videoId = uuidv4();
    const videoMetadata: VideoMetadata = {
      id: videoId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
      path: req.file.path
    };

    // Store metadata (in production, save to database)
    videoDatabase.push(videoMetadata);

    const response: VideoUploadResponse = {
      success: true,
      message: 'Video uploaded successfully',
      data: {
        videoId: videoMetadata.id,
        filename: videoMetadata.filename,
        originalName: videoMetadata.originalName,
        mimeType: videoMetadata.mimeType,
        size: videoMetadata.size,
        uploadedAt: videoMetadata.uploadedAt
      }
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during upload',
      error: 'UPLOAD_FAILED'
    } as VideoUploadResponse);
  }
});

// Get video metadata
app.get('/api/videos/:videoId', (req, res) => {
  const { videoId } = req.params;
  const video = videoDatabase.find(v => v.id === videoId);

  if (!video) {
    return res.status(404).json({
      success: false,
      message: 'Video not found',
      error: 'VIDEO_NOT_FOUND'
    });
  }

  res.json({
    success: true,
    data: {
      videoId: video.id,
      filename: video.filename,
      originalName: video.originalName,
      mimeType: video.mimeType,
      size: video.size,
      uploadedAt: video.uploadedAt
    }
  });
});

// Stream video file
app.get('/api/videos/:videoId/stream', (req, res) => {
  const { videoId } = req.params;
  const video = videoDatabase.find(v => v.id === videoId);

  if (!video) {
    return res.status(404).json({
      success: false,
      message: 'Video not found',
      error: 'VIDEO_NOT_FOUND'
    });
  }

  if (!fs.existsSync(video.path)) {
    return res.status(404).json({
      success: false,
      message: 'Video file not found on disk',
      error: 'FILE_NOT_FOUND'
    });
  }

  const stat = fs.statSync(video.path);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    // Support for range requests (video seeking)
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(video.path, { start, end });
    
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': video.mimeType,
    };
    
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    // Full file stream
    const head = {
      'Content-Length': fileSize,
      'Content-Type': video.mimeType,
    };
    
    res.writeHead(200, head);
    fs.createReadStream(video.path).pipe(res);
  }
});

// List all videos
app.get('/api/videos', (req, res) => {
  const videos = videoDatabase.map(video => ({
    videoId: video.id,
    filename: video.filename,
    originalName: video.originalName,
    mimeType: video.mimeType,
    size: video.size,
    uploadedAt: video.uploadedAt
  }));

  res.json({
    success: true,
    data: videos,
    count: videos.length
  });
});

// Delete video
app.delete('/api/videos/:videoId', (req, res) => {
  const { videoId } = req.params;
  const videoIndex = videoDatabase.findIndex(v => v.id === videoId);

  if (videoIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Video not found',
      error: 'VIDEO_NOT_FOUND'
    });
  }

  const video = videoDatabase[videoIndex];

  // Delete file from disk
  if (fs.existsSync(video.path)) {
    fs.unlinkSync(video.path);
  }

  // Remove from database
  videoDatabase.splice(videoIndex, 1);

  res.json({
    success: true,
    message: 'Video deleted successfully'
  });
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: 'File too large. Maximum size is 500MB.',
        error: 'FILE_TOO_LARGE'
      } as VideoUploadResponse);
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Only one file allowed per upload.',
        error: 'TOO_MANY_FILES'
      } as VideoUploadResponse);
    }
  }

  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message,
      error: 'INVALID_FILE_TYPE'
    } as VideoUploadResponse);
  }

  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: 'INTERNAL_ERROR'
  } as VideoUploadResponse);
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    error: 'NOT_FOUND'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 loop.fun API server running on port ${PORT}`);
  console.log(`📁 Upload directory: ${uploadsDir}`);
});

export default app;