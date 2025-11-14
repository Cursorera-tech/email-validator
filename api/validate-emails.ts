import type { VercelRequest, VercelResponse } from '@vercel/node'
import express, { Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { processXLSXFile, processXLSXFileWithSSE } from '../server/xlsxProcessor'
import os from 'os'

// Extend Express Request to include multer file
interface MulterRequest extends Request {
  file?: Express.Multer.File
}

// For Vercel, use temp directory
const uploadDir = path.join(os.tmpdir(), 'uploads')
const outputDir = path.join(os.tmpdir(), 'output')

// Ensure directories exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
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
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const app = express()
  app.use(express.json())

  return new Promise((resolve) => {
    upload.single('file')(req as any, res as any, async (err: any) => {
      if (err) {
        console.error('Multer error:', err)
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ 
            error: 'File too large', 
            message: 'File size exceeds the maximum limit of 100MB. Please use a smaller file.' 
          })
          return resolve(null)
        }
        res.status(400).json({ 
          error: 'File upload error', 
          message: err.message || 'Failed to upload file' 
        })
        return resolve(null)
      }

      const multerReq = req as any as MulterRequest
      
      try {
        if (!multerReq.file) {
          console.log('❌ No file uploaded in request')
          res.status(400).json({ error: 'No file uploaded' })
          return resolve(null)
        }

        console.log('\n' + '═'.repeat(60))
        console.log('📤 FILE UPLOAD RECEIVED')
        console.log('═'.repeat(60))
        console.log(`File: ${multerReq.file.originalname}`)
        console.log(`Size: ${(multerReq.file.size / 1024).toFixed(2)} KB`)
        console.log(`Path: ${multerReq.file.path}`)

        const emailColumn = (req.body as any).emailColumn || 'email'
        const senderEmail = (req.body as any).senderEmail

        console.log(`Email column: "${emailColumn}"`)
        if (senderEmail) {
          console.log(`Sender email: "${senderEmail}"`)
        }

        const inputPath = multerReq.file.path
        const outputFilename = 'validated-' + Date.now() + '-' + multerReq.file.originalname
        const outputPath = path.join(outputDir, outputFilename)

        // Process without SSE for Vercel (stateless)
        const stats = await processXLSXFile(
          inputPath,
          outputPath,
          emailColumn,
          senderEmail
        )

        // Clean up uploaded file
        if (fs.existsSync(inputPath)) {
          fs.unlinkSync(inputPath)
          console.log('🗑️  Cleaned up uploaded file')
        }

        console.log('\n✅ Processing completed')
        console.log('═'.repeat(60) + '\n')

        // Return download link
        res.json({
          success: true,
          message: 'Email validation completed',
          stats: {
            total: stats.total,
            valid: stats.valid,
            invalid: stats.invalid,
          },
          downloadUrl: `/api/download/${outputFilename}`,
          filename: outputFilename,
          complete: true,
        })
        resolve(null)
      } catch (error) {
        console.error('\n❌ ERROR PROCESSING FILE:')
        console.error('─'.repeat(60))
        console.error('Error:', error)
        if (error instanceof Error) {
          console.error('Message:', error.message)
          console.error('Stack:', error.stack)
        }
        console.error('─'.repeat(60) + '\n')
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        // Clean up uploaded file if it exists
        if (multerReq.file && fs.existsSync(multerReq.file.path)) {
          fs.unlinkSync(multerReq.file.path)
          console.log('🗑️  Cleaned up uploaded file after error')
        }

        res.status(500).json({
          error: 'Failed to process file',
          message: errorMessage,
        })
        resolve(null)
      }
    })
  })
}

// Disable body parsing, let multer handle it
export const config = {
  api: {
    bodyParser: false,
  },
}

