const axios = require('axios');

const API_URL = 'http://localhost:4000/api/v1';

async function testLogin() {
  console.log('🧪 Testing Login Endpoint\n');
  console.log('='.repeat(60));
  
  // Test 1: Check API health
  console.log('\n1️⃣ Checking API health...');
  try {
    const healthRes = await axios.get(`${API_URL}/health`);
    console.log('✅ API is running');
    console.log('   Response:', healthRes.data);
  } catch (error) {
    console.log('❌ API health check failed!');
    console.log('   Error:', error.message);
    console.log('\n⚠️  API is not running or not responding');
    console.log('   Solution: Run restart-api.bat');
    return;
  }
  
  // Test 2: Try login
  console.log('\n2️⃣ Testing login...');
  try {
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: 'test@example.com',
      password: 'Test123456!',
    });
    
    console.log('✅ Login successful!');
    console.log('   User:', loginRes.data.data.user.email);
    console.log('   Token:', loginRes.data.data.token.substring(0, 30) + '...');
    
  } catch (error) {
    console.log('❌ Login failed!');
    console.log('\n📋 Error Details:');
    console.log('   Status:', error.response?.status);
    console.log('   Message:', error.response?.data?.error || error.response?.data?.message);
    
    if (error.response?.status === 500) {
      console.log('\n🔍 500 Internal Server Error - Possible causes:');
      console.log('   1. Database connection issue');
      console.log('   2. User not found in database');
      console.log('   3. Password hashing error');
      console.log('   4. JWT secret not configured');
      
      console.log('\n💡 Solutions:');
      console.log('   1. Check MongoDB is running: mongosh --eval "db.version()"');
      console.log('   2. Run: node fresh-user-setup.js');
      console.log('   3. Check API logs for detailed error');
      console.log('   4. Restart API: restart-api.bat');
      
    } else if (error.response?.status === 401) {
      console.log('\n💡 Wrong credentials. Try:');
      console.log('   node fresh-user-setup.js');
      
    } else if (error.response?.status === 404) {
      console.log('\n💡 User not found. Run:');
      console.log('   node fresh-user-setup.js');
    }
    
    // Show full error for debugging
    if (error.response?.data) {
      console.log('\n📄 Full Error Response:');
      console.log(JSON.stringify(error.response.data, null, 2));
    }
  }
  
  // Test 3: Try register (to see if DB works)
  console.log('\n3️⃣ Testing database connection via register...');
  try {
    const testEmail = 'test-' + Date.now() + '@example.com';
    const registerRes = await axios.post(`${API_URL}/auth/register`, {
      email: testEmail,
      password: 'Test123456!',
      name: 'Test User',
      orgName: 'Test Org',
    });
    
    console.log('✅ Database is working (register successful)');
    console.log('   Test user created:', testEmail);
    
    // Clean up - delete test user
    console.log('   Cleaning up test user...');
    
  } catch (error) {
    console.log('❌ Database test failed!');
    console.log('   Error:', error.response?.data?.error || error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n⚠️  Cannot connect to API!');
      console.log('   Solution: restart-api.bat');
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary:');
  console.log('   If login failed with 500 error:');
  console.log('   1. Run: node fresh-user-setup.js');
  console.log('   2. Then try login again');
  console.log('\n');
}

testLogin();
