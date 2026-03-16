#!/bin/bash
# SHIK Live - Automated Cloud Run Deployment Script
# Usage: ./scripts/deploy.sh [staging|production]

set -e

ENVIRONMENT=${1:-production}
PROJECT_ID="hagan-485508"
REGION="us-central1"
SERVICE_NAME="shik-live"

# Load environment variables from .env.local if it exists
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
fi

# Validate required env vars
if [ -z "$GEMINI_API_KEY" ]; then
  echo "Error: GEMINI_API_KEY not set"
  exit 1
fi

echo "🚀 Deploying SHIK Live to Cloud Run ($ENVIRONMENT)"
echo "   Project: $PROJECT_ID"
echo "   Region:  $REGION"
echo "   Service: $SERVICE_NAME"

# Build and deploy
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars="GEMINI_API_KEY=$GEMINI_API_KEY,GCP_PROJECT_ID=$PROJECT_ID,NEXT_PUBLIC_GEMINI_API_KEY=$GEMINI_API_KEY" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10

echo "✅ Deployment complete!"
echo "   URL: https://$SERVICE_NAME-912015102970.$REGION.run.app"
