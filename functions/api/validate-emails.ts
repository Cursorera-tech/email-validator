import { processXLSXFile } from '../../server/xlsxProcessor'
import * as XLSX from 'xlsx'
import path from 'path'
import os from 'os'
import fs from 'fs'

export async function onRequestPost(context: any) {
  const { request } = context
  
  try {
    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file uploaded' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Validate file type
    const allowedExtensions = ['.xlsx', '.xls']
    const fileName = file.name.toLowerCase()
    const ext = path.extname(fileName)
    
    if (!allowedExtensions.includes(ext)) {
      return new Response(
        JSON.stringify({ error: 'Only .xlsx and .xls files are allowed' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Check file size (100MB limit)
    const fileSize = file.size
    const maxSize = 100 * 1024 * 1024 // 100MB
    
    if (fileSize > maxSize) {
      return new Response(
        JSON.stringify({ 
          error: 'File too large',
          message: 'File size exceeds the maximum limit of 100MB. Please use a smaller file.'
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Get form data
    const emailColumn = (formData.get('emailColumn') as string) || 'email'
    const senderEmail = formData.get('senderEmail') as string | undefined

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Create temporary directories
    const uploadDir = path.join(os.tmpdir(), 'uploads')
    const outputDir = path.join(os.tmpdir(), 'output')
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // Save uploaded file
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const inputFilename = 'upload-' + uniqueSuffix + ext
    const inputPath = path.join(uploadDir, inputFilename)
    fs.writeFileSync(inputPath, buffer)

    // Generate output filename
    const outputFilename = 'validated-' + Date.now() + '-' + file.name
    const outputPath = path.join(outputDir, outputFilename)

    console.log('📤 Processing file:', file.name)
    console.log('📊 Size:', (fileSize / 1024).toFixed(2), 'KB')
    console.log('📧 Email column:', emailColumn)

    // Process the file
    const stats = await processXLSXFile(
      inputPath,
      outputPath,
      emailColumn,
      senderEmail
    )

    // Read output file
    const outputBuffer = fs.readFileSync(outputPath)

    // Clean up files
    if (fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath)
    }
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath)
    }

    console.log('✅ Processing completed')
    console.log('📊 Stats:', stats)

    // Return results with file as base64 or use R2 storage
    // For now, we'll return stats and suggest using R2 for file storage
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email validation completed',
        stats: {
          total: stats.total,
          valid: stats.valid,
          invalid: stats.invalid,
        },
        // Note: For production, upload to R2 and return download URL
        fileData: outputBuffer.toString('base64'),
        filename: outputFilename,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  } catch (error) {
    console.error('❌ ERROR PROCESSING FILE:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return new Response(
      JSON.stringify({
        error: 'Failed to process file',
        message: errorMessage,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

