# Cloudflare Pages Deployment Guide

## Build Configuration

In your Cloudflare Pages dashboard, set the following:

### Build Settings

- **Build command**: `npm run build`
- **Deploy command**: `npx wrangler pages deploy dist`
- **Non-production branch deploy command**: `npx wrangler pages deploy dist --branch=$CF_PAGES_BRANCH`
- **Path**: `/` (root)

### Package Manager

⚠️ **Important**: This project uses **npm**, not yarn. Make sure:
- `yarn.lock` is **not** in the repository (it has been removed)
- `package-lock.json` **is** present and committed
- Cloudflare will auto-detect npm when only `package-lock.json` exists

### Environment Variables (if needed)

Add any required environment variables in the Cloudflare Pages dashboard under Settings → Environment Variables.

## Project Structure

```
email-validator/
├── functions/           # Cloudflare Pages Functions
│   ├── api/
│   │   └── validate-emails.ts
│   └── health.ts
├── public/              # Static files (HTML, CSS, JS)
├── server/              # Server code (used by functions)
├── src/                 # Email validation library
├── dist/                # Build output (generated)
├── wrangler.toml        # Cloudflare configuration
└── package.json
```

## How It Works

1. **Build Process**:
   - TypeScript compiles to `dist/`
   - Public files are copied to `dist/public/`
   - Functions in `functions/` are automatically discovered by Cloudflare

2. **Functions**:
   - `functions/health.ts` → `GET /health`
   - `functions/api/validate-emails.ts` → `POST /api/validate-emails`

3. **Static Files**:
   - Files in `public/` are served at the root
   - `public/index.html` → `/`

## Deployment Steps

### Option 1: Via Cloudflare Dashboard

1. Connect your GitHub repository to Cloudflare Pages
2. Set build configuration as shown above
3. Deploy automatically on push to main branch

### Option 2: Via Wrangler CLI

```bash
# Install dependencies
npm install

# Build
npm run build

# Deploy
npx wrangler pages deploy dist
```

## Important Notes

### File Storage

- Files are temporarily stored in `/tmp` during processing
- For production, consider using **Cloudflare R2** for file storage
- Current implementation returns file as base64 in response (not ideal for large files)

### Limitations

- **File Size**: 100MB limit (Cloudflare Pages has a 100MB request size limit)
- **Execution Time**: 30 seconds default (can be increased in Cloudflare dashboard)
- **Memory**: Limited by Cloudflare Pages plan

### Recommended Improvements

1. **Use R2 for File Storage**:
   - Upload files to R2 bucket
   - Return download URLs instead of base64
   - Better for large files

2. **Increase Timeout**:
   - Go to Cloudflare Pages → Settings → Functions
   - Increase timeout for `/api/validate-emails` function

3. **Add Caching**:
   - Cache validation results if processing same files
   - Use Cloudflare KV or Durable Objects

## Troubleshooting

### Build Errors

#### TypeScript Module Resolution Errors

If you see errors like `Cannot find module '../src/output/output'`:

1. **Verify local build works**:
   ```bash
   npm install
   npm run build
   ```

2. **Check TypeScript version**: Ensure `typescript` is in `devDependencies` (currently `^5.9.3`)

3. **Verify module resolution**: The `tsconfig.json` should have:
   - `"moduleResolution": "node"`
   - `"baseUrl": "."`
   - `"typeRoots": ["./node_modules/@types"]`

4. **Clear Cloudflare cache**: In Cloudflare Pages dashboard, try clearing the build cache and redeploying

5. **Check file paths**: Ensure all files exist and paths are correct (case-sensitive)

#### Other Build Issues

- Ensure `@types/node` is installed
- Check that all dependencies are in `package.json`
- Verify TypeScript compilation succeeds locally
- Check Cloudflare build logs for specific error messages

### Function Not Found

- Ensure functions are in `functions/` directory
- Functions must export `onRequestGet`, `onRequestPost`, etc.
- Check function file naming matches route

### File Upload Issues

- Check file size limits
- Verify multipart/form-data is being sent correctly
- Check Cloudflare Pages logs for errors

## Testing Locally

```bash
# Install wrangler
npm install -g wrangler

# Start local development server
npx wrangler pages dev dist
```

## Support

For Cloudflare-specific issues:
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Cloudflare Functions Docs](https://developers.cloudflare.com/pages/platform/functions/)

