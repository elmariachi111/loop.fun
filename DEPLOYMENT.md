# loop.fun Deployment Guide

This project is configured for separate deployment of frontend and backend to optimize for Vercel's limitations.

## Architecture

- **Frontend**: Deployed to Vercel (main domain: `loop.fun`)
- **Backend**: Deployed separately (API subdomain: `api.loop.fun`)

## Frontend Deployment (Vercel)

### Prerequisites
- Vercel account connected to your GitHub repository
- Domain `loop.fun` configured in Vercel

### Environment Variables
Set these in your Vercel project settings:
```
VITE_API_BASE_URL=https://api.loop.fun
```

### Deploy Frontend
1. Push to main branch - Vercel will auto-deploy
2. Or manually deploy: `vercel --prod`

### Configuration
- `vercel.json` - Vercel deployment configuration
- `.vercelignore` - Excludes server files from frontend build
- Rewrites API calls to `api.loop.fun` subdomain
- Security headers configured

## Backend Deployment Options

### Option 1: Railway
```bash
cd server
railway login
railway init
railway up
```

### Option 2: Render
1. Create new Web Service on Render
2. Connect your GitHub repository
3. Set build command: `cd server && npm install && npm run build`
4. Set start command: `cd server && npm start`
5. Set environment variables:
   - `NODE_ENV=production`
   - `PORT=10000` (or Render's PORT)

### Option 3: DigitalOcean App Platform
```yaml
# app.yaml
name: loopfun-api
services:
  - name: api
    source_dir: /server
    github:
      repo: your-repo
      branch: main
    build_command: npm install && npm run build
    run_command: npm start
    environment_slug: node-js
    instance_count: 1
    instance_size_slug: basic-xxs
    envs:
      - key: NODE_ENV
        value: production
```

### Option 4: Heroku
```bash
# Create separate git repo for server
cd server
git init
git add .
git commit -m "Initial server commit"

# Deploy to Heroku
heroku create loopfun-api
git push heroku main
```

## Environment Configuration

### Development
```bash
# .env.local
VITE_API_BASE_URL=http://localhost:3001
```

### Production
- Frontend: `VITE_API_BASE_URL=https://api.loop.fun`
- Backend: Configured via platform environment variables

## CORS Configuration

The server is configured to accept requests from:
- `*.loop.fun` (production domain and subdomains)
- `localhost` (development)
- `*.vercel.app` (Vercel preview deployments)

## File Upload Considerations

### Storage Options for Production:
1. **Local Disk** (current setup)
   - Good for single-server deployments
   - Requires persistent storage volume

2. **Cloud Storage** (recommended for scale)
   - AWS S3, Google Cloud Storage, or Azure Blob
   - Update multer configuration to use cloud storage

3. **CDN Integration**
   - CloudFront, CloudFlare, or similar
   - For optimized video delivery

## Build Commands

### Frontend Only
```bash
npm run build
```

### Full Build (Frontend + Server)
```bash
npm run build:full
```

### Server Only
```bash
cd server
npm run build
```

## Monitoring & Logging

Configure logging and monitoring for production:
- Server logs via Morgan middleware
- Error tracking (Sentry, etc.)
- Performance monitoring
- File upload analytics

## Domain Setup

1. Point `loop.fun` to Vercel
2. Point `api.loop.fun` to your backend hosting service
3. Configure SSL certificates on both

## Scaling Considerations

- Backend: Horizontal scaling with load balancer
- File uploads: Implement cloud storage
- Database: Add persistent database (PostgreSQL, MongoDB)
- Caching: Redis for session/metadata caching
- CDN: For global video delivery