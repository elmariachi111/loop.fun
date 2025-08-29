// API configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.loop.fun';

export const apiConfig = {
  baseURL: API_BASE_URL,
  endpoints: {
    health: '/api/health',
    videoUpload: '/api/videos/upload',
    videoGet: '/api/videos',
    videoStream: '/api/videos',
    videoDelete: '/api/videos'
  }
};

// Helper function to build full API URLs
export const buildApiUrl = (endpoint: string): string => {
  return `${apiConfig.baseURL}${endpoint}`;
};

// Helper function for video-specific endpoints
export const videoEndpoints = {
  upload: () => buildApiUrl(apiConfig.endpoints.videoUpload),
  get: (videoId: string) => buildApiUrl(`${apiConfig.endpoints.videoGet}/${videoId}`),
  stream: (videoId: string) => buildApiUrl(`${apiConfig.endpoints.videoStream}/${videoId}/stream`),
  list: () => buildApiUrl(apiConfig.endpoints.videoGet),
  delete: (videoId: string) => buildApiUrl(`${apiConfig.endpoints.videoDelete}/${videoId}`),
  process: (videoId: string) => buildApiUrl(`${apiConfig.endpoints.videoGet}/${videoId}/process`),
  download: (videoId: string) => buildApiUrl(`${apiConfig.endpoints.videoGet}/${videoId}/download`)
};

export default apiConfig;