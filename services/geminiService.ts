
import { GoogleGenAI, Type } from "@google/genai";
import { ProcessingResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const PROCESSING_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transactionType: {
      type: Type.STRING,
      description: "One of: INITIAL_SETUP, SALE, PURCHASE. Use PURCHASE for bulk inventory additions.",
    },
    summary: {
      type: Type.STRING,
      description: "A human-readable summary of the sync operation.",
    },
    customerInfo: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        email: { type: Type.STRING },
        contact: { type: Type.STRING },
      },
      required: ["name"]
    },
    extractedItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sku: { type: Type.STRING },
          name: { type: Type.STRING, description: "Full descriptive name of the product" },
          grade: { type: Type.STRING, description: "The specific material grade (e.g. 304, 316, 202, MS)" },
          size: { type: Type.STRING, description: "The exact size variant" },
          qty: { type: Type.NUMBER, description: "The current stock quantity listed" },
          price: { type: Type.NUMBER, description: "Unit price if available" },
        },
        required: ["name", "grade", "size", "qty"]
      },
    },
    alerts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["transactionType", "summary", "extractedItems"],
};

export async function processLedgerInput(
  input: { data?: string; mimeType?: string; text?: string },
  currentInventoryContext: string
): Promise<ProcessingResult> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    You are the "Nivee Metal Master Sync Engine". Your primary goal is 100% ACCURACY in extracting inventory data.
    
    CRITICAL INSTRUCTIONS FOR INDUSTRIAL STOCK SHEETS:
    1. CONTEXTUAL EXTRACTION: The input data is often sparse. A product category (e.g., "SS 304 IC Ball Valve 1PC S/E") is usually in its own row. EVERY subsequent row with a SIZE (e.g., "1/4", "1/2") belongs to that parent product category until a NEW category name is found.
    2. EXHAUSTIVE SCAN: Do NOT skip rows. If a row has a Size and a Total Quantity, it MUST be extracted.
    3. GRADE PRECISION: Pay extremely close attention to "304", "316", "202", and "MS". These must be correctly assigned to the 'grade' property.
    4. SIZE NORMALIZATION: Convert variants like '1/2 inch', '1/2"', '1/2' to a standard '1/2"'.
    5. SKU MATCHING: Check the "Current Inventory Status" provided below. If Name+Grade+Size matches an existing record, use that SKU. Otherwise, create a unique one.
    
    Current Inventory Status (JSON):
    ${currentInventoryContext}
    
    EXPECTATION:
    - If this is a bulk file upload, return ALL identified items as 'extractedItems' with transactionType 'PURCHASE'.
    - If it's an invoice, return items with transactionType 'SALE'.
  `;

  const parts: any[] = [{ text: prompt }];
  
  if (input.data && input.mimeType) {
    const base64Data = input.data.includes(',') ? input.data.split(',')[1] : input.data;
    parts.push({
      inlineData: {
        data: base64Data,
        mimeType: input.mimeType,
      },
    });
  } else if (input.text) {
    parts.push({ text: `Sync Request: ${input.text}` });
  }

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: PROCESSING_SCHEMA,
    },
  });

  try {
    const text = response.text;
    if (!text) throw new Error("Empty engine response");
    const parsed = JSON.parse(text);
    
    // Safety check for empty results
    if (!parsed.extractedItems || parsed.extractedItems.length === 0) {
        parsed.alerts = [...(parsed.alerts || []), "Engine detected no inventory lines in the provided source."];
    }
    
    return parsed as ProcessingResult;
  } catch (e) {
    console.error("AI Engine Sync Failure:", e);
    return {
      transactionType: 'UNKNOWN',
      summary: 'Critical failure during engine synchronization.',
      extractedItems: [],
      alerts: ['Internal parser error. Please ensure the file format is valid.'],
      affectedItems: []
    };
  }
}

export async function generateChallanMarkdown(customerName: string, items: any[]): Promise<string> {
    const model = "gemini-3-flash-preview";
    const prompt = `Create a professional Nivee Metal Delivery Challan. 
    Customer: ${customerName}. 
    Items: ${JSON.stringify(items)}. 
    Return ONLY standard markdown table.`;

    const response = await ai.models.generateContent({
        model,
        contents: { parts: [{ text: prompt }] }
    });
    return response.text || "Error generating document.";
}
