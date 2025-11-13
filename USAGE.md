# XLSX Email Validator - Usage Guide

This application allows you to upload XLSX files containing email addresses, validate them, and download the results with validation status.

## Setup

1. Install dependencies:
```bash
yarn install
# or
npm install
```

2. Start the server:
```bash
yarn start
# or
npm start
```

The server will start on `http://localhost:3000` (or the PORT specified in environment variables).

## Usage

### Web Interface

1. Open your browser and navigate to `http://localhost:3000`
2. Click "Click to browse or drag and drop" to select an XLSX file
3. (Optional) Specify the email column name (default: "email")
4. (Optional) Specify a sender email for SMTP validation
5. Click "Validate Emails"
6. Wait for validation to complete
7. Download the results file

### API Endpoint

You can also use the API directly:

**POST** `/api/validate-emails`

**Form Data:**
- `file`: The XLSX file to upload
- `emailColumn`: (Optional) Name of the column containing emails (default: "email")
- `senderEmail`: (Optional) Email address to use as sender for SMTP validation

**Response:**
```json
{
  "success": true,
  "message": "Email validation completed",
  "stats": {
    "total": 100,
    "valid": 85,
    "invalid": 15
  },
  "downloadUrl": "/api/download/validated-1234567890-file.xlsx",
  "filename": "validated-1234567890-file.xlsx"
}
```

**Download Results:**
- **GET** `/api/download/:filename` - Download the validated results file

## XLSX File Format

Your XLSX file should have a column containing email addresses. By default, the application looks for a column named "email", but you can specify a different column name.

**Example:**
| email | name | company |
|-------|------|---------|
| user1@example.com | John Doe | Company A |
| user2@example.com | Jane Smith | Company B |

The output file will include all original columns plus validation results:
- `valid`: boolean indicating if the email is valid
- `reason`: reason for invalidity (if invalid)
- `validators`: detailed validation results for each validator (regex, typo, disposable, mx, smtp)

## Validation Process

The application validates emails using:
1. **Regex**: Checks if email format is valid
2. **Typo**: Detects common typos (e.g., gmaill.com → gmail.com)
3. **Disposable**: Checks if email is from a disposable email service
4. **MX Records**: Verifies domain has MX records
5. **SMTP**: Validates mailbox exists on SMTP server

## Notes

- Large files may take several minutes to process
- SMTP validation can be slow as it requires connecting to mail servers
- Uploaded files are automatically deleted after processing
- Output files are stored in the `output/` directory
- Maximum file size: 10MB


