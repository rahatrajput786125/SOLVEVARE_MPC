const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const API_URL = 'http://localhost:4000/api/v1';

async function deleteUserFromDB() {
  console.log('🗑️  Deleting existing user from database...\n');
  
  try {
    const command = `mongosh "mongodb://localhost:27017/mpc_dev?replicaSet=rs0" --quiet --eval "db.users.deleteOne({email: 'test@example.com'})"`;
    
    const { stdout } = await execAsync(command);
    
    if (stdout.includes('deletedCount: 1')) {
      console.log('✅ User deleted successfully');
      return true;
    } else {
      console.log('⚠️  User not found in database (already deleted or never existed)');
      return true;
    }
  } catch (error) {
    console.log('❌ Could not delete user:', error.message);
    console.log('   Make sure MongoDB is running');
    return false;
  }
}

async function deleteOrgFromDB() {
  console.log('🗑️  Deleting test organization from database...\n');
  
  try {
    const command = `mongosh "mongodb://localhost:27017/mpc_dev?replicaSet=rs0" --quiet --eval "db.organizations.deleteOne({name: 'Test Organization'})"`;
    
    await execAsync(command);
    console.log('✅ Organization deleted (if existed)');
    return true;
  } catch (error) {
    console.log('⚠️  Could not delete organization');
    return false;
  }
}

async function registerUser() {
  console.log('\n📝 Registering new user...\n');
  
  const email = 'test@example.com';
  const password = 'Test123456!';
  
  try {
    const response = await axios.post(`${API_URL}/auth/register`, {
      email,
      password,
      name: 'Test User',
      orgName: 'Test Organization',
    });
    
    console.log('✅ User registered successfully!');
    console.log('\n📋 User Details:');
    console.log(`   Email: ${response.data.data.user.email}`);
    console.log(`   Name: ${response.data.data.user.name}`);
    console.log(`   User ID: ${response.data.data.user.id}`);
    console.log(`   Org: ${response.data.data.org.name}`);
    console.log(`   Org ID: ${response.data.data.org.id}`);
    console.log(`\n🔑 Token: ${response.data.data.token.substring(0, 50)}...`);
    
    return response.data.data;
  } catch (error) {
    console.log('❌ Registration failed:', error.response?.data?.error || error.message);
    return null;
  }
}

async function loginUser() {
  console.log('\n🔐 Testing login...\n');
  
  const email = 'test@example.com';
  const password = 'Test123456!';
  
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email,
      password,
    });
    
    console.log('✅ Login successful!');
    return response.data.data;
  } catch (error) {
    console.log('❌ Login failed:', error.response?.data?.error || error.message);
    return null;
  }
}

async function main() {
  console.log('🔄 Fresh User Setup\n');
  console.log('='.repeat(60));
  console.log('\nThis script will:');
  console.log('1. Delete existing test user from database');
  console.log('2. Delete test organization');
  console.log('3. Register fresh user');
  console.log('4. Test login\n');
  console.log('='.repeat(60));
  
  // Step 1: Delete user
  const userDeleted = await deleteUserFromDB();
  if (!userDeleted) {
    console.log('\n❌ Could not proceed. Check MongoDB connection.');
    return;
  }
  
  // Step 2: Delete org
  await deleteOrgFromDB();
  
  // Wait a bit for DB to sync
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Step 3: Register
  const registerResult = await registerUser();
  if (!registerResult) {
    console.log('\n❌ Registration failed. Check API logs.');
    return;
  }
  
  // Step 4: Test login
  const loginResult = await loginUser();
  if (!loginResult) {
    console.log('\n❌ Login failed after registration. Something is wrong.');
    return;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✨ SUCCESS! Fresh user created and tested!\n');
  console.log('📋 Credentials:');
  console.log('   Email: test@example.com');
  console.log('   Password: Test123456!');
  console.log('\n💡 Next Steps:');
  console.log('   1. Run: node create-test-project.js');
  console.log('   2. Or login at: http://localhost:3000/login');
  console.log('\n');
}

main();
