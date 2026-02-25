import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// Set up PDF.js worker - use local copy served from public directory
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * Parse PDF file and extract text content
 */
export async function parsePDF(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = '';
        
        // Extract text from each page
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ');
            
            fullText += `--- Page ${pageNum} ---\n${pageText}\n\n`;
        }
        
        return fullText.trim();
    } catch (error) {
        console.error('Error parsing PDF:', error);
        throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Parse Excel file (xls, xlsx) and extract text content
 */
export async function parseExcel(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        let fullText = '';
        
        // Process each sheet
        workbook.SheetNames.forEach((sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            
            // Convert sheet to CSV format for better readability
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            
            fullText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
        });
        
        return fullText.trim();
    } catch (error) {
        console.error('Error parsing Excel:', error);
        throw new Error(`Failed to parse Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Parse Word document (.docx) - Note: requires additional library
 * For now, we'll just return a message that .docx is not yet supported
 */
export async function parseWord(file: File): Promise<string> {
    // TODO: Implement .docx parsing with mammoth.js or similar
    return `[Word document: ${file.name} - Text extraction not yet implemented. Please convert to PDF or plain text.]`;
}

/**
 * Parse plain text file
 */
export async function parseText(file: File): Promise<string> {
    try {
        return await file.text();
    } catch (error) {
        console.error('Error reading text file:', error);
        throw new Error(`Failed to read text file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Main document parser - routes to appropriate parser based on file type
 */
export async function parseDocument(file: File): Promise<string> {
    const mimeType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();
    
    // PDF files
    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
        return await parsePDF(file);
    }
    
    // Excel files
    if (
        mimeType === 'application/vnd.ms-excel' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        fileName.endsWith('.xls') ||
        fileName.endsWith('.xlsx')
    ) {
        return await parseExcel(file);
    }
    
    // Word files
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileName.endsWith('.docx')
    ) {
        return await parseWord(file);
    }
    
    // Plain text files
    if (mimeType === 'text/plain' || fileName.endsWith('.txt')) {
        return await parseText(file);
    }
    
    // Fallback: try to read as text
    try {
        return await parseText(file);
    } catch {
        throw new Error(`Unsupported file type: ${mimeType || 'unknown'}`);
    }
}
