# Vercel Deployment Guide

## What Was Fixed

The 405 "Method Not Allowed" error was caused by the Express server not being compatible with Vercel's serverless architecture. 

### Changes Made:

1. **Created Vercel-compatible API routes** in the `api/` directory:
   - `api/validate-emails.ts` - Handles POST requests for email validation
   - `api/download/[filename].ts` - Handles file downloads
   - `api/health.ts` - Health check endpoint

2. **Updated `vercel.json`** with proper configuration:
   - Set 300-second timeout for long-running validation tasks
   - Allocated 3GB memory for processing large files
   - Configured proper rewrites for static files

3. **Added TypeScript configuration** for API routes:
   - Created `api/tsconfig.json` for proper compilation
   - Installed `@vercel/node` types

4. **Modified `server/server.ts`**:
   - Server only starts in development mode
   - Exports app for Vercel serverless functions

## Deployment Steps

### Option 1: Automatic Deployment (Recommended)

If your Vercel project is connected to GitHub:

```bash
git push origin main
```

Vercel will automatically detect the push and deploy.

### Option 2: Manual Deployment

```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# Deploy
vercel --prod
```

## Important Notes

### ⚠️ SSE (Server-Sent Events) Limitation

The real-time progress feature using Server-Sent Events (`/api/validate-emails-stream`) **will not work** on Vercel because:
- Vercel uses serverless functions that don't support persistent connections
- Each request has a maximum timeout of 300 seconds (5 minutes)

**Current Behavior:**
- Users upload file
- Validation happens server-side
- Final results are returned when complete
- No real-time progress updates

**Alternatives for Real-Time Updates:**
1. Use polling - Have the frontend check progress periodically
2. Use a different hosting platform (Railway, Render, AWS EC2, DigitalOcean)
3. Implement WebSockets with a separate persistent service

### File Storage

- Uploaded files are stored in `/tmp` directory on Vercel
- Files are automatically cleaned up after processing
- Downloaded files are deleted after 1 second

### Limits

- Maximum file size: 100MB (multer limit)
- Maximum execution time: 300 seconds (5 minutes)
- Maximum memory: 3GB

## Testing the Deployment

After deployment, test these endpoints:

1. **Health Check**
   ```bash
   curl https://your-app.vercel.app/api/health
   ```

2. **File Upload** (use the web interface)
   - Go to: `https://your-app.vercel.app/`
   - Upload an XLSX file
   - Wait for validation to complete
   - Download results

## Troubleshooting

### 405 Method Not Allowed
- Make sure you're using POST for `/api/validate-emails`
- Check that the API files are properly deployed

### Timeout Errors
- Large files may take longer than 5 minutes
- Consider splitting into smaller batches
- Or use a different hosting platform

### Module Not Found Errors
- Ensure all dependencies are in `package.json`
- Run `npm install` before deploying
- Check that `node_modules` is not in `.vercelignore`

## Local Development

To run the server locally:

```bash
# Start the Express server
npm start

# Access at http://localhost:3000
```

The local server includes SSE support for real-time updates.

## Environment Variables

If you need to add environment variables:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add variables as needed
3. Redeploy for changes to take effect

## Support

For Vercel-specific issues, check:
- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Serverless Functions](https://vercel.com/docs/functions/serverless-functions)

