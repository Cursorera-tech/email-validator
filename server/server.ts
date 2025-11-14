import express, { Request, Response } from 'express'
import multer from 'multer'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { processXLSXFile, processXLSXFileWithSSE } from './xlsxProcessor'

// Extend Express Request to include multer file
interface MulterRequest extends Request {
  file?: Express.Multer.File
}

// Store active SSE connections
const sseConnections = new Map<string, Response>()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '../public')))

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, 'upload-' + uniqueSuffix + path.extname(file.originalname))
  },
})

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.xlsx', '.xls']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowedExtensions.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Only .xlsx and .xls files are allowed'))
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit (increased from 10MB)
  },
})

// Ensure output directory exists
const outputDir = path.join(__dirname, '../output')
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  ;(res as any).json({ status: 'ok', message: 'Email validator server is running' })
})

// SSE endpoint for real-time validation updates
app.get('/api/validate-emails-stream', (req: Request, res: Response) => {
  const sessionId = (req as any).query.session as string

  if (!sessionId) {
    return (res as any).status(400).json({ error: 'Session ID required' })
  }

  const resAny = res as any

  // Set headers for SSE
  resAny.setHeader('Content-Type', 'text/event-stream')
  resAny.setHeader('Cache-Control', 'no-cache')
  resAny.setHeader('Connection', 'keep-alive')
  resAny.setHeader('Access-Control-Allow-Origin', '*')

  // Store connection
  sseConnections.set(sessionId, resAny)

  // Send initial connection message
  resAny.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`)

  // Handle client disconnect
  ;(req as any).on('close', () => {
    sseConnections.delete(sessionId)
    resAny.end()
  })
})

// Helper function to send SSE message
function sendSSEMessage(sessionId: string, data: any) {
  const connection = sseConnections.get(sessionId)
  if (connection) {
    try {
      const message = `data: ${JSON.stringify(data)}\n\n`
      ;(connection as any).write(message)
      // Force flush if available
      if ((connection as any).flush) {
        (connection as any).flush()
      }
      console.log(`SSE message sent to session ${sessionId}:`, data.type, data.email || '')
    } catch (error) {
      console.error(`Error sending SSE message to session ${sessionId}:`, error)
      sseConnections.delete(sessionId)
    }
  } else {
    console.warn(`No SSE connection found for session ${sessionId}. Available sessions:`, Array.from(sseConnections.keys()))
  }
}

// File upload and validation endpoint
app.post(
  '/api/validate-emails',
  (req: MulterRequest, res: Response, next: any) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        console.error('Multer error:', err)
        if (err.code === 'LIMIT_FILE_SIZE') {
          return (res as any).status(400).json({ 
            error: 'File too large', 
            message: 'File size exceeds the maximum limit of 100MB. Please use a smaller file.' 
          })
        }
        return (res as any).status(400).json({ 
          error: 'File upload error', 
          message: err.message || 'Failed to upload file' 
        })
      }
      next()
    })
  },
  async (req: MulterRequest, res: Response) => {
    const startTime = Date.now()
    
    try {
      if (!req.file) {
        console.log('❌ No file uploaded in request')
        return (res as any).status(400).json({ error: 'No file uploaded' })
      }

      console.log('\n' + '═'.repeat(60))
      console.log('📤 FILE UPLOAD RECEIVED')
      console.log('═'.repeat(60))
      console.log(`File: ${req.file.originalname}`)
      console.log(`Size: ${(req.file.size / 1024).toFixed(2)} KB`)
      console.log(`Path: ${req.file.path}`)

      const emailColumn = ((req as any).body.emailColumn as string) || 'email'
      const senderEmail = (req as any).body.senderEmail as string | undefined

      console.log(`Email column: "${emailColumn}"`)
      if (senderEmail) {
        console.log(`Sender email: "${senderEmail}"`)
      }

      const inputPath = req.file.path
      const outputFilename =
        'validated-' + Date.now() + '-' + req.file.originalname
      const outputPath = path.join(outputDir, outputFilename)
      const sessionId = ((req as any).body.sessionId as string) || null
      
      console.log(`Session ID: ${sessionId}`)
      if (sessionId) {
        console.log(`SSE connections available: ${sseConnections.size}`)
        console.log(`Has connection for session: ${sseConnections.has(sessionId)}`)
      }

      // Wait a bit to ensure SSE connection is established
      if (sessionId && !sseConnections.has(sessionId)) {
        console.log('Waiting for SSE connection to be established...')
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // Process the file with real-time updates if sessionId is provided
      let stats
      if (sessionId) {
        // Process with SSE updates
        stats = await processXLSXFileWithSSE(
          inputPath,
          outputPath,
          emailColumn,
          senderEmail,
          sessionId,
          (data) => {
            console.log(`Sending SSE update: ${data.type}`)
            sendSSEMessage(sessionId, data)
          }
        )
      } else {
        // Process without SSE (fallback)
        stats = await processXLSXFile(
          inputPath,
          outputPath,
          emailColumn,
          senderEmail
        )
      }

      // Clean up uploaded file
      fs.unlinkSync(inputPath)
      console.log('🗑️  Cleaned up uploaded file')

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2)
      console.log(`\n✅ Processing completed in ${totalTime} seconds`)
      console.log('═'.repeat(60) + '\n')

      // Send completion message via SSE if session exists
      if (sessionId) {
        sendSSEMessage(sessionId, {
          type: 'complete',
          stats: {
            total: stats.total,
            valid: stats.valid,
            invalid: stats.invalid,
          },
          downloadUrl: `/api/download/${outputFilename}`,
          filename: outputFilename,
        })
        // Close SSE connection
        const connection = sseConnections.get(sessionId)
        if (connection) {
          ;(connection as any).end()
          sseConnections.delete(sessionId)
        }
      }

      // Return download link
      ;(res as any).json({
        success: true,
        message: 'Email validation completed',
        stats: {
          total: stats.total,
          valid: stats.valid,
          invalid: stats.invalid,
        },
        downloadUrl: `/api/download/${outputFilename}`,
        filename: outputFilename,
        complete: !!sessionId, // Indicate if SSE was used
      })
    } catch (error) {
      console.error('\n❌ ERROR PROCESSING FILE:')
      console.error('─'.repeat(60))
      console.error('Error:', error)
      if (error instanceof Error) {
        console.error('Message:', error.message)
        console.error('Stack:', error.stack)
      }
      console.error('─'.repeat(60) + '\n')
      
      const sessionId = ((req as any).body.sessionId as string) || null
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Send error via SSE if session exists
      if (sessionId) {
        sendSSEMessage(sessionId, {
          type: 'error',
          message: errorMessage,
        })
        const connection = sseConnections.get(sessionId)
        if (connection) {
          ;(connection as any).end()
          sseConnections.delete(sessionId)
        }
      }
      
      // Clean up uploaded file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path)
        console.log('🗑️  Cleaned up uploaded file after error')
      }

      ;(res as any).status(500).json({
        error: 'Failed to process file',
        message: errorMessage,
      })
    }
  }
)

// Download endpoint
app.get('/api/download/:filename', (req: Request, res: Response) => {
  const filename = (req as any).params.filename
  const filePath = path.join(outputDir, filename)

  if (!fs.existsSync(filePath)) {
    return (res as any).status(404).json({ error: 'File not found' })
  }

  ;(res as any).download(filePath, filename, (err: Error | null) => {
    if (err) {
      console.error('Error downloading file:', err)
      ;(res as any).status(500).json({ error: 'Failed to download file' })
    }
  })
})

// Start server
app.listen(PORT, () => {
  console.log('\n' + '═'.repeat(60))
  console.log('🚀 EMAIL VALIDATOR SERVER STARTED')
  console.log('═'.repeat(60))
  console.log(`📍 Server running on http://localhost:${PORT}`)
  console.log(`🌐 Web interface: http://localhost:${PORT}`)
  console.log(`📤 Upload endpoint: http://localhost:${PORT}/api/validate-emails`)
  console.log(`💚 Health check: http://localhost:${PORT}/health`)
  console.log('═'.repeat(60) + '\n')
})

