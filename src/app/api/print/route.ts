import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();
  console.log('🔧 API Print route called at:', timestamp);
  try {
    const { imageData, printId } = await request.json();
    console.log(`📨 Processing print job ID: ${printId || 'unknown'}`);
    
    if (!imageData) {
      return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
    }

    // แปลง base64 เป็นไฟล์
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // สร้างโฟลเดอร์ temp ถ้ายังไม่มี
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    
    // บันทึกไฟล์ชั่วคราว
    const fileName = `print_${Date.now()}.png`;
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, imageBuffer);

    // พิมพ์ไฟล์
    let printCommand = '';
    try {
      
      if (process.platform === 'darwin') {
        // macOS - ใช้ lp command โดยตรงกับตัวเลือกสำหรับรูปภาพ
        printCommand = `lp -d "EPSON_L3250_Series_2" -o media=A4 -o ColorModel=Color -o quality=5 -o MediaType=plain -n 1 "${filePath}"`;
        console.log('Executing print command:', printCommand);
        
        const result = execSync(printCommand, { 
          encoding: 'utf8',
          timeout: 15000 
        });
        console.log('Print command result:', result);
        console.log('Print job sent to:', 'EPSON_L3250_Series_2');
        
      } else if (process.platform === 'win32') {
        // Windows - ใช้ PowerShell
        printCommand = `powershell.exe -Command "Start-Process -FilePath '${filePath}' -Verb Print"`;
        execSync(printCommand, { timeout: 10000 });
      } else {
        // Linux - ใช้ lp
        printCommand = `lp "${filePath}"`;
        execSync(printCommand, { timeout: 10000 });
      }
      
      // ลบไฟล์ชั่วคราวหลังพิมพ์เสร็จ
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 5000);

      return NextResponse.json({ 
        success: true, 
        message: 'Print job sent successfully',
        fileName 
      });
      
    } catch (printError) {
      // ลบไฟล์ถ้าพิมพ์ไม่สำเร็จ
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      console.error('Print error details:', {
        error: printError,
        message: printError instanceof Error ? printError.message : 'Unknown error',
        platform: process.platform,
        command: printCommand
      });
      
      return NextResponse.json({ 
        error: 'Failed to send print job', 
        details: printError instanceof Error ? printError.message : 'Unknown error',
        platform: process.platform,
        command: printCommand
      }, { status: 500 });
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}