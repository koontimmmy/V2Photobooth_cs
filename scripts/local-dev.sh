#!/bin/bash

# Local Development Script for Photobooth with ngrok
echo "🚀 Starting Photobooth Local Development Environment"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo -e "${RED}❌ ngrok is not installed!${NC}"
    echo "Please install ngrok first:"
    echo "brew install ngrok/ngrok/ngrok"
    exit 1
fi

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${RED}❌ .env.local not found!${NC}"
    echo "Please create .env.local file with your configuration"
    exit 1
fi

echo -e "${BLUE}📋 Setup Instructions:${NC}"
echo "1. Start the Next.js development server"
echo "2. Start ngrok tunnel"
echo "3. Update Beam webhook URL with ngrok URL"
echo ""

# Function to start Next.js dev server
start_nextjs() {
    echo -e "${GREEN}🔥 Starting Next.js development server...${NC}"
    npm run dev &
    NEXTJS_PID=$!
    echo "Next.js PID: $NEXTJS_PID"
}

# Function to start ngrok
start_ngrok() {
    echo -e "${GREEN}🌐 Starting ngrok tunnel...${NC}"
    ngrok http 3000 --log=stdout > ngrok.log &
    NGROK_PID=$!
    echo "ngrok PID: $NGROK_PID"
    
    # Wait for ngrok to start
    sleep 3
    
    # Get ngrok URL
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok-free\.app')
    
    if [ -n "$NGROK_URL" ]; then
        echo -e "${GREEN}✅ ngrok tunnel started successfully!${NC}"
        echo -e "${YELLOW}🔗 Your ngrok URL: $NGROK_URL${NC}"
        echo ""
        echo -e "${BLUE}📝 Next Steps:${NC}"
        echo "1. Go to Beam Dashboard: https://portal.beamcheckout.com/"
        echo "2. Update webhook URL to: $NGROK_URL/api/webhook"
        echo "3. Make sure webhook secret matches your .env.local file"
        echo ""
        echo -e "${YELLOW}⚠️  Important Webhook URLs:${NC}"
        echo "   Main webhook: $NGROK_URL/api/webhook"
        echo "   Backup webhook: $NGROK_URL/api/webhook/backup"
        echo "   Test webhook: $NGROK_URL/api/webhook/test"
        echo ""
        
        # Update .env.local with ngrok URL
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=$NGROK_URL|" .env.local
        else
            sed -i "s|PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=$NGROK_URL|" .env.local
        fi
        echo -e "${GREEN}✅ Updated .env.local with ngrok URL${NC}"
    else
        echo -e "${RED}❌ Failed to get ngrok URL${NC}"
        echo "Check ngrok.log for details"
    fi
}

# Function to cleanup processes
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
    if [ ! -z "$NEXTJS_PID" ]; then
        kill $NEXTJS_PID 2>/dev/null
        echo "Stopped Next.js server"
    fi
    if [ ! -z "$NGROK_PID" ]; then
        kill $NGROK_PID 2>/dev/null
        echo "Stopped ngrok tunnel"
    fi
    echo -e "${GREEN}✅ Cleanup complete${NC}"
    exit 0
}

# Set trap to cleanup on Ctrl+C
trap cleanup SIGINT

# Check if services are already running
if lsof -i :3000 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Port 3000 is already in use${NC}"
    read -p "Kill existing process and continue? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        lsof -ti :3000 | xargs kill -9
        echo "Killed existing process on port 3000"
    else
        echo "Exiting..."
        exit 1
    fi
fi

# Start services
start_nextjs
sleep 2
start_ngrok

# Keep script running
echo -e "\n${GREEN}🎉 Development environment is ready!${NC}"
echo -e "${BLUE}📱 Open http://localhost:3000 to test your app${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for user to stop
while true; do
    sleep 1
done