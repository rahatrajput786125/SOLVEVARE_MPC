const axios = require('axios');

const API_URL = 'http://localhost:4000/api/v1';

async function loginUser() {
  console.log('🔐 Trying to login...\n');
  
  const email = 'test@example.com';
  const password = 'Test123456!';
  
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email,
      password,
    });
    
    console.log('✅ Login successful!');
    console.log('\n📋 User Details:');
    console.log(`   Email: ${response.data.data.user.email}`);
    console.log(`   Name: ${response.data.data.user.name}`);
    console.log(`   User ID: ${response.data.data.user.id}`);
    console.log(`   Org: ${response.data.data.org.name}`);
    console.log(`   Org ID: ${response.data.data.org.id}`);
    console.log(`\n🔑 Token: ${response.data.data.token.substring(0, 50)}...`);
    
    return response.data.data;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('❌ Login failed: Invalid credentials');
      console.log('   User exists but password is wrong');
    } else if (error.response?.status === 404) {
      console.log('❌ Login failed: User not found');
      console.log('   User does not exist in database');
    } else {
      console.log('❌ Login failed:', error.response?.data?.error || error.message);
    }
    return null;
  }
}

async function checkUserInDB() {
  console.log('\n🔍 Checking MongoDB for user...\n');
  
  // We'll use MongoDB shell command
  const { exec } = require('child_process');
  
  const command = `mongosh "mongodb://localhost:27017/mpc_dev?replicaSet=rs0" --quiet --eval "db.users.findOne({email: 'test@example.com'}, {email: 1, name: 1, _id: 1})"`;
  
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.log('⚠️  Could not connect to MongoDB');
      console.log('   Make sure MongoDB is running');
      return;
    }
    
    if (stdout.includes('null')) {
      console.log('❌ User NOT found in database');
      console.log('   Email: test@example.com does not exist');
    } else {
      console.log('✅ User found in database:');
      console.log(stdout);
    }
  });
}

async function main() {
  console.log('🧪 Testing User Authentication\n');
  console.log('='.repeat(60));
  
  // Try login first
  const loginResult = await loginUser();
  
  if (loginResult) {
    console.log('\n✅ User exists and credentials are correct!');
    console.log('\n💡 You can now run: node create-test-project.js');
  } else {
    console.log('\n⚠️  User exists but cannot login');
    console.log('   Checking database...');
    await checkUserInDB();
    
    console.log('\n💡 Solutions:');
    console.log('   1. Try different credentials');
    console.log('   2. Delete user from database and re-register');
    console.log('   3. Reset password');
  }
  
  console.log('\n' + '='.repeat(60));
}

main();
