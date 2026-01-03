# Translation Implementation Plan

## 1. Identify and List Untranslated Strings ✅
- Scan all TSX files for plain text strings not using t() or getTranslation
- Exclude privacy and terms of use pages
- List all untranslated lines in translations_needed.md with file paths and line numbers

## 2. Add Translations to Vocabulary ✅
- Add new keys to english and french objects in src/lib/vocabulary.ts
- Ensure translations are accurate and context-appropriate

## 3. Apply t() in Frontend Files ✅
- Update each identified file to use t() function for the untranslated strings
- Test that translations work correctly

## 4. Apply getTranslation in Backend (if needed)
- Check API routes and server-side code for untranslated strings
- Apply getTranslation where applicable

## 5. Verification
- Test the application in both English and French
- Ensure no hardcoded strings remain
- Update translations_needed.md to mark completed items
