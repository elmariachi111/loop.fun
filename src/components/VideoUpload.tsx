import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { videoEndpoints } from '../config/api';
import './VideoUpload.css';

interface UploadResponse {
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

interface VideoSplit {
  parts: Blob[];
  partNames: string[];
}

interface UploadState {
  uploading: boolean;
  progress: number;
  result: UploadResponse | null;
  error: string | null;
  splitVideos: VideoSplit | null;
  ffmpegLoading: boolean;
}

const VideoUpload = () => {
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    result: null,
    error: null,
    splitVideos: null,
    ffmpegLoading: false
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [numberOfParts, setNumberOfParts] = useState<number>(2);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ffmpegRef = useRef<FFmpeg>(new FFmpeg());

  // Initialize FFmpeg
  useEffect(() => {
    const loadFFmpeg = async () => {
      setUploadState(prev => ({ ...prev, ffmpegLoading: true }));
      
      try {
        const ffmpeg = ffmpegRef.current;
        
        // Load from local assets
        await ffmpeg.load({
          coreURL: await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
          wasmURL: await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
          workerURL: await toBlobURL('/ffmpeg/ffmpeg-core.worker.js', 'text/javascript'),
        });
        
        setUploadState(prev => ({ ...prev, ffmpegLoading: false }));
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        setUploadState(prev => ({ 
          ...prev, 
          ffmpegLoading: false,
          error: 'Failed to load video processing library. Please refresh and try again.'
        }));
      }
    };
    
    loadFFmpeg();
  }, []);

  // Cleanup object URLs when component unmounts or when splitVideos changes
  useEffect(() => {
    return () => {
      videoUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [videoUrls]);

  // Create object URLs when splitVideos is updated
  useEffect(() => {
    if (uploadState.splitVideos) {
      const urls = uploadState.splitVideos.parts.map(part => URL.createObjectURL(part));
      setVideoUrls(urls);
      setActiveTab(0); // Reset to first tab
    } else {
      // Clean up previous URLs
      videoUrls.forEach(url => URL.revokeObjectURL(url));
      setVideoUrls([]);
      setActiveTab(0);
    }
  }, [uploadState.splitVideos]);


  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const videoTypes = [
        'video/mp4',
        'video/mpeg', 
        'video/quicktime',
        'video/x-msvideo',
        'video/webm',
        'video/ogg',
        'video/x-flv',
        'video/3gpp',
        'video/x-ms-wmv'
      ];
      
      if (!videoTypes.includes(file.type)) {
        setUploadState(prev => ({
          ...prev,
          error: `Invalid file type: ${file.type}. Please select a video file.`,
          result: null
        }));
        return;
      }

      // Check file size (500MB limit)
      const maxSize = 500 * 1024 * 1024;
      if (file.size > maxSize) {
        setUploadState(prev => ({
          ...prev,
          error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum size is 500MB.`,
          result: null
        }));
        return;
      }

      setSelectedFile(file);
      setUploadState(prev => ({
        ...prev,
        error: null,
        result: null,
        splitVideos: null
      }));
    }
  };

  const splitVideoLocally = async (file: File, numParts: number): Promise<{ parts: Blob[]; partNames: string[] }> => {
    const ffmpeg = ffmpegRef.current;
    const parts: Blob[] = [];
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const partNames: string[] = [];

    try {
      // Write input file to FFmpeg filesystem
      await ffmpeg.writeFile('input.mp4', await fetchFile(file));
      
      // Get video duration first
      await ffmpeg.exec(['-i', 'input.mp4', '-f', 'null', '-']);
      
      // Create a temporary video to get metadata
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
      });
      
      const duration = video.duration;
      const partDuration = duration / numParts;
      
      URL.revokeObjectURL(video.src);
      
      // Process each part
      for (let i = 0; i < numParts; i++) {
        const endTime = (i + 1) * partDuration;
        const outputFilename = `part_${i + 1}.mp4`;
        
        // Create ping-pong effect: extract from start to endTime, then reverse and concatenate
        
        // Step 1: Extract the segment from start to endTime
        await ffmpeg.exec([
          '-i', 'input.mp4',
          '-ss', '0',
          '-t', endTime.toString(),
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-avoid_negative_ts', 'make_zero',
          `segment_${i + 1}.mp4`
        ]);
        
        // Step 2: Create reversed version
        await ffmpeg.exec([
          '-i', `segment_${i + 1}.mp4`,
          '-vf', 'reverse',
          '-af', 'areverse',
          `reversed_${i + 1}.mp4`
        ]);
        
        // Step 3: Create concat file for combining forward and reverse
        const concatContent = `file 'segment_${i + 1}.mp4'\nfile 'reversed_${i + 1}.mp4'`;
        await ffmpeg.writeFile(`concat_${i + 1}.txt`, concatContent);
        
        // Step 4: Concatenate forward and reverse
        await ffmpeg.exec([
          '-f', 'concat',
          '-safe', '0',
          '-i', `concat_${i + 1}.txt`,
          '-c', 'copy',
          outputFilename
        ]);
        
        // Read the output file
        const outputData = await ffmpeg.readFile(outputFilename);
        const blob = new Blob([outputData], { type: 'video/mp4' });
        
        parts.push(blob);
        partNames.push(`${baseName}_part${i + 1}.mp4`);
        
        // Update progress
        const progress = 20 + Math.round((i + 1) / numParts * 60);
        setUploadState(prev => ({ ...prev, progress }));
        
        // Clean up temporary files
        try {
          await ffmpeg.deleteFile(`segment_${i + 1}.mp4`);
          await ffmpeg.deleteFile(`reversed_${i + 1}.mp4`);
          await ffmpeg.deleteFile(`concat_${i + 1}.txt`);
          await ffmpeg.deleteFile(outputFilename);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      
      // Clean up input file
      await ffmpeg.deleteFile('input.mp4');
      
      return { parts, partNames };
      
    } catch (error) {
      console.error('FFmpeg processing error:', error);
      throw new Error('Failed to process video with FFmpeg: ' + (error as Error).message);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadState(prev => ({
      ...prev,
      uploading: true,
      progress: 0,
      error: null,
      result: null,
      splitVideos: null
    }));

    try {
      setUploadState(prev => ({ ...prev, progress: 20 }));
      
      const { parts, partNames } = await splitVideoLocally(selectedFile, numberOfParts);
      
      setUploadState(prev => ({ ...prev, progress: 80 }));
      
      // Store all parts in state
      setUploadState(prev => ({
        ...prev,
        uploading: false,
        progress: 100,
        splitVideos: {
          parts,
          partNames
        },
        result: {
          success: true,
          message: `Video split into ${numberOfParts} parts successfully!`,
          data: {
            videoId: 'local-split',
            filename: selectedFile.name,
            originalName: selectedFile.name,
            mimeType: selectedFile.type,
            size: selectedFile.size,
            uploadedAt: new Date().toISOString()
          }
        }
      }));
      
    } catch (error) {
      setUploadState(prev => ({
        ...prev,
        uploading: false,
        error: error instanceof Error ? error.message : 'Video splitting failed',
        progress: 0,
        splitVideos: null
      }));
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="video-upload">
      <div className="upload-section">
        <h3>📹 Split Video</h3>
        
        <div className="file-input-wrapper">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="file-input"
            id="video-file-input"
            disabled={uploadState.uploading}
          />
          <label htmlFor="video-file-input" className="file-input-label">
            {selectedFile ? selectedFile.name : 'Choose video file...'}
          </label>
        </div>

        {selectedFile && (
          <div className="file-info">
            <p><strong>File:</strong> {selectedFile.name}</p>
            <p><strong>Type:</strong> {selectedFile.type}</p>
            <p><strong>Size:</strong> {formatFileSize(selectedFile.size)}</p>
          </div>
        )}

        <div className="parts-selector">
          <label htmlFor="parts-slider" className="parts-label">
            <strong>Number of parts to split into: {numberOfParts}</strong>
          </label>
          <input
            id="parts-slider"
            type="range"
            min="2"
            max="6"
            value={numberOfParts}
            onChange={(e) => setNumberOfParts(parseInt(e.target.value))}
            className="parts-slider"
            disabled={uploadState.uploading}
          />
          <div className="parts-markers">
            {[2, 3, 4, 5, 6].map(num => (
              <span key={num} className={numberOfParts === num ? 'active' : ''}>{num}</span>
            ))}
          </div>
        </div>

        {(uploadState.uploading || uploadState.ffmpegLoading) && (
          <div className="progress-section">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: uploadState.ffmpegLoading ? '0%' : `${uploadState.progress}%` }}
              />
            </div>
            <p className="progress-text">
              {uploadState.ffmpegLoading 
                ? 'Loading video processor...' 
                : `Splitting Video: ${uploadState.progress}%`}
            </p>
          </div>
        )}

        <div className="privacy-notice">
          <div className="privacy-icon">🔒</div>
          <p className="privacy-text">
            <strong>Your privacy, preserved.</strong> All video processing happens entirely within your browser—your content never touches our servers or leaves your device.
          </p>
        </div>

        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploadState.uploading || uploadState.ffmpegLoading}
          className="upload-btn"
        >
          {uploadState.ffmpegLoading 
            ? 'Loading Video Processor...' 
            : uploadState.uploading 
              ? 'Splitting Video...' 
              : `Split Video Into ${numberOfParts} Parts`}
        </button>

        {uploadState.error && (
          <div className="error-message">
            <strong>Error:</strong> {uploadState.error}
          </div>
        )}

        {uploadState.result && uploadState.result.success && uploadState.splitVideos && (
          <div className="success-message">
            <h4>✅ Video Split Successfully!</h4>
            <p>Your video has been split into {uploadState.splitVideos.parts.length} parts. Preview and download each part below:</p>
            
            <div className="video-preview-section">
              <div className="video-tabs">
                <div className="tab-header">
                  {uploadState.splitVideos.parts.map((_, index) => (
                    <button
                      key={index}
                      className={`tab-button ${activeTab === index ? 'active' : ''}`}
                      onClick={() => setActiveTab(index)}
                    >
                      Part {index + 1}
                    </button>
                  ))}
                </div>
                
                <div className="tab-content">
                  <div className="video-player-container">
                    <video
                      ref={videoRef}
                      src={videoUrls[activeTab]}
                      controls
                      autoPlay
                      muted
                      loop
                      className="preview-video"
                      key={activeTab} // Force re-render when tab changes
                    />
                    
                    <div className="video-controls">
                      <button 
                        onClick={() => downloadBlob(uploadState.splitVideos!.parts[activeTab], uploadState.splitVideos!.partNames[activeTab])}
                        className="download-btn"
                      >
                        📥 Download Part {activeTab + 1}
                      </button>
                      <p className="file-name">{uploadState.splitVideos.partNames[activeTab]}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="upload-details">
              <p><strong>Original Name:</strong> {uploadState.result.data?.originalName}</p>
              <p><strong>File Size:</strong> {uploadState.result.data?.size ? formatFileSize(uploadState.result.data.size) : 'Unknown'}</p>
            </div>
            
            <button 
              onClick={() => {
                setUploadState(prev => ({ ...prev, result: null, splitVideos: null }));
                setSelectedFile(null);
                setNumberOfParts(2); // Reset to default
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
              className="new-video-btn"
            >
              🎬 Split Another Video
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoUpload;