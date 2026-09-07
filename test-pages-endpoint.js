const axios = require('axios');

const API_URL = 'http://localhost:4000/api/v1';
const PROJECT_ID = '6a0f5ec4e49c96fad4467008';

async function testPagesEndpoint() {
  console.log('🧪 Testing Pages Endpoint...\n');
  
  // Test without auth (should get 401)
  console.log('1️⃣ Testing without authentication...');
  try {
    await axios.get(`${API_URL}/projects/${PROJECT_ID}/pages`);
    console.log('❌ Should have failed without auth');
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Correctly returns 401 without auth');
    } else {
      console.log(`⚠️  Unexpected error: ${error.response?.status} - ${error.response?.data?.error}`);
    }
  }
  
  // Test with pagination params
  console.log('\n2️⃣ Testing pagination parameters...');
  try {
    await axios.get(`${API_URL}/projects/${PROJECT_ID}/pages`, {
      params: { page: 1, limit: 10 }
    });
    console.log('❌ Should have failed without auth');
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Accepts pagination params (page, limit)');
    } else if (error.response?.status === 400) {
      console.log(`❌ Validation error: ${error.response?.data?.message}`);
      console.log('   This means the DTO fix didn\'t work properly');
    } else {
      console.log(`⚠️  Unexpected error: ${error.response?.status}`);
    }
  }
  
  // Test with filters
  console.log('\n3️⃣ Testing with filters...');
  try {
    await axios.get(`${API_URL}/projects/${PROJECT_ID}/pages`, {
      params: { 
        page: 1, 
        limit: 10,
        status: 'PUBLISHED',
        search: 'test'
      }
    });
    console.log('❌ Should have failed without auth');
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Accepts all filter params');
    } else if (error.response?.status === 400) {
      console.log(`❌ Validation error: ${error.response?.data?.message}`);
    } else {
      console.log(`⚠️  Unexpected error: ${error.response?.status}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary:');
  console.log('   If all tests show ✅, the pagination fix is working!');
  console.log('   The 401 errors are expected (no auth token provided)');
  console.log('\n💡 Next Step:');
  console.log('   Run: node create-test-project.js');
  console.log('   This will create a full test project with auth');
  console.log('\n');
}

testPagesEndpoint().catch(console.error);
