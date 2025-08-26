import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();
  console.log('🔧 API Print route called at:', timestamp);
  console.log('🌍 Environment:', process.env.NODE_ENV);
  console.log('🏗️ Platform:', process.platform);
  
  try {
    const { imageData, printId } = await request.json();
    console.log(`📨 Processing print job ID: ${printId || 'unknown'}`);
    
    if (!imageData) {
      return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
    }

    // แปลง base64 เป็นไฟล์
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    console.log('📊 Image size:', imageBuffer.length, 'bytes');
    
    // สร้างโฟลเดอร์ temp ถ้ายังไม่มี
    const tempDir = path.join(process.cwd(), 'temp');
    console.log('📁 Temp directory:', tempDir);
    
    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
        console.log('✅ Temp directory created');
      }
    } catch (dirError) {
      console.error('❌ Failed to create temp directory:', dirError);
      return NextResponse.json({ 
        error: 'Failed to create temp directory',
        details: dirError instanceof Error ? dirError.message : 'Unknown error'
      }, { status: 500 });
    }
    
    // บันทึกไฟล์ชั่วคราว
    const fileName = `print_${Date.now()}.png`;
    const filePath = path.join(tempDir, fileName);
    
    try {
      fs.writeFileSync(filePath, imageBuffer);
      console.log('✅ Image file saved:', filePath);
    } catch (writeError) {
      console.error('❌ Failed to write image file:', writeError);
      return NextResponse.json({ 
        error: 'Failed to save image file',
        details: writeError instanceof Error ? writeError.message : 'Unknown error'
      }, { status: 500 });
    }

    // ตรวจสอบว่าไฟล์ถูกสร้างจริง
    if (!fs.existsSync(filePath)) {
      console.error('❌ Image file not found after writing');
      return NextResponse.json({ 
        error: 'Image file not found after writing'
      }, { status: 500 });
    }

    // พิมพ์ไฟล์
    let printCommand = '';
    let printResult = '';
    
    try {
      if (process.platform === 'darwin') {
        // macOS - ตรวจสอบเครื่องพิมพ์ก่อน
        try {
          const printerCheck = execSync('lpstat -p', { encoding: 'utf8', timeout: 5000 });
          console.log('🖨️ Available printers:', printerCheck);
        } catch (checkError) {
          console.warn('⚠️ Could not check printers:', checkError);
        }
        
        // ใช้ lp command โดยตรงกับตัวเลือกสำหรับรูปภาพ
        printCommand = `lp -d "EPSON_L3250_Series_2" -o media=A4 -o ColorModel=Color -o quality=5 -o MediaType=plain -n 1 "${filePath}"`;
        console.log('🖨️ Executing print command:', printCommand);
        
        printResult = execSync(printCommand, { 
          encoding: 'utf8',
          timeout: 15000 
        });
        console.log('✅ Print command result:', printResult);
        console.log('✅ Print job sent to: EPSON_L3250_Series_2');
        
      } else if (process.platform === 'win32') {
        // Windows - ใช้ PowerShell
        printCommand = `powershell.exe -Command "Start-Process -FilePath '${filePath}' -Verb Print"`;
        console.log('🖨️ Executing Windows print command:', printCommand);
        execSync(printCommand, { timeout: 10000 });
        console.log('✅ Windows print command executed');
        
      } else {
        // Linux - ใช้ lp
        printCommand = `lp "${filePath}"`;
        console.log('🖨️ Executing Linux print command:', printCommand);
        execSync(printCommand, { timeout: 10000 });
        console.log('✅ Linux print command executed');
      }
      
      // ลบไฟล์ชั่วคราวหลังพิมพ์เสร็จ
      setTimeout(() => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('🗑️ Temp file cleaned up:', fileName);
          }
        } catch (cleanupError) {
          console.warn('⚠️ Failed to cleanup temp file:', cleanupError);
        }
      }, 5000);

      return NextResponse.json({ 
        success: true, 
        message: 'Print job sent successfully',
        fileName,
        platform: process.platform,
        command: printCommand,
        result: printResult
      });
      
    } catch (printError) {
      // ลบไฟล์ถ้าพิมพ์ไม่สำเร็จ
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('🗑️ Temp file cleaned up after error:', fileName);
        }
      } catch (cleanupError) {
        console.warn('⚠️ Failed to cleanup temp file after error:', cleanupError);
      }
      
      console.error('❌ Print error details:', {
        error: printError,
        message: printError instanceof Error ? printError.message : 'Unknown error',
        platform: process.platform,
        command: printCommand,
        filePath,
        fileExists: fs.existsSync(filePath),
        fileSize: fs.existsSync(filePath) ? fs.statSync(filePath).size : 'N/A'
      });
      
      return NextResponse.json({ 
        error: 'Failed to send print job', 
        details: printError instanceof Error ? printError.message : 'Unknown error',
        platform: process.platform,
        command: printCommand,
        suggestion: 'Check if printer is connected and CUPS is running'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}