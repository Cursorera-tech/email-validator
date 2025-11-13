import * as XLSX from 'xlsx'
import { validate } from '../src/index'
import { OutputFormat } from '../src/output/output'

export interface EmailRow {
  email: string
  [key: string]: any
}

export interface ValidationResult {
  email: string
  valid: boolean
  reason?: string
  validators?: {
    regex?: { valid: boolean; reason?: string }
    typo?: { valid: boolean; reason?: string }
    disposable?: { valid: boolean; reason?: string }
    mx?: { valid: boolean; reason?: string }
    smtp?: { valid: boolean; reason?: string }
  }
  [key: string]: any
}

/**
 * Reads emails from an XLSX file
 * Assumes emails are in the first column or a column named 'email'
 */
export function readEmailsFromXLSX(filePath: string): EmailRow[] {
  console.log(`\n📄 Reading emails from file: ${filePath}`)
  const workbook = XLSX.readFile(filePath)
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const data: EmailRow[] = XLSX.utils.sheet_to_json(worksheet)
  
  console.log(`✅ Found ${data.length} rows in sheet "${sheetName}"`)
  return data
}

/**
 * Validates emails and returns results
 */
export async function validateEmails(
  emails: EmailRow[],
  emailColumn: string = 'email',
  senderEmail?: string
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []
  const total = emails.length
  
  console.log(`\n🔍 Starting validation of ${total} emails...`)
  console.log(`📧 Email column: "${emailColumn}"`)
  if (senderEmail) {
    console.log(`📤 Sender email: "${senderEmail}"`)
  }
  console.log('─'.repeat(60))

  for (let i = 0; i < emails.length; i++) {
    const row = emails[i]
    const email = row[emailColumn] || row[Object.keys(row)[0]]
    const current = i + 1
    
    if (!email || typeof email !== 'string') {
      console.log(`[${current}/${total}] ❌ Invalid: "${email || '(empty)'}" - Invalid email format`)
      results.push({
        ...row,
        email: email || '',
        valid: false,
        reason: 'Invalid email format',
      })
      continue
    }

    const emailToValidate = email.trim()
    console.log(`[${current}/${total}] 🔄 Validating: ${emailToValidate}`)

    try {
      const validationResult: OutputFormat = await validate({
        email: emailToValidate,
        sender: senderEmail || emailToValidate,
        validateRegex: true,
        validateMx: true,
        validateTypo: true,
        validateDisposable: true,
        validateSMTP: true,
      })

      const isValid = validationResult.valid
      const status = isValid ? '✅ VALID' : '❌ INVALID'
      const reason = validationResult.reason ? ` (${validationResult.reason})` : ''
      
      console.log(`[${current}/${total}] ${status}: ${emailToValidate}${reason}`)
      
      // Log detailed validator results
      if (validationResult.validators) {
        const validators = validationResult.validators
        const validatorStatuses = []
        if (validators.regex) validatorStatuses.push(`regex:${validators.regex.valid ? '✓' : '✗'}`)
        if (validators.typo) validatorStatuses.push(`typo:${validators.typo.valid ? '✓' : '✗'}`)
        if (validators.disposable) validatorStatuses.push(`disposable:${validators.disposable.valid ? '✓' : '✗'}`)
        if (validators.mx) validatorStatuses.push(`mx:${validators.mx.valid ? '✓' : '✗'}`)
        if (validators.smtp) validatorStatuses.push(`smtp:${validators.smtp.valid ? '✓' : '✗'}`)
        
        if (validatorStatuses.length > 0) {
          console.log(`    └─ Validators: ${validatorStatuses.join(', ')}`)
        }
        
        // Log specific failure reasons
        if (!isValid && validationResult.reason) {
          const failedValidator = validators[validationResult.reason as keyof typeof validators]
          if (failedValidator && failedValidator.reason) {
            console.log(`    └─ Reason: ${failedValidator.reason}`)
          }
        }
      }

      results.push({
        ...row,
        email: emailToValidate,
        valid: isValid,
        reason: validationResult.reason,
        validators: validationResult.validators,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log(`[${current}/${total}] ❌ ERROR: ${emailToValidate} - ${errorMessage}`)
      results.push({
        ...row,
        email: emailToValidate,
        valid: false,
        reason: `Validation error: ${errorMessage}`,
      })
    }
  }

  console.log('─'.repeat(60))
  return results
}

/**
 * Writes validation results to an XLSX file
 */
export function writeResultsToXLSX(
  results: ValidationResult[],
  outputPath: string
): void {
  // Create a new workbook
  const workbook = XLSX.utils.book_new()

  // Convert results to worksheet format
  const worksheet = XLSX.utils.json_to_sheet(results)

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Validation Results')

  // Write file
  XLSX.writeFile(workbook, outputPath)
}

/**
 * Processes an XLSX file: reads emails, validates them, and writes results
 */
export async function processXLSXFile(
  inputPath: string,
  outputPath: string,
  emailColumn: string = 'email',
  senderEmail?: string
): Promise<{ total: number; valid: number; invalid: number }> {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 Starting XLSX Email Validation Process')
  console.log('='.repeat(60))
  
  // Read emails from file
  const emails = readEmailsFromXLSX(inputPath)

  if (emails.length === 0) {
    console.log('⚠️  No emails found in the file!')
    return { total: 0, valid: 0, invalid: 0 }
  }

  // Validate emails
  const startTime = Date.now()
  const results = await validateEmails(emails, emailColumn, senderEmail)
  const endTime = Date.now()
  const duration = ((endTime - startTime) / 1000).toFixed(2)

  // Count valid/invalid
  const valid = results.filter((r) => r.valid).length
  const invalid = results.filter((r) => !r.valid).length

  // Log summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 VALIDATION SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total emails processed: ${results.length}`)
  console.log(`✅ Valid emails: ${valid} (${((valid / results.length) * 100).toFixed(1)}%)`)
  console.log(`❌ Invalid emails: ${invalid} (${((invalid / results.length) * 100).toFixed(1)}%)`)
  console.log(`⏱️  Time taken: ${duration} seconds`)
  console.log('='.repeat(60))

  // Write results to file
  console.log(`\n💾 Writing results to: ${outputPath}`)
  writeResultsToXLSX(results, outputPath)
  console.log('✅ Results file saved successfully!')

  return {
    total: results.length,
    valid,
    invalid,
  }
}

/**
 * Validates emails with SSE callback for real-time updates
 */
export async function validateEmailsWithSSE(
  emails: EmailRow[],
  emailColumn: string = 'email',
  senderEmail?: string,
  onEmailValidated?: (email: string, valid: boolean, reason?: string) => void
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []
  const total = emails.length
  
  console.log(`\n🔍 Starting validation of ${total} emails...`)
  console.log(`📧 Email column: "${emailColumn}"`)
  if (senderEmail) {
    console.log(`📤 Sender email: "${senderEmail}"`)
  }
  console.log('─'.repeat(60))

  for (let i = 0; i < emails.length; i++) {
    const row = emails[i]
    const email = row[emailColumn] || row[Object.keys(row)[0]]
    const current = i + 1
    
    if (!email || typeof email !== 'string') {
      console.log(`[${current}/${total}] ❌ Invalid: "${email || '(empty)'}" - Invalid email format`)
      const result = {
        ...row,
        email: email || '',
        valid: false,
        reason: 'Invalid email format',
      }
      results.push(result)
      if (onEmailValidated) {
        onEmailValidated(email || '', false, 'Invalid email format')
      }
      continue
    }

    const emailToValidate = email.trim()
    console.log(`[${current}/${total}] 🔄 Validating: ${emailToValidate}`)

    try {
      const validationResult: OutputFormat = await validate({
        email: emailToValidate,
        sender: senderEmail || emailToValidate,
        validateRegex: true,
        validateMx: true,
        validateTypo: true,
        validateDisposable: true,
        validateSMTP: true,
      })

      const isValid = validationResult.valid
      const status = isValid ? '✅ VALID' : '❌ INVALID'
      const reason = validationResult.reason ? ` (${validationResult.reason})` : ''
      
      console.log(`[${current}/${total}] ${status}: ${emailToValidate}${reason}`)
      
      // Log detailed validator results
      if (validationResult.validators) {
        const validators = validationResult.validators
        const validatorStatuses = []
        if (validators.regex) validatorStatuses.push(`regex:${validators.regex.valid ? '✓' : '✗'}`)
        if (validators.typo) validatorStatuses.push(`typo:${validators.typo.valid ? '✓' : '✗'}`)
        if (validators.disposable) validatorStatuses.push(`disposable:${validators.disposable.valid ? '✓' : '✗'}`)
        if (validators.mx) validatorStatuses.push(`mx:${validators.mx.valid ? '✓' : '✗'}`)
        if (validators.smtp) validatorStatuses.push(`smtp:${validators.smtp.valid ? '✓' : '✗'}`)
        
        if (validatorStatuses.length > 0) {
          console.log(`    └─ Validators: ${validatorStatuses.join(', ')}`)
        }
        
        // Log specific failure reasons
        if (!isValid && validationResult.reason) {
          const failedValidator = validators[validationResult.reason as keyof typeof validators]
          if (failedValidator && failedValidator.reason) {
            console.log(`    └─ Reason: ${failedValidator.reason}`)
          }
        }
      }

      const result = {
        ...row,
        email: emailToValidate,
        valid: isValid,
        reason: validationResult.reason,
        validators: validationResult.validators,
      }
      results.push(result)

      // Send SSE update
      if (onEmailValidated) {
        onEmailValidated(emailToValidate, isValid, validationResult.reason)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log(`[${current}/${total}] ❌ ERROR: ${emailToValidate} - ${errorMessage}`)
      const result = {
        ...row,
        email: emailToValidate,
        valid: false,
        reason: `Validation error: ${errorMessage}`,
      }
      results.push(result)
      if (onEmailValidated) {
        onEmailValidated(emailToValidate, false, `Validation error: ${errorMessage}`)
      }
    }
  }

  console.log('─'.repeat(60))
  return results
}

/**
 * Processes an XLSX file with SSE updates for real-time validation
 */
export async function processXLSXFileWithSSE(
  inputPath: string,
  outputPath: string,
  emailColumn: string = 'email',
  senderEmail?: string,
  sessionId: string = '',
  sendSSE?: (data: any) => void
): Promise<{ total: number; valid: number; invalid: number }> {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 Starting XLSX Email Validation Process (with SSE)')
  console.log('='.repeat(60))
  
  // Read emails from file
  const emails = readEmailsFromXLSX(inputPath)

  if (emails.length === 0) {
    console.log('⚠️  No emails found in the file!')
    if (sendSSE) {
      sendSSE({ type: 'error', message: 'No emails found in the file' })
    }
    return { total: 0, valid: 0, invalid: 0 }
  }

  // Send start event with total count
  if (sendSSE) {
    sendSSE({
      type: 'start',
      total: emails.length,
    })
  }

  // Validate emails with SSE callback
  const startTime = Date.now()
  const results = await validateEmailsWithSSE(
    emails,
    emailColumn,
    senderEmail,
    (email, valid, reason) => {
      // Send SSE update for each email
      if (sendSSE) {
        sendSSE({
          type: 'email',
          email,
          valid,
          reason,
        })
      }
    }
  )
  const endTime = Date.now()
  const duration = ((endTime - startTime) / 1000).toFixed(2)

  // Count valid/invalid
  const valid = results.filter((r) => r.valid).length
  const invalid = results.filter((r) => !r.valid).length

  // Log summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 VALIDATION SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total emails processed: ${results.length}`)
  console.log(`✅ Valid emails: ${valid} (${((valid / results.length) * 100).toFixed(1)}%)`)
  console.log(`❌ Invalid emails: ${invalid} (${((invalid / results.length) * 100).toFixed(1)}%)`)
  console.log(`⏱️  Time taken: ${duration} seconds`)
  console.log('='.repeat(60))

  // Write results to file
  console.log(`\n💾 Writing results to: ${outputPath}`)
  writeResultsToXLSX(results, outputPath)
  console.log('✅ Results file saved successfully!')

  return {
    total: results.length,
    valid,
    invalid,
  }
}

