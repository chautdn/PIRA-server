#!/bin/bash
# Quick test script to verify the rental order confirmation flow

echo "🧪 Testing Rental Order Renter Confirmation..."
echo ""

# Get Bearer token from environment or use placeholder
BEARER_TOKEN="${BEARER_TOKEN:-your_renter_token_here}"
SUB_ORDER_ID="${SUB_ORDER_ID:-your_suborder_id_here}"
API_URL="${API_URL:-http://localhost:5000}"

echo "📋 Test Configuration:"
echo "   API URL: $API_URL"
echo "   SubOrder ID: $SUB_ORDER_ID"
echo ""

# Make the request
echo "🚀 Sending request to confirm delivery..."
echo ""

curl -X POST \
  "$API_URL/api/rental-orders/suborders/$SUB_ORDER_ID/confirm-delivered" \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -v

echo ""
echo ""
echo "✅ Test complete!"
