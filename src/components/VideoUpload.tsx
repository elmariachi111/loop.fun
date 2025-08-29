import { useState, useRef, useEffect } from 'react';
import { videoEndpoints } from '../config/api';

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
  part1: Blob;
  part2: Blob;
  part1Name: string;
  part2Name: string;
}

interface UploadState {
  uploading: boolean;
  progress: number;
  result: UploadResponse | null;
  error: string | null;
  splitVideos: VideoSplit | null;
}

const VideoUpload = () => {
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    result: null,
    error: null,
    splitVideos: null
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrls, setVideoUrls] = useState<{ part1Url?: string; part2Url?: string }>({});
  const part1VideoRef = useRef<HTMLVideoElement>(null);
  const part2VideoRef = useRef<HTMLVideoElement>(null);

  // Cleanup object URLs when component unmounts or when splitVideos changes
  useEffect(() => {
    return () => {
      if (videoUrls.part1Url) URL.revokeObjectURL(videoUrls.part1Url);
      if (videoUrls.part2Url) URL.revokeObjectURL(videoUrls.part2Url);
    };
  }, [videoUrls]);

  // Create object URLs when splitVideos is updated
  useEffect(() => {
    if (uploadState.splitVideos) {
      const part1Url = URL.createObjectURL(uploadState.splitVideos.part1);
      const part2Url = URL.createObjectURL(uploadState.splitVideos.part2);
      setVideoUrls({ part1Url, part2Url });
    } else {
      // Clean up previous URLs
      if (videoUrls.part1Url) URL.revokeObjectURL(videoUrls.part1Url);
      if (videoUrls.part2Url) URL.revokeObjectURL(videoUrls.part2Url);
      setVideoUrls({});
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

  const splitVideoLocally = async (file: File): Promise<{ part1: Blob; part2: Blob }> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      video.onloadedmetadata = () => {
        const duration = video.duration;
        const midPoint = duration / 2;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const stream = canvas.captureStream(30); // 30 FPS
        
        let part1Recorder: MediaRecorder;
        let part2Recorder: MediaRecorder;
        let part1Data: Blob[] = [];
        let part2Data: Blob[] = [];
        
        // Record first half with ping-pong effect
        const recordFirstHalf = () => {
          part1Recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
          part1Data = [];
          let isReverse = false;
          
          part1Recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              part1Data.push(event.data);
            }
          };
          
          part1Recorder.onstop = () => {
            const part1Blob = new Blob(part1Data, { type: 'video/webm' });
            recordSecondHalf(part1Blob);
          };
          
          video.currentTime = 0;
          video.play();
          part1Recorder.start();
          
          // Draw frames for first half - forward then backward
          const drawFirstHalf = () => {
            if (!isReverse) {
              // Forward playback
              if (video.currentTime < midPoint && !video.ended) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                requestAnimationFrame(drawFirstHalf);
              } else {
                // Switch to reverse
                isReverse = true;
                video.currentTime = midPoint - 0.033; // Start slightly before end
                video.pause();
                drawReverse();
              }
            }
          };
          
          const drawReverse = () => {
            if (video.currentTime > 0) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              video.currentTime -= 0.033; // Go backward at ~30fps
              requestAnimationFrame(drawReverse);
            } else {
              part1Recorder.stop();
            }
          };
          
          drawFirstHalf();
        };
        
        // Record second half with ping-pong effect
        const recordSecondHalf = (part1Blob: Blob) => {
          part2Recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
          part2Data = [];
          let isReverse = false;
          
          part2Recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              part2Data.push(event.data);
            }
          };
          
          part2Recorder.onstop = () => {
            const part2Blob = new Blob(part2Data, { type: 'video/webm' });
            resolve({ part1: part1Blob, part2: part2Blob });
          };
          
          video.currentTime = midPoint;
          video.pause(); // Make sure video is paused during seek
          
          // Wait for the video to seek to the midpoint and load the frame
          const startSecondHalf = () => {
            // Double-check we're at the right position
            if (Math.abs(video.currentTime - midPoint) > 0.1) {
              video.currentTime = midPoint;
              setTimeout(startSecondHalf, 50);
              return;
            }
            
            // Draw the first frame at midpoint before starting recording
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            video.play();
            part2Recorder.start();
            drawSecondHalf();
          };
          
          video.onseeked = () => {
            video.onseeked = null;
            // Small delay to ensure frame is loaded
            setTimeout(startSecondHalf, 100);
          };
          
          // Draw frames for second half - forward then backward  
          const drawSecondHalf = () => {
            if (!isReverse) {
              // Forward playback
              if (!video.ended && video.currentTime < duration - 0.033) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                requestAnimationFrame(drawSecondHalf);
              } else {
                // Switch to reverse
                isReverse = true;
                video.currentTime = duration - 0.033; // Start slightly before end
                video.pause();
                drawReverseSecond();
              }
            }
          };
          
          const drawReverseSecond = () => {
            if (video.currentTime > midPoint) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              video.currentTime -= 0.033; // Go backward at ~30fps
              requestAnimationFrame(drawReverseSecond);
            } else {
              part2Recorder.stop();
            }
          };
          
          drawSecondHalf();
        };
        
        recordFirstHalf();
      };
      
      video.onerror = () => reject(new Error('Failed to load video'));
      video.src = URL.createObjectURL(file);
    });
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
      
      const { part1, part2 } = await splitVideoLocally(selectedFile);
      
      setUploadState(prev => ({ ...prev, progress: 80 }));
      
      // Generate filenames based on original file
      const baseName = selectedFile.name.replace(/\.[^/.]+$/, "");
      const part1Name = `${baseName}_part1.webm`;
      const part2Name = `${baseName}_part2.webm`;
      
      // Store both parts in state instead of auto-downloading
      setUploadState(prev => ({
        ...prev,
        uploading: false,
        progress: 100,
        splitVideos: {
          part1,
          part2,
          part1Name,
          part2Name
        },
        result: {
          success: true,
          message: 'Video split successfully!',
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

        {uploadState.uploading && (
          <div className="progress-section">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${uploadState.progress}%` }}
              />
            </div>
            <p className="progress-text">Splitting Video: {uploadState.progress}%</p>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploadState.uploading}
          className="upload-btn"
        >
          {uploadState.uploading ? 'Splitting Video...' : 'Split Video Into Two Parts'}
        </button>

        {uploadState.error && (
          <div className="error-message">
            <strong>Error:</strong> {uploadState.error}
          </div>
        )}

        {uploadState.result && uploadState.result.success && uploadState.splitVideos && (
          <div className="success-message">
            <h4>✅ Video Split Successfully!</h4>
            <p>Your video has been split into two parts. Preview and download each part below:</p>
            
            <div className="video-preview-section">
              <div className="video-frames">
                <div className="video-frame">
                  <h5>Part 1 (First Half)</h5>
                  <video
                    ref={part1VideoRef}
                    src={videoUrls.part1Url}
                    controls
                    autoPlay
                    muted
                    loop
                    className="preview-video"
                  />
                  <button 
                    onClick={() => downloadBlob(uploadState.splitVideos!.part1, uploadState.splitVideos!.part1Name)}
                    className="download-btn part1-btn"
                  >
                    📥 Download Part 1
                  </button>
                  <p className="file-name">{uploadState.splitVideos.part1Name}</p>
                </div>
                
                <div className="video-frame">
                  <h5>Part 2 (Second Half)</h5>
                  <video
                    ref={part2VideoRef}
                    src={videoUrls.part2Url}
                    controls
                    muted
                    loop
                    className="preview-video"
                  />
                  <button 
                    onClick={() => downloadBlob(uploadState.splitVideos!.part2, uploadState.splitVideos!.part2Name)}
                    className="download-btn part2-btn"
                  >
                    📥 Download Part 2
                  </button>
                  <p className="file-name">{uploadState.splitVideos.part2Name}</p>
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