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
  parts: Blob[];
  partNames: string[];
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
  const [numberOfParts, setNumberOfParts] = useState<number>(2);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

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
    } else {
      // Clean up previous URLs
      videoUrls.forEach(url => URL.revokeObjectURL(url));
      setVideoUrls([]);
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
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      video.onloadedmetadata = () => {
        const duration = video.duration;
        const partDuration = duration / numParts;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const stream = canvas.captureStream(30); // 30 FPS
        
        const parts: Blob[] = [];
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        const partNames: string[] = [];
        
        let currentPartIndex = 0;
        
        const recordPart = (partIndex: number) => {
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
          const partData: Blob[] = [];
          let isReverse = false;
          
          const startTime = partIndex * partDuration;
          const endTime = (partIndex + 1) * partDuration;
          
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              partData.push(event.data);
            }
          };
          
          recorder.onstop = () => {
            const partBlob = new Blob(partData, { type: 'video/webm' });
            parts[partIndex] = partBlob;
            partNames[partIndex] = `${baseName}_part${partIndex + 1}.webm`;
            
            // Record next part or finish
            if (partIndex + 1 < numParts) {
              recordPart(partIndex + 1);
            } else {
              resolve({ parts, partNames });
            }
          };
          
          // Set video to start position and wait for seek
          video.currentTime = startTime;
          video.pause();
          
          const startRecording = () => {
            // Double-check position
            if (Math.abs(video.currentTime - startTime) > 0.1) {
              video.currentTime = startTime;
              setTimeout(startRecording, 50);
              return;
            }
            
            // Draw the first frame before starting
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            video.play();
            recorder.start();
            drawPart();
          };
          
          video.onseeked = () => {
            video.onseeked = null;
            setTimeout(startRecording, 100);
          };
          
          // Draw frames for this part - forward then backward
          const drawPart = () => {
            if (!isReverse) {
              // Forward playback
              if (video.currentTime < endTime - 0.033 && !video.ended) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                requestAnimationFrame(drawPart);
              } else {
                // Switch to reverse
                isReverse = true;
                video.currentTime = endTime - 0.033;
                video.pause();
                drawReverse();
              }
            }
          };
          
          const drawReverse = () => {
            if (video.currentTime > startTime) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              video.currentTime -= 0.033;
              requestAnimationFrame(drawReverse);
            } else {
              recorder.stop();
            }
          };
        };
        
        // Start recording first part
        recordPart(0);
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
          {uploadState.uploading ? 'Splitting Video...' : `Split Video Into ${numberOfParts} Parts`}
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
              <div className="video-frames">
                {uploadState.splitVideos.parts.map((part, index) => (
                  <div key={index} className="video-frame">
                    <h5>Part {index + 1}</h5>
                    <video
                      ref={(el) => {
                        if (videoRefs.current) {
                          videoRefs.current[index] = el;
                        }
                      }}
                      src={videoUrls[index]}
                      controls
                      autoPlay={index === 0} // Only autoplay first video
                      muted
                      loop
                      className="preview-video"
                    />
                    <button 
                      onClick={() => downloadBlob(part, uploadState.splitVideos!.partNames[index])}
                      className={`download-btn part${index + 1}-btn`}
                    >
                      📥 Download Part {index + 1}
                    </button>
                    <p className="file-name">{uploadState.splitVideos.partNames[index]}</p>
                  </div>
                ))}
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