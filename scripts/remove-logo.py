#!/usr/bin/env python3
"""
Script to remove the logo/URL text from bottom of template-news.png
"""
from PIL import Image, ImageDraw
import sys
import os

def remove_bottom_text():
    # Path to the template file
    template_path = "../public/template-news.png"
    output_path = "../public/template-news-clean.png"
    
    try:
        # Open the image
        img = Image.open(template_path)
        width, height = img.size
        
        # Create a copy to work with
        clean_img = img.copy()
        
        # Create a drawing context
        draw = ImageDraw.Draw(clean_img)
        
        # Calculate the area to cover (bottom part where the URL is)
        # Based on the template, the URL is at the very bottom
        bottom_height = int(height * 0.08)  # Bottom 8% of the image
        
        # Fill the bottom area with white/cream color to match background
        # Using a cream color that matches the template background
        background_color = (248, 246, 240)  # Cream/off-white color
        
        draw.rectangle([0, height - bottom_height, width, height], fill=background_color)
        
        # Save the clean version
        clean_img.save(output_path)
        print(f"✅ Clean template saved as: {output_path}")
        
        # Also update the original file
        clean_img.save(template_path)
        print(f"✅ Original template updated: {template_path}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error processing image: {e}")
        return False

if __name__ == "__main__":
    # Change to the script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    print("🖼️ Removing logo/URL from template...")
    
    if remove_bottom_text():
        print("🎉 Logo/URL removed successfully!")
    else:
        print("💥 Failed to remove logo/URL")
        sys.exit(1)