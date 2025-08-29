import { useState, useRef } from 'react';

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

interface UploadState {
  uploading: boolean;
  progress: number;
  result: UploadResponse | null;
  error: string | null;
}

const VideoUpload = () => {
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    result: null,
    error: null
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
        result: null
      }));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadState(prev => ({
      ...prev,
      uploading: true,
      progress: 0,
      error: null,
      result: null
    }));

    try {
      const formData = new FormData();
      formData.append('video', selectedFile);

      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadState(prev => ({
            ...prev,
            progress
          }));
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        try {
          const response: UploadResponse = JSON.parse(xhr.responseText);
          
          if (xhr.status === 201 && response.success) {
            setUploadState(prev => ({
              ...prev,
              uploading: false,
              result: response,
              progress: 100
            }));
            
            // Reset file input
            setSelectedFile(null);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          } else {
            setUploadState(prev => ({
              ...prev,
              uploading: false,
              error: response.message || 'Upload failed',
              progress: 0
            }));
          }
        } catch (parseError) {
          setUploadState(prev => ({
            ...prev,
            uploading: false,
            error: 'Invalid response from server',
            progress: 0
          }));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        setUploadState(prev => ({
          ...prev,
          uploading: false,
          error: 'Network error during upload',
          progress: 0
        }));
      });

      // Start upload
      xhr.open('POST', 'http://localhost:3001/api/videos/upload');
      xhr.send(formData);

    } catch (error) {
      setUploadState(prev => ({
        ...prev,
        uploading: false,
        error: error instanceof Error ? error.message : 'Upload failed',
        progress: 0
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
        <h3>📹 Upload Video</h3>
        
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
            <p className="progress-text">{uploadState.progress}%</p>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploadState.uploading}
          className="upload-btn"
        >
          {uploadState.uploading ? 'Uploading...' : 'Upload Video'}
        </button>

        {uploadState.error && (
          <div className="error-message">
            <strong>Error:</strong> {uploadState.error}
          </div>
        )}

        {uploadState.result && uploadState.result.success && (
          <div className="success-message">
            <h4>✅ Upload Successful!</h4>
            <div className="upload-details">
              <p><strong>Video ID:</strong> <code>{uploadState.result.data?.videoId}</code></p>
              <p><strong>Original Name:</strong> {uploadState.result.data?.originalName}</p>
              <p><strong>File Size:</strong> {uploadState.result.data?.size ? formatFileSize(uploadState.result.data.size) : 'Unknown'}</p>
              <p><strong>Type:</strong> {uploadState.result.data?.mimeType}</p>
              <p><strong>Uploaded:</strong> {uploadState.result.data?.uploadedAt ? formatDate(uploadState.result.data.uploadedAt) : 'Unknown'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoUpload;