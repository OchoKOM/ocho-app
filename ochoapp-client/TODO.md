# TODO: Encrypt Data Export

## Backend Changes
- [x] Import CryptoJS in `src/app/api/users/export/route.ts`
- [x] Retrieve `INTERNAL_SERVER_SECRET` from environment variables
- [x] Encrypt the JSON data using `CryptoJS.AES.encrypt`
- [x] Update response headers: `Content-Type` to 'application/octet-stream' and `Content-Disposition` to 'attachment; filename="user-data.kom"'

## Frontend Changes
- [x] Update download filename in `src/app/(main)/settings/ExportDataDialog.tsx` to 'user-data.kom'

## Testing
- [ ] Test the export functionality to ensure encryption and correct file extension
  - Ensure INTERNAL_SERVER_SECRET is set in environment variables
  - Export data and verify the file is downloaded as 'user-data.kom'
  - Verify the file content is encrypted (not readable JSON)
