import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import archiver from 'archiver';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());

// CORS configuration for subdomain support
const corsOptions = {
  origin: function (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin.includes('localhost')) return callback(null, true);
    
    // Allow same domain and subdomains for production
    if (origin.includes('loop.fun')) return callback(null, true);
    
    // Allow Vercel preview deployments
    if (origin.includes('vercel.app')) return callback(null, true);
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(morgan('combined'));
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create processed directory for video processing outputs
const processedDir = path.join(process.cwd(), 'processed');
if (!fs.existsSync(processedDir)) {
  fs.mkdirSync(processedDir, { recursive: true });
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

// Multer configuration for streaming video uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueId}${extension}`);
  }
});

const fileFilter = (_req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
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
    files: 1, // Only one file at a time
    fieldSize: 10 * 1024 * 1024 // 10MB field size limit for metadata
  },
  // Enable streaming for large files
  preservePath: false
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
app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Upload video endpoint with automatic processing
app.post('/api/videos/upload', upload.single('video'), async (req, res) => {
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

    console.log(`✅ Video uploaded, starting processing:`, {
      videoId: videoMetadata.id,
      originalName: videoMetadata.originalName,
      size: `${(videoMetadata.size / 1024 / 1024).toFixed(2)} MB`,
      mimeType: videoMetadata.mimeType
    });

    // Automatically process the video
    await processVideo(req.file.path, videoId);

    const response: VideoUploadResponse = {
      success: true,
      message: `Video processed successfully! Download will start automatically.`,
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
    console.error('Upload/processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing video',
      error: 'PROCESSING_FAILED'
    } as VideoUploadResponse);
  }
});

// Video processing function to split and re-encode video
async function processVideo(inputPath: string, videoId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(processedDir, videoId);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const part1Path = path.join(outputDir, 'part1.mp4');
    const part2Path = path.join(outputDir, 'part2.mp4');
    const zipPath = path.join(outputDir, 'processed.zip');

    // First, get video duration
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        console.error('Error getting video metadata:', err);
        return reject(err);
      }

      const duration = metadata.format.duration;
      if (!duration) {
        return reject(new Error('Could not determine video duration'));
      }

      const halfDuration = duration / 2;

      // Create first part (0 to halfway)
      ffmpeg(inputPath)
        .setStartTime(0)
        .setDuration(halfDuration)
        .output(part1Path)
        .videoCodec('libx264')
        .audioCodec('aac')
        .on('end', () => {
          console.log('Part 1 processing finished');
          
          // Create second part (halfway to end)
          ffmpeg(inputPath)
            .setStartTime(halfDuration)
            .output(part2Path)
            .videoCodec('libx264')
            .audioCodec('aac')
            .on('end', () => {
              console.log('Part 2 processing finished');
              
              // Create ZIP file
              const output = fs.createWriteStream(zipPath);
              const archive = archiver('zip', { zlib: { level: 9 } });

              output.on('close', () => {
                console.log('ZIP created:', archive.pointer() + ' total bytes');
                resolve(zipPath);
              });

              archive.on('error', (err: Error) => {
                reject(err);
              });

              archive.pipe(output);
              archive.file(part1Path, { name: 'part1.mp4' });
              archive.file(part2Path, { name: 'part2.mp4' });
              archive.finalize();
            })
            .on('error', (err) => {
              console.error('Error processing part 2:', err);
              reject(err);
            })
            .run();
        })
        .on('error', (err) => {
          console.error('Error processing part 1:', err);
          reject(err);
        })
        .run();
    });
  });
}

// Process video endpoint
app.post('/api/videos/:videoId/process', async (req, res) => {
  try {
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

    console.log('Starting video processing for:', videoId);
    await processVideo(video.path, videoId);

    res.json({
      success: true,
      message: 'Video processed successfully',
      data: {
        videoId,
        downloadUrl: `/api/videos/${videoId}/download`
      }
    });
  } catch (error) {
    console.error('Video processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing video',
      error: 'PROCESSING_FAILED'
    });
  }
});

// Download processed video endpoint
app.get('/api/videos/:videoId/download', (req, res) => {
  const { videoId } = req.params;
  const zipPath = path.join(processedDir, videoId, 'processed.zip');

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({
      success: false,
      message: 'Processed video not found. Please process the video first.',
      error: 'PROCESSED_FILE_NOT_FOUND'
    });
  }

  const stat = fs.statSync(zipPath);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="video-${videoId}-processed.zip"`);
  res.setHeader('Content-Length', stat.size);

  const fileStream = fs.createReadStream(zipPath);
  fileStream.pipe(res);
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
app.get('/api/videos', (_req, res) => {
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
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
app.use('*', (_req, res) => {
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