const axios = require('axios');

const API_URL = 'http://localhost:4000/api/v1';

async function testTemplateCreation() {
  console.log('🧪 Testing Template Creation Fix\n');
  console.log('='.repeat(60));
  
  // First, we need to login to get a token
  console.log('\n1️⃣ Logging in...');
  let authToken = '';
  
  try {
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: 'test@example.com',
      password: 'Test123456!',
    });
    authToken = loginRes.data.data.token;
    console.log('✅ Logged in successfully');
  } catch (error) {
    console.log('❌ Login failed. Run: node fresh-user-setup.js');
    return;
  }
  
  // Get or create a project
  console.log('\n2️⃣ Getting project...');
  let projectId = '';
  
  try {
    const projectsRes = await axios.get(`${API_URL}/projects`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (projectsRes.data.data.items && projectsRes.data.data.items.length > 0) {
      projectId = projectsRes.data.data.items[0].id;
      console.log(`✅ Using existing project: ${projectId}`);
    } else {
      // Create new project
      const newProjectRes = await axios.post(
        `${API_URL}/projects`,
        {
          name: 'Test Template Project',
          description: 'Testing template creation',
          slug: 'test-template-project',
        },
        { headers: { 'Authorization': `Bearer ${authToken}` } }
      );
      projectId = newProjectRes.data.data.id;
      console.log(`✅ Created new project: ${projectId}`);
    }
  } catch (error) {
    console.log('❌ Failed to get/create project:', error.response?.data?.error || error.message);
    return;
  }
  
  // Test 1: Create template WITHOUT projectId in body (should work now)
  console.log('\n3️⃣ Testing template creation WITHOUT projectId in body...');
  
  try {
    const templateRes = await axios.post(
      `${API_URL}/projects/${projectId}/templates`,
      {
        // NO projectId here - it comes from URL
        name: 'Test Template',
        description: 'Testing template creation',
        content: '<h1>{{title}}</h1><p>{{content}}</p>',
        titleTemplate: '{{title}} | Test',
        descriptionTemplate: '{{description}}',
        slugTemplate: '{{slug}}',
      },
      { headers: { 'Authorization': `Bearer ${authToken}` } }
    );
    
    console.log('✅ Template created successfully!');
    console.log(`   Template ID: ${templateRes.data.data.id}`);
    console.log(`   Template Name: ${templateRes.data.data.name}`);
    console.log('\n🎉 FIX VERIFIED! Template creation works without projectId in body!');
    
    // Clean up - delete the test template
    console.log('\n4️⃣ Cleaning up test template...');
    await axios.delete(
      `${API_URL}/projects/${projectId}/templates/${templateRes.data.data.id}`,
      { headers: { 'Authorization': `Bearer ${authToken}` } }
    );
    console.log('✅ Test template deleted');
    
  } catch (error) {
    console.log('❌ Template creation failed!');
    console.log('   Error:', error.response?.data?.error || error.message);
    console.log('   Message:', error.response?.data?.message);
    
    if (error.response?.data?.message?.includes('projectId')) {
      console.log('\n⚠️  The fix did not work. projectId is still required.');
      console.log('   Make sure you restarted the API server after the fix.');
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n💡 Next Steps:');
  console.log('   1. If test passed: Try creating template in UI');
  console.log('   2. If test failed: Restart API server');
  console.log('   3. URL: http://localhost:3000/projects/' + projectId + '/templates');
  console.log('\n');
}

testTemplateCreation();
